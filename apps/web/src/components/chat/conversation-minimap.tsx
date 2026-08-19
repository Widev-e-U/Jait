import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { type Virtualizer } from '@tanstack/react-virtual'
import { cn } from '@/lib/utils'
import { prepareWithSegments, walkLineRanges } from '@chenglou/pretext'

interface ConversationMinimapProps {
  virtualizer: Virtualizer<HTMLDivElement, Element>
  /** The conversation's scroll container; null until the transcript renders. */
  scrollElement: HTMLDivElement | null
  /**
   * Offset of the virtualized sizer from the top of the scroll container, in px.
   * The sizer (whose height is `totalSize`) sits below the container's top
   * padding and the "load earlier messages" button, so a `scrollTop` of 0 does
   * not mean the top of the transcript — the document offset is
   * `scrollTop - sizerOffset`. Without this the rail's indicator and scrubbing
   * drift from the real transcript by however much the sizer is inset.
   */
  sizerOffset: number
  /** Per-child role ('user' | 'agent'), index-aligned with the virtualizer items. */
  roles: Array<'user' | 'agent'>
  /** Per-child raw text, index-aligned with the virtualizer items. */
  texts: string[]
  /** Per-child message structure, including interleaved thinking and tool rows. */
  messageInputs: MinimapMessageInput[]
  /**
   * Width of the inner text column, in px. Used to wrap preview lines at the
   * same width the real prose wraps at, so each rail line mirrors an actual
   * line of the transcript rather than an arbitrary character-count chunk.
   */
  textWidth: number
  /**
   * Called right after a scrub writes a new scroll position, so the conversation
   * can stop following the bottom — a programmatic scroll is invisible to the
   * wheel/touch handlers that normally detect that intent.
   */
  onScrub: () => void
}

/**
 * Rail width. Exported so the conversation can inset its floating controls by
 * exactly this much and park them alongside the rail rather than under it.
 */
export const MINIMAP_RAIL_WIDTH_PX = 96

/** Painted height of each actual transcript-line mark on the minimap. */
const MINIMAP_ROW_HEIGHT_PX = 2
/**
 * Vertical pitch of one preview line, constant regardless of how long the
 * conversation is — the rail is a fixed-scale map of the transcript, not a bar
 * stretched to the rail's height. The 1px of slack over the painted height is
 * what keeps consecutive lines readable as lines instead of a solid block.
 */
const MINIMAP_ROW_PITCH_PX = 3
/**
 * User turns read as right-aligned bubbles (like the real layout, where they
 * sit on the right edge of the chat), so their preview lines are capped to
 * this fraction of the rail and painted from the right. Agent prose stays
 * left-aligned but is capped below the full rail width, so a short paragraph
 * never reads as a full-width bar — the rail mirrors the transcript's
 * left/right rhythm.
 */
const MINIMAP_USER_MAX_WIDTH = 0.6
/** Agent lines never exceed this fraction of the rail, keeping prose left-aligned and non-full-width. */
const MINIMAP_AGENT_MAX_WIDTH = 0.85
/** Never let a non-empty line vanish entirely. */
const MINIMAP_MIN_LINE_RATIO = 0.12
/** Ceiling on the line shape we keep per message, so one huge paste can't blow up memory. */
const MINIMAP_MAX_LINES_PER_MESSAGE = 4000
/** Shape used for messages with no text of their own (tool-only turns, queue items). */
const MINIMAP_EMPTY_SHAPE = [0.3]
const MINIMAP_MESSAGE_MAX_WIDTH = 0.85
const MINIMAP_USER_BUBBLE_H_PADDING = 32

export function computeMinimapMessageWrapWidth(
  textWidth: number,
  role: 'user' | 'agent',
): number {
  const bubbleWidth = textWidth * MINIMAP_MESSAGE_MAX_WIDTH
  return Math.max(bubbleWidth - (role === 'user' ? MINIMAP_USER_BUBBLE_H_PADDING : 0), 100)
}

/** Font the transcript's assistant prose is rendered with, used for measurement. */
const MINIMAP_FONT = '16px Inter'
/**
 * Estimated average advance of a character in `MINIMAP_FONT`, used only by the
 * no-canvas fallback (SSR, test env) to approximate chars-per-line from the
 * wrap width. The browser path uses real pretext measurement instead.
 */
