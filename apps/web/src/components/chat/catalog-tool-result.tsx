import { JAIT_PAGES, JAIT_PAGE_IDS, getToolPageId, jaitPageLink, type JaitPageId, type JaitPageLink } from '@jait/shared'
import { ExternalLink } from 'lucide-react'
import { openNotification } from '@/lib/notification-navigation'

/** External providers may preserve the MCP text envelope rather than raw data. */
export function unwrapCatalogData(value: unknown, depth = 0): Record<string, unknown> {
  if (depth > 6 || value == null) return {}
  if (typeof value === 'string') {
    const start = value.indexOf('{')
    try { return start >= 0 ? unwrapCatalogData(JSON.parse(value.slice(start)), depth + 1) : {} } catch { return {} }
  }
  if (Array.isArray(value)) {
    for (const child of value.slice(0, 30)) {
      const result = unwrapCatalogData(child, depth + 1)
      if (Object.keys(result).length) return result
    }
    return {}
  }
  if (typeof value !== 'object') return {}
  const record = value as Record<string, unknown>
  if (Array.isArray(record.pages) || Array.isArray(record.pageLinks)) return record
  for (const key of ['data', 'result', 'structuredContent', 'content', 'text']) {
    const result = unwrapCatalogData(record[key], depth + 1)
    if (Object.keys(result).length) return result
  }
  return {}
}

export function getCatalogPageLinks(tool: string, data: unknown): JaitPageLink[] {
  const record = unwrapCatalogData(data)
  const links = Array.isArray(record.pageLinks) ? record.pageLinks : []
  const valid = links.flatMap((link) => {
    if (!link || typeof link !== 'object') return []
    const id = (link as Record<string, unknown>).pageId
    // Ignore tool-supplied URLs and titles; the shared page registry is trusted.
    return typeof id === 'string' && JAIT_PAGE_IDS.includes(id as JaitPageId) ? [jaitPageLink(id as JaitPageId)] : []
  })
  if (valid.length) return [...new Map(valid.map((link) => [link.pageId, link])).values()]
  const id = getToolPageId(tool)
  return id ? [jaitPageLink(id)] : []
}

export function ToolPageLinks({ tool, data }: { tool: string; data: unknown }) {
  const links = getCatalogPageLinks(tool, data)
  if (!links.length) return null
  return <nav aria-label="Related Jait pages" className="flex flex-wrap gap-2" data-testid="tool-page-links">
    {links.map((link) => <a key={link.pageId} href={link.href}
      className="inline-flex items-center gap-1 rounded-md border bg-background/70 px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        event.preventDefault()
        event.stopPropagation()
        openNotification({ id: `tool-page:${link.pageId}`, link: link.href })
      }}><ExternalLink className="h-3 w-3" />Open {link.title}</a>)}
  </nav>
}

export function CatalogToolResult({ data }: { data: unknown }) {
  const record = unwrapCatalogData(data)
  const pages = Array.isArray(record.pages) ? record.pages : []
  return <div className="space-y-3" data-testid="jait-catalog-result">
    {pages.map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const page = entry as { id?: string; features?: Array<{ id: string; description: string; missingToolRefs?: string[] }>; tools?: Array<{ name: string }>; toolCount?: number; hasMoreTools?: boolean }
      if (!page.id || !JAIT_PAGE_IDS.includes(page.id as JaitPageId)) return null
      const definition = JAIT_PAGES[page.id as JaitPageId]
      return <section key={page.id} className="rounded-md border p-3">
        <h3 className="text-sm font-medium">{definition.title}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{definition.description}</p>
        {Array.isArray(page.features) && page.features.map((feature) => <div key={feature.id} className="mt-2 text-xs">
          <p>{feature.description}</p>
          {!!feature.missingToolRefs?.length && <p className="mt-1 text-muted-foreground">Tools unavailable: {feature.missingToolRefs.join(', ')}</p>}
        </div>)}
        {page.hasMoreTools && <p className="mt-2 text-xs text-muted-foreground">Showing {page.tools?.length ?? 0} of {page.toolCount} tools. Ask Jait for more tools on this page.</p>}
        {Array.isArray(page.tools) && page.tools.length > 0 && <p className="mt-2 break-words text-xs text-muted-foreground">Tools: {page.tools.map((tool) => tool.name).join(', ')}</p>}
      </section>
    })}
  </div>
}
