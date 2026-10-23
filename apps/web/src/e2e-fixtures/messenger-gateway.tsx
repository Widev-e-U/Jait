import { Toaster } from 'sonner';
import { createRoot } from 'react-dom/client';
import { MessengerContext } from '@/components/messenger/messenger-provider';
import MessengerPage from '@/components/messenger/messenger-page';
import { ConfirmDialogProvider } from '@/components/ui/confirm-dialog';
import { GatewayMessengerStore } from '@/lib/messenger/gateway-store';
import { setAuthToken } from '@/lib/auth-token';
import '@/index.css';

// Synthetic Jait token: the review harness serves isolated authenticated API fixtures.
setAuthToken('messenger-gateway-fixture');
const store = new GatewayMessengerStore('gateway-ui-fixture');
createRoot(document.getElementById('root')!).render(
  <ConfirmDialogProvider>
    <Toaster closeButton />
    <MessengerContext.Provider value={store}>
      <div className="h-dvh bg-background text-foreground">
        <MessengerPage
          token="messenger-gateway-fixture"
          sttProvider="whisper"
        />
      </div>
    </MessengerContext.Provider>
  </ConfirmDialogProvider>,
);
void store.resume();
window.addEventListener('pagehide', () => store.dispose());
