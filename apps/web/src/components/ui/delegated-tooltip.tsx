import { useEffect, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip'

type Target = { label: string; rect: DOMRect }

/** One tooltip for dynamically created or very large sets of labeled elements. */
export function DelegatedTooltip({ containerRef, side }: {
  containerRef: RefObject<HTMLElement | null>
  side?: 'top' | 'right' | 'bottom' | 'left'
}) {
  const [target, setTarget] = useState<Target | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let timer: ReturnType<typeof setTimeout> | undefined
    let pointerDown = false
    const findTarget = (node: EventTarget | null) => {
      const element = node instanceof Element ? node.closest<HTMLElement>('[data-tooltip]') : null
      return element && container.contains(element) ? element : null
    }
    const clear = () => { clearTimeout(timer); setTarget(null) }
    const show = (element: HTMLElement, delayed: boolean) => {
      clearTimeout(timer)
      const open = () => {
        const label = element.dataset.tooltip
        if (label && element.isConnected && container.contains(element)) {
          setTarget({ label, rect: element.getBoundingClientRect() })
        }
      }
      if (delayed) timer = setTimeout(open, 50)
      else open()
    }
    const pointerOver = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      const element = findTarget(event.target)
      if (element && element !== findTarget(event.relatedTarget)) show(element, true)
    }
    const pointerOut = (event: PointerEvent) => {
      const element = findTarget(event.target)
      if (element && element !== findTarget(event.relatedTarget)) clear()
    }
    const focusIn = (event: FocusEvent) => {
      const element = findTarget(event.target)
      if (element && !pointerDown) show(element, false)
    }
    const focusOut = (event: FocusEvent) => {
      const element = findTarget(event.target)
      if (element && element !== findTarget(event.relatedTarget)) clear()
    }
    const pointerPress = () => { pointerDown = true; clear() }
    const pointerRelease = () => { pointerDown = false }
    container.addEventListener('pointerover', pointerOver)
    container.addEventListener('pointerout', pointerOut)
    container.addEventListener('pointerdown', pointerPress)
    container.addEventListener('input', clear)
    container.addEventListener('focusin', focusIn)
    container.addEventListener('focusout', focusOut)
    window.addEventListener('pointerup', pointerRelease)
    window.addEventListener('pointercancel', pointerRelease)
    window.addEventListener('scroll', clear, true)
    window.addEventListener('resize', clear)
    return () => {
      clearTimeout(timer)
      container.removeEventListener('pointerover', pointerOver)
      container.removeEventListener('pointerout', pointerOut)
      container.removeEventListener('pointerdown', pointerPress)
      container.removeEventListener('input', clear)
      container.removeEventListener('focusin', focusIn)
      container.removeEventListener('focusout', focusOut)
      window.removeEventListener('pointerup', pointerRelease)
      window.removeEventListener('pointercancel', pointerRelease)
      window.removeEventListener('scroll', clear, true)
      window.removeEventListener('resize', clear)
    }
  }, [containerRef])

  if (!target) return null
  const { rect } = target
  return <Tooltip open onOpenChange={open => { if (!open) setTarget(null) }}>
    {createPortal(<TooltipTrigger asChild><span aria-hidden="true" className="pointer-events-none fixed"
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }} /></TooltipTrigger>, document.body)}
    <TooltipContent side={side}>{target.label}</TooltipContent>
  </Tooltip>
}
