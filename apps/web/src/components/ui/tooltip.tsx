"use client"

import * as React from "react"

/*
 * Lightweight tooltip shims.
 *
 * Radix Tooltip's PopperAnchor/composeRefs path currently trips a React 19
 * maximum-update-depth loop in this app shell. Keep the public component API
 * intact so call sites stay simple, but avoid the Radix ref composition path.
 */

type AnyProps = Record<string, unknown> & { children?: React.ReactNode }

const TooltipProvider = ({ children }: AnyProps) => <>{children}</>

const Tooltip = ({ children }: AnyProps) => <>{children}</>

type TooltipTriggerProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean
  children?: React.ReactNode
}

const TooltipTrigger = React.forwardRef<HTMLButtonElement, TooltipTriggerProps>(
  ({ asChild, children, ...props }, ref) => {
    if (asChild) return <>{children}</>
    return (
      <button ref={ref} type="button" {...props}>
        {children}
      </button>
    )
  },
)
TooltipTrigger.displayName = "TooltipTrigger"

const TooltipContent = React.forwardRef<HTMLDivElement, AnyProps>(
  (_props, _ref) => null,
)
TooltipContent.displayName = "TooltipContent"

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
