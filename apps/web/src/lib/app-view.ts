export type AppView = 'chat' | 'todo' | 'email' | 'memory' | 'jobs' | 'network' | 'settings'

export const APP_VIEWS: readonly AppView[] = ['chat', 'todo', 'email', 'memory', 'jobs', 'network', 'settings']

/**
 * Normalize a raw path/host segment into an {@link AppView}.
 * Maps legacy or plural aliases to canonical views; returns `null` when unrecognized.
 */
export function parseAppView(raw: string): AppView | null {
  const normalized = raw === 'reminders' ? 'memory'
    : raw === 'emails' ? 'email'
      : raw
  return (APP_VIEWS as readonly string[]).includes(normalized) ? (normalized as AppView) : null
}

/** The history path for a view (`chat` lives at the root). */
export function appViewToPath(view: AppView): string {
  if (view === 'email') return '/emails'
  return view === 'chat' ? '/' : `/${view}`
}
