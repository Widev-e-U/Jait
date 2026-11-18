import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('useProjects selection race', () => {
  const source = readFileSync(new URL('./useProjects.ts', import.meta.url), 'utf8')

  it('guards fetchProjects active-selection writes against picks made while it was in flight', () => {
    const fetchStart = source.indexOf('const fetchProjects')
    const fetchEnd = source.indexOf('try {', fetchStart)
    const fetchHead = source.slice(fetchStart, fetchEnd)
    expect(fetchHead).toContain('const selectionVersionAtStart = selectionVersionRef.current')

    const guardIndex = source.indexOf('if (selectionVersionRef.current === selectionVersionAtStart')
    expect(guardIndex).toBeGreaterThan(fetchStart)
    const setProjectIndex = source.indexOf('setActiveProjectId((prevProjectId)', guardIndex)
    const setSessionIndex = source.indexOf('setActiveSessionId((prevSessionId)', guardIndex)
    expect(setProjectIndex).toBeGreaterThan(guardIndex)
    expect(setSessionIndex).toBeGreaterThan(guardIndex)
  })

  it('does not let a project-list response re-select the server chat over a local new-chat view', () => {
    const fetchStart = source.indexOf('const fetchProjects')
    const guardIndex = source.indexOf('if (selectionVersionRef.current === selectionVersionAtStart')
    const localDraftIndex = source.indexOf('const localDraftShowing = isLocalProjectDraft(', fetchStart)
    expect(localDraftIndex).toBeGreaterThan(fetchStart)
    expect(localDraftIndex).toBeLessThan(guardIndex)
    expect(source.slice(guardIndex, guardIndex + 120)).toContain('&& !localDraftShowing')
  })

  it('bumps the selection version on every explicit selection change', () => {
    for (const name of ['createSession', 'switchSession', 'switchProject', 'startProjectDraft']) {
      const start = source.indexOf(`const ${name} = useCallback(`)
      expect(start, `${name} should exist`).toBeGreaterThan(-1)
      const next = source.indexOf('\n  const ', start + 1)
      const body = source.slice(start, next === -1 ? undefined : next)
      expect(body, `${name} should bump selectionVersionRef`).toContain('selectionVersionRef.current++')
      expect(body, `${name} should keep projectDraftRef in step with the selection`).toContain('projectDraftRef.current')
    }
  })
})
