/**
 * Ellipsed list previews for tool result messages.
 *
 * Tool list actions (jait.todos, memory.search, memory.list, reminder.list)
 * used to return count-only messages ("Loaded 5 todos"). The UI renders the
 * tool message, so previews now include an ellipsed list of the found items —
 * full records stay in `result.data` for programmatic use.
 */

/** Maximum characters per preview line before an ellipsis is appended. */
export const PREVIEW_MAX_CHARS = 120;

/** Maximum number of lines rendered inside a preview block. */
export const PREVIEW_MAX_ITEMS = 8;

/** Collapse whitespace/newlines and truncate with an ellipsis. */
export function ellipsizeText(value: string, maxChars: number = PREVIEW_MAX_CHARS): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (maxChars <= 0) return "";
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

/** Join preview lines, appending an "… (+N more)" marker when truncated. */
export function formatEllipsedList(lines: string[], maxItems: number = PREVIEW_MAX_ITEMS): string {
  if (lines.length === 0) return "";
  const count = Math.max(0, Math.floor(maxItems));
  const shown = count === 0 ? [] : lines.slice(0, count);
  const hidden = lines.length - shown.length;
  const parts = [...shown];
  if (hidden > 0) parts.push(`… (+${hidden} more)`);
  return parts.join("\n");
}

/** Combine a summary sentence with an optional ellipsed preview block. */
export function summarizeWithPreview(summary: string, lines: string[], maxItems?: number): string {
  const preview = formatEllipsedList(lines, maxItems);
  return preview ? `${summary}\n${preview}` : summary;
}

/** One "• [id · kind] preview…" line for memory/reminder result previews. */
export function memoryLine(id: string, text: string, kind?: string, extra?: string): string {
  const parts = [id, kind].filter((part): part is string => Boolean(part));
  const suffix = extra ? ` (${extra})` : "";
  return `• [${parts.join(" · ")}] ${ellipsizeText(text)}${suffix}`;
}