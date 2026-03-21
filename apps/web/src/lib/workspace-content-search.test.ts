import { describe, expect, it } from 'vitest'
import {
  searchWorkspaceContent,
  type DirectoryLikeHandle,
  type FileLikeEntry,
} from './workspace-content-search'

function file(name: string, text: string): FileLikeEntry {
  return {
    kind: 'file',
    name,
    getFile: async () => ({
      size: text.length,
      text: async () => text,
    }),
  }
}

function dir(name: string, entries: Array<DirectoryLikeHandle | FileLikeEntry>): DirectoryLikeHandle {
  return {
    kind: 'directory',
    name,
    values: async function * () {
      for (const entry of entries) yield entry
    },
  }
}

describe('searchWorkspaceContent', () => {
  it('finds content matches with file and line numbers', async () => {
    const root = dir('', [
      file('README.md', 'hello\narchitecture diagram\nbye'),
      dir('src', [
        file('main.ts', 'const label = "Architecture Diagram";\nconsole.log(label)'),
      ]),
    ])

    const matches = await searchWorkspaceContent(root, 'architecture diagram', 10)

    expect(matches).toEqual([
      { file: 'README.md', line: 2, content: 'architecture diagram' },
      { file: 'src/main.ts', line: 1, content: 'const label = "Architecture Diagram";' },
    ])
  })

  it('skips hidden and ignored directories', async () => {
    const root = dir('', [
      dir('.git', [file('config', 'architecture diagram')]),
      dir('node_modules', [file('pkg.js', 'architecture diagram')]),
      dir('src', [file('visible.ts', 'architecture diagram')]),
    ])

    const matches = await searchWorkspaceContent(root, 'architecture diagram', 10)

    expect(matches).toEqual([
      { file: 'src/visible.ts', line: 1, content: 'architecture diagram' },
    ])
  })

  it('ignores binary-like files and respects the result limit', async () => {
    const root = dir('', [
      file('image.bin', 'abc\u0000def architecture diagram'),
      file('notes.txt', 'architecture diagram\narchitecture diagram'),
    ])

    const matches = await searchWorkspaceContent(root, 'architecture diagram', 1)

    expect(matches).toEqual([
      { file: 'notes.txt', line: 1, content: 'architecture diagram' },
    ])
  })
})
