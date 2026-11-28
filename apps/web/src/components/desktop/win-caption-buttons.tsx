import type { CSSProperties } from 'react'

const buttonClassName = 'flex h-full w-[46px] items-center justify-center text-foreground transition-colors'
const neutralHover = 'hover:bg-foreground/10'

export function WinCaptionButtons({ isMaximized }: { isMaximized: boolean }) {
  return (
    <div
      className="flex h-full shrink-0"
      style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
    >
      <button
        type="button"
        aria-label="Minimize"
        onClick={() => window.jaitDesktop?.windowMinimize()}
        className={`${buttonClassName} ${neutralHover}`}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" aria-hidden="true">
          <path d="M1 6.5h10" />
        </svg>
      </button>
      <button
        type="button"
        aria-label={isMaximized ? 'Restore' : 'Maximize'}
        onClick={() => window.jaitDesktop?.windowMaximize()}
        className={`${buttonClassName} ${neutralHover}`}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" aria-hidden="true">
          {isMaximized
            ? <path d="M3.5 3.5v-2h7v7h-2m-7-5h7v7h-7z" />
            : <rect x="1.5" y="1.5" width="9" height="9" rx="0.5" />}
        </svg>
      </button>
      <button
        type="button"
        aria-label="Close"
        onClick={() => window.jaitDesktop?.windowClose()}
        className={`${buttonClassName} hover:bg-[#c42b1c] hover:text-white`}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" aria-hidden="true">
          <path d="m1.5 1.5 9 9m0-9-9 9" />
        </svg>
      </button>
    </div>
  )
}
