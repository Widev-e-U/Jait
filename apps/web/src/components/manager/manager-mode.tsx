import type { ReactNode } from 'react'

import type { AppView, ManagerPage } from '@/lib/app-view'

interface ManagerModeProps {
  currentPage: ManagerPage
  onPageChange: (page: AppView) => void
  isMobile: boolean
  children: ReactNode
}

export function ManagerMode({ currentPage, onPageChange, isMobile, children }: ManagerModeProps) {
  return (
    <main className={`flex min-h-0 flex-1 flex-col ${isMobile ? 'pt-14' : ''}`}>
      <nav aria-label="Manager pages" className="flex shrink-0 items-center gap-1 border-b bg-background px-3 py-2 sm:px-5">
        {(['threads', 'agents'] as const).map((page) => (
          <button
            key={page}
            type="button"
            aria-current={currentPage === page ? 'page' : undefined}
            onClick={() => onPageChange(page)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${currentPage === page ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
          >
            {page === 'threads' ? 'Threads' : 'Agents'}
          </button>
        ))}
      </nav>
      {children}
    </main>
  )
}
