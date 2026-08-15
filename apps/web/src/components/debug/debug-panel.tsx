import { useState } from 'react'
import { cn } from '@/lib/utils'
import { SSEDebugPanel } from './sse-debug-panel'
import { TrajectoryPanel } from './trajectory-panel'

interface DebugPanelProps {
  onClose: () => void
}

type Tab = 'trajectory' | 'sse'

const tabs: { id: Tab; label: string }[] = [
  { id: 'trajectory', label: 'Trajectory' },
  { id: 'sse', label: 'SSE' },
]

export function DebugPanel({ onClose }: DebugPanelProps) {
  const [tab, setTab] = useState<Tab>('trajectory')

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-2 pt-1.5 pb-1 border-b border-zinc-700/60 bg-zinc-900 shrink-0">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'px-3 py-1 text-2xs font-semibold uppercase tracking-wider rounded transition-colors',
              tab === t.id
                ? 'bg-zinc-700/60 text-white'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0">
        {tab === 'trajectory' ? (
          <TrajectoryPanel onClose={onClose} />
        ) : (
          <SSEDebugPanel onClose={onClose} />
        )}
      </div>
    </div>
  )
}
