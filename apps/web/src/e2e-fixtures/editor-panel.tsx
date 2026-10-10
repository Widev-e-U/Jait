import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ProjectPanel } from '@/components/project/project-panel'
import { ConfirmDialogProvider } from '@/components/ui/confirm-dialog'
import { TooltipProvider } from '@/components/ui/tooltip'
import '@/index.css'


const imageMode = new URLSearchParams(location.search).has('image')
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1600"><rect width="2400" height="1600" fill="blue"/></svg>'
const files = imageMode ? [{id:'test',name:'example.svg',path:'/repo/example.svg',content:'data:image/svg+xml,'+encodeURIComponent(svg),language:'xml'}] : [{ id: 'test', name: 'example.ts', path: '/repo/example.ts', content: 'export const value = 1', language: 'typescript' }]
function Fixture() {
  const [visible, setVisible] = useState(true)
  const [active, setActive] = useState<string | null>(null)
  return <ConfirmDialogProvider><TooltipProvider>
    <button onClick={() => setVisible(true)}>Show editor</button>
    <output data-testid="editor-visible">{String(visible)}</output>
    <div style={{ display: 'flex', height: 500 }}>
      <ProjectPanel files={files} activeFileId={active} isMobile={new URLSearchParams(location.search).has('mobile')} showTree showEditor={visible}
        onToggleEditor={() => setVisible(value => !value)}
        onActiveFileChange={id => { setActive(id); if (id) setVisible(true) }}
        onFileDrop={() => {}} onReferenceFile={() => {}} />
    </div>
  </TooltipProvider></ConfirmDialogProvider>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
