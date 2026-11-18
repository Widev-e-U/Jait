import { installGatewayFetchAuth } from '@/lib/api-fetch'
import ReactDOM from 'react-dom/client'
import { NotificationToaster } from '@/components/ui/notification-toaster'
import { ConfirmDialogProvider } from '@/components/ui/confirm-dialog'
import { HotkeysProvider } from '@/components/hotkeys'
import { ErrorBoundary } from '@/components/error-boundary'
import { AuthProvider } from '@/hooks/useAuth'
import { installVersionWatchdog } from '@/lib/version-watchdog'
import App from './App'
import { MessengerProvider } from '@/components/messenger/messenger-provider'
import { detectPlatform, initDeviceId } from '@/lib/device-id'
import './index.css'

// Auto-reload when a new bundle is deployed, so a long-lived tab never keeps
// running stale code (e.g. an old bundle that surfaced React #185).
installGatewayFetchAuth()
installVersionWatchdog()

// Note: this app intentionally does NOT wrap the tree in <React.StrictMode>.
// StrictMode double-invokes effects on every mount (mount -> cleanup -> mount),
// and the cleanup calls ws.close() on still-CONNECTING WebSockets (the chat
// automation socket, secret-input, user-question, node-permissions, consent,
// etc.). That churns the connection once per mount and logs a noisy
// "WebSocket is closed before the connection is established" warning for every
// socket right as the app transitions login -> main view. All these effects
// already implement correct cleanup and stable deps, so the double-invoke
// provides no additional safety here. Re-enable StrictMode (wrap this render
// tree) if you want dev-only strict warnings back; production is unaffected.
function renderApp() {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <ErrorBoundary>
      <AuthProvider>
        <MessengerProvider>
        <ConfirmDialogProvider>
          <HotkeysProvider>
            <App />
            <NotificationToaster />
          </HotkeysProvider>
        </ConfirmDialogProvider>
        </MessengerProvider>
      </AuthProvider>
    </ErrorBoundary>,
  )
}

// Resolve the phone's native identity before any hooks can stamp a node ID.
if (detectPlatform() === 'capacitor') {
  void initDeviceId().catch(() => {}).finally(renderApp)
} else {
  renderApp()
}