const MINIMAP_AVG_CHAR_WIDTH_PX = 9

/**
 * Deterministic char-count approximation of a message's line widths for
 * environments where pretext can't measure text (no OffscreenCanvas/DOM
 * canvas). Each paragraph is chopped into `wrapWidth / avg-char-width`
 * character chunks, so it degrades gracefully instead of returning the empty
 * shape. The browser path never runs this — it uses real measurement.
 */
function minimapLineShapeFallback(text: string, wrapWidth: number): number[] {
  const charsPerLine = Math.max(Math.floor(wrapWidth / MINIMAP_AVG_CHAR_WIDTH_PX), 8)
  const widths: number[] = []
  for (const paragraph of text.split('\n')) {
    // A blank line stays blank — that gap is what keeps the preview readable.
    if (paragraph.length === 0) {
      if (widths.length < MINIMAP_MAX_LINES_PER_MESSAGE) widths.push(0)
      continue
    }
    let remaining = paragraph.length
    while (remaining > 0 && widths.length < MINIMAP_MAX_LINES_PER_MESSAGE) {
      if (remaining > charsPerLine) {
        widths.push(1)
      } else {
        widths.push(Math.max(remaining / charsPerLine, MINIMAP_MIN_LINE_RATIO))
      }
      remaining -= charsPerLine
    }
  }
  return widths.length > 0 ? widths : MINIMAP_EMPTY_SHAPE
}

interface MinimapMessageInput {
  content?: unknown
  thinking?: unknown
  toolCalls?: unknown
  segments?: unknown
  role?: 'user' | 'agent'
  error?: unknown
}

export interface MinimapMessageShape {
  widths: number[]
  errorLines: boolean[]
  userLines: boolean[]
}

/** Build the minimap rows represented by one rendered message. */
export function computeMinimapMessageShape(
  message: MinimapMessageInput | null | undefined,
  text: string,
  wrapWidth: number,
): MinimapMessageShape {
  const widths: number[] = []
  const errorLines: boolean[] = []
  const userLines: boolean[] = []
  const messageIsUser = message?.role === 'user'
  const push = (lineWidths: number[], options?: { error?: boolean; user?: boolean }) => {
    for (const width of lineWidths) {
      widths.push(width)
      errorLines.push(options?.error === true)
      userLines.push(options?.user ?? messageIsUser)
    }
  }

  const rawToolCalls = Array.isArray(message?.toolCalls) ? message.toolCalls : []
  const toolCalls = rawToolCalls.filter((call): call is Record<string, unknown> => call != null && typeof call === 'object')
  const toolCallsById = new Map(
    toolCalls.flatMap((call) => typeof call.callId === 'string' ? [[call.callId, call] as const] : []),
  )
  const segments = message && Array.isArray(message.segments) ? message.segments : []
  let renderedStructuredRow = false
  let hasErrorSegment = false

  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index]
    if (!segment || typeof segment !== 'object' || !('type' in segment)) continue
    const type = segment.type
    const content = 'content' in segment && typeof segment.content === 'string' ? segment.content : ''

    if (type === 'text' && content.trim()) {
      push(computeMinimapLineShape(content, wrapWidth))
      renderedStructuredRow = true
    } else if (type === 'thinking' && content.trim()) {
      push([0.42])
      renderedStructuredRow = true
    } else if (type === 'toolGroup') {
      const rawCallIds: unknown[] = 'callIds' in segment && Array.isArray(segment.callIds)
        ? segment.callIds
        : []
      const callIds = rawCallIds.filter((callId: unknown): callId is string =>
        typeof callId === 'string' && callId.length > 0,
      )
      if (callIds.length === 0) continue
      const calls: Record<string, unknown>[] = callIds.flatMap((callId: string) => {
        const call = toolCallsById.get(callId)
        return call ? [call] : []
      })
      const topLevelCalls = calls.filter((call: Record<string, unknown>) => {
        const parentCallId = typeof call.parentCallId === 'string' ? call.parentCallId : undefined
        return !parentCallId || !callIds.includes(parentCallId)
      })
      const representedCallCount = topLevelCalls.length > 0 ? topLevelCalls.length : callIds.length
      const allComplete = calls.length === callIds.length && calls.every((call: Record<string, unknown>) =>
        call.status !== 'running' && call.status !== 'pending',
      )
      const followedByText = segments.slice(index + 1).some((candidate) =>
        candidate && typeof candidate === 'object' && 'type' in candidate && candidate.type === 'text'
          && 'content' in candidate && typeof candidate.content === 'string' && candidate.content.trim(),
      )
      const visibleRows = allComplete && followedByText && representedCallCount >= 3
        ? 1
        : Math.min(representedCallCount, 6) + (representedCallCount > 6 ? 1 : 0)
      push(Array.from({ length: Math.max(visibleRows, 1) }, () => 0.72))
      renderedStructuredRow = true
    } else if (type === 'error') {
      push(computeMinimapLineShape(content, wrapWidth), { error: true })
      renderedStructuredRow = true
      hasErrorSegment = true
    } else if (type === 'steering') {
      const displayContent = 'displayContent' in segment && typeof segment.displayContent === 'string'
        ? segment.displayContent
        : content
      push([0.38], { user: true })
      if (displayContent.trim()) push(computeMinimapLineShape(displayContent, wrapWidth), { user: true })
      renderedStructuredRow = true
    }
  }

  if (!renderedStructuredRow) {
    if (typeof message?.thinking === 'string' && message.thinking.trim()) push([0.42])
    if (toolCalls.length > 0) {
      const allComplete = toolCalls.every((call) => call.status !== 'running' && call.status !== 'pending')
      const visibleRows = allComplete && toolCalls.length >= 3
        ? 1
        : Math.min(toolCalls.length, 6) + (toolCalls.length > 6 ? 1 : 0)
      push(Array.from({ length: visibleRows }, () => 0.72))
    }
    if (text.trim()) push(computeMinimapLineShape(text, wrapWidth))
  }

  if (!hasErrorSegment && typeof message?.error === 'string' && message.error.trim() && message.error !== text) {
    push(computeMinimapLineShape(message.error, wrapWidth), { error: true })
  }
  if (widths.length === 0) push(MINIMAP_EMPTY_SHAPE)

  return { widths, errorLines, userLines }
}

