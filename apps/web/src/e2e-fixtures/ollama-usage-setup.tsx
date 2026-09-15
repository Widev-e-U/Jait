import { createRoot } from 'react-dom/client'

import { UsageModal } from '@/components/app-shell/usage-modal'
import { setAuthToken } from '@/lib/auth-token'

// The modal reads the in-memory auth token, which the app normally seeds from
// the HTTP-only cookie during boot. Seed it synchronously so the fixture is
// deterministic regardless of when the host app finishes initialising.
setAuthToken('e2e-test-token')

const mount = document.createElement('div')
document.body.replaceChildren(mount)
createRoot(mount).render(<UsageModal open onOpenChange={() => {}} />)
