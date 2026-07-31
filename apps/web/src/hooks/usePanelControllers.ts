import { useCallback, useRef, type RefObject } from 'react'

import { toggleDesktopProjectTreeVisibility } from '@/components/project/project-panel-layout'
import { getPersistablePreviewTarget } from '@/lib/project-ui-state'
import {
  collapseMobileProject,
  showMobileProjectPane,
  toggleMobileProjectPane,
} from '@/lib/mobile-project-layout'
import type { DevPreviewPanelState } from '@jait/shared'

interface UsePanelControllersOptions {
  activeProject: any
  activeSessionId: string | null
  closeProjectPanelRef: RefObject<(() => void) | null>
  closeProjectPreview: () => void
  consumeSuppressedUiSync: (key: string) => boolean
  devPreviewTarget: string | null
  isMobile: boolean
  prevProjectPanelPayloadRef: RefObject<string | null>
  projectPreviewState: DevPreviewPanelState
  routePreviewToProject: (target?: string | null, projectRoot?: string | null) => boolean
  savedDevPreview: DevPreviewPanelState | null
  sendUIState: any
  setCurrentView: (view: 'chat') => void
  setDevPreviewTarget: (target: string | null) => void
  setMobileTreeTab: (tab: 'files' | 'git') => void
  setProjectPreviewRequest: (request: { target?: string | null; key: number } | null) => void
  setProjectPreviewState: React.Dispatch<React.SetStateAction<DevPreviewPanelState>>
  setSavedDevPreview: any
  setSavedProject: any
  setSavedScreenShare: any
  setSavedTerminal: any
  setShowProject: (show: boolean) => void
  setShowScreenShare: (show: boolean) => void
  setShowTerminal: (show: boolean) => void
  setTerminalFullscreen: (fullscreen: boolean) => void
  showProjectEditor: boolean
  showProjectRef: RefObject<boolean>
  showProjectTree: boolean
  applyProjectLayout: (layout: { tree: boolean; editor: boolean }, options?: { immediateSync?: boolean }) => void
}

