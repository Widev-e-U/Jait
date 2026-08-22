import { describe, expect, it } from 'vitest'
import { projectNameFromPath } from './project-context-dialog'

describe('projectNameFromPath', () => {
  it('names a project after the folder the user picked', () => {
    expect(projectNameFromPath('/home/jakob/Zinsrechner')).toBe('Zinsrechner')
  })

  it('handles Windows paths, which is what a desktop node reports', () => {
    expect(projectNameFromPath('E:\\FSM.Radar')).toBe('FSM.Radar')
  })

  it('ignores a trailing separator', () => {
    expect(projectNameFromPath('/home/jakob/jait/')).toBe('jait')
  })

  it('has nothing to offer without a folder', () => {
    expect(projectNameFromPath(null)).toBe('')
    expect(projectNameFromPath('')).toBe('')
  })
})
