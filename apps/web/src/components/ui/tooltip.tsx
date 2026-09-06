"use client"

import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import { cn } from "@/lib/utils"

const TooltipProviderContext = React.createContext(false)

function TooltipProvider({
  delayDuration = 50,
  skipDelayDuration = 300,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipProviderContext.Provider value={true}>
      <TooltipPrimitive.Provider
        data-slot="tooltip-provider"
        delayDuration={delayDuration}
        skipDelayDuration={skipDelayDuration}
        {...props}
      >
        {children}
      </TooltipPrimitive.Provider>
    </TooltipProviderContext.Provider>
  )
}

function Tooltip(props: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  const hasProvider = React.useContext(TooltipProviderContext)
  const tooltip = <TooltipPrimitive.Root data-slot="tooltip" {...props} />
  return hasProvider ? tooltip : <TooltipProvider>{tooltip}</TooltipProvider>
}

function TooltipTrigger({ className, ...props }: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" className={cn("disabled:!pointer-events-auto", className)} {...props} />
}

function TooltipContent({
  className,
  sideOffset = 6,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          "z-50 w-fit max-w-xs rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md animate-in fade-in-0 duration-75 motion-reduce:animate-none",
          className,
        )}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

function TooltipHint({
  content,
  children,
  ...props
}: Omit<React.ComponentProps<typeof TooltipPrimitive.Trigger>, "content" | "children" | "asChild"> & {
  content: React.ReactNode
  children: React.ReactElement
}) {
  return (
    <Tooltip open={content ? undefined : false}>
      <TooltipTrigger asChild {...props}>{children}</TooltipTrigger>
      {content && <TooltipContent>{content}</TooltipContent>}
    </Tooltip>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider, TooltipHint }
