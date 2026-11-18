import { cn } from '@/lib/utils'

/** The transcript and composer share a centered column and outer edges. */
export const CHAT_COLUMN_MAX_WIDTH_CLASS = 'max-w-4xl'

/** Match the composer's mobile inset while keeping desktop edges flush. */
export const CHAT_TRANSCRIPT_COLUMN_PADDING_CLASS = 'px-2 md:px-0'
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
 * On mobile, match the header’s 8px side inset. On desktop, the composer
 * spans the column edge so its box aligns with the transcript.
 */
export function getChatComposerBoundaryClassName(isMobile: boolean): string {
  return cn(
    'relative z-30 isolate shrink-0 bg-background',
    isMobile ? 'px-2 py-2' : `${CHAT_COMPOSER_COLUMN_PADDING_CLASS} py-3`,
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