export function canReuseMinimapMessageShape(
  cached: { text: string; message: MinimapMessageInput | undefined; wrapWidth: number },
  current: { text: string; message: MinimapMessageInput | undefined; wrapWidth: number },
): boolean {
  return cached.text === current.text
    && cached.message === current.message
    && cached.wrapWidth === current.wrapWidth
}

/**
 * Break a message into the relative widths of its rendered text lines, 1 being
 * a line that fills the rail's usable width. Rather than chopping characters at
 * a fixed count (which never lines up with the real soft-wrapped lines), this
 * runs the same text-measurement + line-wrapping pass that `pretext-height.ts`
 * uses to estimate heights, so each preview line corresponds to an actual line
 * of the transcript. Blank paragraphs come out as width 0 and stay blank, which
 * keeps the paragraph gaps that make the preview readable. If the environment
 * can't measure text (no canvas, e.g. SSR or tests), it falls back to the
 * deterministic char-count approximation above.
 */
export function computeMinimapLineShape(text: string, wrapWidth = 512): number[] {
  if (!text.trim()) return MINIMAP_EMPTY_SHAPE
  const width = Math.max(wrapWidth, 100)
  let prepared
  try {
    prepared = prepareWithSegments(text, MINIMAP_FONT, { whiteSpace: 'pre-wrap' })
  } catch {
    return minimapLineShapeFallback(text, width)
  }
  const widths: number[] = []
  try {
    walkLineRanges(prepared, width, (line) => {
      if (widths.length >= MINIMAP_MAX_LINES_PER_MESSAGE) return
      const w = line.width
      // A zero-width line is a blank paragraph — keep it blank.
      widths.push(w <= 0.5 ? 0 : Math.max(w / width, MINIMAP_MIN_LINE_RATIO))
    })
  } catch {
    return minimapLineShapeFallback(text, width)
  }
  return widths.length > 0 ? widths : MINIMAP_EMPTY_SHAPE
}

