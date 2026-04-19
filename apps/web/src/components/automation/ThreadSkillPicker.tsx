import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bot, Lightbulb, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { getApiUrl } from '@/lib/gateway-url'
import { agentsApi } from '@/lib/agents-api'
import type { SkillInfo } from '@jait/shared'

const API_URL = getApiUrl()

interface ThreadSkillPickerProps {
  token: string | null
  threadId: string
  selectedSkillIds: string[] | null
}

export function ThreadSkillPicker({ token, threadId, selectedSkillIds }: ThreadSkillPickerProps) {
  const [open, setOpen] = useState(false)
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const loadSkills = useCallback(async () => {
    setLoading(true)
    try {
      const headers: Record<string, string> = {}
      if (token) headers.Authorization = `Bearer ${token}`
      const res = await fetch(`${API_URL}/api/skills`, { headers })
      if (!res.ok) throw new Error(`Failed to load skills (HTTP ${res.status})`)
      const data = await res.json() as SkillInfo[]
      setSkills(data)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    if (open && skills.length === 0 && !loading) {
      void loadSkills()
    }
  }, [loadSkills, loading, open, skills.length])

  const enabledInstalledSkills = useMemo(
    () => skills.filter((skill) => skill.enabled),
    [skills],
  )
  const pinnedIds = selectedSkillIds ?? enabledInstalledSkills.map((skill) => skill.id)
  const usingGlobal = selectedSkillIds === null

  const saveSkillIds = useCallback(async (nextSkillIds: string[] | null) => {
    setSaving(true)
    try {
      await agentsApi.updateThread(threadId, { skillIds: nextSkillIds })
    } finally {
      setSaving(false)
    }
  }, [threadId])

  const toggleSkill = useCallback(async (skillId: string, checked: boolean) => {
    const next = checked
      ? [...new Set([...pinnedIds, skillId])]
      : pinnedIds.filter((id) => id !== skillId)
    await saveSkillIds(next)
  }, [pinnedIds, saveSkillIds])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-[10px] text-muted-foreground">
          <Lightbulb className="h-3 w-3" />
          {usingGlobal ? 'Skills:auto' : `Skills:${selectedSkillIds?.length ?? 0}`}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3 p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium">Thread skills</p>
            <p className="text-xs text-muted-foreground">
              {usingGlobal ? 'Uses globally enabled skills.' : 'Uses only pinned skills for this thread.'}
            </p>
          </div>
          {usingGlobal ? (
            <Badge variant="secondary" className="text-[10px]">global</Badge>
          ) : (
            <Badge variant="outline" className="text-[10px]">custom</Badge>
          )}
        </div>

        <div className="flex gap-2">
          <Button size="sm" variant={usingGlobal ? 'secondary' : 'outline'} className="h-7 text-xs" disabled={saving} onClick={() => void saveSkillIds(null)}>
            Global
          </Button>
          <Button size="sm" variant={!usingGlobal && (selectedSkillIds?.length ?? 0) === 0 ? 'secondary' : 'outline'} className="h-7 text-xs" disabled={saving} onClick={() => void saveSkillIds([])}>
            None
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading skills...
          </div>
        ) : enabledInstalledSkills.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">
            No enabled skills. Install/enable ClawHub skills in Settings.
          </div>
        ) : (
          <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {enabledInstalledSkills.map((skill) => {
              const checked = pinnedIds.includes(skill.id)
              return (
                <div key={skill.id} className="flex items-start gap-3 rounded-lg border p-2.5">
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
                    <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{skill.name}</p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{skill.description}</p>
                  </div>
                  <Switch checked={checked} disabled={saving || usingGlobal} onCheckedChange={(next) => { void toggleSkill(skill.id, next) }} />
                </div>
              )
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
