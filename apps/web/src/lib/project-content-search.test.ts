import { describe, expect, it } from 'vitest'
import {
  searchProjectContent,
  type DirectoryLikeHandle,
  type FileLikeEntry,
} from './project-content-search'

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

describe('searchProjectContent', () => {
  it('finds content matches with file and line numbers', async () => {
    const root = dir('', [
      file('README.md', 'hello\narchitecture diagram\nbye'),
      dir('src', [
        file('main.ts', 'const label = "Architecture Diagram";\nconsole.log(label)'),
      ]),
    ])

    const matches = await searchProjectContent(root, 'architecture diagram', 10)

    expect(matches).toEqual([
      { file: 'README.md', line: 2, content: 'architecture diagram' },
      { file: 'src/main.ts', line: 1, content: 'const label = "Architecture Diagram";' },
    ])
  })

  it('searches hidden files and non-ignored hidden directories while skipping ignored directories', async () => {
    const root = dir('', [
      file('.env.example', 'architecture diagram'),
      dir('.jait', [file('bootstrap.md', 'architecture diagram')]),
      dir('.git', [file('config', 'architecture diagram')]),
      dir('node_modules', [file('pkg.js', 'architecture diagram')]),
      dir('src', [file('visible.ts', 'architecture diagram')]),
    ])

    const matches = await searchProjectContent(root, 'architecture diagram', 10)

    expect(matches).toEqual([
      { file: '.env.example', line: 1, content: 'architecture diagram' },
      { file: '.jait/bootstrap.md', line: 1, content: 'architecture diagram' },
      { file: 'src/visible.ts', line: 1, content: 'architecture diagram' },
    ])
  })

  it('ignores binary-like files and respects the result limit', async () => {
    const root = dir('', [
      file('image.bin', 'abc\u0000def architecture diagram'),
      file('notes.txt', 'architecture diagram\narchitecture diagram'),
    ])

    const matches = await searchProjectContent(root, 'architecture diagram', 1)

    expect(matches).toEqual([
      { file: 'notes.txt', line: 1, content: 'architecture diagram' },
    ])
  })
})
