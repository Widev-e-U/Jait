import { useMemo } from 'react'
import { providerTypeFromId } from '@jait/shared'
import { providerIconFor } from '@/components/chat/provider-model-selector'
import { formatSessionChatSelectionLabel, parseSessionChatSelection } from '@/lib/session-chat-selection'

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
  const selectionLabel = formatSessionChatSelectionLabel(selection)

  return (
    <span
      role="img"
      title={selectionLabel}
      aria-label={selectionLabel}
      className="inline-flex size-3 shrink-0 items-center justify-center text-muted-foreground"
    >
      <span aria-hidden="true" className="pointer-events-none inline-flex">
        <Icon className="size-3" />
      </span>
    </span>
  )
}
