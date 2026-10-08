import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'sonner'
import type { JaitBackend } from '@jait/shared'
import { SettingsPage } from '@/components/settings/SettingsPage'
import { setAuthToken } from '@/lib/auth-token'
import '../index.css'
setAuthToken('e2e-test-token')
localStorage.setItem('jait.settings.activeTab', 'api')
function Fixture() {
  const [keys, setKeys] = useState<Record<string, string>>({})
  const [backend, setBackend] = useState<JaitBackend>('openai')
  return <><SettingsPage focusNodeId={null} username="tester" token="e2e-test-token" apiKeys={keys}
    onSaveApiKeys={async next => { setKeys(next) }} sttProvider="whisper" onSttProviderChange={async () => {}}
    chatStreamingAction="steer" onChatStreamingActionChange={async () => {}} jaitBackend={backend} onJaitBackendChange={async value => { setBackend(value) }}
    onClearArchive={async () => 0} onClearArchivedProjects={async () => 0} onFetchArchivedProjects={async () => []} onRestoreProject={async () => true}
    updateInfo={null} updateChecking={false} onCheckUpdate={() => {}} onApplyUpdate={() => {}} updateApplying={false}
    releases={null} releasesLoading={false} onCheckChangelog={() => {}} platform="web" /><Toaster />
    <output className="hidden" data-testid="saved-settings">{JSON.stringify(keys)}</output></>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
