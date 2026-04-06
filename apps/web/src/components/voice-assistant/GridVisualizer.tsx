import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { VoiceAssistantState } from '@jait/shared'
import { cn } from '@/lib/utils'

// ── Grid animation sequences (from agents-ui) ──────────────────

type Coordinate = { x: number; y: number }

function connectingSequence(rows: number, cols: number, radius: number): Coordinate[] {
  const seq: Coordinate[] = []
  const cy = Math.floor(rows / 2)
  const r = Math.min(radius, Math.floor(Math.max(rows, cols) / 2))
  const tl = { x: Math.max(0, cy - r), y: Math.max(0, cy - r) }
  const br = { x: cols - 1 - tl.x, y: Math.min(rows - 1, cy + r) }
  for (let x = tl.x; x <= br.x; x++) seq.push({ x, y: tl.y })
  for (let y = tl.y + 1; y <= br.y; y++) seq.push({ x: br.x, y })
  for (let x = br.x - 1; x >= tl.x; x--) seq.push({ x, y: br.y })
  for (let y = br.y - 1; y > tl.y; y--) seq.push({ x: tl.x, y })
  return seq
}

function thinkingSequence(rows: number, cols: number): Coordinate[] {
  const y = Math.floor(rows / 2)
  const seq: Coordinate[] = []
  for (let x = 0; x < cols; x++) seq.push({ x, y })
  for (let x = cols - 1; x >= 0; x--) seq.push({ x, y })
  return seq
}

function listeningSequence(rows: number, cols: number): Coordinate[] {
  const center = { x: Math.floor(cols / 2), y: Math.floor(rows / 2) }
  const none = { x: -1, y: -1 }
  return [center, none, none, none, none, none, none, none, none]
}

type GridState = 'connecting' | 'listening' | 'thinking' | 'speaking' | 'idle'

function mapStatus(status: VoiceAssistantState['status'], speaking: boolean): GridState {
  if (speaking) return 'speaking'
  switch (status) {
    case 'connecting':
    case 'reconnecting':
      return 'connecting'
    case 'listening':
    case 'connected':
      return 'listening'
    case 'thinking':
      return 'thinking'
    case 'speaking':
      return 'speaking'
    default:
      return 'idle'
  }
}

function useGridAnimator(
  state: GridState,
  rows: number,
  cols: number,
  interval: number,
  radius: number,
): Coordinate {
  const [index, setIndex] = useState(0)
  const center = useMemo(() => ({ x: Math.floor(cols / 2), y: Math.floor(rows / 2) }), [cols, rows])

  const sequence = useMemo(() => {
    switch (state) {
      case 'connecting': return connectingSequence(rows, cols, radius)
      case 'thinking': return thinkingSequence(rows, cols)
      case 'listening': return listeningSequence(rows, cols)
      default: return [center]
    }
  }, [state, rows, cols, radius, center])

  useEffect(() => {
    setIndex(0)
  }, [sequence])

  useEffect(() => {
    if (state === 'speaking') return
    const id = setInterval(() => setIndex(p => p + 1), interval)
    return () => clearInterval(id)
  }, [interval, state, sequence.length])

  return sequence[index % sequence.length] ?? center
}

// ── Fake volume bands for speaking state ────────────────────────

function useFakeVolumeBands(state: GridState, cols: number): number[] {
  const [bands, setBands] = useState<number[]>(() => new Array(cols).fill(0))
  const rafRef = useRef(0)

  useEffect(() => {
    if (state !== 'speaking') {
      setBands(new Array(cols).fill(0))
      return
    }
    let t = 0
    const tick = () => {
      t += 0.08
      const next = new Array(cols)
      for (let i = 0; i < cols; i++) {
        next[i] = 0.3 + 0.7 * (
          0.5 * (Math.sin(t * 2.3 + i * 1.7) + 1) * 0.5 +
          0.3 * (Math.sin(t * 3.7 + i * 0.9) + 1) * 0.5 +
          0.2 * (Math.sin(t * 5.1 + i * 2.3) + 1) * 0.5
        )
      }
      setBands(next)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [state, cols])

  return bands
}

// ── Size presets (matching agents-ui) ───────────────────────────

const SIZE_CONFIG = {
  icon: { cell: 2, gap: 2 },
  sm:   { cell: 4, gap: 4 },
  md:   { cell: 8, gap: 8 },
  lg:   { cell: 12, gap: 12 },
  xl:   { cell: 16, gap: 16 },
} as const

type VisualizerSize = keyof typeof SIZE_CONFIG

// ── Grid cell ───────────────────────────────────────────────────

interface GridCellProps {
  index: number
  state: GridState
  interval: number
  rowCount: number
  colCount: number
  volumeBands: number[]
  highlighted: Coordinate
  cellSize: number
}

const GridCell = memo(function GridCell({
  index, state, interval, rowCount, colCount, volumeBands, highlighted, cellSize,
}: GridCellProps) {
  const x = index % colCount
  const y = Math.floor(index / colCount)

  let isHighlighted = false
  let transitionDuration: string

  if (state === 'speaking') {
    const midY = Math.floor(rowCount / 2)
    const step = 1 / (midY + 1)
    const dist = Math.abs(midY - y)
    isHighlighted = (volumeBands[x] ?? 0) >= dist * step
    transitionDuration = '0.1s'
  } else {
    isHighlighted = highlighted.x === x && highlighted.y === y
    transitionDuration = isHighlighted ? `${interval / 1000}s` : '0.1s'
  }

  return (
    <div
      data-lk-highlighted={isHighlighted}
      className="rounded-full place-self-center transition-all ease-out data-[lk-highlighted=true]:bg-current bg-current/10"
      style={{
        width: cellSize,
        height: cellSize,
        transitionDuration,
      }}
    />
  )
})

// ── Main component ──────────────────────────────────────────────

interface GridVisualizerProps {
  status: VoiceAssistantState['status']
  assistantSpeaking: boolean
  color?: string
  rows?: number
  cols?: number
  radius?: number
  interval?: number
  size?: VisualizerSize
  className?: string
}

export const GridVisualizer = memo(function GridVisualizer({
  status,
  assistantSpeaking,
  color = '#1FD5F9',
  rows = 15,
  cols = 15,
  radius = 60,
  interval = 100,
  size = 'xl',
  className,
}: GridVisualizerProps) {
  const state = mapStatus(status, assistantSpeaking)
  const highlighted = useGridAnimator(state, rows, cols, interval, radius)
  const volumeBands = useFakeVolumeBands(state, cols)
  const { cell, gap } = SIZE_CONFIG[size]

  const items = useMemo(
    () => Array.from({ length: rows * cols }, (_, i) => i),
    [rows, cols],
  )

  return (
    <div
      className={cn('grid aspect-square size-auto w-full', className)}
      style={{
        gap,
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        color,
      } as CSSProperties}
      data-lk-state={state}
    >
      {items.map(idx => (
        <GridCell
          key={idx}
          index={idx}
          state={state}
          interval={interval}
          rowCount={rows}
          colCount={cols}
          volumeBands={volumeBands}
          highlighted={highlighted}
          cellSize={cell}
        />
      ))}
    </div>
  )
})
