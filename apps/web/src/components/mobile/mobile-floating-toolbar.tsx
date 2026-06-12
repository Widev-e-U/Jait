import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'

interface MobileFloatingToolbarProps {
  open: boolean
  children: ReactNode
  onOpenChange: (open: boolean) => void
}

export function MobileFloatingToolbar({ open, children, onOpenChange }: MobileFloatingToolbarProps) {
  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-[39]"
          onClick={() => onOpenChange(false)}
          aria-hidden="true"
        />
      )}
      <div
        className="fixed right-0 top-1/2 z-40 flex -translate-y-1/2 items-center gap-1"
        draggable={false}
        onDragStart={(event) => event.preventDefault()}
      >
        {open && (
          <div className="transition-all duration-200 translate-x-0 opacity-100">
            {children}
          </div>
        )}
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="h-14 w-7 rounded-l-lg rounded-r-none border-y border-l border-r-0 bg-background/90 shadow-lg backdrop-blur-lg"
          onClick={() => onOpenChange(!open)}
          aria-expanded={open}
          aria-label={open ? 'Hide mobile toolbar' : 'Show mobile toolbar'}
          title={open ? 'Hide mobile toolbar' : 'Show mobile toolbar'}
        >
          {open ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>
    </>
  )
}
