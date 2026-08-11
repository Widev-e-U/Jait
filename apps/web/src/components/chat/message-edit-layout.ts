export function getUserMessageEditComposerShellClassName(): string {
  return [
    'fixed left-1/2 top-1/2 z-50',
    'w-[min(42rem,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] -translate-x-1/2 -translate-y-1/2',
    // Floating mobile composer needs an opaque card so the chat messages
    // behind it do not bleed through the translucent prompt input.
    'rounded-2xl border border-border bg-background p-1.5 shadow-2xl shadow-black/30',
    'md:static md:w-full md:max-w-4xl md:translate-x-0 md:translate-y-0',
    'md:rounded-none md:border-0 md:bg-transparent md:p-0 md:shadow-none',
  ].join(' ')
}

export function getMobileUserMessageEditTop(
  viewport: Pick<VisualViewport, 'height' | 'offsetTop'> | null | undefined,
  fallbackHeight: number,
): number {
  if (viewport && viewport.height > 0) {
    return viewport.offsetTop + viewport.height / 2
  }
  return Math.max(0, fallbackHeight / 2)
}

export function shouldShowNormalChatComposer(
  isMobile: boolean,
  editingMessageId: string | null,
): boolean {
  return !isMobile || editingMessageId === null
}

export function getUserMessageEditComposerTransitionClassName(showEditComposer: boolean): string {
  return [
    'space-y-3 origin-bottom transition-opacity duration-150 ease-out',
    showEditComposer ? 'opacity-100' : 'opacity-0',
  ].join(' ')
}
