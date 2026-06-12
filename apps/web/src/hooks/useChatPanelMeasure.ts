import { useCallback, useEffect, useRef, useState } from 'react'

export function useChatPanelMeasure() {
  const [chatMeasuredWidth, setChatMeasuredWidth] = useState<number | null>(null)
  const chatPanelResizeObserverRef = useRef<ResizeObserver | null>(null)

  const setChatPanelElement = useCallback((el: HTMLDivElement | null) => {
    chatPanelResizeObserverRef.current?.disconnect()
    chatPanelResizeObserverRef.current = null

    if (!el || typeof ResizeObserver === 'undefined') {
      setChatMeasuredWidth(null)
      return
    }

    const updateWidth = () => {
      setChatMeasuredWidth(Math.round(el.getBoundingClientRect().width))
    }

    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    observer.observe(el)
    chatPanelResizeObserverRef.current = observer
  }, [])

  useEffect(() => {
    return () => chatPanelResizeObserverRef.current?.disconnect()
  }, [])

  return { chatMeasuredWidth, setChatPanelElement }
}
