import { useEffect, useRef } from 'react'

import type { ChangedFile, TodoItem } from '@/components/chat'
import { toPersistedTodoState } from '@/lib/todo-state'

interface UseSessionStateSyncOptions {
  activeSessionId: string | null
  chatMode: unknown
  chatResponseStyle: unknown
  chatProviderRuntimeMode: unknown
  consumeSuppressedUiSync: (key: string) => boolean
  loadingChatMode: boolean
  loadingChatResponseStyle: boolean
  loadingChatView: boolean
  loadingProviderRuntimeMode: boolean
  managerMessageQueues: Record<string, unknown[]>
  messageQueue: unknown[]
  sendUIState: any
  setOnChangedFilesSync: (callback: ((files: ChangedFile[]) => void) | null) => void
  setSavedChangedFiles: any
  setSavedChatMode: any
  setSavedChatResponseStyle: any
  setSavedChatView: any
  setSavedProviderRuntimeMode: any
  setSavedQueuedMessages: any
  setSavedQueuedThreadMessages: any
  setSavedTodoList: any
  showMobileToolbar: boolean
  todoList: TodoItem[]
  token: string | null
  viewMode: unknown
  wsFullStateReceivedRef: React.RefObject<boolean>
}

export function useSessionStateSync({
  activeSessionId,
  chatMode,
  chatResponseStyle,
  chatProviderRuntimeMode,
  consumeSuppressedUiSync,
  loadingChatMode,
  loadingChatResponseStyle,
  loadingChatView,
  loadingProviderRuntimeMode,
  managerMessageQueues,
  messageQueue,
  sendUIState,
  setOnChangedFilesSync,
  setSavedChangedFiles,
  setSavedChatMode,
  setSavedChatResponseStyle,
  setSavedChatView,
  setSavedProviderRuntimeMode,
  setSavedQueuedMessages,
  setSavedQueuedThreadMessages,
  setSavedTodoList,
  showMobileToolbar,
  todoList,
  token,
  viewMode,
  wsFullStateReceivedRef,
}: UseSessionStateSyncOptions) {
  const prevChatModePayloadRef = useRef<string | null>(null)
  const prevFooterMenuPayloadRef = useRef<string | null>(null)
  const prevChatResponseStylePayloadRef = useRef<string | null>(null)
  const prevProviderRuntimeModePayloadRef = useRef<string | null>(null)
  const prevChatViewPayloadRef = useRef<string | null>(null)
  const prevQueuePayloadRef = useRef<string | null>(null)
  const prevTodoListPayloadRef = useRef<string | null>(null)
  const prevThreadQueuePayloadRef = useRef<string | null>(null)

  useEffect(() => {
    if (activeSessionId && token && !wsFullStateReceivedRef.current) return
    const payload = { open: showMobileToolbar }
    const serialized = JSON.stringify(payload)
    if (serialized === prevFooterMenuPayloadRef.current) return
    prevFooterMenuPayloadRef.current = serialized
    if (consumeSuppressedUiSync('footer.menu')) return
    sendUIState('footer.menu', payload, activeSessionId)
  }, [activeSessionId, consumeSuppressedUiSync, sendUIState, showMobileToolbar, token, wsFullStateReceivedRef])

  useEffect(() => {
    if (activeSessionId && token && loadingChatMode) return
    if (chatMode === prevChatModePayloadRef.current) return
    prevChatModePayloadRef.current = chatMode as string
    setSavedChatMode(chatMode)
    if (consumeSuppressedUiSync('chat.mode')) return
    sendUIState('chat.mode', chatMode, activeSessionId)
  }, [chatMode, setSavedChatMode, sendUIState, activeSessionId, loadingChatMode, token, consumeSuppressedUiSync])

  useEffect(() => {
    if (activeSessionId && token && loadingChatResponseStyle) return
    if (chatResponseStyle === prevChatResponseStylePayloadRef.current) return
    prevChatResponseStylePayloadRef.current = chatResponseStyle as string
    setSavedChatResponseStyle(chatResponseStyle)
    if (consumeSuppressedUiSync('chat.responseStyle')) return
    sendUIState('chat.responseStyle', chatResponseStyle, activeSessionId)
  }, [chatResponseStyle, setSavedChatResponseStyle, sendUIState, activeSessionId, loadingChatResponseStyle, token, consumeSuppressedUiSync])

  useEffect(() => {
    if (activeSessionId && token && loadingProviderRuntimeMode) return
    if (chatProviderRuntimeMode === prevProviderRuntimeModePayloadRef.current) return
    prevProviderRuntimeModePayloadRef.current = chatProviderRuntimeMode as string
    setSavedProviderRuntimeMode(chatProviderRuntimeMode)
    if (consumeSuppressedUiSync('chat.providerRuntimeMode')) return
    sendUIState('chat.providerRuntimeMode', chatProviderRuntimeMode, activeSessionId)
  }, [chatProviderRuntimeMode, setSavedProviderRuntimeMode, sendUIState, activeSessionId, loadingProviderRuntimeMode, token, consumeSuppressedUiSync])

  useEffect(() => {
    if (activeSessionId && token && loadingChatView) return
    if (viewMode === prevChatViewPayloadRef.current) return
    prevChatViewPayloadRef.current = viewMode as string
    setSavedChatView(viewMode)
    if (consumeSuppressedUiSync('chat.view')) return
    sendUIState('chat.view', viewMode, activeSessionId)
  }, [viewMode, setSavedChatView, sendUIState, activeSessionId, loadingChatView, token, consumeSuppressedUiSync])

  useEffect(() => {
    const payload = messageQueue.length > 0 ? messageQueue : null
    const serialized = JSON.stringify(payload)
    if (serialized === prevQueuePayloadRef.current) return
    prevQueuePayloadRef.current = serialized
    setSavedQueuedMessages(payload)
    if (consumeSuppressedUiSync('queued_messages')) return
    sendUIState('queued_messages', payload, activeSessionId)
  }, [messageQueue, setSavedQueuedMessages, sendUIState, activeSessionId, consumeSuppressedUiSync])

  useEffect(() => {
    if (activeSessionId && token && !wsFullStateReceivedRef.current) return
    const payload = toPersistedTodoState(todoList)
    const serialized = `${activeSessionId ?? ''}:${JSON.stringify(payload)}`
    if (serialized === prevTodoListPayloadRef.current) return
    prevTodoListPayloadRef.current = serialized
    setSavedTodoList(payload)
    if (consumeSuppressedUiSync('todo_list')) return
    sendUIState('todo_list', payload, activeSessionId)
  }, [todoList, setSavedTodoList, sendUIState, activeSessionId, consumeSuppressedUiSync, token, wsFullStateReceivedRef])

  useEffect(() => {
    const payload = Object.keys(managerMessageQueues).length > 0 ? managerMessageQueues : null
    const serialized = `${activeSessionId ?? ''}:${JSON.stringify(payload)}`
    if (serialized === prevThreadQueuePayloadRef.current) return
    prevThreadQueuePayloadRef.current = serialized
    setSavedQueuedThreadMessages(payload)
    if (consumeSuppressedUiSync('queued_thread_messages')) return
    sendUIState('queued_thread_messages', payload, activeSessionId)
  }, [managerMessageQueues, setSavedQueuedThreadMessages, sendUIState, activeSessionId, consumeSuppressedUiSync])

  useEffect(() => {
    setOnChangedFilesSync((files: ChangedFile[]) => {
      const payload = files.length > 0 ? files : null
      setSavedChangedFiles(payload)
      if (consumeSuppressedUiSync('changed_files')) return
      sendUIState('changed_files', payload, activeSessionId)
    })
    return () => setOnChangedFilesSync(null)
  }, [sendUIState, activeSessionId, setOnChangedFilesSync, consumeSuppressedUiSync, setSavedChangedFiles])
}