/**
 * Lay the transcript out on the rail at a *fixed* pitch: every wrapped line is
 * one mark of the same height, stacked in order. The rail is therefore as long
 * as the conversation has lines — short conversations leave the bottom of the
 * rail empty, long ones overflow it and the rail pans (see
 * `computeMinimapRailOffset`) exactly like a VS Code minimap.
 *
 * The earlier model scaled the whole document onto the rail height, which meant
 * the preview always filled the rail and line pitch changed with conversation
 * length — a long chat squeezed every line into an unreadable smear, and a turn
 * with tall non-prose content (tool cards, collapsed reasoning, diffs) opened
 * big empty gaps between messages because its marks inherited the measured
 * document band instead of its line count.
 *
 * The document mapping that scrubbing needs is preserved separately, as spans
 * pairing each message's measured document band with the rail band its lines
 * occupy.
 */
export function computeMinimapLayout({
  blocks,
  rowPitch = MINIMAP_ROW_PITCH_PX,
}: {
  blocks: MinimapBlock[]
  /** Vertical pitch of one preview line on the rail, in px. */
  rowPitch?: number
}): MinimapLayout {
  const rows: MinimapRow[] = []
  const spans: MinimapSpan[] = []
  let line = 0
  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
    const block = blocks[blockIndex]
    const count = block.widths.length
    if (block.end - block.start <= 0 || count === 0) continue
    const contentStart = line * rowPitch
    for (let lineIndex = 0; lineIndex < count; lineIndex++) {
      const width = block.widths[lineIndex] ?? 0
      // Blank lines still consume their slot so paragraph gaps survive; they
      // just have nothing to paint.
      if (width > 0) {
        rows.push({
          key: `${blockIndex}:${lineIndex}`,
          y: (line + lineIndex) * rowPitch,
          height: rowPitch,
          width,
          isUser: block.userLines?.[lineIndex] ?? block.role === 'user',
          isError: block.errorLines?.[lineIndex]
            ?? (block.errorStart !== undefined && lineIndex >= block.errorStart),
        })
      }
    }
    line += count
    spans.push({
      documentStart: block.start,
      documentEnd: block.end,
      contentStart,
      contentEnd: line * rowPitch,
    })
  }
  return { rows, contentHeight: line * rowPitch, spans }
}

/** Piecewise-linear map from a document offset to its offset on the rail. */
export function minimapDocumentToContent(offset: number, spans: MinimapSpan[]): number {
  if (spans.length === 0) return 0
  const first = spans[0]
  if (offset <= first.documentStart) return first.contentStart
  for (const span of spans) {
    if (offset >= span.documentEnd) continue
    const documentSpan = span.documentEnd - span.documentStart
    if (documentSpan <= 0) return span.contentStart
    const ratio = Math.max(offset - span.documentStart, 0) / documentSpan
    return span.contentStart + ratio * (span.contentEnd - span.contentStart)
  }
  return spans[spans.length - 1].contentEnd
}

/** Inverse of `minimapDocumentToContent`. */
export function minimapContentToDocument(contentOffset: number, spans: MinimapSpan[]): number {
  if (spans.length === 0) return 0
  const first = spans[0]
  if (contentOffset <= first.contentStart) return first.documentStart
  for (const span of spans) {
    if (contentOffset >= span.contentEnd) continue
    const contentSpan = span.contentEnd - span.contentStart
    if (contentSpan <= 0) return span.documentStart
    const ratio = Math.max(contentOffset - span.contentStart, 0) / contentSpan
    return span.documentStart + ratio * (span.documentEnd - span.documentStart)
  }
  return spans[spans.length - 1].documentEnd
}

/**
 * How far the fixed-pitch preview is panned up inside the rail. Nothing pans
 * while the whole conversation fits: it simply sits at the top and the rest of
 * the rail stays empty. Once it overflows, the preview slides proportionally
 * with the transcript so the top of the chat is on the rail at scroll 0 and the
 * bottom is on it at the last screenful.
 */
export function computeMinimapRailOffset({
  contentHeight,
  viewportHeight,
  scrollTop,
  maxScroll,
}: {
  contentHeight: number
  /** Height of the rail / viewport, in px. */
  viewportHeight: number
  scrollTop: number
  /**
   * Total scrollable range of the container, in px — `scrollHeight - clientHeight`.
   * This is the real distance the transcript can travel, not the virtualized
   * sizer height, which is inset inside the container by the top padding and
   * the "load earlier messages" button.
   */
  maxScroll: number
}): number {
  const overflow = contentHeight - viewportHeight
  if (overflow <= 0 || maxScroll <= 0) return 0
  return overflow * Math.min(Math.max(scrollTop / maxScroll, 0), 1)
}

