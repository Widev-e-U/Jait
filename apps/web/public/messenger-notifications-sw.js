/* Notification actions only: no message content, credentials, caching or Matrix traffic here. */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))
self.addEventListener('message', event => {
  if (event.data?.type === 'jait-identify-notification-client') event.ports[0]?.postMessage(event.source?.id)
})
self.addEventListener('notificationclick', event => {
  const data = event.notification.data
  const link = event.action === 'mark-read' ? data?.markReadLink : data?.link
  if (typeof link !== 'string' || !link.startsWith('/messenger?') || /[\\\u0000-\u001f]/.test(link)) return
  const url = new URL(link, self.location.origin)
  if (url.origin !== self.location.origin || url.pathname !== '/messenger') return
  event.notification.close()
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const client = clients.find(client => client.id === data.clientId)
    if (client) {
      // Mark-read must not focus the window: focus could auto-read newer messages too.
      if (event.action !== 'mark-read') await client.focus()
      client.postMessage({ type: 'jait-notification-open', activation: { id: data.id, link, scope: data.scope } })
    } else {
      await self.clients.openWindow(url.href)
    }
  })())
})
