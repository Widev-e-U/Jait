import type { ReactNode } from 'react'
import { MessagesSquare, UsersRound } from 'lucide-react'

import type { AppView, ManagerPage } from '@/lib/app-view'

interface ManagerModeProps {
  currentPage: ManagerPage
  onPageChange: (page: AppView) => void
  isMobile: boolean
  children: ReactNode
}

export function ManagerMode({ currentPage, onPageChange, isMobile, children }: ManagerModeProps) {
  return (
    <main className={`flex min-h-0 flex-1 ${isMobile ? 'pt-14' : ''}`}>
      <nav aria-label="Manager pages" className="hidden w-48 shrink-0 flex-col gap-1 border-r bg-background p-3 md:flex">
        {(['threads', 'agents'] as const).map((page) => (
          <button
            key={page}
            type="button"
            aria-current={currentPage === page ? 'page' : undefined}
            onClick={() => onPageChange(page)}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${currentPage === page ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
          >
            {page === 'threads' ? <MessagesSquare className="h-4 w-4" /> : <UsersRound className="h-4 w-4" />}
            {page === 'threads' ? 'Threads' : 'Agents'}
          </button>
        ))}
      </nav>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </main>
  )
}
