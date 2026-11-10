import { useSyncExternalStore } from 'react'

const KEY = 'jait.messenger.list-hidden'
const EVENT = 'jait:messenger-list-hidden'

const read = () => { try { return localStorage.getItem(KEY) === '1' } catch { return false } }

export function setMessengerListHidden(hidden: boolean) {
  try { localStorage.setItem(KEY, hidden ? '1' : '0') } catch { /* The in-memory event still updates open views. */ }
  window.dispatchEvent(new Event(EVENT))
}

const subscribe = (listener: () => void) => {
  window.addEventListener(EVENT, listener)
  window.addEventListener('storage', listener)
  return () => { window.removeEventListener(EVENT, listener); window.removeEventListener('storage', listener) }
}

/** Whether the conversations list is collapsed; shared by the page and the app sidebar button. */
export function useMessengerListHidden() {
  const hidden = useSyncExternalStore(subscribe, read, () => false)
  return [hidden, setMessengerListHidden] as const
}
