import * as React from 'react'
import { Check, ChevronDown, Copy } from 'lucide-react'
import {
  createContext,
  type HTMLAttributes,
  useContext,
  useMemo,
  useState,
} from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface CodeBlockContextValue {
  code: string
  language: string
  setLanguage: (language: string) => void
}

const CodeBlockContext = createContext<CodeBlockContextValue | null>(null)

function useCodeBlockContext() {
  const context = useContext(CodeBlockContext)
  if (!context) throw new Error('CodeBlock components must be used within CodeBlock.')
  return context
}

interface CodeBlockProps extends HTMLAttributes<HTMLDivElement> {
  code: string
  language?: string
  children: React.ReactNode
}

export function CodeBlock({
  code,
  language = 'text',
  className,
  children,
  ...props
}: CodeBlockProps) {
  const [selectedLanguage, setSelectedLanguage] = useState(language)
  const value = useMemo<CodeBlockContextValue>(() => ({
    code,
    language: selectedLanguage,
    setLanguage: setSelectedLanguage,
  }), [code, selectedLanguage])

  return (
    <CodeBlockContext.Provider value={value}>
      <div
        className={cn(
          'not-prose overflow-hidden rounded-lg bg-card/70',
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </CodeBlockContext.Provider>
  )
}

export function CodeBlockHeader({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2', className)}
      {...props}
    />
  )
}

export function CodeBlockTitle({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground', className)} {...props} />
}

export function CodeBlockFilename({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('truncate', className)} {...props} />
}

export function CodeBlockActions({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center gap-1', className)} {...props} />
}

export function CodeBlockCopyButton({
  className,
  ...props
}: Omit<React.ComponentProps<typeof Button>, 'onClick'>) {
  const { code } = useCodeBlockContext()
  const [copied, setCopied] = useState(false)

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn('h-7 w-7 rounded-md', className)}
      onClick={async () => {
        await navigator.clipboard.writeText(code)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1200)
      }}
      aria-label={copied ? 'Copied code' : 'Copy code'}
      title={copied ? 'Copied' : 'Copy code'}
      {...props}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  )
}

export function CodeBlockLanguageSelector({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <div className={cn('flex items-center', className)}>{children}</div>
}

export function CodeBlockLanguageSelectorTrigger({
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn('inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground', className)}
      {...props}
    >
      {children}
      <ChevronDown className="h-3.5 w-3.5 opacity-60" />
    </button>
  )
}

export function CodeBlockLanguageSelectorValue({
  className,
  placeholder,
  children,
}: {
  className?: string
  placeholder?: string
  children?: React.ReactNode
}) {
  const { language } = useCodeBlockContext()
  return <span className={className}>{children ?? language ?? placeholder}</span>
}

export function CodeBlockLanguageSelectorContent({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}

export function CodeBlockLanguageSelectorItem({
  value,
  children,
}: {
  value: string
  children: React.ReactNode
}) {
  const { setLanguage } = useCodeBlockContext()
  React.useEffect(() => {
    setLanguage(value)
  }, [setLanguage, value])
  return <>{children}</>
}

export function CodeBlockBody({
  className,
  ...props
}: HTMLAttributes<HTMLPreElement>) {
  return <pre className={cn('overflow-x-auto p-3 text-sm', className)} {...props} />
}

export function CodeBlockCode({
  className,
  ...props
}: HTMLAttributes<HTMLElement>) {
  return <code className={cn('font-mono', className)} {...props} />
}

export { ChevronDown }
