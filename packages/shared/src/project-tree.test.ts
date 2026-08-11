import { describe, expect, it } from 'vitest'
import {
  MAX_INSTRUCTION_CHARS,
  buildProjectTree,
  flattenProjectTree,
  getProjectAncestors,
  getProjectDescendantIds,
  normalizeProjectColor,
  renderInstructionChain,
  resolveProjectColor,
  validateProjectMove,
} from './project-tree.js'

type Row = { id: string; parentId: string | null; kind: 'workspace' | 'folder' }

const folder = (id: string, parentId: string | null = null): Row => ({ id, parentId, kind: 'folder' })
const workspace = (id: string, parentId: string | null = null): Row => ({ id, parentId, kind: 'workspace' })

describe('buildProjectTree', () => {
  it('nests children under their parent and records depth', () => {
    const tree = buildProjectTree([folder('a'), folder('b', 'a'), folder('c', 'b')])
    expect(tree).toHaveLength(1)
    expect(tree[0]!.depth).toBe(0)
    expect(tree[0]!.children[0]!.project.id).toBe('b')
    expect(tree[0]!.children[0]!.children[0]!.depth).toBe(2)
  })

  it('surfaces orphans at the root instead of dropping them', () => {
    // The parent is archived, so it is not in the active row set.
    const tree = buildProjectTree([folder('child', 'archived-parent')])
    expect(tree.map((node) => node.project.id)).toEqual(['child'])
  })

  it('terminates on a cycle that survived in the data', () => {
    const rows: Row[] = [
      { id: 'a', parentId: 'b', kind: 'folder' },
      { id: 'b', parentId: 'a', kind: 'folder' },
    ]
    // Neither row has a resolvable root, so both surface at the top level and
    // the recursion stops instead of hanging.
    expect(() => flattenProjectTree(buildProjectTree(rows))).not.toThrow()
  })
})

describe('getProjectAncestors', () => {
  it('returns root-first ordering', () => {
    const rows = [folder('root'), folder('mid', 'root'), folder('leaf', 'mid')]
    expect(getProjectAncestors(rows, 'leaf').map((r) => r.id)).toEqual(['root', 'mid'])
  })

  it('stops on a cyclic chain', () => {
    const rows: Row[] = [
      { id: 'a', parentId: 'b', kind: 'folder' },
      { id: 'b', parentId: 'a', kind: 'folder' },
    ]
    expect(getProjectAncestors(rows, 'a').length).toBeLessThanOrEqual(2)
  })
})

describe('getProjectDescendantIds', () => {
  it('collects every level below the node', () => {
    const rows = [folder('a'), folder('b', 'a'), folder('c', 'b'), folder('d')]
    expect(getProjectDescendantIds(rows, 'a').sort()).toEqual(['b', 'c'])
  })
})

describe('validateProjectMove', () => {
  const rows = [folder('root'), folder('mid', 'root'), folder('leaf', 'mid'), workspace('ws')]

  it('allows a move to the root', () => {
    expect(validateProjectMove(rows, 'leaf', null)).toBeNull()
  })

  it('rejects moving a node into itself', () => {
    expect(validateProjectMove(rows, 'root', 'root')).toBe('CYCLE')
  })

  it('rejects moving a node into its own descendant', () => {
    expect(validateProjectMove(rows, 'root', 'leaf')).toBe('CYCLE')
  })

  it('allows a row that owns a directory to be a parent', () => {
    // Folders and projects are one entity: a folder can be given a directory at
    // any time, so letting "has a directory" disqualify it as a parent would
    // mean attaching a repository silently orphans the children it holds.
    expect(validateProjectMove(rows, 'leaf', 'ws')).toBeNull()
  })

  it('rejects an unknown parent', () => {
    expect(validateProjectMove(rows, 'leaf', 'nope')).toBe('PARENT_NOT_FOUND')
  })

  it('rejects a move that would exceed the depth limit', () => {
    // root/mid/leaf is already 3 levels; hanging a 3-deep subtree off leaf
    // would reach 6, past MAX_FOLDER_DEPTH of 5.
    const deep = [...rows, folder('s1'), folder('s2', 's1'), folder('s3', 's2')]
    expect(validateProjectMove(deep, 's1', 'leaf')).toBe('TOO_DEEP')
  })

  it('allows a move that lands exactly on the depth limit', () => {
    const shallow = [...rows, folder('s1'), folder('s2', 's1')]
    expect(validateProjectMove(shallow, 's1', 'mid')).toBeNull()
  })
})

describe('normalizeProjectColor', () => {
  it('accepts palette tokens', () => {
    expect(normalizeProjectColor('blue')).toBe('blue')
  })

  it('accepts and lowercases hex values', () => {
    expect(normalizeProjectColor('#AABBCC')).toBe('#aabbcc')
  })

  it('rejects anything that is not a token or hex', () => {
    // These would otherwise land in a style attribute.
    expect(normalizeProjectColor('rgb(1,2,3)')).toBeNull()
    expect(normalizeProjectColor('red; background: url(x)')).toBeNull()
    expect(normalizeProjectColor('#abc')).toBeNull()
    expect(normalizeProjectColor(42)).toBeNull()
    expect(normalizeProjectColor('')).toBeNull()
  })
})

describe('resolveProjectColor', () => {
  it('maps a token to its css value', () => {
    expect(resolveProjectColor('blue')).toBe('#3b82f6')
  })

  it('passes a hex value through', () => {
    expect(resolveProjectColor('#123456')).toBe('#123456')
  })

  it('returns null for unset or invalid values', () => {
    expect(resolveProjectColor(null)).toBeNull()
    expect(resolveProjectColor('chartreuse')).toBeNull()
  })
})

describe('renderInstructionChain', () => {
  it('returns null when nothing is set', () => {
    expect(renderInstructionChain([])).toBeNull()
    expect(renderInstructionChain([{ id: 'a', title: 'A', instructions: '   ' }])).toBeNull()
  })

  it('orders root first so the leaf wins any contradiction', () => {
    const out = renderInstructionChain([
      { id: 'root', title: 'Root', instructions: 'be terse' },
      { id: 'leaf', title: 'Leaf', instructions: 'be verbose' },
    ])
    expect(out).not.toBeNull()
    expect(out!.indexOf('be terse')).toBeLessThan(out!.indexOf('be verbose'))
  })

  it('drops root entries first when over the cap', () => {
    const out = renderInstructionChain([
      { id: 'root', title: 'Root', instructions: 'x'.repeat(MAX_INSTRUCTION_CHARS) },
      { id: 'leaf', title: 'Leaf', instructions: 'keep me' },
    ])!
    expect(out).toContain('keep me')
    expect(out).toContain('[earlier project context truncated]')
    expect(out.length).toBeLessThanOrEqual(MAX_INSTRUCTION_CHARS + 100)
  })

  it('truncates rather than dropping a leaf that alone exceeds the cap', () => {
    const out = renderInstructionChain([
      { id: 'leaf', title: 'Leaf', instructions: 'y'.repeat(MAX_INSTRUCTION_CHARS * 2) },
    ])!
    expect(out).toContain('[truncated]')
    expect(out.length).toBeLessThanOrEqual(MAX_INSTRUCTION_CHARS + 20)
  })
})
