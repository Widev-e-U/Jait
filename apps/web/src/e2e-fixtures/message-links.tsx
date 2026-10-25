import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AssistantMarkdown } from '@/components/chat/assistant-markdown'
import { MessageText } from '@/components/ui/message-text'
import { MessageResponse } from '@/components/ai-elements/message'
import { subscribeNotificationNavigation } from '@/lib/notification-navigation'
import '@/index.css'

function Harness() {
  const [destination, setDestination] = useState('')
  const [edited, setEdited] = useState(false)
  const [navigationCount, setNavigationCount] = useState(0)
  useEffect(() => subscribeNotificationNavigation(async activation => {
    setDestination(activation.link)
    setNavigationCount(count => count + 1)
    return true
  }), [])
  const content = '[Settings](/settings?q=providers) [Web](https://example.com/readme.md) [File](/home/jakob/jait/README.md:3)'
  return <main className="p-4">
    <section aria-label="Assistant"><AssistantMarkdown content={content} onOpenPath={path => setDestination(path)} /></section>
    <section aria-label="User" className="whitespace-pre-wrap" onClick={() => setEdited(true)}><MessageText>{content}</MessageText></section>
    <section aria-label="Response"><MessageResponse>{content}</MessageResponse></section>
    <output aria-label="Destination">{destination}</output>
    <output aria-label="Navigation count">{navigationCount}</output>
    <output aria-label="Edited">{String(edited)}</output>
  </main>
}
const mount = document.createElement('div')
document.body.replaceChildren(mount)
createRoot(mount).render(<Harness />)