/**
 * Clamp the viewport indicator so it always sits inside the rail and never
 * fills it.
 *
 * The preview is painted at a fixed pitch per line, which is *not* proportional
 * to the document, so one screenful of a long conversation can map to a band
 * taller than the rail — the document ratio and the preview ratio disagree,
 * especially with estimated measurements while content is still streaming. When
 * the mapped band exceeds the rail we fall back to a real proportional
 * scrollbar thumb (`viewportHeight * viewportHeight / docHeight`) so a
 * scrollable conversation never shows a full-rail indicator. In the normal case
 * (band fits) the mapped band height is kept so the indicator still tracks the
 * visible screenful of lines, and in both cases the top is clamped so the
 * indicator can never hang off the bottom of the rail.
 */
export function clampMinimapIndicator({
  top,
  height,
  viewportHeight,
  maxScroll,
}: {
  top: number
  height: number
  viewportHeight: number
  /** Total scrollable range of the container — `scrollHeight - clientHeight`. */
  maxScroll: number
}): { top: number; height: number } {
  const docHeight = maxScroll + viewportHeight
  let resultHeight = height
  // A mapped band taller than the rail means the preview scale and the document
  // scale disagree; fall back to a proper proportional scrollbar thumb. Guarded
  // against a degenerate `docHeight <= 0`.
  if (docHeight > 0 && resultHeight > viewportHeight) {
    resultHeight = viewportHeight * (viewportHeight / docHeight)
  }
  // Keep the min height floor so a tiny band still reads as a thumb.
  resultHeight = Math.max(resultHeight, 2)
  // Clamp the top so the indicator never extends past the rail. When a
  // non-scrollable document's content band is larger than the rail this keeps
  // the indicator within it (it may span the content band but stays on the rail).
  const maxTop = Math.max(viewportHeight - resultHeight, 0)
  const resultTop = Math.min(Math.max(top, 0), maxTop)
  return { top: resultTop, height: resultHeight }
}

/**
 * Maps a pointer position on the rail back to a scroll offset so the pressed
 * point lands in the *middle* of the viewport indicator (like Rider/VS Code
 * scrollbar annotations), instead of snapping the indicator's top edge to the
 * cursor. The pointer is resolved through the rail's current pan offset and the
 * document spans, and clamped so a scrub past either end stops at the
 * corresponding end of the transcript.
 */
export function computeMinimapScrollTop({
  pointerOffset,
  railOffset,
  spans,
  viewportHeight,
  maxScroll,
  sizerOffset,
}: {
  /** Pointer position relative to the top of the rail, in px. */
  pointerOffset: number
  /** Current pan offset of the preview inside the rail, in px. */
  railOffset: number
  spans: MinimapSpan[]
  /** Height of the rail / viewport, in px. */
  viewportHeight: number
  /**
   * Total scrollable range of the container, in px — `scrollHeight - clientHeight`.
   */
  maxScroll: number
  /**
   * Offset of the virtualized sizer from the top of the scroll container, in px.
   * The document spans are in sizer coordinates, so a resolved document offset
   * must be shifted down by this much to become a real `scrollTop`.
   */
  sizerOffset: number
}): number {
  if (spans.length === 0) return 0
  const document = minimapContentToDocument(pointerOffset + railOffset, spans)
  const max = Math.max(maxScroll, 0)
  return Math.min(Math.max(document - viewportHeight / 2 + sizerOffset, 0), max)
}

/**
 * VSCode/Rider-style content-preview minimap for the conversation. Instead of
 * one bar per message it paints one thin line per line of text — blue for user
 * turns, muted for agent turns — so the rail looks like the transcript seen
 * from very far away. Clicking or dragging it scrolls to that position.
 */
