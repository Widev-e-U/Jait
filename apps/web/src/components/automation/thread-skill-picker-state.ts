export function shouldAutoLoadThreadSkills(params: {
  open: boolean
  attemptedLoad: boolean
  skillsLength: number
  loading: boolean
}): boolean {
  return params.open && !params.attemptedLoad && params.skillsLength === 0 && !params.loading
}
