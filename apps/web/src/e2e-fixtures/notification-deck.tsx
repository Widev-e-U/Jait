import { createRoot } from 'react-dom/client'
import { toast } from 'sonner'
import { NotificationToaster } from '@/components/ui/notification-toaster'
import '@/index.css'

createRoot(document.getElementById('root')!).render(<>
  <button onClick={() => {
    toast('First notification', { duration: Infinity })
    toast('Second notification', { duration: Infinity })
    toast('Third notification', { duration: Infinity })
  }}>Add notifications</button>
  <NotificationToaster />
</>)
