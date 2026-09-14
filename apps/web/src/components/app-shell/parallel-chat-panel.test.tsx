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
import { ParallelChatPanel } from './parallel-chat-panel'

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
