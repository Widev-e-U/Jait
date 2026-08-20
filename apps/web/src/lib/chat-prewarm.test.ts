import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildChatPrewarmRequest, createDraftPrewarmTrigger, type ChatPrewarmParams } from './chat-prewarm'

const base = {
  apiUrl: 'http://gateway.test',
  token: 'jwt-token',
  sessionId: 'session-1',
  provider: 'claude-code-abc',
}

describe('buildChatPrewarmRequest', () => {
  it('targets the prewarm endpoint with auth', () => {
    const request = buildChatPrewarmRequest(base)
    expect(request?.url).toBe('http://gateway.test/api/chat/prewarm')
    expect(request?.init.method).toBe('POST')
    expect((request?.init.headers as Record<string, string>).Authorization).toBe('Bearer jwt-token')
  })

  it('skips when there is no CLI provider to warm up', () => {
    expect(buildChatPrewarmRequest({ ...base, provider: 'jait' })).toBeNull()
    expect(buildChatPrewarmRequest({ ...base, provider: null })).toBeNull()
    expect(buildChatPrewarmRequest({ ...base, token: null })).toBeNull()
    expect(buildChatPrewarmRequest({ ...base, sessionId: '' })).toBeNull()
  })

  it('sends the same session-key fields the chat request will send', () => {
    const body = JSON.parse(String(buildChatPrewarmRequest({
      ...base,
      runtimeMode: 'full-access',
      model: 'opus',
      reasoningEffort: 'high',
    })?.init.body))

    expect(body).toEqual({
      sessionId: 'session-1',
      provider: 'claude-code-abc',
      runtimeMode: 'full-access',
      model: 'opus',
      reasoningEffort: 'high',
    })
  })

  it('omits optional key fields exactly like sendMessage does', () => {
    // undefined reasoningEffort means "unset" and must not be serialized —
    // the gateway distinguishes it from an explicit null when matching the
    // cached provider session.
    const body = JSON.parse(String(buildChatPrewarmRequest({
      ...base,
      reasoningEffort: undefined,
    })?.init.body))
    expect(body).toEqual({ sessionId: 'session-1', provider: 'claude-code-abc' })

    const nulled = JSON.parse(String(buildChatPrewarmRequest({
      ...base,
      reasoningEffort: null,
    })?.init.body))
    expect(nulled.reasoningEffort).toBeNull()
  })
})

describe('createDraftPrewarmTrigger', () => {
  const draftBase = { ...base, draft: 'h' }

  it('warms on the first non-empty draft, once per chat', () => {
    const sent: ChatPrewarmParams[] = []
    const trigger = createDraftPrewarmTrigger((params) => sent.push(params))

    trigger({ ...draftBase, draft: '' })
    trigger({ ...draftBase, draft: '   ' })
    expect(sent).toHaveLength(0)

    trigger({ ...draftBase, draft: 'h' })
    trigger({ ...draftBase, draft: 'he' })
    trigger({ ...draftBase, draft: 'hello' })
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ sessionId: 'session-1', provider: 'claude-code-abc' })
    // The draft text itself is never part of the request.
    expect(sent[0]).not.toHaveProperty('draft')
  })

  it('does not spawn a process for a chat that is only opened', () => {
    // The whole point of moving the trigger off chat creation: switching
    // providers in a brand-new chat must not leave a subprocess behind.
    const sent: ChatPrewarmParams[] = []
    const trigger = createDraftPrewarmTrigger((params) => sent.push(params))

    trigger({ ...draftBase, sessionId: 'fresh-chat', draft: '' })
    trigger({ ...draftBase, sessionId: 'fresh-chat', provider: 'codex', draft: '' })
    expect(sent).toHaveLength(0)
  })

  it('keeps the provider selected at the first keystroke', () => {
    // A provider switched after typing is left to the turn to swap — chasing
    // it here would spawn a second process for a selection still in motion.
    const sent: ChatPrewarmParams[] = []
    const trigger = createDraftPrewarmTrigger((params) => sent.push(params))

    trigger({ ...draftBase, draft: 'h' })
    trigger({ ...draftBase, provider: 'codex', draft: 'hi' })
    expect(sent).toHaveLength(1)
    expect(sent[0]?.provider).toBe('claude-code-abc')
  })

  it('tracks each chat separately and skips non-CLI providers', () => {
    const sent: ChatPrewarmParams[] = []
    const trigger = createDraftPrewarmTrigger((params) => sent.push(params))

    trigger({ ...draftBase, sessionId: 'a' })
    trigger({ ...draftBase, sessionId: 'b' })
    trigger({ ...draftBase, sessionId: 'c', provider: 'jait' })
    trigger({ ...draftBase, sessionId: 'd', provider: null })
    trigger({ ...draftBase, sessionId: '' })
    expect(sent.map((s) => s.sessionId)).toEqual(['a', 'b'])
  })

  it('retries once the selection finishes loading', () => {
    // The App-level guard drops keystrokes while the chat's saved provider is
    // still loading; a dropped attempt must not mark the chat as warmed.
    const sent: ChatPrewarmParams[] = []
    let loading = true
    const trigger = createDraftPrewarmTrigger((params) => sent.push(params))
    const typed = (draft: string, provider: string) => {
      if (loading) return
      trigger({ ...draftBase, draft, provider })
    }

    typed('h', 'default-provider')
    expect(sent).toHaveLength(0)
    loading = false
    typed('he', 'codex')
    expect(sent.map((s) => s.provider)).toEqual(['codex'])
  })
})

describe('composer pre-warm wiring', () => {
  it('warms from the chat composer, not from chat creation', () => {
    const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
    // The developer composer's onChange is the trigger…
    expect(app).toContain('createDraftPrewarmTrigger')
    expect(app).toContain('onHandleInputChange={handleChatInputChange}')
    // …and the manager composer is deliberately left on the plain handler.
    expect(app).toContain('onHandleInputChange={handleInputChange}')

    // Creating a chat must stay side-effect free.
    const projects = readFileSync(new URL('../hooks/useProjects.ts', import.meta.url), 'utf8')
    expect(projects).not.toContain('onSessionCreated')
    expect(app).not.toContain('prewarmChatSession')
  })
})
