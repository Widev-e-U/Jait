import React from 'react'
import { createRoot } from 'react-dom/client'
import { useSecretInputPrompt, useUserQuestionPrompt } from '../../../apps/web/src/components/prompts/input-prompts'
import '../../../apps/web/src/index.css'

function Harness() {
  const secret = useSecretInputPrompt({ token: 'fixture', sessionId: 'session' })
  const questions = useUserQuestionPrompt({ token: 'fixture', sessionId: 'session' })
  return <div style={{ height: '100dvh' }} className="flex flex-col bg-background text-foreground">
    <header className="border-b px-4 py-3 text-sm font-medium">Jait</header>
    <main className="min-h-0 flex-1 overflow-auto p-4 text-sm text-muted-foreground">I need your input before continuing.</main>
    <div className="mx-auto w-full max-w-4xl p-2">
      {/* Mirrors the real composer shell (bordered, rounded) so prompt cards are rendered
          where they actually live: nested inside it, not beside it. */}
      <div className="rounded-2xl border bg-background dark:bg-card focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20 overflow-hidden">
        <div className="max-h-[40vh] overflow-y-auto divide-y divide-border [&:not(:empty)]:border-b [&:not(:empty)]:border-border">
          {secret.inlinePrompt}
          {questions.inlinePrompt}
        </div>
        <div data-testid="composer" className="px-3 py-3 text-sm text-muted-foreground">Message Jait…</div>
      </div>
    </div>
  </div>
}
createRoot(document.getElementById('root')!).render(<Harness />)
