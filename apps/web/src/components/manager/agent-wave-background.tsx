import { useEffect, useRef, type RefObject } from 'react'

export interface AgentWavePoint { id: string; x: number; y: number }
export function AgentWaveBackground({ width, height, points, wake }: {
  width: number; height: number
  points: RefObject<AgentWavePoint[]>
  wake: RefObject<(() => void) | null>
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const element = canvas.current
    const context = element?.getContext('2d')
    if (!element || !context || !width || !height) return
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    element.width = Math.ceil(width * ratio)
    element.height = Math.ceil(height * ratio)
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const previous = new Map<string, AgentWavePoint>()
    let energy = 0
    let frame = 0
    let lastPaint = 0
    // Keep the field sparse even on a large monitor.
    const spacing = Math.max(38, Math.sqrt(width * height / 650))
    element.dataset.dotCount = String(Math.ceil(width / spacing) * Math.ceil(height / spacing))
    const draw = (time: number) => {
      frame = 0
      if (time - lastPaint < 32) { frame = requestAnimationFrame(draw); return }
      lastPaint = time
      let movement = 0
      for (const point of points.current) {
        const old = previous.get(point.id)
        if (old) movement = Math.max(movement, Math.hypot(point.x - old.x, point.y - old.y))
        previous.set(point.id, { ...point })
      }
      energy = media.matches ? 0 : Math.max(energy * 0.94, Math.min(movement / 8, 1))
      context.clearRect(0, 0, width, height)
      context.fillStyle = getComputedStyle(element).color
      for (let y = spacing / 2; y < height; y += spacing) {
        for (let x = spacing / 2; x < width; x += spacing) {
          let dx = 0
          let dy = 0
          let glow = 0
          if (energy > 0.01) for (const point of points.current) {
            const distance = Math.hypot(x - point.x, y - point.y)
            const influence = Math.max(0, 1 - distance / 230)
            const wave = Math.sin(distance / 32 - time / 180) * influence * energy * 9
            dx += wave * (x - point.x) / Math.max(distance, 1)
            dy += wave * (y - point.y) / Math.max(distance, 1)
            glow = Math.max(glow, influence * energy)
          }
          context.globalAlpha = 0.18 + glow * 0.2
          context.beginPath()
          context.arc(x + dx, y + dy, 1 + glow * 0.45, 0, Math.PI * 2)
          context.fill()
        }
      }
      context.globalAlpha = 1
      if (energy > 0.01) frame = requestAnimationFrame(draw)
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(draw) }
    wake.current = schedule
    media.addEventListener('change', schedule)
    const theme = new MutationObserver(schedule)
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] })
    schedule()
    return () => {
      cancelAnimationFrame(frame)
      wake.current = null
      media.removeEventListener('change', schedule)
      theme.disconnect()
    }
  }, [width, height, points, wake])
  return <canvas ref={canvas} data-testid="agent-wave-background" aria-hidden="true" className="pointer-events-none absolute inset-0 text-muted-foreground" style={{ width, height }} />
}
