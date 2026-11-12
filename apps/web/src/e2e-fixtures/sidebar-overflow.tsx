import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Bug, FolderOpen, Folders, GitBranch, Globe, Terminal, Boxes } from 'lucide-react'
import { AppNavigationSidebar } from '@/components/app-shell/app-navigation-sidebar'
import { UpdateButton } from '@/components/app-shell/update-button'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { AppView } from '@/lib/app-view'
import '@/index.css'

function Harness() {
  const [lastAction, setLastAction] = useState('')
  const [currentView, setCurrentView] = useState<AppView>('chat')
  const [extraTool, setExtraTool] = useState(false)
  return <TooltipProvider><main className="flex h-dvh bg-background text-foreground">
    <AppNavigationSidebar
      account={{ username: 'Jakob', initial: 'J', loading: false, onLogin: () => {}, onLogout: () => {},
        themeMode: 'system', onThemeModeChange: () => {},
        updateControl: collapsed => <UpdateButton appPlatform="web" collapsed={collapsed}
          updateInfo={{ currentVersion: '1.0.0', latestVersion: '99.0.0', hasUpdate: true }}
          releases={[]} updateApplying={false} updateAwaitingRestart={false}
          onApplyUpdate={async () => { setLastAction('Update') }} />,
        agentControl: () => <button className="h-9 shrink-0">Agents</button> }}
      currentView={currentView}
      onNavigate={view => { setCurrentView(view); setLastAction(view) }}
      onOpenSettings={() => setLastAction('settings')}
      onToggleScreenShare={() => setLastAction('Screen Share')}
      items={[
        { id: 'projects', label: 'Projects & Chats', icon: Folders, onSelect: () => setLastAction('Projects & Chats') },
        { id: 'files', label: 'Files', icon: FolderOpen, onSelect: () => setLastAction('Files') },
        { id: 'git', label: 'Source Control', icon: GitBranch, badge: 2, onSelect: () => setLastAction('Source Control') },
        { id: 'terminal', label: 'Terminal', icon: Terminal, onSelect: () => setLastAction('Terminal') },
        { id: 'architecture', label: 'Architecture', description: 'Explore the project', icon: Boxes, disabled: true, onSelect: () => setLastAction('disabled') },
        { id: 'preview', label: 'Preview', description: 'Open the live app', icon: Globe, badge: 5, active: true, onSelect: () => setLastAction('Preview') },
        ...(extraTool ? [{ id: 'extra', label: 'Extra tool', icon: Bug, onSelect: () => setLastAction('Extra tool') }] : []),
      ]}
      bottomItems={[{ id: 'trajectory', label: 'Trajectory', icon: Bug, onSelect: () => setLastAction('Trajectory') }]}
    />
    <section className="p-6"><output aria-label="Last action">{lastAction}</output>
      <button onClick={() => setExtraTool(value => !value)}>Toggle extra tool</button>
    </section>
  </main></TooltipProvider>
}
createRoot(document.getElementById('root')!).render(<Harness />)
