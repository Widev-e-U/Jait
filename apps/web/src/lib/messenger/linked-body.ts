/**
 * Bridged services (Teams, Slack, ...) send rich text as Matrix `formatted_body` and a plain
 * `body` that drops the link targets ("More info here."). Rebuild the text with Markdown links
 * so the message renderer can make them clickable. Returns undefined when there is no link.
 */
const ENTITIES: Record<string, string> = { '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#x27;': "'", '&nbsp;': ' ', '&amp;': '&' }
const decode = (value: string) => value.replace(/&(?:lt|gt|quot|#39|#x27|nbsp|amp);/g, entity => ENTITIES[entity] ?? entity)

export function linkedBodyFromHtml(html: unknown): string | undefined {
  if (typeof html !== 'string' || !/<a\s/i.test(html)) return undefined
  const links: string[] = []
  const found = () => links.length > 0
  const withLinks = html.replace(/<a\s[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi, (_m, dq: string | undefined, sq: string | undefined, inner: string) => {
    const href = decode(dq ?? sq ?? '').trim()
    const label = decode(inner.replace(/<[^>]*>/g, '')).replace(/[[\]\n]/g, ' ').trim()
    let safe = false
    try { safe = ['http:', 'https:', 'mailto:'].includes(new URL(href).protocol) } catch { /* relative or invalid */ }
    if (!safe || !label) return inner
    links.push(`[${label}](<${href.replace(/[<>\s]/g, encodeURIComponent)}>)`)
    return `\u0000${links.length - 1}\u0001`
  })
  if (!found()) return undefined
  const text = decode(withLinks
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|blockquote|h[1-6]|pre|tr)>/gi, '\n')
    .replace(/<[^>]*>/g, ''))
  return text.replace(/\u0000(\d+)\u0001/g, (_m, index: string) => links[Number(index)] ?? '').replace(/\n{3,}/g, '\n\n').trim()
}
