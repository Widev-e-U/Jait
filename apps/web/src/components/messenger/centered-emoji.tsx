import { useLayoutEffect, useRef } from 'react'

const SCALE = 4
const cache = new Map<string, { left: number; right: number; ascent: number; descent: number } | null>()
let context: CanvasRenderingContext2D | null = null

/** Real ink bounds (px at 1x, relative to the alphabetic origin), found by scanning rendered pixels because canvas text metrics lie for colour emoji. */
function measureInk(text: string, font: string, size: number) {
  const key = `${font}|${size}|${text}`
  if (cache.has(key)) return cache.get(key) ?? null
  const px = Math.ceil(size * SCALE)
  const pad = px
  const width = px * 3
  const height = px * 3
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  context.font = font.replace(/[\d.]+px/, `${px}px`)
  context.textAlign = 'left'
  context.textBaseline = 'alphabetic'
  context.fillText(text, pad, pad * 2)
  const { data } = context.getImageData(0, 0, width, height)
  let minX = width, maxX = -1, minY = height, maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3]! > 24) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  // Fonts not loaded yet (or glyph missing): don't cache so we retry later.
  if (maxX < 0) return null
  const ink = {
    left: (minX - pad) / SCALE,
    right: (maxX + 1 - pad) / SCALE,
    ascent: (pad * 2 - minY) / SCALE,
    descent: (maxY + 1 - pad * 2) / SCALE,
  }
  cache.set(key, ink)
  return ink
}

/** Emoji whose visible pixels, not its font line box, are centred in the parent. */
export function CenteredEmoji({ emoji, className = '', fontFamily }: { emoji: string; className?: string; fontFamily: string }) {
  const element = useRef<HTMLSpanElement>(null)
  const baseline = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    let active = true
    const align = () => {
      const span = element.current
      const probe = baseline.current
      if (!active || !span || !probe) return
      const box = span.getBoundingClientRect()
      if (!box.width || !box.height) return
      const style = getComputedStyle(span)
      const size = parseFloat(style.fontSize)
      const ink = measureInk(emoji, `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${fontFamily}`, size)
      if (!ink) return
      // Measure from the untransformed layout so repeated runs stay idempotent.
      span.style.transform = ''
      const rect = span.getBoundingClientRect()
      const baselineY = probe.getBoundingClientRect().top - rect.top
      const x = (rect.width - ink.right - ink.left) / 2
      const y = rect.height / 2 - baselineY + (ink.ascent - ink.descent) / 2
      span.style.transform = `translate(${x}px, ${y}px)`
    }
    align()
    const observer = new ResizeObserver(align)
    if (element.current) observer.observe(element.current)
    void document.fonts?.ready.then(align)
    return () => { active = false; observer.disconnect() }
  }, [emoji, fontFamily])
  return <span
    ref={element}
    aria-hidden
    data-reaction-emoji
    className={'inline-block whitespace-nowrap leading-none ' + className}
    style={{ fontFamily }}
  >
    <span>{emoji}</span><span ref={baseline} aria-hidden="true" className="inline-block h-0 w-0 align-baseline" />
  </span>
}
