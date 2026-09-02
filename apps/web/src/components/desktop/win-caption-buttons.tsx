import type React from 'react'

/**
 * Windows caption buttons for the Tauri shell at native titleBarOverlay
 * metrics. Electron Windows draws real native buttons (`titleBarOverlay`,
 * height 39 in electron-main.ts — 47×39 px each, flush against the top-right
 * corner); the Tauri shell is frameless on every platform, so it renders this
 * strip inside the titlebar instead. Sized and positioned to match the native
 * chrome exactly (right-edge padding of 140 is reserved in app-header.tsx).
 *
 * Glyphs are 10×10 crisp 1px-stroke drawings matching the Windows 10/11
 * caption geometry (Segoe MDL2 equivalents). The close hover uses the Windows
 * 11 accent red (#c42b1c).
 *
 * Marked no-drag via button elements — `data-tauri-drag-region` on the header
 * only captures mousedown on the header element itself, so clicks land here.
 */
export function WinCaptionButtons({ isMaximized }: { isMaximized: boolean }) {
  return (
    <div
      className="absolute top-0 right-0 flex h-[39px]"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <button
        aria-label="Minimize"
        onClick={() => (window as any).jaitDesktop.windowMinimize()}
        className="flex h-full w-[47px] items-center justify-center text-foreground/80 hover:bg-foreground/10 hover:text-foreground transition-colors"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" shapeRendering="crispEdges" aria-hidden="true">
          <path d="M0 5h10" stroke="currentColor" strokeWidth="1" fill="none" />
        </svg>
      </button>
      <button
        aria-label={isMaximized ? 'Restore' : 'Maximize'}
        onClick={() => (window as any).jaitDesktop.windowMaximize()}
        className="flex h-full w-[47px] items-center justify-center text-foreground/80 hover:bg-foreground/10 hover:text-foreground transition-colors"
      >
        {isMaximized
          ? <svg width="10" height="10" viewBox="0 0 10 10" className="fill-current" aria-hidden="true"><path d="M2 0v2H0v8h8V8h2V0zm5 7H1V3h6zM9 1v6H8V2H3V1z"/></svg>
          : <svg width="10" height="10" viewBox="0 0 10 10" shapeRendering="crispEdges" aria-hidden="true">
              <rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" strokeWidth="1" fill="none" />
            </svg>
        }
      </button>
      <button
        aria-label="Close"
        onClick={() => (window as any).jaitDesktop.windowClose()}
        className="flex h-full w-[47px] items-center justify-center text-foreground/80 hover:bg-[#c42b1c] hover:text-white transition-colors"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" shapeRendering="crispEdges" aria-hidden="true">
          <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1" fill="none" />
        </svg>
      </button>
    </div>
  )
}