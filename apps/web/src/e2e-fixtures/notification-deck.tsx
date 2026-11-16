import { createRoot } from 'react-dom/client'
import { toast } from 'sonner'
import { NotificationToaster } from '@/components/ui/notification-toaster'
import '@/index.css'

createRoot(document.getElementById('root')!).render(<>
  <button onClick={() => {
    toast.info('First notification', {
      description: 'A very long message '.repeat(30),
      duration: Infinity,
      cancel: { label: 'Mark as read', onClick: () => {} },
      action: { label: 'Open', onClick: () => {} },
    })
    toast('Second notification', { duration: Infinity })
    toast('Third notification', { duration: Infinity })
  }}>Add notifications</button>
  <NotificationToaster />
</>)
