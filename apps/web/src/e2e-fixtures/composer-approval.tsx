import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { DeveloperComposerControlRow } from '@/components/app-shell/developer-composer-control-row'
import { TooltipProvider } from '@/components/ui/tooltip'
import '@/index.css'

function Harness() {
  const [approved, setApproved] = useState(true)
  const compact = new URLSearchParams(location.search).has('compact')
  const noop = () => {}
  return <TooltipProvider><main className="p-2 text-xs">
    <DeveloperComposerControlRow
      activeProjectId={null}
      activeProjectSessions={[]}
      activeProjectTitle={null}
      activeSessionId={null}
      approveAllInSession={approved}
      compact={compact}
      disableSendTargetSelector={false}
      remainingPrompts={null}
      repositories={[]}
      selectedThreadRepo={null}
      sendTarget="agent"
      threadRepoPickerDisabled={false}
      getRuntimeInfo={() => ({ hostType: 'gateway', nodeId: 'gateway', locationLabel: 'Local', online: true, loading: false, availableProviders: [] })}
      onAddRepository={noop}
      onClearApproveAll={() => setApproved(false)}
      onCreateSession={noop}
      onSendTargetChange={noop}
      onSessionSwitcherOpenChange={noop}
      onStartNewChat={noop}
      onSelectRepo={noop}
      onSelectSession={noop}
    />
  </main></TooltipProvider>
}

const mount = document.createElement('div')
document.body.replaceChildren(mount)
createRoot(mount).render(<Harness />)
