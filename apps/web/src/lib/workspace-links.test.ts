import { describe, expect, it } from 'vitest'
import {
  getWorkspaceRootForPath,
  isAbsoluteWorkspacePath,
  isPathWithinWorkspace,
  parseWorkspaceLinkTarget,
} from './workspace-links'

describe('workspace-links', () => {
  it('detects Windows and Unix absolute workspace paths', () => {
    expect(isAbsoluteWorkspacePath('E:/Jait/apps/web/src/App.tsx')).toBe(true)
    expect(isAbsoluteWorkspacePath('/workspace/Jait/apps/web/src/App.tsx')).toBe(true)
    expect(isAbsoluteWorkspacePath('https://example.com')).toBe(false)
    expect(isAbsoluteWorkspacePath('apps/web/src/App.tsx')).toBe(false)
  })

  it('parses workspace link targets with optional line and column info', () => {
    expect(parseWorkspaceLinkTarget('E:/Jait/apps/web/src/App.tsx#L58C4')).toEqual({
      path: 'E:/Jait/apps/web/src/App.tsx',
      line: 58,
      column: 4,
    })
    expect(parseWorkspaceLinkTarget('/workspace/Jait/apps/web/src/App.tsx#L10')).toEqual({
      path: '/workspace/Jait/apps/web/src/App.tsx',
      line: 10,
    })
    expect(parseWorkspaceLinkTarget('https://jait.basenetwork.net/home/jakob/jait/apps/web/src/components/chat/message.tsx#L116')).toEqual({
      path: '/home/jakob/jait/apps/web/src/components/chat/message.tsx',
      line: 116,
    })
    expect(parseWorkspaceLinkTarget('https://example.com')).toBeNull()
  })

  it('checks whether a path is inside the current workspace', () => {
    expect(isPathWithinWorkspace('E:/Jait/apps/web/src/App.tsx', 'E:/Jait')).toBe(true)
    expect(isPathWithinWorkspace('E:/Other/App.tsx', 'E:/Jait')).toBe(false)
    expect(isPathWithinWorkspace('/workspace/Jait/apps/web/src/App.tsx', '/workspace/Jait')).toBe(true)
  })

  it('derives a fallback workspace root from a file path', () => {
    expect(getWorkspaceRootForPath('E:/Jait/apps/web/src/App.tsx')).toBe('E:/Jait/apps/web/src')
    expect(getWorkspaceRootForPath('/workspace/Jait/apps/web/src/App.tsx')).toBe('/workspace/Jait/apps/web/src')
  })
})
