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

  // Reset dedup refs on session switch so the persistence effects re-save
  // the current value for the new session instead of short-circuiting when
  // the value happens to match the previous session's (e.g. both
  // 'full-access'). Without this, chat.providerRuntimeMode / chat.mode /
  // chat.responseStyle / chat.view are never written for chats opened after
  // the first one, so they "reset to default" on every reload.
  useEffect(() => {
    prevChatModePayloadRef.current = null
    prevChatResponseStylePayloadRef.current = null
    prevProviderRuntimeModePayloadRef.current = null
    prevChatViewPayloadRef.current = null
  }, [activeSessionId])

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
    if (activeSessionId && token && (!wsFullStateReceivedRef.current || loadingChatMode)) return
    if (chatMode === prevChatModePayloadRef.current) return
    prevChatModePayloadRef.current = chatMode as string
    if (consumeSuppressedUiSync('chat.mode')) return
    setSavedChatMode(chatMode)
    sendUIState('chat.mode', chatMode, activeSessionId)
  }, [chatMode, setSavedChatMode, sendUIState, activeSessionId, loadingChatMode, token, consumeSuppressedUiSync, wsFullStateReceivedRef])

  useEffect(() => {
    if (activeSessionId && token && (!wsFullStateReceivedRef.current || loadingChatResponseStyle)) return
    if (chatResponseStyle === prevChatResponseStylePayloadRef.current) return
    prevChatResponseStylePayloadRef.current = chatResponseStyle as string
    if (consumeSuppressedUiSync('chat.responseStyle')) return
    setSavedChatResponseStyle(chatResponseStyle)
    sendUIState('chat.responseStyle', chatResponseStyle, activeSessionId)
  }, [chatResponseStyle, setSavedChatResponseStyle, sendUIState, activeSessionId, loadingChatResponseStyle, token, consumeSuppressedUiSync, wsFullStateReceivedRef])

  useEffect(() => {
    if (activeSessionId && token && (!wsFullStateReceivedRef.current || loadingProviderRuntimeMode)) return
    if (chatProviderRuntimeMode === prevProviderRuntimeModePayloadRef.current) return
    prevProviderRuntimeModePayloadRef.current = chatProviderRuntimeMode as string
    if (consumeSuppressedUiSync('chat.providerRuntimeMode')) return
    setSavedProviderRuntimeMode(chatProviderRuntimeMode)
    sendUIState('chat.providerRuntimeMode', chatProviderRuntimeMode, activeSessionId)
  }, [chatProviderRuntimeMode, setSavedProviderRuntimeMode, sendUIState, activeSessionId, loadingProviderRuntimeMode, token, consumeSuppressedUiSync, wsFullStateReceivedRef])

  useEffect(() => {
    if (activeSessionId && token && (!wsFullStateReceivedRef.current || loadingChatView)) return
    if (viewMode === prevChatViewPayloadRef.current) return
    prevChatViewPayloadRef.current = viewMode as string
    if (consumeSuppressedUiSync('chat.view')) return
    setSavedChatView(viewMode)
    sendUIState('chat.view', viewMode, activeSessionId)
  }, [viewMode, setSavedChatView, sendUIState, activeSessionId, loadingChatView, token, consumeSuppressedUiSync, wsFullStateReceivedRef])

  useEffect(() => {
    if (activeSessionId && token && !wsFullStateReceivedRef.current) return
    const payload = messageQueue.length > 0 ? messageQueue : null
    const serialized = JSON.stringify(payload)
    if (serialized === prevQueuePayloadRef.current) return
    prevQueuePayloadRef.current = serialized
    if (consumeSuppressedUiSync('queued_messages')) return
    setSavedQueuedMessages(payload)
    sendUIState('queued_messages', payload, activeSessionId)
  }, [messageQueue, setSavedQueuedMessages, sendUIState, activeSessionId, consumeSuppressedUiSync, token, wsFullStateReceivedRef])

  useEffect(() => {
    if (activeSessionId && token && !wsFullStateReceivedRef.current) return
    const payload = toPersistedTodoState(todoList)
    const serialized = `${activeSessionId ?? ''}:${JSON.stringify(payload)}`
    if (serialized === prevTodoListPayloadRef.current) return
    prevTodoListPayloadRef.current = serialized
    if (consumeSuppressedUiSync('todo_list')) return
    setSavedTodoList(payload)
    sendUIState('todo_list', payload, activeSessionId)
  }, [todoList, setSavedTodoList, sendUIState, activeSessionId, consumeSuppressedUiSync, token, wsFullStateReceivedRef])

  useEffect(() => {
    if (activeSessionId && token && !wsFullStateReceivedRef.current) return
    const payload = Object.keys(managerMessageQueues).length > 0 ? managerMessageQueues : null
    const serialized = `${activeSessionId ?? ''}:${JSON.stringify(payload)}`
    if (serialized === prevThreadQueuePayloadRef.current) return
    prevThreadQueuePayloadRef.current = serialized
    if (consumeSuppressedUiSync('queued_thread_messages')) return
    setSavedQueuedThreadMessages(payload)
    sendUIState('queued_thread_messages', payload, activeSessionId)
  }, [managerMessageQueues, setSavedQueuedThreadMessages, sendUIState, activeSessionId, consumeSuppressedUiSync, token, wsFullStateReceivedRef])

  useEffect(() => {
    setOnChangedFilesSync((files: ChangedFile[]) => {
      const payload = files.length > 0 ? files : null
      if (consumeSuppressedUiSync('changed_files')) return
      setSavedChangedFiles(payload)
      sendUIState('changed_files', payload, activeSessionId)
    })
    return () => setOnChangedFilesSync(null)
  }, [sendUIState, activeSessionId, setOnChangedFilesSync, consumeSuppressedUiSync, setSavedChangedFiles])
}
