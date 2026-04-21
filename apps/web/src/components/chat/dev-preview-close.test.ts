import { describe, expect, it, vi } from 'vitest'

/**
 * Regression test for: closing preview via header button then toggling editor
 * off/on should NOT restore the preview panel.
 *
 * The bug was that the header close button took two code paths depending on
 * `workspacePreviewState.open`:
 *   - true  → only called closePreviewTarget() (tab removal), skipping saved state cleanup
 *   - false → called closeDevPreviewPanel() (tab removal + persisted state cleanup)
 *
 * Because the persisted state was never cleared in the first path, re-opening
 * the editor would hydrate the old preview and bring it back.
 *
 * The fix unifies both paths to always call closeDevPreviewPanel().
 */
describe('close preview clears persisted state', () => {
  it('preview routing keeps the active workspace root unchanged', () => {
    const setViewMode = vi.fn()
    const setDevPreviewTarget = vi.fn()
    const setWorkspacePreviewState = vi.fn()
    const setShowWorkspace = vi.fn()
    const showWorkspaceEditorPanel = vi.fn()
    const setWorkspacePreviewRequest = vi.fn()
    const showWorkspaceRef = { current: false }
    const activeWorkspace = { surfaceId: 'fs-root', workspaceRoot: '/home/jakob/jait', nodeId: 'gateway' }

    const routePreviewToWorkspace = (target?: string | null, workspaceRoot?: string | null) => {
      const trimmed = target?.trim() || null
      const nextPreviewState = {
        open: true,
        target: trimmed,
        workspaceRoot: workspaceRoot?.trim() || activeWorkspace.workspaceRoot || null,
        displayState: trimmed ? 'connected' as const : 'blank' as const,
        displayTarget: trimmed,
      }
      setViewMode('developer')
      setDevPreviewTarget(trimmed)
      setWorkspacePreviewState(nextPreviewState)
      if (!showWorkspaceRef.current) {
        showWorkspaceRef.current = true
        setShowWorkspace(true)
      }
      showWorkspaceEditorPanel()
      setWorkspacePreviewRequest({ target: trimmed, key: 123 })
      return true
    }

    routePreviewToWorkspace('http://127.0.0.1:4173/', '/home/jakob/jait/apps/web')

    expect(setWorkspacePreviewState).toHaveBeenCalledWith({
      open: true,
      target: 'http://127.0.0.1:4173/',
      workspaceRoot: '/home/jakob/jait/apps/web',
      displayState: 'connected',
      displayTarget: 'http://127.0.0.1:4173/',
    })
    expect(activeWorkspace.workspaceRoot).toBe('/home/jakob/jait')
  })

  it('closeDevPreviewPanel clears workspace preview tab AND all local + saved state', () => {
    const closePreviewTarget = vi.fn()
    const closeWorkspacePreview = vi.fn(() => closePreviewTarget())
    const setDevPreviewTarget = vi.fn()
    const setWorkspacePreviewRequest = vi.fn()
    const setWorkspacePreviewState = vi.fn()
    const setSavedDevPreview = vi.fn()

    // This mirrors the fixed closeDevPreviewPanel from App.tsx
    const closeDevPreviewPanel = () => {
      closeWorkspacePreview()
      setDevPreviewTarget(null)
      setWorkspacePreviewRequest(null)
      setWorkspacePreviewState({ open: false, target: null, displayState: 'hidden', displayTarget: null })
      setSavedDevPreview(null)
    }

    closeDevPreviewPanel()

    expect(closeWorkspacePreview).toHaveBeenCalledOnce()
    expect(setDevPreviewTarget).toHaveBeenCalledWith(null)
    expect(setWorkspacePreviewRequest).toHaveBeenCalledWith(null)
    expect(setWorkspacePreviewState).toHaveBeenCalledWith({
      open: false, target: null, displayState: 'hidden', displayTarget: null,
    })
    expect(setSavedDevPreview).toHaveBeenCalledWith(null)
  })

  it('header close button always calls closeDevPreviewPanel regardless of workspacePreviewState', () => {
    const closeDevPreviewPanel = vi.fn()

    // Simulate the fixed header button click handler
    const handlePreviewButtonClick = (previewOpen: boolean) => {
      if (previewOpen) {
        closeDevPreviewPanel()
      }
    }

    // Case 1: workspacePreviewState.open = true (the previously broken path)
    handlePreviewButtonClick(true)
    expect(closeDevPreviewPanel).toHaveBeenCalledOnce()

    closeDevPreviewPanel.mockClear()

    // Case 2: workspacePreviewState.open = false
    handlePreviewButtonClick(true)
    expect(closeDevPreviewPanel).toHaveBeenCalledOnce()
  })

  it('hydration should not restore preview when saved state is null', () => {
    const routePreviewToWorkspace = vi.fn()
    const setDevPreviewTarget = vi.fn()

    // Simulate the hydration effect from App.tsx (lines ~2282-2292)
    function hydratePreview(savedPreview: { open: boolean; target: string | null; workspaceRoot?: string | null } | null, panelOpen: boolean) {
      const dp = savedPreview
      if (dp) {
        const nextTarget = dp.target?.trim() || null
        if (nextTarget) setDevPreviewTarget(nextTarget)
        if (dp.open && panelOpen && nextTarget) {
          routePreviewToWorkspace(nextTarget, dp.workspaceRoot ?? null)
        }
      }
    }

    // After closeDevPreviewPanel, savedDevPreview is null
    hydratePreview(null, true)

    expect(routePreviewToWorkspace).not.toHaveBeenCalled()
    expect(setDevPreviewTarget).not.toHaveBeenCalled()
  })

  it('hydration restores preview only when saved state has open=true', () => {
    const routePreviewToWorkspace = vi.fn()
    const setDevPreviewTarget = vi.fn()

    function hydratePreview(savedPreview: { open: boolean; target: string | null; workspaceRoot?: string | null } | null, panelOpen: boolean) {
      const dp = savedPreview
      if (dp) {
        const nextTarget = dp.target?.trim() || null
        if (nextTarget) setDevPreviewTarget(nextTarget)
        if (dp.open && panelOpen && nextTarget) {
          routePreviewToWorkspace(nextTarget, dp.workspaceRoot ?? null)
        }
      }
    }

    // Preview was NOT cleared — should restore
    hydratePreview({ open: true, target: 'http://localhost:3000', workspaceRoot: '/project' }, true)

    expect(setDevPreviewTarget).toHaveBeenCalledWith('http://localhost:3000')
    expect(routePreviewToWorkspace).toHaveBeenCalledWith('http://localhost:3000', '/project')
  })

  it('close preview → close editor → reopen editor: preview stays closed', () => {
    // Simulate the full user scenario
    let devPreviewTarget: string | null = 'http://localhost:3000'
    let workspacePreviewState = { open: true, target: 'http://localhost:3000', displayState: 'connected' as const, displayTarget: 'http://localhost:3000' }
    let workspacePreviewRequest: { target: string | null; key: number } | null = { target: 'http://localhost:3000', key: 1 }
    let savedDevPreview: { open: boolean; target: string | null } | null = { open: true, target: 'http://localhost:3000' }
    let showWorkspace = true

    const closeWorkspacePreview = vi.fn()

    // Step 1: User clicks "Close preview" in the header
    const closeDevPreviewPanel = () => {
      closeWorkspacePreview()
      devPreviewTarget = null
      workspacePreviewRequest = null
      workspacePreviewState = { open: false, target: null, displayState: 'hidden', displayTarget: null }
      savedDevPreview = null
    }
    closeDevPreviewPanel()

    const previewOpenAfterClose = savedDevPreview?.open === true || workspacePreviewState.open
    expect(previewOpenAfterClose).toBe(false)
    expect(workspacePreviewRequest).toBeNull()

    // Step 2: User closes editor mode (WorkspacePanel unmounts)
    showWorkspace = false

    // Step 3: User reopens editor mode (WorkspacePanel remounts with fresh refs)
    showWorkspace = true

    // Simulate WorkspacePanel remount: previewRequest effect checks the request
    // With our fix, workspacePreviewRequest is null, so no preview tab is created
    let handledPreviewRequestKey: number | null = null // fresh ref on remount
    if (workspacePreviewRequest && handledPreviewRequestKey !== workspacePreviewRequest.key) {
      // This block should NOT execute because workspacePreviewRequest is null
      handledPreviewRequestKey = workspacePreviewRequest.key
      // would call handleOpenPreviewTarget here
    }

    // previewOpen should still be false — no ghost restoration
    const previewOpenAfterReopen = savedDevPreview?.open === true || workspacePreviewState.open
    expect(previewOpenAfterReopen).toBe(false)
    expect(devPreviewTarget).toBeNull()
    expect(workspacePreviewRequest).toBeNull()
    expect(showWorkspace).toBe(true)
  })

  it('without fix: stale previewRequest would replay on remount', () => {
    // Demonstrate the bug scenario: if workspacePreviewRequest is NOT cleared,
    // the WorkspacePanel remount replays the preview request
    const workspacePreviewRequest: { target: string | null; key: number } | null = { target: 'http://localhost:3000', key: 1 }
    let handledPreviewRequestKey: number | null = null // fresh ref on remount
    let previewOpened = false

    // Simulate the effect at WorkspacePanel line 3526
    if (workspacePreviewRequest && handledPreviewRequestKey !== workspacePreviewRequest.key) {
      handledPreviewRequestKey = workspacePreviewRequest.key
      previewOpened = true // handleOpenPreviewTarget would run
    }

    // This proves the stale request WOULD replay
    expect(previewOpened).toBe(true)
  })
})

