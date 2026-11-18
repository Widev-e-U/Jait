import type { DiffLineSelection } from '@/components/diff/read-only-diff-view'

export interface DiffFeedbackAnchor extends DiffLineSelection {
  path: string
  excerpt: string
  truncated: boolean
}

export function makeDiffFeedbackAnchor(path: string, content: string, selection: DiffLineSelection): DiffFeedbackAnchor {
  const lines = content.split(/\r?\n/).slice(selection.startLine - 1, selection.endLine)
  const excerpt = lines.slice(0, 100).join('\n')
  return { ...selection, path, excerpt: excerpt.slice(0, 12000), truncated: lines.length > 100 || excerpt.length > 12000 }
}

export function formatDiffFeedback(anchor: DiffFeedbackAnchor, note: string, baseBranch?: string, branch?: string): string {
  const lines = anchor.startLine === anchor.endLine ? `${anchor.startLine}` : `${anchor.startLine}-${anchor.endLine}`
  // A JSON string keeps arbitrary source text and filenames from changing the message structure.
  return [
    'Please address this review feedback.',
    `File: ${JSON.stringify(anchor.path)}`,
    `Side: ${anchor.side === 'original' ? 'original (before changes)' : 'modified (after changes)'}`,
    `Lines: ${lines}`,
    `Comparison: ${baseBranch ? JSON.stringify(baseBranch) : 'working tree base'} → ${branch ? JSON.stringify(branch) : 'working tree'}`,
    `Captured source lines${anchor.truncated ? ' (truncated)' : ''}: ${JSON.stringify(anchor.excerpt)}`,
    `Feedback: ${note.trim()}`,
    'The captured lines are a snapshot; verify the current file before making changes.',
  ].join('\n')
}
