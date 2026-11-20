import { describe, expect, it } from 'vitest'
import { linkedBodyFromHtml } from './linked-body'

describe('linkedBodyFromHtml', () => {
  it('keeps link targets as Markdown links', () => {
    expect(linkedBodyFromHtml('<p>FYI</p><p>More info <a href="https://example.com/a b">here</a>.</p>'))
      .toBe('FYI\nMore info [here](<https://example.com/a%20b>).')
  })
  it('ignores unsafe schemes and link-free html', () => {
    expect(linkedBodyFromHtml('<a href="javascript:alert(1)">x</a>')).toBeUndefined()
    expect(linkedBodyFromHtml('<b>plain</b>')).toBeUndefined()
  })
})
