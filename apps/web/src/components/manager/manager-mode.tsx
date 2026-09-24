import { createContext, useContext, useState, type ReactNode } from 'react'
import { FolderGit2, MessagesSquare } from 'lucide-react'

import { ModeSidebar } from '@/components/app-shell/mode-sidebar'
import type { AppView, ManagerPage } from '@/lib/app-view'

export type ManagerSidebarSection = 'threads' | 'repositories'

const ManagerSidebarContext = createContext<ManagerSidebarSection>('threads')

export function useManagerSidebarSection() {
  return useContext(ManagerSidebarContext)
}

interface ManagerModeProps {
  currentPage: ManagerPage
  onPageChange: (page: AppView) => void
  isMobile: boolean
  children: ReactNode
}

export function ManagerMode({ currentPage, onPageChange, isMobile, children }: ManagerModeProps) {
  const [section, setSection] = useState<ManagerSidebarSection>('threads')

  const selectSection = (next: ManagerSidebarSection) => {
    setSection(next)
    onPageChange('threads')
  }

  return (
    <ManagerSidebarContext.Provider value={section}>
      <main className={`flex min-h-0 flex-1 ${isMobile ? 'pt-14' : ''}`}>
        {!isMobile && (
          <ModeSidebar
            items={[
              { id: 'threads', label: 'Threads', icon: MessagesSquare, active: currentPage === 'threads' && section === 'threads', onSelect: () => selectSection('threads') },
              { id: 'repositories', label: 'Repositories', icon: FolderGit2, active: currentPage === 'threads' && section === 'repositories', onSelect: () => selectSection('repositories') },
            ]}
            onOpenSettings={() => onPageChange('settings')}
          />
        )}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
      </main>
    </ManagerSidebarContext.Provider>
  )
}
