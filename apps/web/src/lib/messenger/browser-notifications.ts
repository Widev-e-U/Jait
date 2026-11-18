/** Service-worker notifications provide action buttons that Notification() cannot expose. */
export async function showMessengerBrowserNotification(input: {
  id: string; title: string; body: string; link: string; markReadLink: string; scope?: string
}): Promise<boolean> {
  if (!navigator.serviceWorker || !('Notification' in window) || Notification.permission !== 'granted') return false
  const registration = await navigator.serviceWorker.register('/messenger-notifications-sw.js', { scope: '/messenger' })
  const worker = registration.active ?? registration.installing ?? registration.waiting
  if (!worker) return false
  if (worker.state !== 'activated') await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => { worker.removeEventListener('statechange', changed); reject(new Error('Notification worker did not activate.')) }, 5000)
    const changed = () => { if (worker.state === 'activated') { clearTimeout(timeout); worker.removeEventListener('statechange', changed); resolve() } }
    worker.addEventListener('statechange', changed)
    changed()
  })
  const clientId = await new Promise<string | undefined>(resolve => {
    const channel = new MessageChannel()
    const finish = (id?: string) => { clearTimeout(timeout); channel.port1.close(); resolve(id) }
    const timeout = setTimeout(() => finish(), 1000)
    channel.port1.onmessage = event => finish(typeof event.data === 'string' ? event.data : undefined)
    worker.postMessage({ type: 'jait-identify-notification-client' }, [channel.port2])
  })
  await registration.showNotification(input.title, {
    body: input.body, tag: input.id, icon: '/apple-touch-icon.png', badge: '/favicon-32x32.png',
    data: { ...input, title: undefined, body: undefined, clientId },
    actions: [{ action: 'mark-read', title: 'Mark as read' }],
  } as NotificationOptions)
  return true
}

export async function closeMessengerBrowserNotification(id: string) {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return
  const registration = await navigator.serviceWorker.getRegistration('/messenger')
  for (const notification of await registration?.getNotifications({ tag: id }) ?? []) notification.close()
}
