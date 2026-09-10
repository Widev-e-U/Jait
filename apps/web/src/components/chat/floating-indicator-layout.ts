/** Horizontal gap (px) required between a floating indicator and transcript text. */
export const FLOATING_INDICATOR_MIN_TEXT_GAP_PX = 12

export interface FloatingLeftIndicatorLayout {
  /** Right edge (px) of the floating indicator, relative to the chat panel. */
  indicatorRight: number
  /** Left edge (px) of the transcript text column, relative to the chat panel. */
  contentLeft: number
}

/**
 * Whether a left-anchored floating indicator (e.g. the file diff badge) can stay
 * visible without covering transcript text. Scrolled text can sit at the
 * indicator's vertical position, so only horizontal separation counts.
 */
export function shouldShowFloatingLeftIndicator({ indicatorRight, contentLeft }: FloatingLeftIndicatorLayout): boolean {
  if (!Number.isFinite(indicatorRight) || !Number.isFinite(contentLeft)) return false
  return contentLeft - indicatorRight >= FLOATING_INDICATOR_MIN_TEXT_GAP_PX
}

/** Width of the centered transcript text column (`max-w-4xl`). */
export const CHAT_TRANSCRIPT_COLUMN_MAX_WIDTH_PX = 896

/**
 * Left edge (px) of the transcript text column relative to the chat panel,
 * mirroring the Conversation layout: a centered `max-w-4xl` column with
 * `px-4` (mobile) / `sm:px-5` (desktop) horizontal padding.
 */
export function getChatTranscriptColumnLeft(panelWidth: number, isMobile: boolean): number {
  if (!Number.isFinite(panelWidth) || panelWidth <= 0) return 0
  const horizontalPadding = isMobile ? 16 : 20
  return (panelWidth - Math.min(CHAT_TRANSCRIPT_COLUMN_MAX_WIDTH_PX, panelWidth)) / 2 + horizontalPadding
}