import { useCallback, useEffect, useState } from 'react'
import { getApiUrl } from '@/lib/gateway-url'
import type { SkillInfo } from '@jait/shared'
import type { PromptSkill } from '@/components/chat'

const API_URL = getApiUrl()

/**
 * Loads the user's installed, enabled skills for the composer `/` slash menu.
 * Returns only enabled skills, shaped as PromptSkill, plus a manual refresh.
 */
export function useSkills(token: string | null): { skills: PromptSkill[]; refresh: () => void } {
  const [skills, setSkills] = useState<PromptSkill[]>([])

  const refresh = useCallback(() => {
    const headers: Record<string, string> = {}
    if (token) headers.Authorization = `Bearer ${token}`
    void fetch(`${API_URL}/api/skills`, { headers })
      .then((res) => (res.ok ? (res.json() as Promise<SkillInfo[]>) : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data) => {
        setSkills(
          data
            .filter((s) => s.enabled)
            .map((s) => ({ id: s.id, name: s.name, description: s.description })),
        )
      })
      .catch(() => {
        // Skills are optional — leave the list empty on failure.
      })
  }, [token])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { skills, refresh }
}
