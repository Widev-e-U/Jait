/**
 * Which reasoning-effort choices the provider/model picker should offer, if any.
 *
 * Kept out of the component because the rule is subtle: the effort applies to
 * the model that will actually run, which is not always the one highlighted in
 * the list.
 */

export interface ReasoningEffortCapableModel {
  id: string
  isDefault?: boolean
  /** Model accepts a provider-specific reasoning/thinking effort option. */
  reasoningEffortSupported?: boolean
  /** Exact effort values the provider advertised for this model. */
  supportedReasoningEfforts?: Array<{ reasoningEffort: string; description?: string }>
}

export interface ReasoningEffortOption {
  value: string
  label: string
  hint: string
}

/**
 * The generic OpenAI `reasoning_effort` ladder. Only used for models that
 * report support without advertising their own values — which in practice
 * means the OpenAI-compatible models behind the jait provider.
 */
export const DEFAULT_REASONING_EFFORTS: ReasoningEffortOption[] = [
  { value: 'minimal', label: 'Minimal', hint: 'Fastest, least thinking' },
  { value: 'low', label: 'Low', hint: 'Brief reasoning' },
  { value: 'medium', label: 'Medium', hint: 'Balanced' },
  { value: 'high', label: 'High', hint: 'Deepest reasoning' },
]

export function formatReasoningEffortLabel(value: string): string {
  return value
    .split(/[-_]/)
    .map((part) => part ? part.charAt(0).toUpperCase() + part.slice(1) : part)
    .join(' ')
}

/**
 * The model an effort would apply to.
 *
 * With no explicit pick the provider runs *its* default, so only a model the
 * provider actually flagged as `isDefault` may stand in. Falling back to the
 * first entry in the list instead made the panel appear based on nothing but
 * list order — jait's OpenAI models carry no `isDefault`, so whichever model
 * happened to be listed first decided whether a model the user never chose got
 * a reasoning-effort selector.
 */
export function resolveActiveModel<T extends ReasoningEffortCapableModel>(
  models: T[],
  selectedModelId: string | null,
): T | null {
  if (selectedModelId) return models.find((entry) => entry.id === selectedModelId) ?? null
  return models.find((entry) => entry.isDefault) ?? null
}

/**
 * Effort choices for a model, or `null` when it takes no effort option at all
 * (in which case the picker hides the section entirely).
 */
export function resolveReasoningEffortOptions(
  model: ReasoningEffortCapableModel | null,
): ReasoningEffortOption[] | null {
  if (!model) return null
  if (model.supportedReasoningEfforts?.length) {
    return model.supportedReasoningEfforts.map((effort) => ({
      value: effort.reasoningEffort,
      label: formatReasoningEffortLabel(effort.reasoningEffort),
      hint: effort.description
        ?? `Use ${formatReasoningEffortLabel(effort.reasoningEffort).toLowerCase()} reasoning`,
    }))
  }
  return model.reasoningEffortSupported ? DEFAULT_REASONING_EFFORTS : null
}
