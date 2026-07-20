export async function copyTextToClipboard(text: string, targetWindow: Window = window): Promise<boolean> {
  try {
    if (targetWindow.navigator.clipboard?.writeText) {
      await targetWindow.navigator.clipboard.writeText(text)
      return true
    }
  } catch {}

  const textarea = targetWindow.document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  textarea.style.pointerEvents = 'none'
  targetWindow.document.body.appendChild(textarea)

  try {
    targetWindow.focus()
    textarea.focus()
    textarea.select()
    return targetWindow.document.execCommand?.('copy') === true
  } catch {
    return false
  } finally {
    textarea.remove()
  }
}