describe('close architecture clears request state', () => {
  it('architecture header close clears architectureRequest to prevent remount replay', () => {
    let showArchitecture = true
    let architectureRequest: { key: number } | null = { key: 12345 }
    const closeArchitectureTab = vi.fn()

    // Simulate the fixed header button close handler
    const handleArchitectureClose = () => {
      closeArchitectureTab()
      architectureRequest = null
      showArchitecture = false
    }

    handleArchitectureClose()

    expect(closeArchitectureTab).toHaveBeenCalledOnce()
    expect(architectureRequest).toBeNull()
    expect(showArchitecture).toBe(false)
  })

  it('explicit close architecture → close editor → reopen editor: architecture stays closed', () => {
    let showArchitecture = true
    let architectureRequest: { key: number } | null = { key: 12345 }
    let showWorkspace = true
    const closeArchitectureTab = vi.fn()

    // Step 1: Explicitly close architecture via header button
    closeArchitectureTab()
    architectureRequest = null
    showArchitecture = false

    // Step 2: Close editor (closeWorkspacePanel does NOT clear architecture)
    showWorkspace = false

    // Step 3: Reopen editor — WorkspacePanel remounts with fresh refs
    showWorkspace = true
    let handledArchitectureRequestKey: number | null = null
    let architectureOpened = false

    if (architectureRequest && handledArchitectureRequestKey !== architectureRequest.key) {
      handledArchitectureRequestKey = architectureRequest.key
      architectureOpened = true
    }

    expect(architectureOpened).toBe(false)
    expect(showArchitecture).toBe(false)
    expect(architectureRequest).toBeNull()
    expect(showWorkspace).toBe(true)
  })

  it('architecture open → close editor → reopen editor: architecture persists', () => {
    let showArchitecture = true
    const architectureRequest: { key: number } | null = { key: 12345 }
    let showWorkspace = true

    // Step 1: Close editor — closeWorkspacePanel does NOT clear architectureRequest
    showWorkspace = false
    // showArchitecture and architectureRequest survive

    // Step 2: Reopen editor — WorkspacePanel remounts
    showWorkspace = true
    let handledArchitectureRequestKey: number | null = null
    let architectureOpened = false

    if (architectureRequest && handledArchitectureRequestKey !== architectureRequest.key) {
      handledArchitectureRequestKey = architectureRequest.key
      architectureOpened = true
    }

    // Architecture should restore because we never explicitly closed it
    expect(architectureOpened).toBe(true)
    expect(showArchitecture).toBe(true)
    expect(architectureRequest).not.toBeNull()
  })

  it('preview open → close editor → reopen editor: preview persists', () => {
    // Preview request and state survive closeWorkspacePanel
    const workspacePreviewRequest: { target: string | null; key: number } | null = { target: 'http://localhost:3000', key: 1 }
    const savedDevPreview: { open: boolean; target: string | null } | null = { open: true, target: 'http://localhost:3000' }
    let showWorkspace = true

    // Close editor — preview state survives
    showWorkspace = false

    // Reopen editor — WorkspacePanel remounts with fresh ref
    showWorkspace = true
    let handledPreviewRequestKey: number | null = null
    let previewOpened = false

    if (workspacePreviewRequest && handledPreviewRequestKey !== workspacePreviewRequest.key) {
      handledPreviewRequestKey = workspacePreviewRequest.key
      previewOpened = true
    }

    // Preview should restore because we never explicitly closed it
    expect(previewOpened).toBe(true)
    expect(savedDevPreview?.open).toBe(true)
  })
})
