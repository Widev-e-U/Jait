import { useCallback, useEffect, useState } from 'react'
import { Eye, EyeOff, Key } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToolSettings } from './ToolSettings'

import OpenAI from '@lobehub/icons/es/OpenAI'
import Perplexity from '@lobehub/icons/es/Perplexity'
import OpenRouter from '@lobehub/icons/es/OpenRouter'
import XAI from '@lobehub/icons/es/XAI'
import Gemini from '@lobehub/icons/es/Gemini'
import Moonshot from '@lobehub/icons/es/Moonshot'
import Kimi from '@lobehub/icons/es/Kimi'
import Grok from '@lobehub/icons/es/Grok'

const API_KEY_FIELDS = [
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'OPENAI_MODEL',
  'OPENAI_WEB_SEARCH_MODEL',
  'BRAVE_API_KEY',
  'PERPLEXITY_API_KEY',
  'OPENROUTER_API_KEY',
  'XAI_API_KEY',
  'GEMINI_API_KEY',
  'MOONSHOT_API_KEY',
  'KIMI_BASE_URL',
  'KIMI_MODEL',
  'PERPLEXITY_MODEL',
  'PERPLEXITY_OPENROUTER_MODEL',
  'GROK_MODEL',
  'GEMINI_MODEL',
] as const

type FieldName = typeof API_KEY_FIELDS[number]

/** Map field prefix → lobe icon component */
const FIELD_ICON: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  OPENAI: OpenAI,
  PERPLEXITY: Perplexity,
  OPENROUTER: OpenRouter,
  XAI: XAI,
  GEMINI: Gemini,
  MOONSHOT: Moonshot,
  KIMI: Kimi,
  GROK: Grok,
}

function getFieldIcon(field: FieldName): React.ComponentType<{ size?: number; className?: string }> | null {
  const prefix = field.split('_')[0]
  return FIELD_ICON[prefix] ?? null
}

/** Is this a secret/key field that should be masked? */
function isSecretField(field: string): boolean {
  return field.endsWith('_KEY') || field.endsWith('_URL')
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

interface SettingsPageProps {
  username: string
  token: string | null
  apiKeys: Record<string, string>
  onSaveApiKeys: (next: Record<string, string>) => Promise<void>
  onClearArchive: () => Promise<number>
}

export function SettingsPage({
  username,
  token,
  apiKeys,
  onSaveApiKeys,
  onClearArchive,
}: SettingsPageProps) {
  const [draft, setDraft] = useState<Record<string, string>>(apiKeys)
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [envSet, setEnvSet] = useState<Record<string, boolean>>({})
  const [visible, setVisible] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setDraft(apiKeys)
  }, [apiKeys])

  // Fetch which fields have env values on mount
  useEffect(() => {
    if (!token) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`${API_URL}/auth/settings/env-status`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok && !cancelled) {
          const data = (await res.json()) as { env_set: Record<string, boolean> }
          setEnvSet(data.env_set)
        }
      } catch {
        // silently ignore — badges will just not show env status
      }
    })()
    return () => { cancelled = true }
  }, [token])

  const toggleVisibility = useCallback((field: string) => {
    setVisible((prev) => ({ ...prev, [field]: !prev[field] }))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setStatus(null)
    try {
      await onSaveApiKeys(draft)
      setStatus('API keys saved.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save API keys')
    } finally {
      setSaving(false)
    }
  }

  const handleClearArchive = async () => {
    setClearing(true)
    setError(null)
    setStatus(null)
    try {
      const removed = await onClearArchive()
      setStatus(`Cleared ${removed} archived session(s).`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear archive')
    } finally {
      setClearing(false)
    }
  }

  function renderSourceBadge(field: FieldName) {
    const userHasValue = !!(draft[field]?.trim())
    const envHasValue = !!envSet[field]

    if (userHasValue) {
      return <Badge variant="default" className="text-[10px] px-1.5 py-0">user</Badge>
    }
    if (envHasValue) {
      return <Badge variant="success" className="text-[10px] px-1.5 py-0">.env</Badge>
    }
    return <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">empty</Badge>
  }

  return (
    <div className="mx-auto w-full max-w-5xl p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Signed in as <span className="font-medium text-foreground">{username}</span>
        </p>
      </div>

      <Card className="p-5 space-y-4">
        <div>
          <h2 className="text-base font-medium">Session archive</h2>
          <p className="text-sm text-muted-foreground">
            Permanently remove archived sessions and their messages from your account.
          </p>
        </div>
        <div>
          <Button variant="destructive" onClick={() => { void handleClearArchive() }} disabled={clearing}>
            {clearing ? 'Clearing...' : 'Clear archived sessions'}
          </Button>
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <div>
          <h2 className="text-base font-medium">API keys and provider settings</h2>
          <p className="text-sm text-muted-foreground">
            Values stored here are user-specific and override environment defaults for your account.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {API_KEY_FIELDS.map((field) => {
            const IconComponent = getFieldIcon(field)
            const secret = isSecretField(field)
            const shown = !!visible[field]

            return (
              <div key={field} className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  {IconComponent ? (
                    <IconComponent size={14} className="shrink-0 text-muted-foreground" />
                  ) : (
                    <Key className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <Label htmlFor={`api-${field}`} className="font-mono text-xs">{field}</Label>
                  {renderSourceBadge(field)}
                </div>
                <div className="relative">
                  <Input
                    id={`api-${field}`}
                    type={secret && !shown ? 'password' : 'text'}
                    value={draft[field] ?? ''}
                    onChange={(event) => {
                      const next = event.target.value
                      setDraft((prev) => ({ ...prev, [field]: next }))
                    }}
                    placeholder={envSet[field] ? '(set via .env)' : '(empty)'}
                    className={secret ? 'pr-9' : ''}
                  />
                  {secret && (
                    <button
                      type="button"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => toggleVisibility(field)}
                      tabIndex={-1}
                      aria-label={shown ? 'Hide value' : 'Show value'}
                    >
                      {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={() => { void handleSave() }} disabled={saving}>
            {saving ? 'Saving...' : 'Save API settings'}
          </Button>
          {status && <span className="text-sm text-muted-foreground">{status}</span>}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </Card>

      <ToolSettings token={token} />
    </div>
  )
}
