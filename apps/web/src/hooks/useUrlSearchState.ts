import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { type JaitPageId } from '@jait/shared'
import { parseAppView } from '@/lib/app-view'

const URL_SEARCH_CHANGE = 'jait:url-search-change'

function isCurrentPage(page: JaitPageId): boolean {
  if (typeof window === 'undefined' || !window.location) return false
  const path = window.location.pathname.replace(/^\/+/, '').split('/')[0]
  return (parseAppView(path) ?? (path === '' ? 'chat' : null)) === page
}

/** URL values override local defaults. Edits replace history; navigation restores it. */
export function useUrlSearchState(
  page: JaitPageId,
  key = 'q',
  initialValue: string | (() => string) = '',
): [string, Dispatch<SetStateAction<string>>] {
  const [fallback] = useState(initialValue)
  const read = useCallback(() => {
    if (typeof window === 'undefined' || !isCurrentPage(page)) return fallback
    return new URLSearchParams(window.location.search).get(key) ?? fallback
  }, [page, key, fallback])
  const [value, setValue] = useState(read)
  const valueRef = useRef(value)
  valueRef.current = value

  useEffect(() => {
    const restore = () => {
      if (!isCurrentPage(page)) return
      const next = read()
      valueRef.current = next
      setValue(next)
    }
    restore()
    window.addEventListener('popstate', restore)
    window.addEventListener(URL_SEARCH_CHANGE, restore)
    return () => {
      window.removeEventListener('popstate', restore)
      window.removeEventListener(URL_SEARCH_CHANGE, restore)
    }
  }, [page, read])

  const update = useCallback<Dispatch<SetStateAction<string>>>((nextValue) => {
    const next = typeof nextValue === 'function' ? nextValue(valueRef.current) : nextValue
    valueRef.current = next
    setValue(next)
    if (typeof window === 'undefined' || !isCurrentPage(page)) return
    const url = new URL(window.location.href)
    // Keep an explicit empty value when it must override a saved local default.
    if (next || fallback) url.searchParams.set(key, next)
    else url.searchParams.delete(key)
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
    window.dispatchEvent(new Event(URL_SEARCH_CHANGE))
  }, [page, key, fallback])

  return [value, update]
}
