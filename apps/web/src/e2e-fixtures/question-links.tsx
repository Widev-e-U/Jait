import { useState } from 'react'
import { createRoot } from 'react-dom/client'

import { UserQuestionForm } from '@/components/prompts/input-prompts'

interface Answer {
  selected: string[]
  freeText: string | null
  skipped: boolean
}

function Harness() {
  const [answers, setAnswers] = useState<Record<string, Answer>>({})

  return (
    <UserQuestionForm
      request={{
        id: 'links',
        sessionId: 's',
        requestedBy: null,
        title: 'Question',
        attention: 'normal',
        expiresAt: '2099-01-01T00:00:00.000Z',
        status: 'pending',
        questions: [{
          id: 'q',
          header: 'Choose',
          question: 'Read [guide](https://example.com/guide)',
          options: [{ label: 'First', description: '[Details](https://example.com/details)' }],
        }],
      }}
      answers={answers}
      submitting={false}
      onAnswerChange={(id, update) => setAnswers((current) => {
        const previous = current[id] ?? { selected: [], freeText: null, skipped: false }
        return {
          ...current,
          [id]: { ...previous, ...update },
        }
      })}
      onSubmit={async () => {}}
      onCancel={async () => {}}
    />
  )
}

const mount = document.createElement('div')
document.body.replaceChildren(mount)
createRoot(mount).render(<Harness />)
