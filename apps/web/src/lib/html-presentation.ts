/** Reserve the tab during the click, before fetching the authenticated file. */
export async function openHtmlPresentation(path: string, read: () => Promise<string>): Promise<void> {
  const tab = window.open('about:blank', '_blank')
  if (!tab) throw new Error('Allow pop-ups for Jait to open the presentation.')
  tab.opener = null
  tab.document.title = path.split(/[\\/]/).pop() || 'Presentation'
  tab.document.body.textContent = 'Loading presentation…'
  try {
    const content = await read()
    if (tab.closed) return
    const frame = tab.document.createElement('iframe')
    frame.title = 'Presentation'
    // An opaque origin prevents generated scripts accessing Jait credentials.
    frame.setAttribute('sandbox', 'allow-scripts allow-downloads')
    frame.setAttribute('allow', 'fullscreen')
    frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;background:white'
    frame.srcdoc = content
    tab.document.body.replaceChildren(frame)
  } catch (error) {
    if (!tab.closed) tab.document.body.textContent = error instanceof Error ? error.message : 'Failed to open presentation'
    throw error
  }
}
