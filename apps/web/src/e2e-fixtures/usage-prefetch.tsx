import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { UsageModal } from '@/components/app-shell/usage-modal'
import { setAuthToken } from '@/lib/auth-token'
import '@/index.css'

setAuthToken('usage-prefetch-fixture')
function Harness() {
  const [open, setOpen] = useState(false)
  return <>
    <button onClick={() => setOpen(true)}>Show usage</button>
    <UsageModal open={open} onOpenChange={setOpen} />
    {/* Desktop mounts a header and sidebar; both must share background work. */}
    <UsageModal open={false} onOpenChange={() => {}} />
  </>
}
const mount = document.createElement('div')
document.body.replaceChildren(mount)
createRoot(mount).render(<Harness />)
