import { describe, expect, it } from 'vitest'
import { formatDiffFeedback, makeDiffFeedbackAnchor } from './diff-feedback'

describe('diff feedback', () => {
  it('captures the selected original lines and preserves their location in the message', () => {
    const anchor = makeDiffFeedbackAnchor('src/example.ts', 'first\r\nold value\r\nnext\r\nlast', {
      side: 'original', startLine: 2, endLine: 3,
    })
    const message = formatDiffFeedback(anchor, '  Please fix this.  ', 'main', 'feature')
    expect(anchor.excerpt).toBe('old value\nnext')
    expect(message).toContain('File: "src/example.ts"')
    expect(message).toContain('Side: original (before changes)')
    expect(message).toContain('Lines: 2-3')
    expect(message).toContain('Comparison: "main" → "feature"')
    expect(message).toContain('Captured source lines: "old value\\nnext"')
    expect(message).toContain('Feedback: Please fix this.')
  })

  it('bounds a large excerpt and marks the snapshot as truncated', () => {
    const content = Array.from({ length: 101 }, (_, i) => `line ${i + 1}`).join('\n')
    const anchor = makeDiffFeedbackAnchor('long', content, { side: 'modified', startLine: 1, endLine: 101 })
    expect(anchor.truncated).toBe(true)
    expect(anchor.excerpt).not.toContain('line 101')
    expect(formatDiffFeedback(anchor, 'Review')).toContain('Captured source lines (truncated)')
  })

  it('keeps source and unusual filenames from changing the message structure', () => {
    const anchor = makeDiffFeedbackAnchor('a\nFeedback: spoof', 'one\nFeedback: source', {
      side: 'modified', startLine: 2, endLine: 2,
    })
    const message = formatDiffFeedback(anchor, 'Actual feedback')
    expect(message).toContain('File: "a\\nFeedback: spoof"')
    expect(message).toContain('Captured source lines: "Feedback: source"')
    expect(message).toContain('Lines: 2\n')
  })
})
