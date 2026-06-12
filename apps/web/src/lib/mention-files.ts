export type AvailableFileForMention = { path: string; name: string; kind?: 'file' | 'dir' }

export function areAvailableFilesEqual(a: AvailableFileForMention[], b: AvailableFileForMention[]) {
  if (a.length !== b.length) return false
  return a.every((file, index) => {
    const other = b[index]
    return other
      && file.path === other.path
      && file.name === other.name
      && file.kind === other.kind
  })
}
