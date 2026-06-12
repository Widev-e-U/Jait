import { Minus, Square, X } from 'lucide-react'

export interface LinuxWindowControlsProps {
  isMaximized: boolean
}

/**
 * Custom minimize/maximize/close caption buttons for the Linux Electron window
 * (Windows uses native `titleBarOverlay`, macOS uses traffic lights). Extracted
 * from the `App` god component.
 */
export function LinuxWindowControls({ isMaximized }: LinuxWindowControlsProps) {
  return (
    <div className="flex items-center ml-2 -mr-2">
      <button
        onClick={() => (window as any).jaitDesktop.windowMinimize()}
        className="flex h-[35px] w-11 items-center justify-center hover:bg-muted/80 transition-colors"
      >
        <Minus className="h-4 w-4" />
      </button>
      <button
        onClick={() => (window as any).jaitDesktop.windowMaximize()}
        className="flex h-[35px] w-11 items-center justify-center hover:bg-muted/80 transition-colors"
      >
        {isMaximized
          ? <svg width="10" height="10" viewBox="0 0 10 10" className="fill-current"><path d="M2 0v2H0v8h8V8h2V0zm5 7H1V3h6zM9 1v6H8V2H3V1z"/></svg>
          : <Square className="h-3 w-3" />
        }
      </button>
      <button
        onClick={() => (window as any).jaitDesktop.windowClose()}
        className="flex h-[35px] w-11 items-center justify-center hover:bg-red-600 hover:text-white transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
