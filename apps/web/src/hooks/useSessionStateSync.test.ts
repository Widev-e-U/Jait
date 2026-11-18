import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStateSync } from './useSessionStateSync'

// Run the real persistence effects across renders without mounting the app's
// transport, auth, and project UI. Preserve refs and React's dependency checks.
const hooks = vi.hoisted(() => ({
  cursor: 0,
  slots: [] as { current?: unknown; deps?: unknown[] }[],
  effects: [] as (() => unknown)[],
}))
vi.mock('react', () => ({
  useRef: (initial: unknown) => {
    const index = hooks.cursor++
    return hooks.slots[index] ??= { current: initial }
  },
  useEffect: (effect: () => unknown, deps: unknown[]) => {
    const index = hooks.cursor++
    const previous = hooks.slots[index]?.deps
    hooks.slots[index] = { deps }
    if (!previous || deps.some((value, i) => !Object.is(value, previous[i]))) {
      hooks.effects.push(effect)
    }
  },
}))

type Options = Parameters<typeof useSessionStateSync>[0]

function setup() {
  const suppressed = new Set<string>()
  const persisted = new Map<string, unknown>()
  const setSavedQueuedMessages = vi.fn((value: unknown) => {
    persisted.set('queued_messages', structuredClone(value))
  })
  const options: Options = {
    activeSessionId: 'session-a',
    token: 'token',
    wsFullStateReceivedRef: { current: true },
    chatMode: 'agent',
    chatResponseStyle: 'normal',
    chatProviderRuntimeMode: 'default',
    viewMode: 'chat',
    showMobileToolbar: false,
    loadingChatMode: false,
    loadingChatResponseStyle: false,
    loadingChatView: false,
    loadingProviderRuntimeMode: false,
    managerMessageQueues: {},
    messageQueue: [],
    todoList: [],
    consumeSuppressedUiSync: (key) => suppressed.delete(key),
    sendUIState: vi.fn(),
    setOnChangedFilesSync: vi.fn(),
    setSavedChangedFiles: vi.fn(),
    setSavedChatMode: vi.fn(),
    setSavedChatResponseStyle: vi.fn(),
    setSavedChatView: vi.fn(),
    setSavedProviderRuntimeMode: vi.fn(),
    setSavedQueuedMessages,
    setSavedQueuedThreadMessages: vi.fn(),
    setSavedTodoList: vi.fn(),
  }
  // Named like a custom hook because it calls the hook under test.
  const useRender = (messageQueue: unknown[]) => {
    hooks.cursor = 0
    useSessionStateSync({ ...options, messageQueue })
    hooks.effects.splice(0).forEach(effect => effect())
  }
  return { useRender, options, suppressed, persisted, setSavedQueuedMessages }
}

beforeEach(() => {
  hooks.cursor = 0
  hooks.slots = []
  hooks.effects = []
})

describe('queued message persistence', () => {
  it('saves the second message after the server echoes the first queue', () => {
    const { useRender, suppressed, persisted, setSavedQueuedMessages } = setup()
    const first = { id: 'q-1', content: 'first', queuedAt: 1 }
    const second = { id: 'q-2', content: 'second', queuedAt: 2 }
    useRender([first])
    expect(setSavedQueuedMessages).toHaveBeenCalledWith([first], { immediate: true })

    // The WS broadcast creates a fresh array with the same persisted value.
    suppressed.add('queued_messages')
    useRender([structuredClone(first)])
    expect(setSavedQueuedMessages).toHaveBeenCalledTimes(1)

    useRender([first, second])
    // This is the server snapshot a reloaded page will restore.
    expect(persisted.get('queued_messages')).toEqual([first, second])
    expect(setSavedQueuedMessages).toHaveBeenLastCalledWith([first, second], { immediate: true })
  })

  it('does not echo remote updates and still saves the next local edit', () => {
    const { useRender, suppressed, setSavedQueuedMessages } = setup()
    useRender([])
    setSavedQueuedMessages.mockClear()
    const first = { id: 'q-remote', content: 'remote', queuedAt: 1 }
    suppressed.add('queued_messages')
    useRender([first])
    expect(setSavedQueuedMessages).not.toHaveBeenCalled()
    useRender([])
    expect(setSavedQueuedMessages).toHaveBeenCalledWith(null, { immediate: true })
  })

  it('does not overwrite persisted messages before the full state arrives', () => {
    const { useRender, options, setSavedQueuedMessages } = setup()
    options.wsFullStateReceivedRef.current = false
    useRender([])
    expect(setSavedQueuedMessages).not.toHaveBeenCalled()
  })

  it('keeps both queued messages and their attachments across a page reload', () => {
    const { useRender, options, suppressed, persisted, setSavedQueuedMessages } = setup()
    const first = { id: 'q-1', content: 'first', queuedAt: 1 }
    const second = {
      id: 'q-2',
      content: 'second',
      queuedAt: 2,
      attachments: [{ name: 'note.txt', mimeType: 'text/plain', data: 'aGk=' }],
    }
    useRender([first])
    // The server echoes the first queue back while the user queues a second one.
    suppressed.add('queued_messages')
    useRender([structuredClone(first)])
    useRender([first, second])
    expect(persisted.get('queued_messages')).toEqual([first, second])

    // Reload: a fresh hook instance with fresh refs, and the full state push
    // has not arrived yet, so the empty queue must not wipe the server copy.
    hooks.slots = []
    hooks.cursor = 0
    setSavedQueuedMessages.mockClear()
    options.wsFullStateReceivedRef.current = false
    useRender([])
    expect(setSavedQueuedMessages).not.toHaveBeenCalled()

    // The server snapshot arrives as serialized JSON and rehydrates both
    // queued messages, including the attachment of the second one.
    options.wsFullStateReceivedRef.current = true
    const serverSnapshot = JSON.parse(JSON.stringify(persisted.get('queued_messages')))
    useRender(serverSnapshot)
    expect(persisted.get('queued_messages')).toEqual([first, second])
    const rehydrated = persisted.get('queued_messages') as Array<Record<string, unknown>>
    expect(rehydrated).toHaveLength(2)
    expect(rehydrated[1]).toEqual(
      expect.objectContaining({
        id: 'q-2',
        attachments: [{ name: 'note.txt', mimeType: 'text/plain', data: 'aGk=' }],
      }),
    )
  })
})
