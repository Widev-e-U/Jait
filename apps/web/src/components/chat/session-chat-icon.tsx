import { useMemo } from 'react'
import { providerTypeFromId } from '@jait/shared'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatModelDisplayLabel, getModelDisplayName } from '@/components/icons/model-icons'
import { providerIconFor, providerLabelFor } from '@/components/chat/provider-model-selector'
import { parseSessionChatSelection } from '@/lib/session-chat-selection'

/**
 * Provider-logo badge for a chat's last-used provider/model/mode. Shows the
 * same provider icon used in the provider/model selector (NOT a model-derived
 * icon, so e.g. a Jait chat running a deepseek model shows the Jait logo, not
 * DeepSeek). Hover for provider · model · mode.
 */
export function SessionChatIcon({ metadata }: { metadata: string | null }) {
  const selection = useMemo(() => parseSessionChatSelection(metadata), [metadata])
  if (!selection) return null

  const providerType = providerTypeFromId(selection.provider)
  const Icon = providerIconFor(providerType, selection.provider)
  const providerLabel = providerLabelFor(providerType, selection.provider)
  const modelLabel = selection.model ? formatModelDisplayLabel(getModelDisplayName(selection.model)) : null
  const modeLabel = selection.reasoningEffort
    ? `${selection.reasoningEffort.charAt(0).toUpperCase()}${selection.reasoningEffort.slice(1)} effort`
    : null
  const tooltipText = [providerLabel, modelLabel, modeLabel].filter(Boolean).join(' · ')

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex size-3 shrink-0 items-center justify-center text-muted-foreground">
          <Icon className="size-3" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">{tooltipText}</TooltipContent>
    </Tooltip>
  )
}
