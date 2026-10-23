import { cn } from '@/lib/utils'

/**
 * The chat column.
 *
 * The transcript and the composer are laid out in one centered column that
 * owns the pane's width; the children only add their own horizontal inset.
 * That is how the VS Code Copilot chat pane works too — `.interactive-session`
 * centers once (max-width + margin auto), then `.interactive-item-container`
 * pads the messages and `.chat-input-container` pads the input box. Keeping the
 * centering in one place is what makes the message text and the text you type
 * share a left edge instead of drifting apart by the wrapper paddings.
 *
 * `floating-indicator-layout.ts` mirrors this geometry numerically
 * (`CHAT_TRANSCRIPT_COLUMN_MAX_WIDTH_PX` = 896 = `max-w-4xl`, 16/20px).
 */
export const CHAT_COLUMN_MAX_WIDTH_CLASS = 'max-w-4xl'

/** Left/right inset of message text inside the chat column. */
export const CHAT_TRANSCRIPT_COLUMN_PADDING_CLASS = 'px-4 sm:px-5'

/**
 * Left/right inset of the composer *box*. The box spans the column edge and
 * `PromptInput` supplies the inner text padding (1px border + `px-2`/`sm:px-3`
 * editor area + `px-2` editable = 17/21px), which lands the typed text on the
 * message text's left edge (16/20px). That is Copilot's arrangement too: the
 * transcript pads 16px, the input box takes its own 1px + 6px inset and the
 * two text edges end up within a pixel or two of each other.
 */
export const CHAT_COMPOSER_COLUMN_PADDING_CLASS = 'px-0'

/** Centered chat column, without a horizontal inset. */
export function getChatColumnClassName(...extra: Array<string | false | null | undefined>): string {
  return cn('mx-auto w-full', CHAT_COLUMN_MAX_WIDTH_CLASS, ...extra)
}

/** Centered chat column carrying the transcript's message gutter. */
export function getChatTranscriptColumnClassName(...extra: Array<string | false | null | undefined>): string {
  return getChatColumnClassName(CHAT_TRANSCRIPT_COLUMN_PADDING_CLASS, ...extra)
}

export function getChatTranscriptBoundaryClassName(): string {
  return 'relative z-0 isolate min-h-0 flex-1 overflow-hidden'
}

/**
 * Composer boundary. Horizontal padding lives in
 * `CHAT_COMPOSER_COLUMN_PADDING_CLASS`; only vertical padding is kept here so
 * the composer box can span the column edge while message text stays inset.
 */
export function getChatComposerBoundaryClassName(isMobile: boolean): string {
  return cn(
    'relative z-30 isolate shrink-0 bg-background',
    CHAT_COMPOSER_COLUMN_PADDING_CLASS,
    isMobile ? 'py-2' : 'py-3',
  )
}

export function getMessageEditPromptClassName(): string {
  return "rounded-lg border-primary/20 bg-primary/[0.08] dark:!bg-primary/[0.08] shadow-none [&_.text-muted-foreground]:text-muted-foreground [&>div]:!bg-transparent [&_[contenteditable='true']]:!bg-transparent"
}

export function getUserMessageEditComposerShellClassName(): string {
  return [
    'fixed left-1/2 top-1/2 z-50',
    'w-[min(42rem,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] -translate-x-1/2 -translate-y-1/2',
    // Floating mobile composer needs an opaque card so the chat messages
    // behind it do not bleed through the translucent prompt input.
    'rounded-2xl border border-border bg-background p-1.5 shadow-2xl shadow-black/30',
    'md:relative md:left-auto md:top-auto md:z-40 md:w-full md:max-w-4xl md:translate-x-0 md:translate-y-0',
    'md:rounded-none md:border-0 md:bg-transparent md:p-0 md:shadow-none',
  ].join(' ')
}

export function getMobileUserMessageEditTop(
  viewport: Pick<VisualViewport, 'height' | 'offsetTop'> | null | undefined,
  fallbackHeight: number,
): number {
  if (viewport && viewport.height > 0) {
    return viewport.offsetTop + viewport.height / 2
  }
  return Math.max(0, fallbackHeight / 2)
}

export function shouldShowNormalChatComposer(
  isMobile: boolean,
  editingMessageId: string | null,
  editingQueue = false,
): boolean {
  return !isMobile || (editingMessageId === null && !editingQueue)
}

export function shouldShowChatContextIndicator(
  hasContextUsage: boolean,
  showTrajectory: boolean,
): boolean {
  return hasContextUsage && !showTrajectory
}

export function getUserMessageEditComposerTransitionClassName(showEditComposer: boolean): string {
  return [
    'space-y-3 origin-bottom transition-opacity duration-150 ease-out',
    showEditComposer ? 'opacity-100' : 'opacity-0',
  ].join(' ')
}
