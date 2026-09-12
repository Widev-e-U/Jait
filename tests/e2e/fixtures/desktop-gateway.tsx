import { createRoot } from 'react-dom/client'
import { DesktopGatewaySetup } from '../../../apps/web/src/components/onboarding/DesktopGatewaySetup'
import '../../../apps/web/src/index.css'
createRoot(document.getElementById('root')!).render(<div className="mx-auto max-w-lg p-8"><DesktopGatewaySetup /></div>)
