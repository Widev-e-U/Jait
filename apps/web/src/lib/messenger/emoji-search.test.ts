import { describe, expect, it } from 'vitest'
import { filterEmojiRows, type EmojiRow } from './emoji-search'

const rows: EmojiRow[] = [
  ['👍', 'thumbs up', 1, '+1 thumb up yes agree'],
  ['❤️', 'red heart', 1, 'heart love red'],
  ['😂', 'face with tears of joy', 1, 'laugh joy haha lol'],
  ['😮', 'face with open mouth', 1, 'wow surprised shocked'],
]

describe('emoji search', () => {
  it('returns every row for an empty or whitespace query', () => {
    expect(filterEmojiRows(rows, '')).toEqual(rows)
    expect(filterEmojiRows(rows, '   ')).toEqual(rows)
  })

  it('matches search terms and labels case-insensitively', () => {
    expect(filterEmojiRows(rows, 'love').map(row => row[0])).toEqual(['❤️'])
    expect(filterEmojiRows(rows, 'JOY').map(row => row[0])).toEqual(['😂'])
  })

  it('requires every word of a multi-word query to match one row', () => {
    expect(filterEmojiRows(rows, 'face open').map(row => row[0])).toEqual(['😮'])
    expect(filterEmojiRows(rows, 'face thumb')).toEqual([])
  })

  it('keeps dataset order and returns nothing when nothing matches', () => {
    expect(filterEmojiRows(rows, 'o').map(row => row[0])).toEqual(['❤️', '😂', '😮'])
    expect(filterEmojiRows(rows, 'thumb').map(row => row[0])).toEqual(['👍'])
    expect(filterEmojiRows(rows, 'zzz')).toEqual([])
  })
})
