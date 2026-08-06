import { useMemo } from 'react'
import { providerTypeFromId } from '@jait/shared'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ModelIcon, formatModelDisplayLabel, getModelDisplayName } from '@/components/icons/model-icons'
import { parseSessionChatSelection } from '@/lib/session-chat-selection'

/** Provider-logo-only badge for a chat's last-used provider/model/mode, hoverable for details. */
export function SessionChatIcon({ metadata }: { metadata: string | null }) {
  const selection = useMemo(() => parseSessionChatSelection(metadata), [metadata])
  if (!selection) return null

  const providerType = providerTypeFromId(selection.provider)
  const iconProvider = providerType === 'codex' ? 'openai' : providerType === 'claude-code' ? 'anthropic' : 'jait'
  const iconModel = providerType === 'codex' ? 'codex' : providerType === 'claude-code' ? 'claude-3' : selection.model ?? undefined
  const providerLabel = providerType === 'codex' ? 'OpenAI Codex' : providerType === 'claude-code' ? 'Claude Code' : 'Jait'
  const modelLabel = selection.model
    ? (providerType === 'codex' || providerType === 'claude-code'
      ? formatModelDisplayLabel(selection.model)
      : getModelDisplayName(selection.model))
    : null
  const modeLabel = selection.reasoningEffort
    ? `${selection.reasoningEffort.charAt(0).toUpperCase()}${selection.reasoningEffort.slice(1)} effort`
    : null
  const tooltipText = [providerLabel, modelLabel, modeLabel].filter(Boolean).join(' · ')

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex shrink-0 items-center text-muted-foreground">
          <ModelIcon provider={iconProvider} model={iconModel} size={12} />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">{tooltipText}</TooltipContent>
    </Tooltip>
  )
}
