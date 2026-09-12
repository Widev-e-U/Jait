import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, writeFile, mkdir, rm, chmod } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { GitService } from './git'
let cwd: string
const git = (...args: string[]) => execFileSync('git', args, { cwd, stdio: 'ignore' })
beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'jait-git-status-'))
  git('init', '-b', 'main'); git('config', 'user.email', 'test@example.com'); git('config', 'user.name', 'Test')
  await writeFile(join(cwd, 'base.txt'), 'one\ntwo\n')
  git('add', '.'); git('commit', '-m', 'initial')
})
afterEach(async () => { await rm(cwd, { recursive: true, force: true }) })
describe('Git status as the canonical file list', () => {
  it('enumerates nested untracked files and preserves special names in status and lazy diffs', async () => {
    await mkdir(join(cwd, 'new'))
    const names = ['new/a.txt', 'new/b.txt', ' space\tnewline\n.txt']
    for (const name of names) await writeFile(join(cwd, name), 'new\n')
    const svc = new GitService()
    const status = await svc.status(cwd)
    expect(status.workingTree.files.map(file => file.path).sort()).toEqual(names.sort())
    const diffs = await svc.fileDiffs(cwd)
    expect(diffs.map(file => file.path).sort()).toEqual(names.sort())
    expect(diffs.every(file => file.modified === 'new\n')).toBe(true)
  })
  it('reports staged and unstaged stats and mode-only changes', async () => {
    await writeFile(join(cwd, 'base.txt'), 'one\ntwo\nthree\n')
    git('add', 'base.txt')
    await writeFile(join(cwd, 'base.txt'), 'one\ntwo\nthree\nfour\n')
    await writeFile(join(cwd, 'executable'), 'hello\n')
    git('add', 'executable'); git('commit', '-m', 'stage baseline')
    await chmod(join(cwd, 'executable'), 0o755); git('add', 'executable')
    const status = await new GitService().status(cwd)
    expect(status.index.files).toContainEqual({ path: 'executable', status: 'M', insertions: 0, deletions: 0 })
    expect(status.workingTree.files).toContainEqual({ path: 'base.txt', status: 'M', insertions: 1, deletions: 0 })
  })
  it('uses rename destinations and reads originals from the old path', async () => {
    git('mv', 'base.txt', 'renamed\tfile.txt')
    const svc = new GitService()
    const status = await svc.status(cwd)
    expect(status.index.files).toEqual([{ path: 'renamed\tfile.txt', status: 'R', insertions: 0, deletions: 0 }])
    const [diff] = await svc.fileDiffs(cwd)
    expect(diff).toMatchObject({ path: 'renamed\tfile.txt', original: 'one\ntwo', modified: 'one\ntwo\n' })
  })
})
