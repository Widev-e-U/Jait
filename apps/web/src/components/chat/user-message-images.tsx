import { ImageViewerContent } from './image-viewer'
import { Dialog, DialogTrigger } from '@/components/ui/dialog'
import type { UserImageAttachment } from '@/lib/user-message-segments'
import { TooltipHint } from '@/components/ui/tooltip'

function imageSource(image: UserImageAttachment): string {
  return image.data.startsWith('data:') ? image.data : `data:${image.mimeType};base64,${image.data}`
}

/** Numbered thumbnails stay above sent messages; their references retain inline positions. */
export function UserMessageImages({ images }: { images: UserImageAttachment[] }) {
  if (!images.length) return null
  return <div className="flex min-w-0 flex-wrap gap-2" data-user-message-images data-no-message-edit onClick={event => event.stopPropagation()}>
    {images.map((image, index) => <Dialog key={index}>
      <TooltipHint content={image.name}>
        <DialogTrigger asChild>
          <button type="button" className="relative flex h-24 w-32 max-w-full overflow-hidden rounded-lg border bg-muted hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`View image ${index + 1}: ${image.name}`} data-no-message-edit>
            <img src={imageSource(image)} alt={image.name} className="h-full w-full object-contain" />
            <span className="absolute bottom-1 right-1 rounded bg-background/90 px-1.5 py-0.5 text-xs tabular-nums" data-image-number>[{index + 1}]</span>
          </button>
        </DialogTrigger>
      </TooltipHint>
      <ImageViewerContent src={imageSource(image)} alt={image.name} />
    </Dialog>)}
  </div>
}

export function UserMessageImageReference({ image, number }: { image: UserImageAttachment; number: number }) {
  return <Dialog>
    <TooltipHint content={image.name}>
      <DialogTrigger asChild>
        <button type="button" className="mx-0.5 inline-flex items-center rounded px-1 align-baseline text-primary hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`View image reference ${number}: ${image.name}`} data-image-reference={number} data-no-message-edit onClick={event => event.stopPropagation()}>
          <span className="tabular-nums" data-image-number>[{number}]</span>
        </button>
      </DialogTrigger>
    </TooltipHint>
    <ImageViewerContent src={imageSource(image)} alt={image.name} />
  </Dialog>
}
