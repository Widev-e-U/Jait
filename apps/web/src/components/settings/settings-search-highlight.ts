function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function highlightSearchMatchHtml(text: string, rawQuery: string): string {
  const query = rawQuery.trim()
  if (!query) return escapeHtml(text)

  const normalizedText = text.toLowerCase()
  const normalizedQuery = query.toLowerCase()
  let cursor = 0
  let index = normalizedText.indexOf(normalizedQuery)

  if (index === -1) return escapeHtml(text)

  let html = ''
  while (index !== -1) {
    if (index > cursor) {
      html += escapeHtml(text.slice(cursor, index))
    }

    const end = index + query.length
    html += `<mark class="rounded bg-yellow-200/80 px-0.5 text-inherit dark:bg-yellow-500/30">${escapeHtml(text.slice(index, end))}</mark>`
    cursor = end
    index = normalizedText.indexOf(normalizedQuery, cursor)
  }

  if (cursor < text.length) {
    html += escapeHtml(text.slice(cursor))
  }

  return html
}
