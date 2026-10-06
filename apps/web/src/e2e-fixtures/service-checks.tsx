import { createRoot } from 'react-dom/client'
import { ServiceChecks } from '@/components/network/service-checks'
import '../index.css'
const mount = document.createElement('div')
document.body.replaceChildren(mount)
createRoot(mount).render(<ServiceChecks token="assessment-test-token" />)
