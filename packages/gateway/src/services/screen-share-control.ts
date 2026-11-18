import type { ScreenShareSessionState } from "@jait/shared";
import type { ScreenShareService } from "@jait/screen-share";
import type { WsControlPlane } from "../ws.js";
import { ComputerControlSessionService } from "./computer-control.js";

interface Geometry { originX: number; originY: number; width: number; height: number; monitorCount: number }
interface Entry {
  shareId: string;
  chatId: string;
  viewerId: string;
  nodeId: string;
  controlId: string;
  requestId: string;
  active: boolean;
  busy: boolean;
  geometry?: Geometry;
}
interface RemoteResult { ok?: boolean; message?: string; data?: unknown }

/** A share's viewer seat is tied to the host's approved computer lease. */
export class ScreenShareControlCoordinator {
  private readonly entries = new Map<string, Entry>();
  private readonly cancelled = new Map<string, number>();

  private requestKey(shareId: string, chatId: string, viewerId: string, requestId: string): string {
    return JSON.stringify([shareId, chatId, viewerId, requestId]);
  }

  private pruneCancelled(): void {
    const now = Date.now();
    for (const [key, expiry] of this.cancelled) if (expiry <= now) this.cancelled.delete(key);
  }

  constructor(
    private readonly shares: ScreenShareService,
    private readonly sessions: ComputerControlSessionService,
    private readonly ws: Pick<WsControlPlane, "proxyToolOp" | "getNodeRegistry">,
  ) {}

  private requireShare(shareId: string, chatId: string, viewerId: string): ScreenShareSessionState {
    const share = this.shares.getSession(shareId);
    if (!share || share.status !== "sharing" || share.pendingApproval || share.chatId !== chatId
      || share.controlOwner !== "user" || !share.nodeId || share.nodeId !== share.hostDeviceId
      || !share.capabilities.remoteInput || !share.viewers.some(viewer => viewer.deviceId === viewerId)
      || this.shares.getSessionsForNode(share.nodeId).some(other => other.id !== share.id)) {
      throw new Error("This viewer cannot control the current screen share.");
    }
    const node = this.ws.getNodeRegistry().nodes.find(candidate => candidate.id === share.nodeId);
    const required = ["computer.session", "computer.act", "computer.geometry", "computer.share.capture", "computer.clipboard.read", "computer.clipboard.write"];
    if (!node || node.role !== "desktop" || node.lifecycle !== "ready" || node.platform !== "windows"
      || required.some(tool => !node.capabilities.tools.includes(tool))) {
      throw new Error("The desktop does not support approved screen control.");
    }
    return share;
  }

  private async proxy(entry: Entry, tool: string, args: Record<string, unknown>, timeoutMs = 5_000): Promise<RemoteResult> {
    const result = await this.ws.proxyToolOp<RemoteResult>(entry.nodeId, tool, { ...args, shareSessionId: entry.shareId }, { sessionId: entry.chatId, timeoutMs });
    if (!result || result.ok !== true) throw new Error(result?.message ?? "The desktop rejected the control request.");
    return result;
  }

  private current(entry: Entry): void {
    if (this.entries.get(entry.shareId) !== entry) throw new Error("Screen control has ended.");
    this.sessions.requireOwned(entry.controlId, entry.chatId);
    this.requireShare(entry.shareId, entry.chatId, entry.viewerId);
  }

  private async capture(entry: Entry): Promise<{ width: number; height: number }> {
    const result = await this.proxy(entry, "computer.share.capture", { shareSessionId: entry.shareId });
    this.current(entry);
    const data = result.data as { width?: unknown; height?: unknown } | undefined;
    if (typeof data?.width !== "number" || typeof data.height !== "number"
      || !Number.isFinite(data.width) || !Number.isFinite(data.height) || data.width <= 0 || data.height <= 0) {
      throw new Error("The host cannot verify the captured monitor.");
    }
    return { width: data.width, height: data.height };
  }

