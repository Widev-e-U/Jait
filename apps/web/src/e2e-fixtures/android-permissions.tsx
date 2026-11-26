import { createRoot } from 'react-dom/client'
import { AndroidPermissionsDialog } from '@/components/settings/AndroidPermissionsDialog'
import { Button } from '@/components/ui/button'
import { useVoiceRecording } from '@/hooks/useVoiceRecording'
import '@/index.css'

function Harness() {
  const { handleVoiceInput, voiceRecording } = useVoiceRecording({
    token: 'fixture-token',
    activeSessionId: null,
    sttProvider: 'whisper',
    setInputValue: () => {},
    onAuthRequired: () => {},
  })
  return (
    <main className="flex gap-2 p-4">
      <Button onClick={() => void handleVoiceInput()}>{voiceRecording ? 'Recording' : 'Record voice'}</Button>
      <AndroidPermissionsDialog />
    </main>
  )
}

const mount = document.createElement('div')
document.body.replaceChildren(mount)
createRoot(mount).render(<Harness />)
