import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import type { ChatMessage } from '@/hooks/useChat'

const fixture = vi.hoisted(() => ({
  messages: [] as ChatMessage[],
  inputs: [] as ChatMessage[],
}))
vi.mock('@/hooks/useChat', () => ({
  useChat: () => ({ messages: fixture.messages, isLoading: true }),
}))
vi.mock('@/components/chat', () => ({
  Conversation: (props: { messageEstimateInputs: ChatMessage[] }) => {
    fixture.inputs = props.messageEstimateInputs
    return null
  },
  Message: () => null,
  PromptInput: () => null,
  ChatComposerSurface: () => null,
}))
import {
  ParallelChatPanel,
  areParallelChatPanelPropsEqual,
  type ParallelChatPanelProps,
} from './parallel-chat-panel'

/**
 * The comparator is what keeps an idle panel from re-rendering when the *main*
 * chat streams: App re-renders per token and hands every panel fresh prop
 * objects. These cases pin the two halves of that contract — the props App
 * re-creates every render must be compared structurally, and everything else
 * must stay identity-based so a genuine change still re-renders the panel.
 */
describe('areParallelChatPanelPropsEqual', () => {
  const onSearchFiles = async () => []
  const onClose = () => {}
  const availableFiles: ParallelChatPanelProps['availableFiles'] = []
  const availableSkills: ParallelChatPanelProps['availableSkills'] = []
  const session = { id: 'panel-1', projectId: 'project-1', lastActiveAt: '2024-01-01T00:00:00.000Z' }

  const baseProps = (): ParallelChatPanelProps => ({
    session: { ...session } as never,
    token: 'token',
    provider: 'codex' as never,
    responseStyle: 'normal',
    model: null,
    reasoningEffort: null,
    availableFiles,
    availableSkills,
    isMobile: false,
    onSearchFiles,
    showHideButton: false,
    onClose,
  })

  it('bails out when App re-creates the session object with identical fields', () => {
    const prev = baseProps()
    const next = baseProps()
    expect(prev.session).not.toBe(next.session)
    expect(areParallelChatPanelPropsEqual(prev, next)).toBe(true)
  })

  it('treats an omitted showDivider as equal to the internal default of true', () => {
    const prev = baseProps()
    const next = { ...baseProps(), showDivider: true }
    expect(areParallelChatPanelPropsEqual(prev, next)).toBe(true)
    expect(areParallelChatPanelPropsEqual(next, prev)).toBe(true)
    expect(areParallelChatPanelPropsEqual(prev, { ...next, showDivider: false })).toBe(false)
  })

  it('re-renders when a session field the panel reads changes', () => {
    const prev = baseProps()
    for (const patch of [
      { lastActiveAt: '2024-01-02T00:00:00.000Z' },
      { id: 'panel-2' },
      { projectId: 'project-2' },
    ]) {
      const next = { ...baseProps(), session: { ...session, ...patch } as never }
      expect(areParallelChatPanelPropsEqual(prev, next)).toBe(false)
    }
  })

  it('re-renders on identity changes for streamed or user-visible props', () => {
    const prev = baseProps()
    const variants: Partial<ParallelChatPanelProps>[] = [
      { token: 'other-token' },
      { provider: 'claude-code' as never },
      { responseStyle: 'concise' as never },
      { model: 'gpt-5' },
      { reasoningEffort: 'high' as never },
      { availableFiles: [] },
      { availableSkills: [] },
      { isMobile: true },
      { onSearchFiles: async () => [] },
      { showHideButton: true },
      { onClose: () => {} },
      { initialPrompt: { content: 'hi' } },
      { composerControlRow: null },
    ]
    for (const variant of variants) {
      expect(areParallelChatPanelPropsEqual(prev, { ...baseProps(), ...variant })).toBe(false)
    }
  })
})

describe('parallel transcript streaming work', () => {
  it('only invalidates the changing message across 60 stream paints', () => {
    fixture.messages = Array.from({ length: 200 }, (_, i) => ({
      id: String(i), role: 'assistant', content: 'Historical markdown '.repeat(100),
    }))
    const render = () => renderToString(createElement(ParallelChatPanel, {
      session: { id: 'panel', projectId: 'project' } as never,
      token: null, provider: 'codex' as never, responseStyle: 'normal',
      model: null, reasoningEffort: null, availableFiles: [], availableSkills: [],
      isMobile: false, onSearchFiles: async () => [], showHideButton: false, onClose: () => {},
    }))
    render()
    let invalidations = 0
    for (let frame = 0; frame < 60; frame++) {
      const previous = fixture.inputs
      fixture.messages = fixture.messages.map((m, i) => i === 199 ? { ...m, content: m.content + ' token' } : m)
      render()
      invalidations += fixture.inputs.filter((m, i) => m !== previous[i]).length
    }
    console.log('Minimap message cache invalidations over 60 paints:', invalidations)
    expect(invalidations).toBe(60)
  })
})