export function ConversationMinimap({ virtualizer, scrollElement, sizerOffset, roles, texts, messageInputs, textWidth, onScrub }: ConversationMinimapProps) {
  const [viewportHeight, setViewportHeight] = useState(0)
  const [scrollTop, setScrollTop] = useState(0)

  useEffect(() => {
    if (!scrollElement) return
    const update = () => setViewportHeight(scrollElement.clientHeight)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(scrollElement)
    return () => ro.disconnect()
  }, [scrollElement])

  useEffect(() => {
    if (!scrollElement) return
    const onScroll = () => setScrollTop(scrollElement.scrollTop)
    onScroll()
    scrollElement.addEventListener('scroll', onScroll, { passive: true })
    return () => scrollElement.removeEventListener('scroll', onScroll)
  }, [scrollElement])

  // Reads (and populates) the virtualizer's measurement cache below.
  const totalSize = virtualizer.getTotalSize()

  // Line shapes are derived once per message and reused until its content or
  // wrapping width changes, so a streaming turn only re-splits its own rows.
  const shapeCacheRef = useRef(new Map<number, {
    text: string
    message: MinimapMessageInput | undefined
    wrapWidth: number
    shape: MinimapMessageShape
  }>())

  // Each message's *document* band (its real vertical range inside the scroll
  // container) paired with the shape of its text lines.
  //
  // This is the part that has to come from the virtualizer rather than from a
  // synthetic line count: the rail's whole job is to be a map of the document,
  // so a rail offset must translate back to the document offset the transcript
  // actually has there. The older model laid every message out at a fixed pitch
  // per line of text, which drifts away from the real layout as soon as a turn
  // renders anything that isn't prose (tool-call cards, collapsed reasoning,
  // diffs, images) — a tall tool-heavy turn occupied almost no rail, so the
  // blue band of a user turn pointed at a completely different part of the
  // conversation than the click on it scrolled to.
  //
  // `measurementsCache` covers the *whole* conversation — real measured heights
  // for items that have rendered, estimates for the rest — and is updated in
  // place as content streams in, so the rail stays live without a second height
  // pass per render. Deriving from the cache rather than from
  // `getVirtualItems()` is also what keeps the full history on the rail: virtual
  // items only ever span the visible window, which is why the old bars used to
  // flash in and appear to vanish while scrolling.
  const blocks = useMemo(() => {
    if (totalSize <= 0) return [] as MinimapBlock[]
    const cache = shapeCacheRef.current
    const measurements = virtualizer.measurementsCache
    const out: MinimapBlock[] = []
    for (let index = 0; index < measurements.length; index++) {
      const measurement = measurements[index]
      if (!measurement || measurement.size <= 0) continue
      const role = roles[index] ?? 'agent'
      const text = texts[index] ?? ''
      const message = messageInputs[index]
      const cached = cache.get(index)
      const wrapWidth = computeMinimapMessageWrapWidth(textWidth, role)
      const current = { text, message, wrapWidth }
      let shape: MinimapMessageShape
      if (cached && canReuseMinimapMessageShape(cached, current)) {
        shape = cached.shape
      } else {
        shape = computeMinimapMessageShape(message, text, wrapWidth)
        cache.set(index, { ...current, shape })
      }
      out.push({
        start: measurement.start,
        end: measurement.start + measurement.size,
        role,
        widths: shape.widths,
        errorLines: shape.errorLines,
        userLines: shape.userLines,
      })
    }
    return out
    // `totalSize` stands in for the measurement cache, which mutates in place:
    // it changes whenever an item is measured or the list grows.
  }, [messageInputs, roles, texts, textWidth, totalSize, virtualizer])

  const { rows, contentHeight, spans } = useMemo(() => computeMinimapLayout({ blocks }), [blocks])

  if (totalSize <= 0 || viewportHeight <= 0) return null

  // The real scrollable range of the container. The virtualized sizer is inset
  // inside it (top padding + "load earlier messages" button), so its height is
  // not the distance the transcript can actually travel — using it here would
  // make the rail's pan and indicator drift from the real scroll position.
  const maxScroll = scrollElement ? scrollElement.scrollHeight - scrollElement.clientHeight : 0
  // The document spans are in sizer coordinates; the container's scrollTop is
  // measured from the container top, which is `sizerOffset` above the sizer.
  const documentScrollTop = scrollTop - sizerOffset

  // The preview keeps its own fixed scale; the rail pans over it when the
  // conversation has more lines than the rail has room for.
  const railOffset = computeMinimapRailOffset({ contentHeight, viewportHeight, scrollTop, maxScroll })
  const indicator = clampMinimapIndicator({
    top: minimapDocumentToContent(documentScrollTop, spans) - railOffset,
    height: minimapDocumentToContent(documentScrollTop + viewportHeight, spans)
      - minimapDocumentToContent(documentScrollTop, spans),
    viewportHeight,
    maxScroll,
  })

  const handlePointer = (rail: HTMLElement, clientY: number) => {
    if (!scrollElement) return
    const rect = rail.getBoundingClientRect()
    scrollElement.scrollTop = computeMinimapScrollTop({
      pointerOffset: clientY - rect.top,
      railOffset,
      spans,
      viewportHeight,
      maxScroll,
      sizerOffset,
    })
    onScrub()
  }

  return (
    <div
      onPointerDown={(e) => {
        e.preventDefault()
        handlePointer(e.currentTarget, e.clientY)
      }}
      onPointerMove={(e) => {
        if (e.buttons > 0) handlePointer(e.currentTarget, e.clientY)
      }}
      className="relative h-full shrink-0 cursor-pointer select-none overflow-hidden border-l border-border/30 bg-transparent transition-colors hover:bg-muted/30"
      style={{ width: MINIMAP_RAIL_WIDTH_PX }}
      role="slider"
      aria-label="Conversation minimap"
    >
      {/* viewport indicator */}
      <div
        className="absolute left-0 right-0 bg-foreground/10"
        style={{
          top: `${indicator.top}px`,
          height: `${indicator.height}px`,
        }}
      />
      <div className="absolute inset-x-0 top-0" style={{ transform: `translateY(${-railOffset}px)` }}>
        <MinimapLines rows={rows} />
      </div>
    </div>
  )
}

