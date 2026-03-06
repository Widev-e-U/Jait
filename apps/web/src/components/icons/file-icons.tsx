/**
 * File & folder icons powered by vscode-icons (MIT).
 *
 * Uses `vscode-icons-js` for the filename→icon mapping and loads the
 * actual SVGs from the jsDelivr CDN (cached at the edge).
 *
 * @see https://github.com/vscode-icons/vscode-icons
 * @see https://github.com/dderevjanik/vscode-icons-js
 */

import {
  getIconForFile,
  getIconForFolder,
  getIconForOpenFolder,
  DEFAULT_FILE,
  DEFAULT_FOLDER,
  DEFAULT_FOLDER_OPENED,
} from 'vscode-icons-js'

/** jsDelivr CDN pinned to the v12.9.0 tag for stability. */
const CDN = 'https://cdn.jsdelivr.net/gh/vscode-icons/vscode-icons@12.9.0/icons/'

/**
 * Renders the appropriate vscode-icons file icon for a given filename.
 */
export function FileIcon({
  filename,
  className,
}: {
  filename: string
  className?: string
}) {
  const icon = getIconForFile(filename) ?? DEFAULT_FILE
  return (
    <img
      src={`${CDN}${icon}`}
      alt=""
      className={className}
      loading="lazy"
      decoding="async"
      draggable={false}
    />
  )
}

/**
 * Renders a folder icon (closed or open) for a given folder name.
 */
export function FolderIcon({
  name,
  open = false,
  className,
}: {
  name: string
  open?: boolean
  className?: string
}) {
  const icon = open
    ? getIconForOpenFolder(name) ?? DEFAULT_FOLDER_OPENED
    : getIconForFolder(name) ?? DEFAULT_FOLDER
  return (
    <img
      src={`${CDN}${icon}`}
      alt=""
      className={className}
      loading="lazy"
      decoding="async"
      draggable={false}
    />
  )
}
