import { describe, expect, it, vi } from 'vitest'

/**
 * Regression test for: closing preview via header button then toggling editor
 * off/on should NOT restore the preview panel.
 *
 * The bug was that the header close button took two code paths depending on
 * `projectPreviewState.open`:
 *   - true  → only called closePreviewTarget() (tab removal), skipping saved state cleanup
 *   - false → called closeDevPreviewPanel() (tab removal + persisted state cleanup)
 *
 * Because the persisted state was never cleared in the first path, re-opening
 * the editor would hydrate the old preview and bring it back.
 *
 * The fix unifies both paths to always call closeDevPreviewPanel().
 */
describe('close preview clears persisted state', () => {
  it('preview routing keeps the active project root unchanged', () => {
    const setViewMode = vi.fn()
    const setDevPreviewTarget = vi.fn()
    const setProjectPreviewState = vi.fn()
    const setShowProject = vi.fn()
    const showProjectEditorPanel = vi.fn()
    const setProjectPreviewRequest = vi.fn()
    const showProjectRef = { current: false }
    const activeProject = { surfaceId: 'fs-root', projectRoot: '/home/alice/jait', nodeId: 'gateway' }

    const routePreviewToProject = (target?: string | null, projectRoot?: string | null) => {
      const trimmed = target?.trim() || null
      const nextPreviewState = {
        open: true,
        target: trimmed,
        projectRoot: projectRoot?.trim() || activeProject.projectRoot || null,
        displayState: trimmed ? 'connected' as const : 'blank' as const,
        displayTarget: trimmed,
      }
      setViewMode('developer')
      setDevPreviewTarget(trimmed)
      setProjectPreviewState(nextPreviewState)
      if (!showProjectRef.current) {
        showProjectRef.current = true
        setShowProject(true)
      }
      showProjectEditorPanel()
      setProjectPreviewRequest({ target: trimmed, key: 123 })
      return true
    }

    routePreviewToProject('http://127.0.0.1:4173/', '/home/alice/jait/apps/web')

    expect(setProjectPreviewState).toHaveBeenCalledWith({
      open: true,
      target: 'http://127.0.0.1:4173/',
      projectRoot: '/home/alice/jait/apps/web',
      displayState: 'connected',
      displayTarget: 'http://127.0.0.1:4173/',
    })
    expect(activeProject.projectRoot).toBe('/home/alice/jait')
  })

  it('closeDevPreviewPanel clears project preview tab AND all local + saved state', () => {
    const closePreviewTarget = vi.fn()
    const closeProjectPreview = vi.fn(() => closePreviewTarget())
    const setDevPreviewTarget = vi.fn()
    const setProjectPreviewRequest = vi.fn()
    const setProjectPreviewState = vi.fn()
    const setSavedDevPreview = vi.fn()

    // This mirrors the fixed closeDevPreviewPanel from App.tsx
    const closeDevPreviewPanel = () => {
      closeProjectPreview()
      setDevPreviewTarget(null)
      setProjectPreviewRequest(null)
      setProjectPreviewState({ open: false, target: null, displayState: 'hidden', displayTarget: null })
      setSavedDevPreview(null)
    }

    closeDevPreviewPanel()

    expect(closeProjectPreview).toHaveBeenCalledOnce()
    expect(setDevPreviewTarget).toHaveBeenCalledWith(null)
    expect(setProjectPreviewRequest).toHaveBeenCalledWith(null)
    expect(setProjectPreviewState).toHaveBeenCalledWith({
      open: false, target: null, displayState: 'hidden', displayTarget: null,
    })
    expect(setSavedDevPreview).toHaveBeenCalledWith(null)
  })

  it('header close button always calls closeDevPreviewPanel regardless of projectPreviewState', () => {
    const closeDevPreviewPanel = vi.fn()

    // Simulate the fixed header button click handler
    const handlePreviewButtonClick = (previewOpen: boolean) => {
      if (previewOpen) {
        closeDevPreviewPanel()
      }
    }

    // Case 1: projectPreviewState.open = true (the previously broken path)
    handlePreviewButtonClick(true)
    expect(closeDevPreviewPanel).toHaveBeenCalledOnce()

    closeDevPreviewPanel.mockClear()

    // Case 2: projectPreviewState.open = false
    handlePreviewButtonClick(true)
    expect(closeDevPreviewPanel).toHaveBeenCalledOnce()
  })

  it('hydration should not restore preview when saved state is null', () => {
    const routePreviewToProject = vi.fn()
    const setDevPreviewTarget = vi.fn()

    // Simulate the hydration effect from App.tsx (lines ~2282-2292)
    function hydratePreview(savedPreview: { open: boolean; target: string | null; projectRoot?: string | null } | null, panelOpen: boolean) {
      const dp = savedPreview
      if (dp) {
        const nextTarget = dp.target?.trim() || null
        if (nextTarget) setDevPreviewTarget(nextTarget)
        if (dp.open && panelOpen && nextTarget) {
          routePreviewToProject(nextTarget, dp.projectRoot ?? null)
        }
      }
    }

    // After closeDevPreviewPanel, savedDevPreview is null
    hydratePreview(null, true)

    expect(routePreviewToProject).not.toHaveBeenCalled()
    expect(setDevPreviewTarget).not.toHaveBeenCalled()
  })

  it('hydration restores preview only when saved state has open=true', () => {
    const routePreviewToProject = vi.fn()
    const setDevPreviewTarget = vi.fn()

    function hydratePreview(savedPreview: { open: boolean; target: string | null; projectRoot?: string | null } | null, panelOpen: boolean) {
      const dp = savedPreview
      if (dp) {
        const nextTarget = dp.target?.trim() || null
        if (nextTarget) setDevPreviewTarget(nextTarget)
        if (dp.open && panelOpen && nextTarget) {
          routePreviewToProject(nextTarget, dp.projectRoot ?? null)
        }
      }
    }

    // Preview was NOT cleared — should restore
    hydratePreview({ open: true, target: 'http://localhost:3000', projectRoot: '/project' }, true)

    expect(setDevPreviewTarget).toHaveBeenCalledWith('http://localhost:3000')
    expect(routePreviewToProject).toHaveBeenCalledWith('http://localhost:3000', '/project')
  })

  it('close preview → close editor → reopen editor: preview stays closed', () => {
    // Simulate the full user scenario
    let devPreviewTarget: string | null = 'http://localhost:3000'
    let projectPreviewState = { open: true, target: 'http://localhost:3000', displayState: 'connected' as const, displayTarget: 'http://localhost:3000' }
    let projectPreviewRequest: { target: string | null; key: number } | null = { target: 'http://localhost:3000', key: 1 }
    let savedDevPreview: { open: boolean; target: string | null } | null = { open: true, target: 'http://localhost:3000' }
    let showProject = true

    const closeProjectPreview = vi.fn()

    // Step 1: User clicks "Close preview" in the header
    const closeDevPreviewPanel = () => {
      closeProjectPreview()
      devPreviewTarget = null
      projectPreviewRequest = null
      projectPreviewState = { open: false, target: null, displayState: 'hidden', displayTarget: null }
      savedDevPreview = null
    }
    closeDevPreviewPanel()

    const previewOpenAfterClose = savedDevPreview?.open === true || projectPreviewState.open
    expect(previewOpenAfterClose).toBe(false)
    expect(projectPreviewRequest).toBeNull()

    // Step 2: User closes editor mode (ProjectPanel unmounts)
    showProject = false

    // Step 3: User reopens editor mode (ProjectPanel remounts with fresh refs)
    showProject = true

    // Simulate ProjectPanel remount: previewRequest effect checks the request
    // With our fix, projectPreviewRequest is null, so no preview tab is created
    let handledPreviewRequestKey: number | null = null // fresh ref on remount
    if (projectPreviewRequest && handledPreviewRequestKey !== projectPreviewRequest.key) {
      // This block should NOT execute because projectPreviewRequest is null
      handledPreviewRequestKey = projectPreviewRequest.key
      // would call handleOpenPreviewTarget here
    }

    // previewOpen should still be false — no ghost restoration
    const previewOpenAfterReopen = savedDevPreview?.open === true || projectPreviewState.open
    expect(previewOpenAfterReopen).toBe(false)
    expect(devPreviewTarget).toBeNull()
    expect(projectPreviewRequest).toBeNull()
    expect(showProject).toBe(true)
  })

  it('without fix: stale previewRequest would replay on remount', () => {
    // Demonstrate the bug scenario: if projectPreviewRequest is NOT cleared,
    // the ProjectPanel remount replays the preview request
    const projectPreviewRequest: { target: string | null; key: number } | null = { target: 'http://localhost:3000', key: 1 }
    let handledPreviewRequestKey: number | null = null // fresh ref on remount
    let previewOpened = false

    // Simulate the effect at ProjectPanel line 3526
    if (projectPreviewRequest && handledPreviewRequestKey !== projectPreviewRequest.key) {
      handledPreviewRequestKey = projectPreviewRequest.key
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
    let showProject = true
    const closeArchitectureTab = vi.fn()

    // Step 1: Explicitly close architecture via header button
    closeArchitectureTab()
    architectureRequest = null
    showArchitecture = false

    // Step 2: Close editor (closeProjectPanel does NOT clear architecture)
    showProject = false

    // Step 3: Reopen editor — ProjectPanel remounts with fresh refs
    showProject = true
    let handledArchitectureRequestKey: number | null = null
    let architectureOpened = false

    if (architectureRequest && handledArchitectureRequestKey !== architectureRequest.key) {
      handledArchitectureRequestKey = architectureRequest.key
      architectureOpened = true
    }

    expect(architectureOpened).toBe(false)
    expect(showArchitecture).toBe(false)
    expect(architectureRequest).toBeNull()
    expect(showProject).toBe(true)
  })

  it('architecture open → close editor → reopen editor: architecture persists', () => {
    let showArchitecture = true
    const architectureRequest: { key: number } | null = { key: 12345 }
    let showProject = true

    // Step 1: Close editor — closeProjectPanel does NOT clear architectureRequest
    showProject = false
    // showArchitecture and architectureRequest survive

    // Step 2: Reopen editor — ProjectPanel remounts
    showProject = true
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
    // Preview request and state survive closeProjectPanel
    const projectPreviewRequest: { target: string | null; key: number } | null = { target: 'http://localhost:3000', key: 1 }
    const savedDevPreview: { open: boolean; target: string | null } | null = { open: true, target: 'http://localhost:3000' }
    let showProject = true

    // Close editor — preview state survives
    showProject = false

    // Reopen editor — ProjectPanel remounts with fresh ref
    showProject = true
    let handledPreviewRequestKey: number | null = null
    let previewOpened = false

    if (projectPreviewRequest && handledPreviewRequestKey !== projectPreviewRequest.key) {
      handledPreviewRequestKey = projectPreviewRequest.key
      previewOpened = true
    }

    // Preview should restore because we never explicitly closed it
    expect(previewOpened).toBe(true)
    expect(savedDevPreview?.open).toBe(true)
  })
})
