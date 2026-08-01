import { describe, expect, it } from 'vitest'
import {
  getProjectRootForPath,
  isAbsoluteProjectPath,
  isPathWithinProject,
  parseProjectLinkTarget,
} from './project-links'

describe('project-links', () => {
  it('detects Windows and Unix absolute project paths', () => {
    expect(isAbsoluteProjectPath('E:/Jait/apps/web/src/App.tsx')).toBe(true)
    expect(isAbsoluteProjectPath('/project/Jait/apps/web/src/App.tsx')).toBe(true)
    expect(isAbsoluteProjectPath('https://example.com')).toBe(false)
    expect(isAbsoluteProjectPath('apps/web/src/App.tsx')).toBe(false)
  })

  it('parses project link targets with optional line and column info', () => {
    expect(parseProjectLinkTarget('E:/Jait/apps/web/src/App.tsx#L58C4')).toEqual({
      path: 'E:/Jait/apps/web/src/App.tsx',
      line: 58,
      column: 4,
    })
    expect(parseProjectLinkTarget('/project/Jait/apps/web/src/App.tsx#L10')).toEqual({
      path: '/project/Jait/apps/web/src/App.tsx',
      line: 10,
    })
    expect(parseProjectLinkTarget('https://example.jait.dev/home/user/project/apps/web/src/components/chat/message.tsx#L116')).toEqual({
      path: '/home/user/project/apps/web/src/components/chat/message.tsx',
      line: 116,
    })
    expect(parseProjectLinkTarget('E:/Jait/apps/web/src/App.tsx:58:4')).toEqual({
      path: 'E:/Jait/apps/web/src/App.tsx',
      line: 58,
      column: 4,
    })
    expect(parseProjectLinkTarget('/project/Jait/apps/web/src/App.tsx:10')).toEqual({
      path: '/project/Jait/apps/web/src/App.tsx',
      line: 10,
    })
    expect(parseProjectLinkTarget('https://example.jait.dev/home/user/project/apps/web/src/components/chat/message.tsx:116')).toEqual({
      path: '/home/user/project/apps/web/src/components/chat/message.tsx',
      line: 116,
    })
    expect(parseProjectLinkTarget('file:///project/Jait/apps/web/src/App.tsx#L10')).toEqual({
      path: '/project/Jait/apps/web/src/App.tsx',
      line: 10,
    })
    expect(parseProjectLinkTarget('file:///C:/Jait/apps/web/src/App.tsx#L58C4')).toEqual({
      path: 'C:/Jait/apps/web/src/App.tsx',
      line: 58,
      column: 4,
    })
    expect(parseProjectLinkTarget('https://example.com')).toBeNull()
  })

  it('returns null for malformed percent-encoded paths instead of throwing', () => {
    expect(parseProjectLinkTarget('/project/Jait/apps/web/src/%E0%A4%A.tsx#L10')).toBeNull()
    expect(parseProjectLinkTarget('https://example.jait.dev/project/%E0%A4%A.tsx#L10')).toBeNull()
  })

  it('does not misread numeric path suffixes as line numbers for non-file paths', () => {
    expect(parseProjectLinkTarget('/project/Jait/releases/2026')).toEqual({
      path: '/project/Jait/releases/2026',
    })
  })

  it('checks whether a path is inside the current project', () => {
    expect(isPathWithinProject('E:/Jait/apps/web/src/App.tsx', 'E:/Jait')).toBe(true)
    expect(isPathWithinProject('E:/Other/App.tsx', 'E:/Jait')).toBe(false)
    expect(isPathWithinProject('/project/Jait/apps/web/src/App.tsx', '/project/Jait')).toBe(true)
    expect(isPathWithinProject('apps/web/src/App.tsx', '/project/Jait')).toBe(true)
    expect(isPathWithinProject('../Other/App.tsx', '/project/Jait')).toBe(false)
  })

  it('derives a fallback project root from a file path', () => {
    expect(getProjectRootForPath('E:/Jait/apps/web/src/App.tsx')).toBe('E:/Jait/apps/web/src')
    expect(getProjectRootForPath('/project/Jait/apps/web/src/App.tsx')).toBe('/project/Jait/apps/web/src')
  })
})
