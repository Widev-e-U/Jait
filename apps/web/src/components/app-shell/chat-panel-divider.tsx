import { useRef, useState } from 'react'

const MIN_PANEL_WIDTH = 220

/** Resize adjacent flex panels without sending pointer moves through chat rendering. */
export function ChatPanelDivider() {
  const drag = useRef<{ pointerId: number; startX: number; left: HTMLElement; right: HTMLElement; leftWidth: number; totalWidth: number; totalGrow: number } | null>(null)
  const [percent, setPercent] = useState(50)

  const getPair = (divider: HTMLElement) => {
    const left = divider.previousElementSibling
    const right = divider.nextElementSibling
    if (!(left instanceof HTMLElement) || !(right instanceof HTMLElement)) return null
    const leftWidth = left.getBoundingClientRect().width
    const totalWidth = leftWidth + right.getBoundingClientRect().width
    if (leftWidth <= 0 || totalWidth <= leftWidth) return null
    const totalGrow = Number(getComputedStyle(left).flexGrow) + Number(getComputedStyle(right).flexGrow)
    return { left, right, leftWidth, totalWidth, totalGrow: totalGrow || 2 }
  }

  const resize = (pair: NonNullable<ReturnType<typeof getPair>>, width: number) => {
    const minimum = Math.min(MIN_PANEL_WIDTH, pair.totalWidth / 2)
    const leftWidth = Math.max(minimum, Math.min(pair.totalWidth - minimum, width))
    const ratio = leftWidth / pair.totalWidth
    pair.left.style.setProperty('--chat-panel-grow', String(pair.totalGrow * ratio))
    pair.right.style.setProperty('--chat-panel-grow', String(pair.totalGrow * (1 - ratio)))
    setPercent(Math.round(ratio * 100))
  }

  return <div
    role="separator"
    aria-label="Resize chat panels"
    aria-orientation="vertical"
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={percent}
    tabIndex={0}
    className="relative z-40 w-1 shrink-0 touch-none cursor-col-resize select-none bg-border hover:bg-primary/50 focus-visible:bg-primary/50 focus-visible:outline-none before:absolute before:-inset-x-1 before:inset-y-0"
    onPointerDown={(event) => {
      if (event.button !== 0) return
      const pair = getPair(event.currentTarget)
      if (!pair) return
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      drag.current = { ...pair, startX: event.clientX, pointerId: event.pointerId }
    }}
    onPointerMove={(event) => {
      const current = drag.current
      if (!current || current.pointerId !== event.pointerId) return
      resize(current, current.leftWidth + event.clientX - current.startX)
    }}
    onPointerUp={(event) => {
      if (drag.current?.pointerId !== event.pointerId) return
      drag.current = null
      event.currentTarget.releasePointerCapture(event.pointerId)
    }}
    onPointerCancel={() => { drag.current = null }}
    onLostPointerCapture={() => { drag.current = null }}
    onDoubleClick={(event) => {
      const pair = getPair(event.currentTarget)
      if (pair) resize(pair, pair.totalWidth / 2)
    }}
    onKeyDown={(event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
      const pair = getPair(event.currentTarget)
      if (!pair) return
      event.preventDefault()
      const width = event.key === 'Home' ? 0 : event.key === 'End' ? pair.totalWidth
        : pair.leftWidth + (event.key === 'ArrowLeft' ? -32 : 32)
      resize(pair, width)
    }}
  />
}
