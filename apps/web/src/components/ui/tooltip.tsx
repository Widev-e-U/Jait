"use client"

import * as React from "react"
import { createPortal } from "react-dom"

import { cn } from "@/lib/utils"

/*
 * Tooltip — a lightweight, dependency-free shadcn-styled tooltip.
 *
 * Radix Tooltip's PopperAnchor/composeRefs path currently trips a React 19
 * maximum-update-depth loop in this app shell, so we render the tooltip
 * ourselves (portal + fixed positioning + hover/focus triggers) instead of
 * pulling in @radix-ui/react-tooltip. The public component API mirrors the
 * shadcn/radix shape so call sites stay simple and consistent.
 */

type AnyProps = Record<string, unknown> & { children?: React.ReactNode }

type Side = "top" | "bottom" | "left" | "right"

type TooltipContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
  triggerRef: React.MutableRefObject<HTMLElement | null>
}

const TooltipContext = React.createContext<TooltipContextValue | null>(null)

const TooltipProvider = ({ children }: AnyProps) => <>{children}</>

const Tooltip = ({ children }: AnyProps) => {
  const [open, setOpen] = React.useState(false)
  const triggerRef = React.useRef<HTMLElement | null>(null)
  const value = React.useMemo(
    () => ({ open, setOpen, triggerRef }),
    [open],
  )
  return <TooltipContext.Provider value={value}>{children}</TooltipContext.Provider>
}

type TooltipTriggerProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean
  children?: React.ReactNode
}

const TooltipTrigger = React.forwardRef<HTMLElement, TooltipTriggerProps>(
  ({ asChild, children, ...props }, _forwardedRef) => {
    const ctx = React.useContext(TooltipContext)
    const localRef = React.useRef<HTMLElement | null>(null)

    const nodeRef = React.useCallback(
      (el: HTMLElement | null) => {
        localRef.current = el
        if (ctx) ctx.triggerRef.current = el
      },
      [ctx],
    )

    const openTimer = React.useRef<number | null>(null)
    const closeTimer = React.useRef<number | null>(null)

    const clearTimers = React.useCallback(() => {
      if (openTimer.current !== null) {
        window.clearTimeout(openTimer.current)
        openTimer.current = null
      }
      if (closeTimer.current !== null) {
        window.clearTimeout(closeTimer.current)
        closeTimer.current = null
      }
    }, [])

    React.useEffect(() => clearTimers, [clearTimers])

    const scheduleOpen = React.useCallback(() => {
      clearTimers()
      openTimer.current = window.setTimeout(() => ctx?.setOpen(true), 200)
    }, [ctx, clearTimers])

    const scheduleClose = React.useCallback(() => {
      clearTimers()
      closeTimer.current = window.setTimeout(() => ctx?.setOpen(false), 100)
    }, [ctx, clearTimers])

    const openNow = React.useCallback(() => {
      clearTimers()
      ctx?.setOpen(true)
    }, [ctx, clearTimers])

    const closeNow = React.useCallback(() => {
      clearTimers()
      ctx?.setOpen(false)
    }, [ctx, clearTimers])

    if (asChild && React.isValidElement(children)) {
      const child = children as React.ReactElement<Record<string, unknown>>
      return React.cloneElement(child, {
        ...props,
        ref: nodeRef,
        onMouseEnter: scheduleOpen,
        onMouseLeave: scheduleClose,
        onFocus: openNow,
        onBlur: closeNow,
      })
    }

    return (
      <button
        type="button"
        ref={nodeRef as unknown as React.Ref<HTMLButtonElement>}
        {...props}
        onMouseEnter={scheduleOpen}
        onMouseLeave={scheduleClose}
        onFocus={openNow}
        onBlur={closeNow}
      >
        {children}
      </button>
    )
  },
)
TooltipTrigger.displayName = "TooltipTrigger"

type TooltipContentProps = React.HTMLAttributes<HTMLDivElement> & {
  side?: Side
}

const TooltipContent = React.forwardRef<HTMLDivElement, TooltipContentProps>(
  ({ children, className, side = "top", ...props }, _ref) => {
    const ctx = React.useContext(TooltipContext)
    const boxRef = React.useRef<HTMLDivElement | null>(null)
    const [pos, setPos] = React.useState<{ x: number; y: number } | null>(null)

    const compute = React.useCallback(() => {
      const el = ctx?.triggerRef.current
      const box = boxRef.current
      if (!el || !box) return
      const a = el.getBoundingClientRect()
      const s = box.getBoundingClientRect()
      const gap = 8
      let x = 0
      let y = 0
      switch (side) {
        case "bottom":
          x = a.left + a.width / 2 - s.width / 2
          y = a.bottom + gap
          break
        case "left":
          x = a.left - gap - s.width
          y = a.top + a.height / 2 - s.height / 2
          break
        case "right":
          x = a.right + gap
          y = a.top + a.height / 2 - s.height / 2
          break
        case "top":
        default:
          x = a.left + a.width / 2 - s.width / 2
          y = a.top - gap - s.height
          break
      }
      x = Math.max(8, Math.min(x, window.innerWidth - s.width - 8))
      y = Math.max(8, Math.min(y, window.innerHeight - s.height - 8))
      setPos({ x, y })
    }, [ctx, side])

    React.useEffect(() => {
      if (!ctx?.open) return
      compute()
      window.addEventListener("scroll", compute, true)
      window.addEventListener("resize", compute)
      return () => {
        window.removeEventListener("scroll", compute, true)
        window.removeEventListener("resize", compute)
      }
    }, [ctx?.open, compute])

    if (!ctx?.open) return null

    return createPortal(
      <div
        ref={boxRef}
        role="tooltip"
        {...props}
        style={{
          position: "fixed",
          left: pos?.x ?? -9999,
          top: pos?.y ?? -9999,
          zIndex: 9999,
          ...(props.style as React.CSSProperties),
        }}
        className={cn(
          "z-50 overflow-hidden rounded-md border border-border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md select-none pointer-events-none animate-in fade-in-0 zoom-in-95",
          className,
        )}
      >
        {children}
      </div>,
      document.body,
    )
  },
)
TooltipContent.displayName = "TooltipContent"

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
