import { createRoot } from 'react-dom/client'
import { SecurityWorkbench } from '@/components/network/security-workbench'
import '../index.css'
const mount = document.createElement('div')
document.body.replaceChildren(mount)
createRoot(mount).render(<SecurityWorkbench token="assessment-test-token" sessionId="fixture-chat" />)
