import { createRoot } from 'react-dom/client'
import { ToolCallCard, SubAgentAuthProvider } from '@/components/chat/tool-call-card'
import { TooltipProvider } from '@/components/ui/tooltip'
import { applyTerminalExecutionEvent } from '@/lib/tool-terminal-live'
import '@/index.css'

function announceBinding() {
  applyTerminalExecutionEvent('terminal-repro', {
    terminalId: 'terminal-repro-pty',
    execution: {
      command: 'bun run test', actionId: 'terminal-repro-call',
      startedAt: new Date().toISOString(), completedAt: null,
      outputOffset: 12, outputEndOffset: null, isBackground: false, watched: null,
    },
  })
}

Reflect.set(window, '__announceTerminalBinding', announceBinding)
createRoot(document.getElementById('root')!).render(
  <TooltipProvider>
    <SubAgentAuthProvider sessionId="terminal-repro">
      <main className="mx-auto max-w-3xl p-6">
        <ToolCallCard call={{
          callId: 'terminal-repro-call', tool: 'mcp__jait_core__jait_terminal',
          args: { command: 'bun run test' }, status: 'running', startedAt: Date.now(),
        }} />
      </main>
    </SubAgentAuthProvider>
  </TooltipProvider>,
)
