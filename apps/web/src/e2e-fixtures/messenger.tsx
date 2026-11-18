import { bindMessengerNotifications, handleMessengerNotification } from '@/lib/messenger/notification-actions'
import { subscribeNotificationNavigation } from '@/lib/notification-navigation'
import { ConfirmDialogProvider } from '@/components/ui/confirm-dialog'
import { createRoot } from 'react-dom/client'
import { MessengerContext } from '@/components/messenger/messenger-provider'
import MessengerPage from '@/components/messenger/messenger-page'
import { MessengerStore } from '@/lib/messenger/store'
import '@/index.css'

const store = new MessengerStore('messenger-e2e')
bindMessengerNotifications(store)
subscribeNotificationNavigation(async activation => (await handleMessengerNotification(activation)) ?? false)
const mount = document.createElement('div')
document.body.replaceChildren(mount)
createRoot(mount).render(<ConfirmDialogProvider><MessengerContext.Provider value={store}><div className="h-dvh bg-background text-foreground"><MessengerPage token="messenger-e2e-voice" sttProvider="whisper" /></div></MessengerContext.Provider></ConfirmDialogProvider>)
void store.resume().catch(() => {})
