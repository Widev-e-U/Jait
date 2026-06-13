export function getUserMessageEditComposerShellClassName(): string {
  return [
    'fixed left-1/2 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50',
    'w-[min(42rem,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] -translate-x-1/2',
    // Floating mobile composer needs an opaque card so the chat messages
    // behind it do not bleed through the translucent prompt input.
    'rounded-2xl border border-border bg-background p-1.5 shadow-2xl shadow-black/30',
    'md:static md:w-full md:max-w-3xl md:translate-x-0',
    'md:rounded-none md:border-0 md:bg-transparent md:p-0 md:shadow-none',
  ].join(' ')
}

export function getUserMessageEditComposerTransitionClassName(showEditComposer: boolean): string {
  return [
    'space-y-3 origin-bottom transition-opacity duration-150 ease-out',
    showEditComposer ? 'opacity-100' : 'opacity-0',
  ].join(' ')
}
