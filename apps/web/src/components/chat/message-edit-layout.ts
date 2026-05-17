export function getUserMessageEditComposerShellClassName(): string {
  return [
    'fixed left-1/2 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50',
    'w-[min(42rem,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] -translate-x-1/2',
    'md:static md:w-full md:max-w-3xl md:translate-x-0',
  ].join(' ')
}

export function getUserMessageEditComposerTransitionClassName(showEditComposer: boolean): string {
  return [
    'space-y-3 origin-bottom transition-opacity duration-150 ease-out',
    showEditComposer ? 'opacity-100' : 'opacity-0',
  ].join(' ')
}
