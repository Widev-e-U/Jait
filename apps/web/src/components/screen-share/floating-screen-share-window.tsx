import { Cast, X } from 'lucide-react'

import { ErrorBoundary } from '@/components/error-boundary'
import { ScreenSharePanel } from '@/components/screen-share'
import { Button } from '@/components/ui/button'
import type { useScreenShare } from '@/hooks/useScreenShare'

export interface FloatingScreenShareWindowProps {
  screenShare: ReturnType<typeof useScreenShare>
  floatingSSPos: { x: number; y: number }
  floatingSSSize: { w: number; h: number }
  onFloatingDragStart: (e: React.PointerEvent<HTMLDivElement>) => void
  onFloatingResizeStart: (e: React.PointerEvent<HTMLDivElement>) => void
  onClose: () => void
}

/**
 * The draggable/resizable floating screen-share window. Pairs with
 * `useFloatingScreenShare`, which supplies position/size and the pointer
 * handlers. Extracted from the `App` god component.
 */
export function FloatingScreenShareWindow({
  screenShare,
  floatingSSPos,
  floatingSSSize,
  onFloatingDragStart,
  onFloatingResizeStart,
  onClose,
}: FloatingScreenShareWindowProps) {
  return (
    <div
      className="fixed z-50 bg-background border rounded-lg shadow-2xl overflow-hidden flex flex-col"
      style={{
        left: floatingSSPos.x < 0 ? undefined : floatingSSPos.x,
        top: floatingSSPos.y < 0 ? undefined : floatingSSPos.y,
        right: floatingSSPos.x < 0 ? 16 : undefined,
        bottom: floatingSSPos.y < 0 ? 16 : undefined,
        width: floatingSSSize.w,
        height: floatingSSSize.h,
      }}
    >
      <div
        className="flex items-center justify-between h-8 px-3 border-b bg-muted/30 shrink-0 cursor-move select-none"
        onPointerDown={onFloatingDragStart}
        style={{ touchAction: 'none' }}
      >
        <span className="text-xs font-medium flex items-center gap-1.5">
          <Cast className="h-3 w-3" /> Screen Share
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onClose}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
      <ErrorBoundary name="Screen share" variant="section" className="flex-1 min-h-0" resetKeys={[true]}>
        <ScreenSharePanel screenShare={screenShare} />
      </ErrorBoundary>
      {/* Resize handle */}
      <div
        className="absolute bottom-0 right-0 w-3 h-3 cursor-nwse-resize opacity-50 hover:opacity-100"
        onPointerDown={onFloatingResizeStart}
        style={{ touchAction: 'none' }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" className="text-muted-foreground">
          <path d="M10 2L2 10M10 6L6 10M10 10L10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  )
}
