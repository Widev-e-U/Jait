import { describe, expect, it } from 'vitest'
import { isProjectBinaryPreview, isProjectMarkdown, isProjectPdf } from './project-file-preview'

describe('project file preview kinds', () => {
  it('sends images and PDFs through the binary preview read', () => {
    expect(isProjectBinaryPreview('/p/shots/a.PNG')).toBe(true)
    expect(isProjectBinaryPreview('/p/docs/report.pdf')).toBe(true)
    expect(isProjectBinaryPreview('/p/src/a.ts')).toBe(false)
    expect(isProjectBinaryPreview('/p/docs/guide.md')).toBe(false)
  })

  it('recognizes PDFs and markdown by extension', () => {
    expect(isProjectPdf('report.pdf')).toBe(true)
    expect(isProjectPdf('report.pdf.txt')).toBe(false)
    expect(isProjectMarkdown('README.md')).toBe(true)
    expect(isProjectMarkdown('notes.markdown')).toBe(true)
    expect(isProjectMarkdown('page.mdx')).toBe(true)
    expect(isProjectMarkdown('md.ts')).toBe(false)
  })
})
