import type { MessengerStoreApi, MessengerLogin } from './store';
import { getApiUrl } from '@/lib/gateway-url';
import { getAuthToken } from '@/lib/auth-token';
import { triggerSystemNotification } from '@/lib/system-notifications';
import { messengerReadLink } from './notification-actions';
import type { MessengerSnapshot, MessengerMessage, MessengerRoom } from './model';

/** Id prefix for messages that only exist locally until the gateway confirms. */
const LOCAL_ECHO_PREFIX = '~local:';

/** Thin authenticated view of a gateway-owned Matrix device. Disposing a view never logs Matrix out. */
export class GatewayMessengerStore implements MessengerStoreApi {
  private remoteSnapshot: MessengerSnapshot = {
    status: 'disconnected',
    error: null,
    session: null,
    rooms: [],
    messages: [],
    selectedRoomId: null,
    notifications: false,
    assistantAccess: false,
  };
  private remoteListeners = new Set<() => void>();
  private stopped = false;
  private pollTimer?: ReturnType<typeof setTimeout>;
  private roomCache = new Map<string, MessengerMessage[]>();
  private requestGeneration = 0;
  private visible: string | null = null;
  private started = false;
  private notificationKey: string | null = null;
  /** Last ready snapshot for this account, retained across reconnections. */
  private notificationRooms: Map<string, MessengerRoom> | null = null;
  private pausedReads = new Set<string>();
  private activeSearch = '';
  /**
   * Messages shown before the gateway confirms them. The gateway snapshot only
   * contains confirmed timeline events, so without this overlay an outgoing
   * message stays invisible for a full round trip (send + sync + poll).
   */
  private optimistic = new Map<
    string,
    { roomId: string; message: MessengerMessage }
  >();
  private optimisticIds = 0;
  private searchResults: Array<{
    roomId: string;
    roomName: string;
    message: MessengerMessage;
  }> = [];
  private async refreshSearch(query: string) {
    const result = await this.request(
      '/search?query=' + encodeURIComponent(query),
    );
    if (query === this.activeSearch) {
      this.searchResults = result.results;
      this.publish({});
    }
  }
  private onStorage = (event: StorageEvent) => {
    try {
      if (event.storageArea === window.localStorage &&
          event.key === this.notificationKey && this.notificationKey) {
        this.publish({ notifications: event.newValue === '1' });
      }
    } catch { /* Storage may be unavailable. */ }
  };
  constructor(private owner: string) {}
  private preferenceKey(session: MessengerSnapshot['session']) {
    if (!session) return null;
    return 'jait.messenger.notifications.' +
      [this.owner, session.homeserver, session.userId].map(encodeURIComponent).join('.');
  }
  private readNotificationPreference(key: string | null) {
    if (!key) return false;
    try { return window.localStorage.getItem(key) === '1'; } catch { return false; }
  }
  subscribe = (listener: () => void) => {
    this.remoteListeners.add(listener);
    return () => {
      this.remoteListeners.delete(listener);
    };
  };
  getSnapshot = () => this.remoteSnapshot;
  private publish(patch: Partial<MessengerSnapshot>) {
    if (this.stopped) return;
    this.remoteSnapshot = { ...this.remoteSnapshot, ...patch };
    this.remoteListeners.forEach((listener) => listener());
  }
  /** Server messages plus local echoes the gateway has not delivered yet. */
  private withOptimistic(roomId: string, messages: MessengerMessage[]) {
    const known = new Set(messages.map((message) => message.id));
    const merged = [...messages];
    for (const [id, entry] of this.optimistic) {
      if (entry.roomId !== roomId) continue;
      if (known.has(entry.message.id)) {
        // The gateway reports the real event now, so drop the local copy.
        this.optimistic.delete(id);
        continue;
      }
      let index = merged.length;
      while (index > 0 && merged[index - 1]!.timestamp > entry.message.timestamp)
        index--;
      merged.splice(index, 0, entry.message);
    }
    return merged;
  }
  private publishMessages(roomId: string) {
    if (this.remoteSnapshot.selectedRoomId !== roomId) return;
    // Fall back to what is on screen when the room cache is still empty (for
    // example right after selecting a room), ignoring other local echoes so
    // withOptimistic() does not see them twice.
    const base =
      this.roomCache.get(roomId) ??
      this.remoteSnapshot.messages.filter(
        (message) => !message.id.startsWith(LOCAL_ECHO_PREFIX),
      );
    this.publish({ messages: this.withOptimistic(roomId, base) });
  }
  /**
   * Show an outgoing message immediately, then swap its local id for the
   * gateway event id once the send resolves. Failures drop the local echo so
   * the caller can restore the draft.
   */
  private async sendOptimistic(
    roomId: string,
    body: string,
    request: () => Promise<{ eventId?: string }>,
  ) {
    const localId =
      LOCAL_ECHO_PREFIX + roomId + ':' + ++this.optimisticIds + ':' + Date.now();
    this.optimistic.set(localId, {
      roomId,
      message: {
        id: localId,
        sender: this.remoteSnapshot.session?.userId ?? 'You',
        body,
        timestamp: Date.now(),
        own: true,
        encrypted: false,
        unableToDecrypt: false,
        pending: true,
        failed: false,
      },
    });
    this.publishMessages(roomId);
    let eventId: string | undefined;
    try {
      eventId = (await request()).eventId;
    } catch (error) {
      this.dropOptimistic(localId);
      throw error;
    }
    const current = this.optimistic.get(localId);
    if (current) {
      if (eventId)
        this.optimistic.set(localId, {
          roomId,
          message: { ...current.message, id: eventId, pending: false },
        });
      else this.optimistic.delete(localId);
      this.publishMessages(roomId);
    }
    void this.refreshRemote().catch(() => {});
  }
  private dropOptimistic(localId: string) {
    const entry = this.optimistic.get(localId);
    if (!entry) return;
    this.optimistic.delete(localId);
    this.publishMessages(entry.roomId);
  }
  private forgetRoom(roomId: string) {
    for (const [id, entry] of this.optimistic)
      if (entry.roomId === roomId) this.optimistic.delete(id);
    this.roomCache.delete(roomId);
  }
  private async request(path: string, method = 'GET', body?: unknown) {
    const token = getAuthToken();
    if (!token) throw new Error('Sign in to Jait to use Messenger.');
    const response = await fetch(getApiUrl() + '/api/messenger' + path, {
      method,
      credentials: 'include',
      headers: {
        Authorization: 'Bearer ' + token,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok)
      throw new Error(
        'The gateway could not complete the Matrix request. Check your connection and credentials.',
      );
    return response.json();
  }
  private async refreshRemote() {
    const generation = ++this.requestGeneration;
    const roomId = this.remoteSnapshot.selectedRoomId;
    const result = await this.request(
      roomId ? '?roomId=' + encodeURIComponent(roomId) : '',
    );
    if (this.stopped || generation !== this.requestGeneration) return;
    const snapshot: MessengerSnapshot = result.snapshot;
    const key = this.preferenceKey(snapshot.session);
    const sameAccount = key !== null && key === this.notificationKey;
    const notifications = sameAccount
      ? this.remoteSnapshot.notifications
      : this.readNotificationPreference(key);
    if (!sameAccount) this.notificationRooms = null;
    if (snapshot.status === 'ready' && key && this.notificationRooms && notifications) {
      for (const room of snapshot.rooms) {
        const old = this.notificationRooms.get(room.id);
        if (
          (old && room.timestamp <= old.timestamp) ||
          !room.unread ||
          (this.visible === room.id &&
            document.visibilityState === 'visible' &&
            document.hasFocus())
        )
          continue;
        const message = snapshot.messages.at(-1);
        void triggerSystemNotification({
          id: 'matrix-room:' + room.id,
          title: room.name,
          body: 'New message',
          independentOfAttention: true,
          link: '/messenger?roomId=' + encodeURIComponent(room.id),
          ...(message && snapshot.selectedRoomId === room.id && snapshot.session
            ? {
                markReadLink: messengerReadLink(
                  room.id,
                  message.id,
                  snapshot.session.userId,
                  snapshot.session.homeserver,
                ),
              }
            : {}),
        }).catch(() => {});
      }
    }
    if (this.activeSearch)
      void this.refreshSearch(this.activeSearch).catch(() => {});
    if (snapshot.status === 'ready' && key) {
      this.notificationRooms = new Map(snapshot.rooms.map(room => [room.id, room]));
    }
    this.notificationKey = key;
    if (roomId) this.roomCache.set(roomId, snapshot.messages);
    this.publish({
      ...snapshot,
      messages: roomId
        ? this.withOptimistic(roomId, snapshot.messages)
        : snapshot.messages,
      selectedRoomId: roomId,
      notifications,
    });
  }
  async resume() {
    if (this.started) return;
    this.started = true;
    if (typeof window !== 'undefined') window.addEventListener('storage', this.onStorage);
    const poll = async () => {
      try {
        await this.refreshRemote();
      } catch {
        this.publish({
          status: 'reconnecting',
          error: 'Gateway connection interrupted. Retrying.',
        });
      }
      if (!this.stopped) this.pollTimer = setTimeout(() => void poll(), 2000);
    };
    await poll();
  }
  async connect(input: MessengerLogin) {
    this.publish({ status: 'connecting', error: null });
    try {
      await this.request('', 'POST', input);
      await this.refreshRemote();
    } catch (error) {
      this.publish({
        status: 'error',
        error:
          'Matrix sign-in failed. Check credentials and homeserver availability.',
      });
      throw error;
    }
  }
  private async action(body: unknown) {
    const result = await this.request('/command', 'POST', body);
    await this.refreshRemote();
    return result;
  }
  selectRoom(id: string | null) {
    ++this.requestGeneration;
    if (id) this.pausedReads.delete(id);
    this.publish({
      selectedRoomId: id,
      messages: id ? this.withOptimistic(id, this.roomCache.get(id) ?? []) : [],
    });
    void this.refreshRemote().catch(() => {});
  }
  async send(roomId: string, text: string) {
    const body = text.trim();
    if (!body) return;
    await this.sendOptimistic(roomId, body, () =>
      this.request('/command', 'POST', { action: 'send', roomId, text: body }),
    );
  }
  async edit(roomId: string, eventId: string, text: string) {
    await this.action({ action: 'edit', roomId, eventId, text });
  }
  async react(roomId: string, eventId: string, key: string) {
    await this.action({ action: 'react', roomId, eventId, key });
  }
  async remove(roomId: string) {
    await this.request('/command', 'POST', { action: 'remove', roomId });
    this.forgetRoom(roomId);
    if (this.remoteSnapshot.selectedRoomId === roomId) this.selectRoom(null);
    await this.refreshRemote();
  }
  async join(roomId: string) {
    await this.action({ action: 'join', roomId });
  }
  async leave(roomId: string) {
    await this.action({ action: 'leave', roomId });
    this.forgetRoom(roomId);
  }
  async openDirect(userId: string, select = true) {
    const result = await this.action({ action: 'open', userId });
    if (select) this.selectRoom(result.roomId);
    return result.roomId as string;
  }
  async loadEarlier() {
    if (this.remoteSnapshot.selectedRoomId)
      await this.action({
        action: 'earlier',
        roomId: this.remoteSnapshot.selectedRoomId,
      });
  }
  async markRead(
    roomId = this.remoteSnapshot.selectedRoomId,
    eventId?: string,
    _automatic = false,
  ) {
    if (!roomId || (_automatic && this.pausedReads.has(roomId))) return;
    if (eventId) this.pausedReads.add(roomId);
    await this.action({
      action: 'read',
      roomId,
      ...(eventId ? { eventId } : {}),
    });
  }
  async markUnread(roomId: string) {
    this.pausedReads.add(roomId);
    await this.action({ action: 'unread', roomId });
  }
  setVisibleRoom(id: string | null) {
    this.visible = id;
  }
  setAssistantAccess(enabled: boolean) {
    void this.action({ action: 'assistantAccess', enabled }).catch(() => {});
  }
  async assistantCommand(): Promise<
    import('@jait/shared').MessengerToolResponse
  > {
    return {
      ok: false,
      message: 'Assistant commands are executed by the gateway.',
    };
  }
  searchLoadedMessages(query: string) {
    if (query !== this.activeSearch) {
      this.activeSearch = query;
      this.searchResults = [];
      if (query.trim()) void this.refreshSearch(query).catch(() => {});
    }
    return this.searchResults;
  }
  async enableNotifications(enabled: boolean) {
    const key = this.notificationKey;
    if (!key) throw new Error('Connect to Matrix first.');
    if (
      enabled &&
      'Notification' in window &&
      !window.jaitDesktop?.notify &&
      (await Notification.requestPermission()) !== 'granted'
    )
      throw new Error('Allow notifications in your device settings first.');
    if (key !== this.notificationKey) throw new Error('The Matrix account changed.');
    try { window.localStorage.setItem(key, enabled ? '1' : '0'); } catch { /* Keep the preference for this session. */ }
    this.publish({ notifications: enabled });
  }
  async sendAttachment(roomId: string, file: File) {
    if (file.size > 20 * 1024 * 1024)
      throw new Error('Attachments must be 20 MB or smaller.');
    await this.sendOptimistic(roomId, file.name, async () => {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]!);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      return this.request('/command', 'POST', {
        action: 'attachment',
        roomId,
        data,
        name: file.name,
        mime: file.type,
      });
    });
  }
  async attachmentBlob(
    attachment: NonNullable<MessengerMessage['attachment']>,
  ) {
    const result = await this.request('/media', 'POST', {
      url: attachment.url,
      file: attachment.file,
    });
    const bytes = Uint8Array.from(atob(result.data), (c) => c.charCodeAt(0));
    return new Blob([bytes], { type: attachment.mime });
  }
  async avatarBlob(mxcUrl: string) {
    const result = await this.request('/media', 'POST', { url: mxcUrl });
    const bytes = Uint8Array.from(atob(result.data), (c) => c.charCodeAt(0));
    return new Blob([bytes]);
  }
  async restoreKeys(recoveryKey: string) {
    await this.request('/keys', 'POST', { recoveryKey });
    await this.refreshRemote();
  }
  async disconnect() {
    ++this.requestGeneration;
    await this.request('', 'DELETE');
    this.roomCache.clear();
    this.optimistic.clear();
    await this.refreshRemote();
  }
  dispose() {
    if (typeof window !== 'undefined') window.removeEventListener('storage', this.onStorage);
    this.stopped = true;
    ++this.requestGeneration;
    clearTimeout(this.pollTimer);
    this.roomCache.clear();
    this.optimistic.clear();
    this.remoteListeners.clear();
  }
}
