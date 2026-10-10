import { describe, expect, it, vi } from 'vitest'
import { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/components/chat', () => ({
  Conversation: ({ children }: any) => children,
  Message: () => null,
  TodoList: () => null,
  MessageQueue: () => null,
  PromptInput: (props: any) => createElement('output', {
    'data-provider': props.provider,
    'data-model': props.cliModel ?? '',
    'data-effort': props.reasoningEffort ?? '',
    'data-runtime': props.providerRuntimeMode,
    'data-locked': String(Boolean(props.controlsDisabled)),
  }),
}))
vi.mock('@/components/manager/manager-mode', () => ({ useManagerSidebarSection: () => 'threads' }))
vi.mock('@/components/manager/manager-thread-ui', () => ({
  ManagerRepoPicker: () => null,
  ManagerRepoRuntimeMeta: () => null,
  ManagerRepositoryPanel: () => null,
  ManagerThreadListItem: () => null,
  getVisibleThreadPrState: () => null,
}))
vi.mock('./thread-approval-notice', () => ({ ThreadApprovalNotice: () => null }))
import { ThreadsPage } from './threads-page'

function render(selectedThread: Record<string, unknown> | null) {
  return renderToStaticMarkup(createElement(ThreadsPage, {
    automation: { selectedThread, selectedThreadTodos: [], repositories: [], threadPrStates: {} },
    automationMessages: [], managerThreads: [], selectedManagerQueue: [],
    availableFiles: [], availableSkills: [],
    chatProvider: 'jait', cliModel: 'default-model', chatReasoningEffort: 'low',
    chatProviderRuntimeMode: 'full-access', chatResponseStyle: 'normal',
    inputValueRef: { current: '' }, promptInputRef: { current: null }, inputVersion: 0,
  } as unknown as ComponentProps<typeof ThreadsPage>))
}

describe('thread composer execution selection', () => {
  it.each(['running', 'idle', 'completed', 'interrupted'])('shows the selected %s thread rather than the project default', (status) => {
    const html = render({ id: 'codex-thread', status, providerId: 'codex-account', model: 'gpt-6', reasoningEffort: 'high', runtimeMode: 'supervised' })
    expect(html).toContain('data-provider="codex-account"')
    expect(html).toContain('data-model="gpt-6"')
    expect(html).toContain('data-effort="high"')
    expect(html).toContain('data-runtime="supervised"')
    expect(html).toContain('data-locked="true"')
  })

  it('keeps null thread model/effort instead of borrowing defaults', () => {
    const html = render({ id: 'thread', status: 'running', providerId: 'claude-code', model: null, reasoningEffort: null, runtimeMode: 'full-access' })
    expect(html).toContain('data-model=""')
    expect(html).toContain('data-effort=""')
  })

  it('uses editable defaults when creating a new thread', () => {
    const html = render(null)
    expect(html).toContain('data-provider="jait"')
    expect(html).toContain('data-model="default-model"')
    expect(html).toContain('data-locked="false"')
  })
})