  async start(shareId: string, chatId: string, viewerId: string, requestId: string): Promise<{ controlId: string; expiresAt: string }> {
    if (!requestId || requestId.length > 256) throw new Error("A control request ID is required.");
    this.pruneCancelled();
    if (this.cancelled.has(this.requestKey(shareId, chatId, viewerId, requestId))) throw new Error("Screen control was cancelled.");
    const share = this.requireShare(shareId, chatId, viewerId);
    if (this.entries.has(shareId)) throw new Error("Screen control is already active or awaiting approval.");
    const session = this.sessions.start(chatId, share.nodeId!);
    const entry: Entry = { shareId, chatId, viewerId, requestId, nodeId: share.nodeId!, controlId: session.id, active: false, busy: false };
    this.entries.set(shareId, entry);
    try {
      await this.capture(entry);
      await this.proxy(entry, "computer.session", { action: "start", sessionId: session.id, expiresAt: session.expiresAt }, 180_000);
      this.current(entry);
      const result = await this.proxy(entry, "computer.geometry", { sessionId: session.id });
      this.current(entry);
      const g = result.data as Partial<Geometry> | undefined;
      if (!g || g.monitorCount !== 1 || !Number.isInteger(g.originX) || !Number.isInteger(g.originY)
        || !Number.isInteger(g.width) || !Number.isInteger(g.height) || !g.width || !g.height
        || g.width <= 0 || g.height <= 0 || g.width > 16_384 || g.height > 16_384) {
        throw new Error("Control requires a verified single-monitor desktop.");
      }
      const capture = await this.capture(entry);
      if (Math.abs(capture.width / capture.height - g.width / g.height) > 0.01) {
        throw new Error("The captured monitor does not match the desktop geometry.");
      }
      entry.geometry = g as Geometry;
      entry.active = true;
      return { controlId: session.id, expiresAt: session.expiresAt };
    } catch (error) {
      await this.stopEntry(entry);
      throw error;
    }
  }

  private owned(shareId: string, chatId: string, viewerId: string, controlId: string): Entry {
    const entry = this.entries.get(shareId);
    if (!entry || entry.chatId !== chatId || entry.viewerId !== viewerId || entry.controlId !== controlId || !entry.active) {
      throw new Error("Screen control is not active for this viewer.");
    }
    this.current(entry);
    return entry;
  }

  private async run<T>(entry: Entry, effect: () => Promise<T>): Promise<T> {
    if (entry.busy) throw new Error("A screen-control action is already in progress.");
    entry.busy = true;
    try {
      await this.capture(entry);
      this.current(entry);
      return await effect();
    } catch (error) {
      // Losing the capture, permission or desktop ends the control lease.
      await this.stopEntry(entry);
      throw error;
    } finally {
      entry.busy = false;
    }
  }

