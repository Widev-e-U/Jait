import { useEffect, useMemo, useState, memo, useDeferredValue } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { codeToHtml } from 'shiki/bundle/web'
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockHeader,
  CodeBlockTitle,
} from '@/components/ai-elements/code-block'
import { cn } from '@/lib/utils'
import { FileIcon } from '@/components/icons/file-icons'
import { parseProjectLinkTarget } from '@/lib/project-links'
import { resolveChatImageUrl } from '@/lib/chat-image-url'

/**
 * Shared assistant-markdown renderer: syntax-highlighted code blocks, project
 * file links, and image previews. Used by both the main chat feed and any
 * tool-call surface (e.g. sub-agent output) that should render markdown
 * identically to a normal assistant reply.
 */

export type OnOpenPath = (path: string, line?: number, column?: number) => Promise<void> | void

// Long agent chats routinely contain hundreds of code blocks. Evicting at 120
// made every scroll back into older messages re-run full shiki tokenization
// (heavy per-block work), which is a large part of why long chats lagged.
const CODE_HIGHLIGHT_CACHE_LIMIT = 600
const STREAMING_HIGHLIGHT_DELAY_MS = 150
const codeHighlightCache = new Map<string, string | null>()
const CODE_HTML_MATCHER = /<pre[^>]*><code>([\s\S]*)<\/code><\/pre>/

type CodeHighlightTheme = 'github-dark' | 'github-light'

function normalizeCodeLanguage(language: string): string {
  const normalized = language.toLowerCase()
  const aliases: Record<string, string> = {
    'c#': 'csharp',
    'c++': 'cpp',
    docker: 'dockerfile',
    js: 'javascript',
    md: 'markdown',
    plain: 'txt',
    plaintext: 'txt',
    py: 'python',
    rb: 'ruby',
    sh: 'bash',
    shell: 'bash',
    ts: 'typescript',
    yml: 'yaml',
    zsh: 'bash',
  }
  return (aliases[normalized] ?? normalized) || 'txt'
}

function getCodeHighlightCacheKey(code: string, language: string, theme: string): string {
  return `${theme}\0${normalizeCodeLanguage(language)}\0${code}`
}

function rememberHighlightedCode(key: string, value: string | null) {
  if (codeHighlightCache.size >= CODE_HIGHLIGHT_CACHE_LIMIT) {
    const oldestKey = codeHighlightCache.keys().next().value
    if (oldestKey) codeHighlightCache.delete(oldestKey)
  }
  codeHighlightCache.set(key, value)
}

function getCurrentCodeTheme(): CodeHighlightTheme {
  if (typeof document === 'undefined') return 'github-light'
  return document.documentElement.classList.contains('dark') ? 'github-dark' : 'github-light'
}

