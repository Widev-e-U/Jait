import { humanizeToolName } from '@/lib/tool-call-body'

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

/** Native, MCP structuredContent, and persisted MCP text envelopes. Never execute content. */
export function questionResultData(value: unknown, depth = 0): Record<string, unknown> | undefined {
  if (depth > 6) return undefined
  if (typeof value === 'string') {
    try { return questionResultData(JSON.parse(value), depth + 1) } catch { return undefined }
  }
  const data = record(value)
  if (!data) return undefined
  if (record(data.answers) || (data.status === 'pending' && typeof data.requestId === 'string') || (data.ok === false && typeof data.message === 'string')) return data
  for (const key of ['data', 'result', 'structuredContent']) {
    const found = questionResultData(data[key], depth + 1)
    if (found) return found
  }
  if (Array.isArray(data.content)) {
    for (const item of data.content) {
      const found = questionResultData(record(item)?.text, depth + 1)
      if (found) return found
    }
  }
  return undefined
}

export function questionAnswerData(value: unknown): Record<string, unknown> | undefined {
  const result = questionResultData(value)
  return record(result?.answers) ? result : undefined
}

export function UserQuestionResult({ args, data, status, message }: {
  args: Record<string, unknown>
  data: unknown
  status: string
  message?: string
}) {
  const result = questionAnswerData(data)
  const answers = record(result?.answers)
  const questions = Array.isArray(args.questions) ? args.questions : []
  const labels = new Map(questions.flatMap(question => {
    const q = record(question)
    return typeof q?.id === 'string' ? [[q.id, typeof q.question === 'string' ? q.question : q.header] as const] : []
  }))
  if (!answers) {
    return <p className="px-3 py-2 text-xs text-muted-foreground" role="status">
      {status === 'error' ? message || 'Question cancelled' : 'Waiting for your answers'}
    </p>
  }
  return <dl className="space-y-3 px-3 py-2 text-sm" aria-label="Your answers">
    {Object.entries(answers).map(([id, value]) => {
      const answer = record(value)
      if (!answer) return null
      const selected = Array.isArray(answer.selected) ? answer.selected.filter((v): v is string => typeof v === 'string') : []
      const freeText = typeof answer.freeText === 'string' ? answer.freeText : ''
      return <div key={id}>
        <dt className="text-xs text-muted-foreground">{String(labels.get(id) || humanizeToolName(id))}</dt>
        <dd className="mt-1 whitespace-pre-wrap break-words">
          {answer.skipped === true ? <span className="text-muted-foreground">Skipped</span> : <>
            {selected.map((label, index) => <div key={index}>{label}</div>)}
            {freeText && <div>{freeText}</div>}
            {!selected.length && !freeText && <span className="text-muted-foreground">No answer supplied</span>}
          </>}
        </dd>
      </div>
    })}
  </dl>
}
