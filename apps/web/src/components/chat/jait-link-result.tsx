import { parseJaitRenderedLink } from '@jait/shared'
import { ExternalLink } from 'lucide-react'
import { openNotification } from '@/lib/notification-navigation'
import { unwrapCatalogData } from './catalog-tool-result'

export function JaitLinkResult({ data }: { data: unknown }) {
  const link = parseJaitRenderedLink(unwrapCatalogData(data))
  if (!link) return <p className="text-xs text-muted-foreground">Link unavailable</p>
  return <a href={link.href} data-testid="jait-link-result"
    className="inline-flex items-center gap-2 rounded-md border bg-background/70 px-3 py-2 text-sm text-primary hover:underline"
    onClick={(event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      event.preventDefault()
      event.stopPropagation()
      openNotification({ id: `jait-link:${link.href}`, link: link.href })
    }}><ExternalLink className="h-3.5 w-3.5" />{link.label}</a>
}
