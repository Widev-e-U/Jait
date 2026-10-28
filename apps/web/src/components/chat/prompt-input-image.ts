import type { UserImageAttachment } from '@/lib/user-message-segments'

let inlineNodeSequence = 0

// These IDs identify only live editor nodes; they also work on plain HTTP LAN URLs.
export function createInlineNodeRef(prefix: string): string {
  return `${prefix}:${Date.now().toString(36)}:${++inlineNodeSequence}`
}

/** Noneditable images are atomic inline nodes, just like reference chips. */
export function createInlineImageNode(image: UserImageAttachment, onRemove: (refKey: string) => void): HTMLSpanElement {
  const chip = document.createElement('span')
  const refKey = createInlineNodeRef('image')
  chip.contentEditable = 'false'
  chip.dataset.chipRef = refKey
  chip.dataset.segmentType = 'image'
  chip.dataset.chipName = image.name
  chip.dataset.imageMime = image.mimeType
  chip.dataset.imageData = image.data
  chip.dataset.tooltip = image.name
  chip.className = 'mx-0.5 inline-flex max-w-full items-center gap-1 rounded border border-border bg-muted/45 px-1 py-0.5 align-middle select-none text-sm'

  const preview = document.createElement('img')
  preview.src = image.data.startsWith('data:') ? image.data : `data:${image.mimeType};base64,${image.data}`
  preview.alt = image.name
  preview.draggable = false
  preview.className = 'h-[1em] w-[1em] shrink-0 rounded-sm object-contain'
  chip.appendChild(preview)

  const label = document.createElement('span')
  label.dataset.imageName = ''
  label.className = 'min-w-0 max-w-[min(200px,40vw)] truncate'
  label.textContent = image.name
  chip.appendChild(label)

  const remove = document.createElement('button')
  remove.type = 'button'
  remove.setAttribute('aria-label', `Remove ${image.name}`)
  remove.className = 'rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
  remove.textContent = '×'
  remove.addEventListener('mousedown', (event) => event.preventDefault())
  remove.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    onRemove(refKey)
  })
  chip.appendChild(remove)
  return chip
}

export function readInlineImageNode(node: HTMLElement): ({ type: 'image' } & UserImageAttachment) | null {
  const { imageMime, imageData, chipName } = node.dataset
  if (!imageMime?.startsWith('image/') || !imageData) return null
  return { type: 'image', name: chipName || 'Image', mimeType: imageMime, data: imageData }
}
