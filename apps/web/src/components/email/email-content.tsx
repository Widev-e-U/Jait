import { useMemo, useState } from 'react'
import DOMPurify from 'dompurify'
import { Button } from '@/components/ui/button'
import { emailApi } from '@/lib/email-api'

/** Sanitization plus a CSP/sandbox: mail never inherits the workbench's origin. */
export function prepareEmailHtml(html: string, images: Record<string, string> = {}) {
  const fragment = DOMPurify.sanitize(html.slice(0, 14 * 1024 * 1024), {
    RETURN_DOM_FRAGMENT: true,
    ADD_TAGS: ['style'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'video', 'audio', 'link', 'meta', 'base'],
    FORBID_ATTR: ['srcset', 'action', 'formaction', 'autofocus'],
  })
  const urls: string[] = []
  for (const img of fragment.querySelectorAll('img')) {
    const src = img.getAttribute('src') || ''
    if (/^https:\/\//i.test(src)) {
      if (!urls.includes(src)) urls.push(src)
      const replacement = images[src]
      if (replacement && /^data:image\/(png|jpeg|gif|webp|avif);base64,/i.test(replacement)) img.setAttribute('src', replacement)
      else img.removeAttribute('src')
    } else if (!/^data:image\/(png|jpeg|gif|webp|avif);base64,/i.test(src)) img.removeAttribute('src')
    img.removeAttribute('srcset')
  }
  for (const link of fragment.querySelectorAll('a')) {
    if (!/^(https?:|mailto:)/i.test(link.getAttribute('href') || '')) link.removeAttribute('href')
    link.setAttribute('target', '_blank')
    link.setAttribute('rel', 'noopener noreferrer')
  }
  const body = document.createElement('div')
  body.append(fragment)
  return {
    urls: urls.slice(0, 12),
    srcDoc: `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src 'none'; connect-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'"><meta name="referrer" content="no-referrer"><style>body{font-family:system-ui,Arial,sans-serif;margin:12px;color:#111;background:white;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}pre{white-space:pre-wrap}</style></head><body>${body.innerHTML}</body></html>`,
  }
}

export function EmailContent({ bodyHtml, bodyText, accountId }: { bodyHtml: string; bodyText: string; accountId?: string }) {
  const [images, setImages] = useState<{ html: string; values: Record<string, string> }>({ html: '', values: {} })
  const [loading, setLoading] = useState(false)
  const [imageError, setImageError] = useState('')
  const prepared = useMemo(() => prepareEmailHtml(bodyHtml, images.html === bodyHtml ? images.values : {}), [bodyHtml, images])
  async function loadImages() {
    if (!accountId) return
    setLoading(true); setImageError('')
    try {
      const values = await emailApi.remoteImages(accountId, prepared.urls)
      setImages({ html: bodyHtml, values })
      if (Object.keys(values).length < prepared.urls.length) setImageError('Some images could not be loaded.')
    } catch { setImageError('External images could not be loaded.') }
    finally { setLoading(false) }
  }
  if (!bodyHtml) return <pre className="whitespace-pre-wrap break-words font-sans text-sm">{bodyText || '(Empty message)'}</pre>
  return (
    <div className="min-w-0" data-testid="email-content">
      {prepared.urls.length > 0 && (
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5 px-2.5 text-[11px] text-muted-foreground sm:mb-2 sm:gap-2 sm:text-xs">
          <span>{images.html === bodyHtml ? 'External images requested.' : 'External images are blocked for privacy.'}</span>
          {accountId && <Button size="sm" variant="outline" onClick={() => { void loadImages() }} disabled={loading || images.html === bodyHtml} className="h-6 px-2 text-[11px] sm:h-7 sm:px-3 sm:text-xs">{loading ? 'Loading images…' : 'Load images'}</Button>}
          {imageError && <span role="status">{imageError}</span>}
        </div>
      )}
      <iframe title="Email content" referrerPolicy="no-referrer" sandbox="allow-popups allow-popups-to-escape-sandbox" className="h-[38vh] max-h-64 min-h-44 w-full bg-white sm:h-[min(60vh,600px)] sm:max-h-none sm:min-h-72" srcDoc={prepared.srcDoc} />
    </div>
  )
}
