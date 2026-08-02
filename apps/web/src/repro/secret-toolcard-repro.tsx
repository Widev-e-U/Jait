import { StrictMode, type ReactNode, useCallback, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Message } from '@/components/chat/message'
import type { ToolCallInfo } from '@/components/chat/tool-call-card'
import { secretRequestMatchesTool, type SecretInputRequest } from '@/lib/secret-input'
import type { MessageSegment } from '@/hooks/useChat'
import '@/index.css'

function SecretToolcardRepro() {
  const [value, setValue] = useState('')
  const [submitted, setSubmitted] = useState('')

  const request = useMemo<SecretInputRequest>(() => ({
    id: 'secret-e2e',
    sessionId: 'session-e2e',
    title: 'SSH password',
    prompt: "Password for alice@host",
    requestedBy: 'terminal.run',
    expiresAt: new Date(Date.now() + 120_000).toISOString(),
    status: 'pending',
  }), [])

  const toolCalls = useMemo<ToolCallInfo[]>(() => [{
    callId: 'terminal-ssh-e2e',
    tool: 'terminal.run',
    args: { command: 'ssh alice@host', timeout: 120_000 },
    status: 'running',
    streamingOutput: "alice@host's password: ",
    startedAt: Date.now(),
  }], [])

  const segments = useMemo<MessageSegment[]>(() => [
    { type: 'text', content: 'Terminal command started.' },
    { type: 'toolGroup', callIds: ['terminal-ssh-e2e'] },
  ], [])

  const renderInlineSecretPrompt = useCallback((call: ToolCallInfo): ReactNode => {
    if (!secretRequestMatchesTool(request, call.tool, call.args)) return null
    return (
      <form
        data-testid="inline-secret-form"
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          setSubmitted(value)
        }}
      >
        <div className="space-y-0.5">
          <p className="text-sm font-medium text-foreground">{request.title}</p>
          <p className="text-[11px] text-muted-foreground">This prompt is attached to the running tool call.</p>
        </div>
        <p className="text-sm text-muted-foreground">
          {request.prompt} The value goes directly to the local gateway and is not sent to the model.
        </p>
        <label className="block text-sm font-medium text-foreground" htmlFor="secret-repro-input">Secret</label>
        <input
          id="secret-repro-input"
          className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <button className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground" type="submit">
          Submit
        </button>
      </form>
    )
  }, [request, value])

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-4 text-xl font-semibold">Secret Toolcard Repro</h1>
      <div className="rounded-md border border-border p-4">
        <Message
          role="assistant"
          content="Terminal command started."
          toolCalls={toolCalls}
          segments={segments}
          isStreaming
          preferLlmUi
          renderInlineSecretPrompt={renderInlineSecretPrompt}
        />
      </div>
      <p data-testid="submitted-secret" className="mt-4 text-sm text-muted-foreground">
        {submitted ? `submitted:${submitted}` : 'not-submitted'}
      </p>
    </main>
  )
}

const container = document.getElementById('root')

if (!container) {
  throw new Error('Missing root element')
}

createRoot(container).render(
  <StrictMode>
    <SecretToolcardRepro />
  </StrictMode>,
)
