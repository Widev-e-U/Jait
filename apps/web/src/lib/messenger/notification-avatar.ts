/** Resolve authenticated Matrix media to a small, self-contained notification icon. */
export async function notificationAvatarUrl(mxcUrl: string | undefined, load: (url: string) => Promise<Blob>): Promise<string | undefined> {
  if (!mxcUrl?.startsWith('mxc://')) return undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const blob = await Promise.race([
      load(mxcUrl),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Avatar timed out')), 3000) }),
    ])
    if (!blob.size || blob.size > 1024 * 1024) return undefined
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const type = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 ? 'image/png'
      : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? 'image/jpeg'
      : bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP' ? 'image/webp'
      : undefined
    if (!type) return undefined
    let binary = ''
    for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
    return `data:${type};base64,${btoa(binary)}`
  } catch {
    return undefined
  } finally {
    clearTimeout(timer)
  }
}
