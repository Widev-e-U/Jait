export function isProviderLoginDisabled(params: {
  busy: boolean
  hasLogoutInProgress: boolean
  isSignedIn: boolean
}): boolean {
  return params.busy || params.hasLogoutInProgress || params.isSignedIn
}
