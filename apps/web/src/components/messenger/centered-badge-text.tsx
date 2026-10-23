import { useLayoutEffect, useRef } from 'react'

let context: CanvasRenderingContext2D | null = null

/** Center visible ink, rather than the font's line box (which includes ascender/descender space). */
export function CenteredBadgeText({ text, className = '', 'aria-hidden': ariaHidden }: {
  text: string | number
  className?: string
  'aria-hidden'?: boolean
}) {
  const element = useRef<HTMLSpanElement>(null)
  const baseline = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    let active = true
    const align = () => {
      if (!active || !element.current || !baseline.current) return
      const span = element.current
      const box = span.getBoundingClientRect()
      // Mobile mounts the list while it is hidden behind the open conversation.
      // Wait for a real line box before calculating an ink offset.
      if (!box.width || !box.height) return
      const style = getComputedStyle(span)
      context ??= document.createElement('canvas').getContext('2d')
      if (!context) return
      // The computed shorthand can be empty when tabular numerals are enabled.
      context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
      const ink = context.measureText(String(text))
      if (!Number.isFinite(ink.actualBoundingBoxAscent) || !Number.isFinite(ink.actualBoundingBoxDescent)) return
      const baselineY = baseline.current.getBoundingClientRect().top - box.top
      const x = (box.width - ink.actualBoundingBoxRight + ink.actualBoundingBoxLeft) / 2
      const y = box.height / 2 - baselineY + (ink.actualBoundingBoxAscent - ink.actualBoundingBoxDescent) / 2
      span.style.transform = `translate(${x}px, ${y}px)`
    }
    align()
    const observer = new ResizeObserver(align)
    if (element.current) observer.observe(element.current)
    void document.fonts?.ready.then(align)
    return () => { active = false; observer.disconnect() }
  }, [text, className])
  return <span ref={element} aria-hidden={ariaHidden} data-badge-text className={'inline-block whitespace-nowrap leading-none ' + className}>
    <span>{text}</span><span ref={baseline} aria-hidden="true" data-badge-baseline className="inline-block h-0 w-0 align-baseline" />
  </span>
}
