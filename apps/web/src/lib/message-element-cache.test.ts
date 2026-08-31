import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { haveRenderInputsChanged } from './message-element-cache'

describe('haveRenderInputsChanged', () => {
  it('compares shared render inputs by identity without traversing deep objects', () => {
    let deepReads = 0
    const managerThreads = [{
      id: 'thread-1',
      get messages() {
        deepReads += 1
        return [{ content: 'large nested transcript' }]
      },
    }]
    const previous = ['codex', false, managerThreads]
    const current = ['codex', false, managerThreads]

    expect(haveRenderInputsChanged(previous, current)).toBe(false)
    expect(deepReads).toBe(0)
    expect(haveRenderInputsChanged(previous, ['codex', false, [...managerThreads]])).toBe(true)
  })

  it.each([
    'developer-chat-workspace.tsx',
    'manager-workspace.tsx',
  ])('uses identity comparison in %s instead of serializing shared props', (fileName) => {
    const source = readFileSync(new URL(`../components/app-shell/${fileName}`, import.meta.url), 'utf8')

    expect(source).toContain('haveRenderInputsChanged')
    expect(source).not.toContain('JSON.stringify(sharedPropsKey)')
  })
})