export interface MinimapBlock {
  /** Offset of the message's top edge inside the scroll container, in px. */
  start: number
  /** Offset of the message's bottom edge inside the scroll container, in px. */
  end: number
  /** Relative widths of the message's rendered text lines, top to bottom. */
  widths: number[]
  role: 'user' | 'agent'
  /** First line belonging to an error segment, when present. */
  errorStart?: number
  /** Per-line error classification for interleaved content. */
  errorLines?: boolean[]
  /** Per-line right-alignment override for steered user content. */
  userLines?: boolean[]
}

export interface MinimapRow {
  /** Stable identity for the line's position in the transcript. */
  key: string
  /** Offset of this row from the top of the rail's preview content, in px. */
  y: number
  /** Fixed line pitch. */
  height: number
  /** Line length as a fraction of the rail's usable width. */
  width: number
  isUser: boolean
  isError: boolean
}

/** Pairs a message's measured document band with the rail band its lines occupy. */
export interface MinimapSpan {
  documentStart: number
  documentEnd: number
  contentStart: number
  contentEnd: number
}

export interface MinimapLayout {
  rows: MinimapRow[]
  /** Total height of the fixed-pitch preview, in px. */
  contentHeight: number
  spans: MinimapSpan[]
}

/**
 * Split out and memoized: scrolling re-renders the minimap on every scroll
 * event to move the viewport indicator, but the preview lines themselves only
 * change when the conversation's layout or content does.
 */
const MinimapLines = memo(function MinimapLines({ rows }: { rows: MinimapRow[] }) {
  return (
    <>
      {rows.map((row) => (
        <div
          key={row.key}
          className={cn(
            'absolute',
            row.isError
              ? 'bg-red-500/90'
              : row.isUser ? 'bg-blue-500/80' : 'bg-muted-foreground/45',
          )}
          style={{
            top: row.y,
            height: MINIMAP_ROW_HEIGHT_PX,
            // User turns hug the right edge like chat bubbles; agent prose stays
            // left-aligned but capped below the full rail so short paragraphs
            // read as short lines rather than full-width bars.
            ...(row.isUser
              ? {
                  right: 2,
                  width: `calc(${(Math.min(row.width, MINIMAP_USER_MAX_WIDTH) * 100).toFixed(1)}% - 4px)`,
                }
              : {
                  left: 2,
                  width: `calc(${(Math.min(row.width, MINIMAP_AGENT_MAX_WIDTH) * 100).toFixed(1)}% - 4px)`,
                }),
          }}
        />
      ))}
    </>
  )
})
