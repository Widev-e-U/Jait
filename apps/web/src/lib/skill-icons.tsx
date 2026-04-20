import {
  Blocks,
  Bug,
  ChartColumn,
  type LucideIcon,
  Lock,
  Network,
  Search,
  TestTube2,
  Wrench,
} from 'lucide-react'
import type { SkillInfo } from '@jait/shared'

export type SkillVisual = {
  icon: LucideIcon
  className: string
}

const SOURCE_STYLES: Record<SkillInfo['source'], string> = {
  bundled: 'bg-sky-500/10 text-sky-600',
  user: 'bg-amber-500/10 text-amber-600',
  workspace: 'bg-emerald-500/10 text-emerald-600',
  plugin: 'bg-fuchsia-500/10 text-fuchsia-600',
}

const KEYWORD_ICON_MAP: Array<{ pattern: RegExp; icon: LucideIcon }> = [
  { pattern: /\b(debug|bug|troubleshoot|fix)\b/i, icon: Bug },
  { pattern: /\b(review|audit|security|secure|vuln)\b/i, icon: Lock },
  { pattern: /\b(test|qa|spec)\b/i, icon: TestTube2 },
  { pattern: /\b(perf|performance|optimi[sz]e|latency|profil)\b/i, icon: ChartColumn },
  { pattern: /\b(arch|design|system|topology|diagram)\b/i, icon: Network },
  { pattern: /\b(research|investigate|search|explore)\b/i, icon: Search },
  { pattern: /\b(data|analysis|analytics|report)\b/i, icon: ChartColumn },
  { pattern: /\b(code|generate|scaffold|tool|workflow)\b/i, icon: Wrench },
]

export function getSkillVisual(skill: Pick<SkillInfo, 'id' | 'name' | 'description' | 'source'>): SkillVisual {
  const haystack = `${skill.id} ${skill.name} ${skill.description}`
  const matched = KEYWORD_ICON_MAP.find(({ pattern }) => pattern.test(haystack))
  return {
    icon: matched?.icon ?? Blocks,
    className: SOURCE_STYLES[skill.source],
  }
}
