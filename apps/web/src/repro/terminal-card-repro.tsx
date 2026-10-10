import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ToolCallCard, SubAgentAuthProvider } from '@/components/chat/tool-call-card'
import type { ToolCallInfo } from '@/components/chat/tool-call-card'
import { useTerminals } from '@/components/terminal/terminal-view'
import { TooltipProvider } from '@/components/ui/tooltip'
import { applyTerminalExecutionEvent } from '@/lib/tool-terminal-live'
import '@/index.css'

function TerminalCardRepro() {
  useTerminals()
  const [call, setCall] = useState<ToolCallInfo>({
    callId: 'terminal-repro-call', tool: 'mcp__jait_core__jait_terminal',
    args: {}, streamingArgs: '{"command":"bun', status: 'pending', startedAt: Date.now(),
  })
  Reflect.set(window, '__streamTerminalCommand', (command: string) => {
    setCall(previous => ({ ...previous, streamingArgs: JSON.stringify({ command }).slice(0, -2) }))
  })
  Reflect.set(window, '__announceTerminalBinding', (isBackground = false) => {
    setCall(previous => ({ ...previous, args: { command: 'bun run test', isBackground }, streamingArgs: undefined, status: 'running' }))
    applyTerminalExecutionEvent('terminal-repro', {
      terminalId: 'terminal-repro-pty',
      execution: {
        command: 'bun run test', actionId: 'terminal-repro-call',
        startedAt: new Date().toISOString(), completedAt: null,
        outputOffset: 12, outputEndOffset: null, isBackground, watched: isBackground ? true : null,
      },
    })
  })
  Reflect.set(window, '__finishTerminalCommand', () => {
    setCall(previous => ({
      ...previous, status: 'success', completedAt: Date.now(),
      result: { ok: true, message: 'Done', data: {
        terminalId: 'terminal-repro-pty', outputOffset: 12, outputEndOffset: 14,
        terminalOutput: '$ bun run test\r\nLIVE FIRST LINE\r\nLIVE SECOND LINE\r\n',
      } },
    }))
  })
  return <ToolCallCard call={call} />
}

createRoot(document.getElementById('root')!).render(
  <TooltipProvider>
    <SubAgentAuthProvider sessionId="terminal-repro">
      <main className="mx-auto max-w-3xl p-6"><TerminalCardRepro /></main>
    </SubAgentAuthProvider>
  </TooltipProvider>,
)
