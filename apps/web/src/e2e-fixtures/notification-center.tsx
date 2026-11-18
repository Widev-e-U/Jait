import { createRoot } from 'react-dom/client'
import { NotificationBell, NotificationCornerControls } from '@/components/ui/notification-center'
import { recordNotification } from '@/lib/notification-center'
import '@/index.css'

createRoot(document.getElementById('root')!).render(<>
  <button onClick={() => {
    recordNotification({ id: 'first', title: 'First notification', body: 'Needs a look', level: 'info' })
    recordNotification({ id: 'second', title: 'Second notification', body: '', level: 'success' })
  }}>Add notifications</button>
  <NotificationCornerControls top={16} />
  <NotificationBell />
</>)