function useCodeHighlightTheme(): CodeHighlightTheme {
  const [theme, setTheme] = useState<CodeHighlightTheme>(getCurrentCodeTheme)

  useEffect(() => {
    setTheme(getCurrentCodeTheme())
    if (typeof MutationObserver === 'undefined') return

    const observer = new MutationObserver(() => setTheme(getCurrentCodeTheme()))
    observer.observe(document.documentElement, { attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  return theme
}

export function getCodeHighlightDelay(isStreaming: boolean): number {
  return isStreaming ? STREAMING_HIGHLIGHT_DELAY_MS : 0
}

export async function highlightCodeHtml(
  code: string,
  language: string,
  theme: CodeHighlightTheme,
): Promise<string | null> {
  const cacheKey = getCodeHighlightCacheKey(code, language, theme)
  if (codeHighlightCache.has(cacheKey)) {
    return codeHighlightCache.get(cacheKey) ?? null
  }

  const render = async (lang: string) => {
    const html = await codeToHtml(code, { lang: lang as any, theme })
    return html.match(CODE_HTML_MATCHER)?.[1] ?? null
  }

  try {
    const highlighted = await render(normalizeCodeLanguage(language))
    rememberHighlightedCode(cacheKey, highlighted)
    return highlighted
  } catch {
    try {
      const highlighted = await render('txt')
      rememberHighlightedCode(cacheKey, highlighted)
      return highlighted
    } catch {
      rememberHighlightedCode(cacheKey, null)
      return null
    }
  }
}

function HighlightedCode({
  code,
  language,
  className,
  isStreaming,
}: {
  code: string
  language: string
  className?: string
  isStreaming: boolean
}) {
  const theme = useCodeHighlightTheme()
  const cacheKey = getCodeHighlightCacheKey(code, language, theme)
  const [highlightedResult, setHighlightedResult] = useState<{
    cacheKey: string
    html: string | null
  } | null>(null)
  const highlightedHtml = highlightedResult?.cacheKey === cacheKey
    ? highlightedResult.html
    : null

  useEffect(() => {
    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    const highlight = async () => {
      const html = await highlightCodeHtml(code, language, theme)
      if (!cancelled) setHighlightedResult({ cacheKey, html })
    }

    const delay = getCodeHighlightDelay(isStreaming)
    if (delay > 0) {
      timeoutId = setTimeout(() => void highlight(), delay)
    } else {
      void highlight()
    }

    return () => {
      cancelled = true
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [cacheKey, code, isStreaming, language, theme])

  if (!highlightedHtml) {
    return <code className={cn(className, 'whitespace-pre')}>{code}</code>
  }

  return <code className={cn(className, 'whitespace-pre')} dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
}

export function proseClassName(_compact?: boolean) {
  return 'prose dark:prose-invert max-w-none break-words [overflow-wrap:anywhere] prose-pre:bg-muted prose-pre:border prose-pre:max-w-full prose-pre:overflow-x-auto prose-code:before:content-none prose-code:after:content-none prose-p:leading-relaxed [font-size:0.9rem]'
}

function getFileLinkLabel(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const parts = normalized.split('/')
  return parts[parts.length - 1] ?? normalized
}

function ProjectPathLink({
  href,
  target,
  onOpenPath,
}: {
  href?: string
  target: NonNullable<ReturnType<typeof parseProjectLinkTarget>>
  onOpenPath: OnOpenPath
}) {
  const fileName = getFileLinkLabel(target.path)
  const location = target.line
    ? `L${target.line}${target.column ? `:${target.column}` : ''}`
    : null

  return (
    <a
      href={href}
      className={cn(
        'not-prose inline-flex max-w-full items-center gap-1.5 rounded-md border border-border/70 bg-muted/45 px-2 py-1 align-middle text-xs font-medium leading-none text-foreground no-underline transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      )}
      title={target.path}
      onClick={(event) => {
        event.preventDefault()
        void onOpenPath(target.path, target.line, target.column)
      }}
    >
      <FileIcon filename={fileName} className="h-3.5 w-3.5 shrink-0" />
      <span className="max-w-[220px] truncate">{fileName}</span>
      {location ? (
        <span className="shrink-0 rounded bg-background/80 px-1 py-0.5 text-2xs text-muted-foreground">
          {location}
        </span>
      ) : null}
    </a>
  )
}

export function buildMarkdownComponents(onOpenPath?: OnOpenPath, isStreaming = false): Components | undefined {
  return {
    pre: ({ children }) => <>{children}</>,
    code: ({ node, className, children, ref: _ref, ...props }: any) => {
      const inline = node?.position?.start.line === node?.position?.end.line && !className
      if (!inline) {
        const language = typeof className === 'string'
          ? className.replace(/^language-/, '').split(' ')[0] || 'text'
          : 'text'
        const code = String(children ?? '').replace(/\n$/, '')
        return (
          <CodeBlock code={code} language={language}>
            <CodeBlockHeader>
              <CodeBlockTitle>
                <CodeBlockFilename>{language}</CodeBlockFilename>
              </CodeBlockTitle>
              <CodeBlockActions>
                <CodeBlockCopyButton />
              </CodeBlockActions>
            </CodeBlockHeader>
            <div className="overflow-x-auto px-3 py-2 text-sm">
              <HighlightedCode code={code} language={language} className={className} isStreaming={isStreaming} />
            </div>
          </CodeBlock>
        )
      }

      return (
        <code
          className={cn(
            'not-prose inline-flex max-w-full items-baseline rounded-md border border-border/70 bg-muted/45 px-2 py-1 align-middle font-mono text-xs font-medium leading-[1.2] text-foreground',
            'shadow-[inset_0_1px_0_hsl(var(--background)/0.55)]',
          )}
          {...props}
        >
          <span className="max-w-[32rem] truncate sm:max-w-[40rem]">{children}</span>
        </code>
      )
    },
    a: ({ href, ref: _ref, ...props }) => {
      if (!onOpenPath) {
        return (
          <a href={href} {...props}>
            {props.children}
          </a>
        )
      }

      const target = parseProjectLinkTarget(href)
      if (!target) {
        return (
          <a href={href} {...props}>
            {props.children}
          </a>
        )
      }

      return <ProjectPathLink href={href} target={target} onOpenPath={onOpenPath} />
    },
    table: ({ children, ref: _ref, node: _node, ...props }) => (
      <div className="my-0 w-full max-w-full overflow-x-auto">
        <table
          className={cn(props.className, 'w-max min-w-full')}
          {...props}
        >
          {children}
        </table>
      </div>
    ),
    img: ({ src, alt, ref: _ref, ...props }) => {
      const resolvedSrc = typeof src === 'string' ? resolveChatImageUrl(src) : null
      if (!resolvedSrc) {
        return (
          <span className="inline-flex rounded-md border border-dashed border-border/70 px-2 py-1 text-xs text-muted-foreground">
            image unavailable
          </span>
        )
      }

      return (
        <a
          href={resolvedSrc}
          target="_blank"
          rel="noreferrer"
          className="not-prose block overflow-hidden rounded-xl border border-border/60 bg-muted/20 no-underline"
        >
          <img
            src={resolvedSrc}
            alt={alt ?? 'Chat image'}
            loading="lazy"
            className="max-h-[28rem] w-full object-contain bg-background/80"
            {...props}
          />
        </a>
      )
    },
  }
}

function StaticMarkdown({
  content,
  compact,
  isStreaming,
  onOpenPath,
}: {
  content: string
  compact?: boolean
  isStreaming: boolean
  onOpenPath?: OnOpenPath
}) {
  const components = useMemo(
    () => buildMarkdownComponents(onOpenPath, isStreaming),
    [isStreaming, onOpenPath],
  )
  // A streaming assistant message re-parses its entire markdown on every token
  // flush, and that cost grows with message length — in long chats it starts
  // competing with scroll/input. `useDeferredValue` lets each flush paint with
  // the previous parsed tree immediately, then re-parses at lower priority.
  // The deferred value always converges to the latest content, so the final
  // render is exact; during streaming it just stops blocking the main thread.
  const deferredContent = useDeferredValue(content)
  return (
    <div className={proseClassName(compact)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {deferredContent}
      </ReactMarkdown>
    </div>
  )
}

/** Renders markdown exactly like a normal assistant chat reply — syntax-highlighted code blocks, project file links, image previews. */
export const AssistantMarkdown = memo(function AssistantMarkdown({
  content,
  compact,
  isStreaming = false,
  onOpenPath,
}: {
  content: string
  compact?: boolean
  isStreaming?: boolean
  preferLlmUi?: boolean
  onOpenPath?: OnOpenPath
}) {
  return <StaticMarkdown content={content} compact={compact} isStreaming={isStreaming} onOpenPath={onOpenPath} />
})
AssistantMarkdown.displayName = 'AssistantMarkdown'
