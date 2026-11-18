import { describe, expect, it, vi } from 'vitest'
import { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const mocks = vi.hoisted(() => ({ approve: vi.fn(), refresh: vi.fn(), message: vi.fn() }))
vi.mock('@/lib/agents-api', () => ({ agentsApi: { approveToolCall: mocks.approve } }))
vi.mock('@/components/chat', () => ({
  Conversation: ({ children }: any) => children,
  Message: (props: any) => { mocks.message(props); return null },
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

function render(selectedThread: Record<string, unknown> | null, messages: unknown[] = []) {
  return renderToStaticMarkup(createElement(ThreadsPage, {
    automation: { selectedThread, selectedThreadTodos: [], repositories: [], threadPrStates: {}, refreshSelectedThread: mocks.refresh },
    automationMessages: messages, managerThreads: [], selectedManagerQueue: [],
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


describe('thread approval response', () => {
  it.each([true, false])('sends the explicit %s decision and refreshes recorded activity', async (approved) => {
    mocks.approve.mockReset().mockResolvedValue(undefined)
    mocks.refresh.mockReset().mockResolvedValue(undefined)
    mocks.message.mockClear()
    render({ id: 'thread-1', status: 'running' }, [{ id: 'message', role: 'assistant', content: '' }])
    const respond = mocks.message.mock.calls[0][0].onApprovalResponse
    await respond('request-1', approved)
    expect(mocks.approve).toHaveBeenCalledWith('thread-1', 'request-1', approved)
    expect(mocks.refresh).toHaveBeenCalledOnce()
  })

  it('waits for the submission before refreshing activity', async () => {
    let resolveSubmission!: () => void
    mocks.approve.mockReset().mockReturnValue(new Promise<void>((resolve) => { resolveSubmission = resolve }))
    mocks.refresh.mockReset().mockResolvedValue(undefined)
    mocks.message.mockClear()
    render({ id: 'thread-1', status: 'running' }, [{ id: 'message', role: 'assistant', content: '' }])
    const pending = mocks.message.mock.calls[0][0].onApprovalResponse('request-1', true)
    expect(mocks.refresh).not.toHaveBeenCalled()
    resolveSubmission()
    await pending
    expect(mocks.refresh).toHaveBeenCalledOnce()
  })

  it('propagates submission failure without refreshing or claiming success', async () => {
    mocks.approve.mockReset().mockRejectedValue(new Error('No active session'))
    mocks.refresh.mockReset()
    mocks.message.mockClear()
    render({ id: 'thread-1', status: 'running' }, [{ id: 'message', role: 'assistant', content: '' }])
    await expect(mocks.message.mock.calls[0][0].onApprovalResponse('request-1', false)).rejects.toThrow('No active session')
    expect(mocks.refresh).not.toHaveBeenCalled()
  })
})
