import { JAIT_PAGES, JAIT_PAGE_IDS, type JaitPageId } from '@jait/shared'

export type AppView = JaitPageId

export const APP_VIEWS: readonly AppView[] = JAIT_PAGE_IDS

/**
 * Normalize a raw path/host segment into an {@link AppView}.
 * Maps legacy or plural aliases to canonical views; returns `null` when unrecognized.
 */
export function parseAppView(raw: string): AppView | null {
  const normalized = raw === 'reminders' ? 'memory'
    : raw === 'emails' ? 'email'
      : raw === 'pull-requests' ? 'pulls'
        : raw
  return (APP_VIEWS as readonly string[]).includes(normalized) ? (normalized as AppView) : null
}

/** The history path for a view (`chat` lives at the root). */
export function appViewToPath(view: AppView): string {
  return JAIT_PAGES[view].path
}

export type ManagerPage = Extract<AppView, 'threads' | 'agents'>

export function isManagerView(view: AppView): view is ManagerPage {
  return view === 'threads' || view === 'agents'
}
