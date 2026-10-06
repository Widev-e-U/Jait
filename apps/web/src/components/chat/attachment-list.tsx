import { ImageViewerContent } from './image-viewer'
import { X } from 'lucide-react'
import { FileIcon } from '@/components/icons/file-icons'
import { Dialog, DialogTrigger } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { ChatAttachment } from '@/hooks/useChat'
import type { UserMessageSegment } from '@/lib/user-message-segments'
import { cn } from '@/lib/utils'

export function collectAttachments(attachments?: ChatAttachment[] | string[], segments?: UserMessageSegment[]): ChatAttachment[] {
  const result: ChatAttachment[] = (attachments ?? []).filter((item): item is ChatAttachment => typeof item === 'object' && item !== null && typeof item.mimeType === 'string' && typeof item.data === 'string')
  for (const segment of segments ?? []) {
    if (segment.type !== 'image' && segment.type !== 'attachment') continue
    if (!result.some((item) => item.name === segment.name && item.mimeType === segment.mimeType && item.data === segment.data)) result.push(segment)
  }
  return result
}

/** Compact attachment chips shared by the composer, queue and transcript. */
export function AttachmentList({ attachments, onRemove, className }: {
  attachments: ChatAttachment[]
  onRemove?: (name: string) => void
  className?: string
}) {
  if (!attachments.length) return null
  return (
    <div className={cn('flex min-w-0 flex-wrap gap-1.5', className)} data-attachment-list data-no-drag="true" data-no-message-edit onClick={(event) => event.stopPropagation()}>
      {attachments.map((attachment, index) => {
        const isImage = attachment.mimeType.startsWith('image/')
        const src = attachment.preview ?? (attachment.data.startsWith('data:') ? attachment.data : `data:${attachment.mimeType};base64,${attachment.data}`)
        const label = <>
          {isImage ? <img src={src} alt={attachment.name} className="h-5 w-5 shrink-0 rounded-sm object-cover" /> : <FileIcon filename={attachment.name} className="h-3.5 w-3.5 shrink-0" />}
          <span className="min-w-0 truncate">{attachment.name}</span>
          {attachment.pastedText && <span className="shrink-0 text-muted-foreground">{attachment.pastedText.lineCount} lines</span>}
        </>
        const chipClass = 'flex min-w-0 max-w-full items-center gap-1.5 px-1.5 py-1 text-left hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
        return <div key={`${attachment.name}-${index}`} className="inline-flex min-w-0 max-w-full items-center overflow-hidden rounded border border-border/70 bg-muted/30 text-xs text-foreground" title={attachment.name}>
          {isImage ? <Dialog>
            <DialogTrigger asChild><button type="button" className={chipClass} aria-label={`Expand image ${attachment.name}`}>{label}</button></DialogTrigger>
            <ImageViewerContent src={src} alt={attachment.name} />
          </Dialog> : attachment.pastedText ? <Popover>
            <PopoverTrigger asChild><button type="button" className={chipClass} aria-label={`Review ${attachment.name}`}>{label}</button></PopoverTrigger>
            <PopoverContent className="w-[min(600px,90vw)]" align="start"><p className="mb-2 text-sm font-medium">{attachment.name}</p><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs">{attachment.pastedText.text}</pre></PopoverContent>
          </Popover> : <a className={chipClass} href={src} download={attachment.name} aria-label={`Download ${attachment.name}`}>{label}</a>}
          {onRemove && <button type="button" className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`Remove ${attachment.name}`} onClick={() => onRemove(attachment.name)}><X className="h-3.5 w-3.5" /></button>}
        </div>
      })}
    </div>
  )
}
