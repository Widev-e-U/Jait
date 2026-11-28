import { useContext, useEffect, useState } from 'react'
import type { MeetingSettings } from '@jait/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MeetingRecordingContext } from '@/hooks/useMeetingRecording'
import { meetingRecordingApi } from '@/lib/meeting-recording'

const fields = [
  { name: 'parakeetUrl', label: 'Parakeet URL', placeholder: 'http://127.0.0.1:18170' },
  { name: 'nemotronUrl', label: 'Nemotron URL', placeholder: 'http://127.0.0.1:18172/v1' },
  { name: 'nemotronModel', label: 'Nemotron model', placeholder: 'nemotron' },
  { name: 'obsidianUrl', label: 'Obsidian URL', placeholder: 'http://127.0.0.1:18171' },
  { name: 'obsidianVault', label: 'Obsidian vault name', placeholder: 'vault' },
] as const

export function MeetingRecordingSettings() {
  const recording = useContext(MeetingRecordingContext)
  const setup = recording?.setup
  const [draft, setDraft] = useState<MeetingSettings>()
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState('')
  const [status, setStatus] = useState('')
  const [results, setResults] = useState<{ service: string; ok: boolean }[]>([])
  useEffect(() => {
    if (setup) {
      const { configured, hasObsidianToken, ...settings } = setup
      setDraft(settings)
    }
    setToken('')
  }, [setup])
  if (!recording || !setup || !draft) return null

  const dirty = !!token.trim() || fields.some(({name}) => draft[name] !== setup[name])
  async function save(clearToken = false) {
    if (!recording || !draft) return
    setBusy('Saving…'); setStatus(''); setResults([])
    try {
      recording.setSetup(await meetingRecordingApi.saveSettings({ ...draft, obsidianToken: clearToken ? '' : token.trim() || undefined }))
      setStatus('Meeting settings saved.')
    } catch (failure) { setStatus((failure as Error).message) }
    finally { setBusy('') }
  }
  async function test() {
    setBusy('Testing…'); setStatus(''); setResults([])
    try { setResults(await meetingRecordingApi.test()) }
    catch (failure) { setStatus((failure as Error).message) }
    finally { setBusy('') }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Meeting recording</CardTitle>
        <CardDescription>Record on Jait Desktop or Android. Your gateway sends the audio to Parakeet, summarizes it with Nemotron, and saves the note and transcript in Obsidian’s Meetings folder.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          {fields.map(({ name, label, placeholder }) => <div className="space-y-1.5" key={name}>
            <Label htmlFor={`meeting-${name}`}>{label}</Label>
            <Input id={`meeting-${name}`} value={draft[name]} placeholder={placeholder} autoComplete="off"
              onChange={event => { const value = event.target.value; setDraft(previous => previous && { ...previous, [name]: value }) }} />
          </div>)}
          <div className="space-y-1.5">
            <Label htmlFor="meeting-token">Obsidian bearer token</Label>
            <Input id="meeting-token" type="password" value={token} autoComplete="new-password"
              onChange={event => setToken(event.target.value)} placeholder={setup.hasObsidianToken ? 'Saved in encrypted storage' : undefined} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={!!busy || !dirty} onClick={() => void save()}>Save meeting settings</Button>
          <Button variant="outline" size="sm" disabled={!!busy || dirty || !setup.configured} onClick={() => void test()}>Test connections</Button>
          {setup.hasObsidianToken && <Button variant="ghost" size="sm" disabled={!!busy || dirty} onClick={() => void save(true)}>Remove token</Button>}
        </div>
        {(busy || status || results.length > 0) && <div className="text-sm" role="status">
          {busy || status}
          {results.length > 0 && <ul className="space-y-1">{results.map(({ service, ok }) => <li key={service}>{service} · {ok ? 'Connected' : 'Connection failed'}</li>)}</ul>}
        </div>}
      </CardContent>
    </Card>
  )
}
