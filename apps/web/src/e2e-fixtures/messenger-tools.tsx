import { createRoot } from 'react-dom/client'
import { MessengerContext } from '@/components/messenger/messenger-provider'
import MessengerPage from '@/components/messenger/messenger-page'
import { ConfirmDialogProvider } from '@/components/ui/confirm-dialog'
import type { MessengerStore } from '@/lib/messenger/store'
import type { MessengerSnapshot } from '@/lib/messenger/model'
import '@/index.css'

window.history.replaceState(null, '', '/messenger' + window.location.search)
const listeners = new Set<() => void>()
let snapshot: MessengerSnapshot = {
  status: 'ready', error: null, notifications: false, assistantAccess: false,
  session: { homeserver: 'https://matrix.test', userId: '@alice:matrix.test', deviceId: 'A' },
  selectedRoomId: null,
  rooms: [
    { id: '!lab:test', name: 'Homelab', service: 'WhatsApp', network: 'Personal', membership: 'join', encrypted: true, unread: 0, timestamp: 2, preview: 'Firewall ready' },
    { id: '!team:test', name: 'Team', service: 'Telegram', network: '', membership: 'join', encrypted: true, unread: 0, timestamp: 1, preview: 'Hello' },
  ],
  messages: [],
}
const messages = [
  { id: '$one', sender: 'Bob', body: new URLSearchParams(window.location.search).get('linkTest') ? '[Guide](https://example.com/guide) https://example.com/plain www.example.com [Settings](/settings?q=providers)' : 'Firewall ready', timestamp: 2, own: false, encrypted: true, unableToDecrypt: false, pending: false, failed: false },
  { id: '$two', sender: 'Alice', body: 'Hello', timestamp: 1, own: true, encrypted: true, unableToDecrypt: false, pending: false, failed: false },
]
const update = (value: Partial<MessengerSnapshot>) => { snapshot = { ...snapshot, ...value }; listeners.forEach(listener => listener()) }
const store = {
  subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener) },
  getSnapshot: () => snapshot,
  selectRoom: (id: string | null) => update({ selectedRoomId: id, messages: id ? messages : [] }),
  setVisibleRoom: () => {},
  markRead: async () => {},
  searchLoadedMessages: (query: string) => query ? messages.filter(message => message.body.toLowerCase().includes(query.toLowerCase())).map(message => ({ roomId: '!lab:test', roomName: 'Homelab', message })) : [],
  setAssistantAccess: (enabled: boolean) => update({ assistantAccess: enabled }),
  loadEarlier: async () => {},
} as unknown as MessengerStore
const mount = document.createElement('div')
document.body.replaceChildren(mount)
createRoot(mount).render(<ConfirmDialogProvider><MessengerContext.Provider value={store}><div className="h-dvh bg-background text-foreground"><MessengerPage /></div></MessengerContext.Provider></ConfirmDialogProvider>)
