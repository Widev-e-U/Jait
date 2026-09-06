import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { GitDiffIndicator } from '../../../apps/web/src/components/chat/git-diff-indicator'
import { MobileBottomNav } from '../../../apps/web/src/components/mobile/mobile-bottom-nav'

function Harness() {
  const [projectRoot, setProjectRoot] = useState<string | null>('/project-a')
  const [nodeId, setNodeId] = useState('gateway')
  const [refreshSignal, setRefreshSignal] = useState(0)
  const fileCount = 0
  return <>
    <button onClick={() => setProjectRoot('/project-a')}>Project A</button>
    <button onClick={() => setProjectRoot('/project-b')}>Project B</button>
    <button onClick={() => setProjectRoot(null)}>Personal chat</button>
    <button onClick={() => setNodeId('remote-node')}>Remote node</button>
    <button onClick={() => setRefreshSignal(value => value + 1)}>Refresh</button>
    <GitDiffIndicator projectRoot={projectRoot} nodeId={nodeId} refreshSignal={refreshSignal} fileCount={fileCount} onOpen={() => {}} />
    <MobileBottomNav activeProjectId={projectRoot} changedFilesCount={fileCount}
      mobileProjectControlState={{ showProject: false, showProjectTree: false, showProjectEditor: false, treeTab: 'files', showTerminal: false }}
      showProject={false} showSidebar={false} showTerminal={false} onChatClick={() => {}} onProjectTargetAction={() => {}} />
  </>
}

createRoot(document.getElementById('root')!).render(<Harness />)
