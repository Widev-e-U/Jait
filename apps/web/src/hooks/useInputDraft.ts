import { useCallback, useRef, useState } from 'react'

export function useInputDraft() {
  const inputValueRef = useRef('')
  const [inputVersion, setInputVersion] = useState(0)
  const [inputSegments, setInputSegments] = useState<unknown[] | undefined>(undefined)

  const setInputValue = useCallback((valOrFn: string | ((prev: string) => string)) => {
    const next = typeof valOrFn === 'function' ? valOrFn(inputValueRef.current) : valOrFn
    inputValueRef.current = next
    setInputVersion((v) => v + 1)
  }, [])

  const handleInputChange = useCallback((text: string) => {
    inputValueRef.current = text
  }, [])

  return {
    inputValueRef,
    inputVersion,
    inputSegments,
    setInputSegments,
    setInputValue,
    handleInputChange,
  }
}