  async act(shareId: string, chatId: string, viewerId: string, controlId: string, input: Record<string, unknown>): Promise<void> {
    const entry = this.owned(shareId, chatId, viewerId, controlId);
    const geometry = entry.geometry!;
    const action = input.action;
    let args: Record<string, unknown>;
    if (action === "move" || action === "click") {
      const { x, y } = input;
      if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)
        || x < 0 || x > 1 || y < 0 || y > 1) throw new Error("Pointer coordinates must be within the captured image.");
      if (action === "click" && input.button !== undefined && !["left", "middle", "right"].includes(String(input.button))) {
        throw new Error("Invalid mouse button.");
      }
      args = { action, x: geometry.originX + Math.round(x * (geometry.width - 1)), y: geometry.originY + Math.round(y * (geometry.height - 1)),
        ...(action === "click" ? { button: input.button ?? "left" } : {}) };
    } else if (action === "key") {
      if (typeof input.combo !== "string" || input.combo.length < 1 || input.combo.length > 100) throw new Error("Invalid key combination.");
      args = { action, combo: input.combo };
    } else if (action === "type") {
      if (typeof input.text !== "string" || !input.text || input.text.length > 2048) throw new Error("Invalid typed text.");
      args = { action, text: input.text };
    } else if (action === "scroll") {
      if (!["up", "down", "left", "right"].includes(String(input.direction))) throw new Error("Invalid scroll direction.");
      if (input.amount !== undefined && (!Number.isInteger(input.amount) || (input.amount as number) < 1 || (input.amount as number) > 20)) throw new Error("Invalid scroll amount.");
      args = { action, direction: input.direction, amount: input.amount ?? 1 };
    } else {
      throw new Error("Invalid screen-control action.");
    }
    await this.run(entry, async () => {
      await this.proxy(entry, "computer.act", { ...args, sessionId: controlId, includeScreenshot: false, expectedGeometry: geometry });
    });
  }

  async readClipboard(shareId: string, chatId: string, viewerId: string, controlId: string): Promise<string | null> {
    const entry = this.owned(shareId, chatId, viewerId, controlId);
    return this.run(entry, async () => {
      const result = await this.proxy(entry, "computer.clipboard.read", { sessionId: controlId, expectedGeometry: entry.geometry });
      const text = (result.data as { text?: unknown } | undefined)?.text;
      if (text !== null && typeof text !== "string") throw new Error("Invalid remote clipboard response.");
      return text;
    });
  }

  async writeClipboard(shareId: string, chatId: string, viewerId: string, controlId: string, text: string): Promise<void> {
    if (typeof text !== "string" || text.length > 262_143 || text.includes("\0")) throw new Error("Invalid clipboard text.");
    const entry = this.owned(shareId, chatId, viewerId, controlId);
    await this.run(entry, async () => { await this.proxy(entry, "computer.clipboard.write", { sessionId: controlId, text, expectedGeometry: entry.geometry }); });
  }

  async stop(shareId: string, chatId: string, viewerId: string, controlId: string): Promise<void> {
    const entry = this.entries.get(shareId);
    if (!entry || entry.chatId !== chatId || entry.viewerId !== viewerId || entry.controlId !== controlId) return;
    await this.stopEntry(entry);
  }

  async cancel(shareId: string, chatId: string, viewerId: string, requestId: string): Promise<void> {
    if (!requestId || requestId.length > 256) throw new Error("A control request ID is required.");
    this.pruneCancelled();
    const key = this.requestKey(shareId, chatId, viewerId, requestId);
    if (!this.cancelled.has(key) && this.cancelled.size >= 1024) throw new Error("Too many cancelled control requests.");
    this.cancelled.set(key, Date.now() + 5 * 60_000);
    const entry = this.entries.get(shareId);
    if (entry && entry.chatId === chatId && entry.viewerId === viewerId && entry.requestId === requestId) await this.stopEntry(entry);
  }

  async stopForViewer(shareId: string, viewerId: string): Promise<void> {
    const entry = this.entries.get(shareId);
    if (entry?.viewerId === viewerId) await this.stopEntry(entry);
  }

  async stopForShare(shareId: string): Promise<void> {
    const entry = this.entries.get(shareId);
    if (entry) await this.stopEntry(entry);
  }

  /** The host revokes locally when its node socket drops; discard the gateway seat too. */
  nodeDisconnected(nodeId: string): void {
    const active = this.sessions.findByNode(nodeId);
    if (!active) return;
    for (const [shareId, entry] of this.entries) {
      if (entry.controlId === active.id) this.entries.delete(shareId);
    }
    this.sessions.stop(active.id);
  }

  async stopForNode(nodeId: string, chatId: string, strict = true): Promise<void> {
    const active = this.sessions.findByNode(nodeId);
    if (!active) return;
    if (active.ownerSessionId !== chatId) {
      if (strict) throw new Error("The computer is controlled by another chat.");
      return;
    }
    const viewer = [...this.entries.values()].find(entry => entry.controlId === active.id);
    if (viewer) return this.stopEntry(viewer);
    this.sessions.stop(active.id);
    try {
      await this.ws.proxyToolOp(nodeId, "computer.session", { action: "stop", sessionId: active.id }, { sessionId: chatId, timeoutMs: 5_000 });
    } catch { /* the node may already have disconnected */ }
  }

  private async stopEntry(entry: Entry): Promise<void> {
    if (this.entries.get(entry.shareId) === entry) this.entries.delete(entry.shareId);
    this.sessions.stop(entry.controlId);
    // Stop is allowed even when the node's input grant was revoked. It also
    // invalidates a native approval dialog whose response may arrive late.
    try {
      await this.ws.proxyToolOp(entry.nodeId, "computer.session", { action: "stop", sessionId: entry.controlId }, { sessionId: entry.chatId, timeoutMs: 5_000 });
    } catch { /* the node may already have disconnected */ }
  }
}
