import { useCallback, type RefObject } from 'react'
import { toast } from 'sonner'

import type { ReferencedFile, PromptInputHandle } from '@/components/chat'
import { saveDetachedTerminal } from '@/components/terminal/detached-terminal-view'
import type { PreviewInspectInteractiveElement } from '@/components/project/project-preview-inspect-panel'
import {
  buildFileSelectionReferenceSegments,
  buildPreviewElementReferenceSegments,
  buildTerminalSelectionReferenceSegments,
} from '@/lib/message-segment-builders'
import type { MobileProjectTarget } from '@/lib/mobile-project-controls'
import { terminalBelongsToProject } from '@/components/terminal'

interface UseTerminalInteractionHandlersOptions {
  activeProjectRoot: string | null
  activeProjectNodeId: string
  activeSessionId: string | null
  activeTerminalId: string | null
  appliedThemeMode: string
  closeProjectPanel: () => void
  closeTerminalPanel: () => void
  createTerminal: (sessionId: string, projectRoot?: string, shell?: string, nodeId?: string | null) => Promise<{ id: string }>
  handleToggleEditor: () => Promise<void>
  killTerminal: (id: string) => Promise<void>
  openTerminalPanel: () => void
  projectTerminals: any[]
  promptInputRef: RefObject<PromptInputHandle | null>
  refresh: () => Promise<any[]>
  setActiveTerminalId: (terminalId: string) => void
  setCurrentView: (view: 'chat') => void
  setShowSidebar: (show: boolean) => void
  showMobileProjectEditorTab: () => void
  showMobileProjectTreeTab: (tab: 'files' | 'git') => void
  showProject: boolean
  showSidebar: boolean
  showTerminal: boolean
  token: string | null
}

