export interface FirstProjectSetupState {
  gatewayStep: 'url' | 'auth'
  gatewayReachable: boolean | null
  authenticated: boolean
  authLoading: boolean
  projectsLoading: boolean
  projectsInitialLoadComplete: boolean
  nodePermissionSetupReady: boolean
  projectCount: number
  personalChatCount: number
  completed: boolean
  hasRoutedDestination: boolean
  view: string
  mode: string
}

/** Only a confirmed empty account enters setup. Gateway and account setup own their earlier steps. */
export function shouldOfferFirstProjectSetup(state: FirstProjectSetupState): boolean {
  return state.gatewayStep === 'auth'
    && state.gatewayReachable === true
    && state.authenticated
    && !state.authLoading
    && !state.projectsLoading
    && state.projectsInitialLoadComplete
    && state.nodePermissionSetupReady
    && state.projectCount === 0
    && state.personalChatCount === 0
    && !state.completed
    && !state.hasRoutedDestination
    && state.view === 'chat'
    && state.mode === 'developer'
}

export function firstProjectSetupKey(scope: string): string {
  return `jait:first-project-setup:v1:${scope}`
}

export function readFirstProjectSetupDone(scope: string | null): boolean {
  if (!scope || typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(firstProjectSetupKey(scope)) === 'done'
  } catch {
    return false
  }
}

export function saveFirstProjectSetupDone(scope: string | null): void {
  if (!scope || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(firstProjectSetupKey(scope), 'done')
  } catch {
    // The project/chat can still be used when storage is unavailable.
  }
}
