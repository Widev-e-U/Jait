import { describe, expect, it } from 'vitest'
import { bulletsToMarkdown, resolveListLineBreak, shouldAutoBullet } from './prompt-list-format'

describe('shouldAutoBullet', () => {
  it('turns a leading dash or star followed by a space into a bullet', () => {
    expect(shouldAutoBullet('- ')).toBe(true)
    expect(shouldAutoBullet('  * ')).toBe(true)
  })

  it('leaves dashes inside a sentence alone', () => {
    expect(shouldAutoBullet('a - ')).toBe(false)
    expect(shouldAutoBullet('-- ')).toBe(false)
    expect(shouldAutoBullet('-')).toBe(false)
  })
})

describe('resolveListLineBreak', () => {
  it('continues a bullet list with the same indentation', () => {
    expect(resolveListLineBreak('• first')).toEqual({ kind: 'continue', prefix: '• ' })
    expect(resolveListLineBreak('  - nested')).toEqual({ kind: 'continue', prefix: '  • ' })
  })

  it('counts numbered lists up and keeps the delimiter', () => {
    expect(resolveListLineBreak('1. one')).toEqual({ kind: 'continue', prefix: '2. ' })
    expect(resolveListLineBreak('9) nine')).toEqual({ kind: 'continue', prefix: '10) ' })
  })

  it('ends the list on an empty item', () => {
    expect(resolveListLineBreak('• ')).toEqual({ kind: 'end', markerLength: 2 })
    expect(resolveListLineBreak('3. ')).toEqual({ kind: 'end', markerLength: 3 })
  })

  it('ignores lines that are not list items', () => {
    expect(resolveListLineBreak('hello')).toBeNull()
    expect(resolveListLineBreak('-dash without space')).toBeNull()
    expect(resolveListLineBreak('2024. was a year')).toBeNull()
  })
})

describe('bulletsToMarkdown', () => {
  it('sends composer bullets as markdown list items', () => {
    expect(bulletsToMarkdown('intro\n• a\n  • b\nnot • here')).toBe('intro\n- a\n  - b\nnot • here')
  })
})
