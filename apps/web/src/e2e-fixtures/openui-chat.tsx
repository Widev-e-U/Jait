import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AssistantMarkdown } from '@/components/chat/assistant-markdown'
import '../index.css'

const partial = 'Before\n\n```openui\nroot = Panel("Status", [metric, tasks, more])\nmetric = Metric("Done", "3", "of 5")\ntasks = Checklist("Next", ["Review", "Test"])'
const complete = partial + '\nmore = Details("Notes", "Ready to review")\n```\n\nAfter'
function Fixture() {
  const [finished, setFinished] = useState(false)
  return <main><button onClick={() => setFinished(true)}>Finish stream</button><AssistantMarkdown content={finished ? complete : partial} isStreaming={!finished} /></main>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
