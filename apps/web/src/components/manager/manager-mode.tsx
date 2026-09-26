import { createContext, useContext, useState, type ReactNode } from 'react'
import { FolderGit2 } from 'lucide-react'

import { AppNavigationSidebar } from '@/components/app-shell/app-navigation-sidebar'
import type { SidebarAccount } from '@/components/app-shell/mode-sidebar'
import type { ViewMode } from '@/components/chat/view-mode-selector'
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
  account: SidebarAccount
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
}

export function ManagerMode({ currentPage, onPageChange, isMobile, children, account, viewMode, onViewModeChange }: ManagerModeProps) {
  const [section, setSection] = useState<ManagerSidebarSection>('threads')

  const toggleRepositories = () => setSection((current) => current === 'repositories' ? 'threads' : 'repositories')

  return (
    <ManagerSidebarContext.Provider value={section}>
      <main className={`flex min-h-0 flex-1 ${isMobile ? 'pt-14' : ''}`}>
        {!isMobile && (
          <AppNavigationSidebar
            account={account}
            currentView={currentPage}
            viewMode={viewMode}
            onNavigate={onPageChange}
            onViewModeChange={onViewModeChange}
            items={currentPage === 'threads' ? [
              { id: 'repositories', label: 'Repositories', description: 'Browse connected repositories', icon: FolderGit2, active: section === 'repositories', onSelect: toggleRepositories },
            ] : []}
            onOpenSettings={() => onPageChange('settings')}
          />
        )}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
      </main>
    </ManagerSidebarContext.Provider>
  )
}