export function usePanelControllers({
  activeProject,
  activeSessionId,
  closeProjectPanelRef,
  closeProjectPreview,
  consumeSuppressedUiSync,
  devPreviewTarget,
  isMobile,
  prevProjectPanelPayloadRef,
  projectPreviewState,
  routePreviewToProject,
  savedDevPreview,
  sendUIState,
  setCurrentView,
  setDevPreviewTarget,
  setMobileTreeTab,
  setProjectPreviewRequest,
  setProjectPreviewState,
  setSavedDevPreview,
  setSavedProject,
  setSavedScreenShare,
  setSavedTerminal,
  setShowProject,
  setShowScreenShare,
  setShowTerminal,
  setTerminalFullscreen,
  showProjectEditor,
  showProjectRef,
  showProjectTree,
  applyProjectLayout,
}: UsePanelControllersOptions) {
  const openScreenSharePanel = useCallback(() => {
    setShowScreenShare(true)
    setSavedScreenShare({ open: true })
    if (consumeSuppressedUiSync('screen-share.panel')) return
    sendUIState('screen-share.panel', { open: true }, activeSessionId)
  }, [setSavedScreenShare, sendUIState, activeSessionId, consumeSuppressedUiSync, setShowScreenShare])

  const closeScreenSharePanel = useCallback(() => {
    setShowScreenShare(false)
    setSavedScreenShare(null)
    if (consumeSuppressedUiSync('screen-share.panel')) return
    sendUIState('screen-share.panel', null, activeSessionId)
  }, [setSavedScreenShare, sendUIState, activeSessionId, consumeSuppressedUiSync, setShowScreenShare])

  const closeDevPreviewPanel = useCallback(() => {
    closeProjectPreview()
    setDevPreviewTarget(null)
    setProjectPreviewRequest(null)
    setProjectPreviewState({ open: false, target: null, displayState: 'hidden', displayTarget: null })
    setSavedDevPreview(null)
  }, [closeProjectPreview, setDevPreviewTarget, setProjectPreviewRequest, setProjectPreviewState, setSavedDevPreview])

  const prevPreviewSyncRef = useRef<string>('')
  const handleProjectPreviewOpenChange = useCallback((state: { open: boolean; target: string | null }) => {
    const persistedTarget = getPersistablePreviewTarget(state.target)
    const displayState: DevPreviewPanelState['displayState'] = !state.open
      ? 'hidden'
      : persistedTarget
        ? 'connected'
        : 'blank'
    const nextPreviewState: DevPreviewPanelState = {
      open: state.open,
      target: persistedTarget,
      displayState,
      displayTarget: displayState === 'connected' ? persistedTarget : null,
    }
    setProjectPreviewState((prev) => {
      if (
        prev.open === nextPreviewState.open
        && prev.target === nextPreviewState.target
        && prev.displayState === nextPreviewState.displayState
        && prev.displayTarget === nextPreviewState.displayTarget
      ) return prev
      return nextPreviewState
    })
    if (state.open && persistedTarget) {
      const nextState: DevPreviewPanelState = {
        open: true,
        target: persistedTarget ?? devPreviewTarget ?? null,
        projectRoot: activeProject?.projectRoot ?? null,
        displayState,
        displayTarget: displayState === 'connected' ? (persistedTarget ?? devPreviewTarget ?? null) : null,
      }
      const key = `${nextState.open}:${nextState.target ?? ''}:${nextState.projectRoot ?? ''}:${nextState.displayState ?? ''}:${nextState.displayTarget ?? ''}`
      if (key === prevPreviewSyncRef.current) return
      prevPreviewSyncRef.current = key
      setSavedDevPreview(nextState)
      return
    }
    if (prevPreviewSyncRef.current === '') return
    prevPreviewSyncRef.current = ''
    setSavedDevPreview(null)
  }, [activeProject?.projectRoot, devPreviewTarget, setSavedDevPreview, setProjectPreviewState])

  const previewOpen = savedDevPreview?.open === true || projectPreviewState.open

  const openTerminalPanel = useCallback(() => {
    setShowTerminal(true)
    setSavedTerminal({ open: true }, { immediate: isMobile })
    if (consumeSuppressedUiSync('terminal.panel')) return
    sendUIState('terminal.panel', { open: true }, activeSessionId)
  }, [setSavedTerminal, sendUIState, activeSessionId, consumeSuppressedUiSync, isMobile, setShowTerminal])

  const closeTerminalPanel = useCallback(() => {
    setShowTerminal(false)
    setTerminalFullscreen(false)
    setSavedTerminal(null, { immediate: isMobile })
    if (consumeSuppressedUiSync('terminal.panel')) return
    sendUIState('terminal.panel', null, activeSessionId)
  }, [setSavedTerminal, sendUIState, activeSessionId, consumeSuppressedUiSync, isMobile, setShowTerminal, setTerminalFullscreen])

  const closeProjectPanel = useCallback(() => {
    showProjectRef.current = false
    setShowProject(false)
    const nextPanel = activeProject
      ? {
          open: false,
          remotePath: activeProject.projectRoot,
          surfaceId: activeProject.surfaceId,
          nodeId: activeProject.nodeId,
        }
      : null
    prevProjectPanelPayloadRef.current = JSON.stringify(nextPanel)
    if (isMobile) {
      const collapsedLayout = collapseMobileProject()
      applyProjectLayout(collapsedLayout, { immediateSync: true })
    }
    if (nextPanel) {
      setSavedProject(nextPanel, { immediate: true })
    }
  }, [activeProject, applyProjectLayout, isMobile, setSavedProject, setShowProject, showProjectRef, prevProjectPanelPayloadRef])
  closeProjectPanelRef.current = closeProjectPanel

  const toggleProjectTree = useCallback(() => {
    if (isMobile) {
      const nextLayout = toggleMobileProjectPane({ tree: showProjectTree, editor: showProjectEditor }, 'tree')
      applyProjectLayout(nextLayout, { immediateSync: true })
      return
    }
    const nextLayout = toggleDesktopProjectTreeVisibility({ tree: showProjectTree, editor: showProjectEditor })
    applyProjectLayout(nextLayout, { immediateSync: true })
  }, [applyProjectLayout, isMobile, showProjectTree, showProjectEditor])

  const toggleProjectEditor = useCallback(() => {
    if (isMobile) {
      const nextLayout = toggleMobileProjectPane({ tree: showProjectTree, editor: showProjectEditor }, 'editor')
      applyProjectLayout(nextLayout, { immediateSync: true })
      return
    }
    applyProjectLayout({ tree: showProjectTree, editor: !showProjectEditor }, { immediateSync: true })
  }, [applyProjectLayout, isMobile, showProjectTree, showProjectEditor])

  const showMobileProjectTreeTab = useCallback((tab: 'files' | 'git') => {
    setMobileTreeTab(tab)
    const nextLayout = showMobileProjectPane('tree')
    applyProjectLayout(nextLayout, { immediateSync: true })
  }, [applyProjectLayout, setMobileTreeTab])

  const showMobileProjectEditorTab = useCallback(() => {
    const nextLayout = showMobileProjectPane('editor')
    applyProjectLayout(nextLayout, { immediateSync: true })
  }, [applyProjectLayout])

  const openDevPreviewPanel = useCallback((target?: string | null) => {
    setCurrentView('chat')
    const nextTarget = target?.trim() || devPreviewTarget?.trim() || null
    setDevPreviewTarget(nextTarget)
    const state = { open: true, target: nextTarget, projectRoot: activeProject?.projectRoot ?? null }
    setSavedDevPreview(state)
    routePreviewToProject(nextTarget, activeProject?.projectRoot ?? null)
  }, [setSavedDevPreview, devPreviewTarget, routePreviewToProject, activeProject?.projectRoot, setCurrentView, setDevPreviewTarget])

  return {
    closeDevPreviewPanel,
    closeProjectPanel,
    closeScreenSharePanel,
    closeTerminalPanel,
    handleProjectPreviewOpenChange,
    openDevPreviewPanel,
    openScreenSharePanel,
    openTerminalPanel,
    previewOpen,
    showMobileProjectEditorTab,
    showMobileProjectTreeTab,
    toggleProjectEditor,
    toggleProjectTree,
  }
}
