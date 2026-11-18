type Desktop = { nativePlatform?: string; toolOp?: (tool: string, args: Record<string, unknown>, meta: Record<string, unknown>) => Promise<unknown> }

/** A desktop must explicitly report implemented input and observation support. */
async function capabilities(desktop: Desktop | undefined): Promise<{ computer: boolean; share: boolean }> {
  if (!desktop?.toolOp || !['win32', 'windows'].includes((desktop.nativePlatform ?? '').toLowerCase())) return { computer: false, share: false }
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const result = await Promise.race([
      desktop.toolOp('computer.capabilities', {}, {}),
      new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 2000) }),
    ]) as { ok?: boolean; data?: { input?: boolean; observe?: boolean; shareControl?: boolean } } | null
    const computer = result?.ok === true && result.data?.input === true && result.data.observe === true
    return { computer, share: computer && result?.data?.shareControl === true }
  } catch {
    return { computer: false, share: false }
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

export async function desktopComputerControlAvailable(desktop: Desktop | undefined): Promise<boolean> {
  return (await capabilities(desktop)).computer
}

/** Interactive shares require the extra capture-binding and clipboard contract. */
export async function desktopScreenShareControlAvailable(desktop: Desktop | undefined): Promise<boolean> {
  return (await capabilities(desktop)).share
}
