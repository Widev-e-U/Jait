import { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { cn } from '@/lib/utils'
import { chordFromEvent, formatChordParts, formatEventModifierParts, isModifierOnlyEvent } from '@/lib/hotkeys'

import { useHotkeys } from './hotkeys-provider'

interface ShortcutRecorderProps {
  /** The chord currently assigned, or `null` when unbound. */
  value: string | null
  onChange: (chord: string) => void
  /** Called when the user clears the binding with Backspace/Delete. */
  onClear?: () => void
  disabled?: boolean
  className?: string
  ariaLabel?: string
}

/**
 * A button that captures the next key combination the user presses.
 *
 * While recording, global hotkey dispatch is suspended so pressing e.g. `⌘,`
 * records the chord instead of navigating away. Escape cancels, Backspace and
 * Delete clear the binding.
 */
export function ShortcutRecorder({ value, onChange, onClear, disabled, className, ariaLabel }: ShortcutRecorderProps) {
  const { isMac, suspendDispatch } = useHotkeys()
  const [recording, setRecording] = useState(false)
  const [preview, setPreview] = useState<string[]>([])
  const releaseRef = useRef<(() => void) | null>(null)

  const stopRecording = useCallback(() => {
    releaseRef.current?.()
    releaseRef.current = null
    setRecording(false)
    setPreview([])
  }, [])

  const startRecording = useCallback(() => {
    if (disabled) return
    releaseRef.current?.()
    releaseRef.current = suspendDispatch()
    setPreview([])
    setRecording(true)
  }, [disabled, suspendDispatch])

  useEffect(() => () => releaseRef.current?.(), [])

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!recording) {
      // Space/Enter opens recording mode, matching native button semantics.
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault()
        startRecording()
      }
      return
    }

    event.preventDefault()
    event.stopPropagation()

    if (isModifierOnlyEvent(event.nativeEvent)) {
      // Show the modifiers as they are held down, but keep waiting for a key.
      setPreview(formatEventModifierParts(event.nativeEvent, isMac))
      return
    }

    const bare = !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey
    if (bare && event.key === 'Escape') {
      stopRecording()
      return
    }
    if (bare && (event.key === 'Backspace' || event.key === 'Delete')) {
      onClear?.()
      stopRecording()
      return
    }

    const chord = chordFromEvent(event.nativeEvent, isMac)
    if (!chord) return
    onChange(chord)
    stopRecording()
  }

  const parts = recording ? preview : formatChordParts(value, isMac)

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled}
      aria-label={ariaLabel ?? 'Change shortcut'}
      className={cn(
        'min-w-[8.5rem] justify-center font-normal',
        recording && 'border-primary ring-2 ring-primary/40',
        className,
      )}
      onClick={() => (recording ? stopRecording() : startRecording())}
      onKeyDown={handleKeyDown}
      onBlur={stopRecording}
    >
      {recording && parts.length === 0
        ? <span className="text-xs text-muted-foreground">Press keys…</span>
        : <Kbd keys={parts} emptyLabel="Not set" />}
    </Button>
  )
}
