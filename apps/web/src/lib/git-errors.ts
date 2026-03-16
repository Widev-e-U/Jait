export function isMissingGitIdentityError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const normalized = message.toLowerCase()
  return normalized.includes('author identity unknown')
    || normalized.includes('please tell me who you are')
    || normalized.includes('unable to auto-detect email address')
}
