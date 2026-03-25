import * as React from 'react'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { cn } from '@/lib/utils'

const Popover = PopoverPrimitive.Root

// React 19 compat: Radix types don't resolve children/asChild through the
// Primitive chain with @types/react 19, so we extend manually.
const PopoverTrigger = PopoverPrimitive.Trigger as React.ForwardRefExoticComponent<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    asChild?: boolean
    children?: React.ReactNode
  } & React.RefAttributes<HTMLButtonElement>
>

const PopoverAnchor = PopoverPrimitive.Anchor

function PopoverContent({
  className,
  align = 'center',
  side,
  sideOffset = 4,
  ref,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'right' | 'bottom' | 'left'
  sideOffset?: number
  forceMount?: true
  onOpenAutoFocus?: (event: Event) => void
  onCloseAutoFocus?: (event: Event) => void
  ref?: React.Ref<HTMLDivElement>
}) {
  return (
    <PopoverPrimitive.Portal>
      {/* @ts-expect-error React 19 children compat with Radix UI */}
      <PopoverPrimitive.Content
        ref={ref as React.Ref<HTMLDivElement>}
        align={align}
        side={side}
        sideOffset={sideOffset}
        className={cn(
          'z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2',
          'data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
          className,
        )}
        {...props as Record<string, unknown>}
      >
        {children}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  )
}

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor }
