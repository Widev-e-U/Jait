import { describe, expect, it } from 'vitest'

import { folderTitleFromPath } from './useDesktopOpenFolder'

describe('folderTitleFromPath', () => {
  it('names a project after the folder, not the whole path', () => {
    expect(folderTitleFromPath('/home/jakob/jait')).toBe('jait')
  })

  it('reads Windows paths even though the renderer may run on a Linux gateway', () => {
    expect(folderTitleFromPath('C:\\Users\\jakob\\projects\\jait')).toBe('jait')
  })

  it('ignores a trailing separator', () => {
    // Explorer's "%V" for a folder background click can arrive with one.
    expect(folderTitleFromPath('/home/jakob/jait/')).toBe('jait')
    expect(folderTitleFromPath('C:\\projects\\jait\\')).toBe('jait')
  })

  it('keeps the path as the title for a filesystem root, which has no name', () => {
    expect(folderTitleFromPath('/')).toBe('/')
    expect(folderTitleFromPath('C:\\')).toBe('C:')
  })

  it('trims surrounding whitespace', () => {
    expect(folderTitleFromPath('  /home/jakob/jait  ')).toBe('jait')
  })

  it('returns empty for a blank path so the caller can skip it', () => {
    expect(folderTitleFromPath('')).toBe('')
    expect(folderTitleFromPath('   ')).toBe('')
  })

  it('handles a folder name containing dots and spaces', () => {
    expect(folderTitleFromPath('/home/jakob/My Project.v2')).toBe('My Project.v2')
  })
})