export function useTerminalInteractionHandlers({
  activeProjectRoot,
  activeProjectNodeId,
  activeSessionId,
  activeTerminalId,
  appliedThemeMode,
  closeProjectPanel,
  closeTerminalPanel,
  createTerminal,
  handleToggleEditor,
  killTerminal,
  openTerminalPanel,
  projectTerminals,
  promptInputRef,
  refresh,
  setActiveTerminalId,
  setCurrentView,
  setShowSidebar,
  showMobileProjectEditorTab,
  showMobileProjectTreeTab,
  showProject,
  showSidebar,
  showTerminal,
  token,
}: UseTerminalInteractionHandlersOptions) {
  const ensureActiveTerminal = useCallback(async (preferredTerminalId: string | null = null) => {
    const refreshed = await refresh()
    const wsRoot = activeProjectRoot
    const wsTerminals = wsRoot
      ? refreshed.filter((terminal) => terminalBelongsToProject(terminal, wsRoot, activeProjectNodeId))
      : refreshed

    if (preferredTerminalId) {
      const preferredExists = wsTerminals.some((terminal) => terminal.id === preferredTerminalId)
      if (preferredExists) {
        setActiveTerminalId(preferredTerminalId)
        return preferredTerminalId
      }
    }

    if (activeTerminalId && wsTerminals.some((terminal) => terminal.id === activeTerminalId)) {
      return activeTerminalId
    }

    if (wsTerminals.length > 0) {
      const fallbackId = wsTerminals[wsTerminals.length - 1]!.id
      setActiveTerminalId(fallbackId)
      return fallbackId
    }

    try {
      const created = await createTerminal(
        activeSessionId ?? 'default',
        activeProjectRoot ?? undefined,
        undefined,
        activeProjectNodeId,
      )
      return created.id
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Failed to create terminal'
      const isRemote = activeProjectNodeId && activeProjectNodeId !== 'gateway'
      toast.error(isRemote ? 'Terminal unavailable on this node' : 'Failed to open terminal', {
        description: isRemote
          ? `${reason}. Make sure the node is connected and the project path exists on it.`
          : reason,
        duration: 8000,
      })
      return null
    }
  }, [refresh, setActiveTerminalId, activeTerminalId, createTerminal, activeSessionId, activeProjectRoot, activeProjectNodeId])

  const handleOpenTerminalFromToolCall = useCallback(async (terminalId: string | null) => {
    setCurrentView('chat')
    openTerminalPanel()
    const id = await ensureActiveTerminal(terminalId)
    if (!id) closeTerminalPanel()
  }, [ensureActiveTerminal, openTerminalPanel, closeTerminalPanel, setCurrentView])

  const handleMobileProjectTargetAction = useCallback(async (target: MobileProjectTarget) => {
    if (showSidebar) {
      setShowSidebar(false)
    }

    if (target === 'terminal') {
      setCurrentView('chat')
      closeProjectPanel()
      openTerminalPanel()
      const id = await ensureActiveTerminal()
      if (!id) closeTerminalPanel()
      return
    }

    if (showTerminal) {
      closeTerminalPanel()
    }

    if (target === 'editor') {
      if (!showProject) {
        await handleToggleEditor()
      }
      showMobileProjectEditorTab()
      return
    }

    if (!showProject) {
      await handleToggleEditor()
    }
    showMobileProjectTreeTab(target)
  }, [closeTerminalPanel, closeProjectPanel, ensureActiveTerminal, handleToggleEditor, openTerminalPanel, setCurrentView, setShowSidebar, showMobileProjectEditorTab, showMobileProjectTreeTab, showSidebar, showTerminal, showProject])

  const handleReferenceFile = useCallback((file: ReferencedFile) => {
    promptInputRef.current?.insertChip(file)
    promptInputRef.current?.focus()
  }, [promptInputRef])

  const handleReferenceFileSelection = useCallback((file: ReferencedFile, selection: string, startLine: number, endLine: number) => {
    const trimmed = selection.trim()
    if (!trimmed) return
    promptInputRef.current?.insertSegments(buildFileSelectionReferenceSegments(file, startLine, endLine))
    promptInputRef.current?.focus()
  }, [promptInputRef])

  const handleReferenceTerminalSelection = useCallback((terminalId: string, selection: string, projectRoot?: string | null, startLine?: number, endLine?: number) => {
    const trimmed = selection.trim()
    if (!trimmed) return
    const name = terminalId.replace(/^term-/, '').slice(0, 8) || terminalId
    promptInputRef.current?.insertSegments(buildTerminalSelectionReferenceSegments({
      terminalId,
      name,
      ...(projectRoot ? { projectRoot } : {}),
    }, trimmed, startLine, endLine))
    promptInputRef.current?.focus()
  }, [promptInputRef])

  const handleReferencePreviewElement = useCallback((element: PreviewInspectInteractiveElement) => {
    if (!element.selector) return
    promptInputRef.current?.insertSegments(buildPreviewElementReferenceSegments(element))
    promptInputRef.current?.focus()
    setCurrentView('chat')
  }, [promptInputRef, setCurrentView])

  const handleToggleTerminal = useCallback(async () => {
    if (showTerminal) {
      closeTerminalPanel()
      return
    }
    setCurrentView('chat')
    // Close the project panel so the terminal opens full height instead of
    // rendering as a short bottom panel beneath the project.
    closeProjectPanel()
    openTerminalPanel()
    const id = await ensureActiveTerminal()
    if (!id) closeTerminalPanel()
  }, [showTerminal, ensureActiveTerminal, openTerminalPanel, closeTerminalPanel, closeProjectPanel, setCurrentView])

  const handleKillTerminal = useCallback(async (id: string) => {
    const isLastProjectTerminal = projectTerminals.length === 1 && projectTerminals[0]?.id === id
    await killTerminal(id)
    if (isLastProjectTerminal) {
      closeTerminalPanel()
    }
  }, [projectTerminals, killTerminal, closeTerminalPanel])

  const handleDetachTerminal = useCallback((terminalId: string) => {
    const terminal = projectTerminals.find((item) => item.id === terminalId)
    const detachedId = `detached-terminal-${terminalId}-${Date.now()}`
    saveDetachedTerminal({
      id: detachedId,
      terminalId,
      token: token ?? null,
      label: (terminal?.metadata?.cwd as string) ?? `Terminal ${terminalId.slice(0, 6)}`,
      theme: appliedThemeMode === 'dark' ? 'dark' : 'light',
      projectRoot: (terminal?.projectRoot as string) ?? activeProjectRoot ?? null,
    })
    const detachedUrl = `${window.location.origin}${window.location.pathname}?detachedTerminal=${encodeURIComponent(detachedId)}`
    if ((window as any).jaitDesktop?.openProjectWindow) {
      void (window as any).jaitDesktop.openProjectWindow({ url: detachedUrl, title: 'Terminal' })
    } else {
      const popup = window.open(detachedUrl, `jait-detached-terminal-${terminalId}`, 'popup=yes,width=800,height=600,resizable=yes,scrollbars=yes')
      popup?.focus?.()
    }
  }, [projectTerminals, token, appliedThemeMode, activeProjectRoot])

  return {
    ensureActiveTerminal,
    handleDetachTerminal,
    handleKillTerminal,
    handleMobileProjectTargetAction,
    handleOpenTerminalFromToolCall,
    handleReferenceFile,
    handleReferenceFileSelection,
    handleReferencePreviewElement,
    handleReferenceTerminalSelection,
    handleToggleTerminal,
  }
}
