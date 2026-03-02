import { useRef, useEffect, KeyboardEvent } from 'react'
import { ArrowUp, Mic, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface PromptInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onStop?: () => void
  isLoading?: boolean
  disabled?: boolean
  placeholder?: string
  className?: string
  onVoiceInput?: () => void
  talkModeEnabled?: boolean
  onToggleTalkMode?: () => void
}

export function PromptInput({
  value,
  onChange,
  onSubmit,
  onStop,
  isLoading,
  disabled,
  placeholder = 'Ask anything...',
  className,
  onVoiceInput,
  talkModeEnabled,
  onToggleTalkMode,
}: PromptInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }, [value])

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (value.trim() && !isLoading) onSubmit()
    }
  }

  return (
    <div className={cn('flex items-end gap-2 rounded-2xl border bg-background p-3 shadow-sm', className)}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        className="flex-1 resize-none bg-transparent text-base leading-relaxed placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 min-h-[40px] py-2 px-2"
      />
      {onVoiceInput && (
        <Button
          type="button"
          size="icon"
          variant={talkModeEnabled ? 'default' : 'outline'}
          className="h-10 w-10 shrink-0 rounded-full"
          onClick={onVoiceInput}
          title="Push to talk"
        >
          <Mic className="h-4 w-4" />
        </Button>
      )}
      {onToggleTalkMode && (
        <Button
          type="button"
          variant={talkModeEnabled ? 'default' : 'outline'}
          className="h-10 shrink-0 rounded-full px-3 text-xs"
          onClick={onToggleTalkMode}
          title="Toggle continuous talk mode"
        >
          Talk mode
        </Button>
      )}
      {isLoading ? (
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="h-10 w-10 shrink-0 rounded-full"
          onClick={onStop}
        >
          <Square className="h-4 w-4 fill-current" />
        </Button>
      ) : (
        <Button
          type="button"
          size="icon"
          className="h-10 w-10 shrink-0 rounded-full"
          disabled={!value.trim() || disabled}
          onClick={onSubmit}
        >
          <ArrowUp className="h-5 w-5" />
        </Button>
      )}
    </div>
  )
}
