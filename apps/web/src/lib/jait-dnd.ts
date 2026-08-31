export const JAIT_FILE_REF_MIME = 'text/jait-file'
export const JAIT_TREE_NODE_MIME = 'text/jait-tree-node'
export const JAIT_TAB_MIME = 'text/jait-tab'
export const JAIT_PROJECT_REF_MIME = 'application/x-jait-project+json'
export const JAIT_TERMINAL_REF_MIME = 'application/x-jait-terminal+json'
export const JAIT_CHAT_REF_MIME = 'application/x-jait-chat+json'

export interface JaitProjectDragPayload {
  path: string
  name: string
}

export interface JaitChatDragPayload {
  sessionId: string
  name: string
}

export interface JaitTerminalDragPayload {
  terminalId: string
  name: string
  projectRoot?: string | null
}

export function buildProjectDragPayload(path: string, name?: string): JaitProjectDragPayload {
  return {
    path,
    name: name || path.split(/[\\/]/).pop() || path,
  }
}

export function buildTerminalDragPayload(
  terminalId: string,
  name?: string,
  projectRoot?: string | null,
): JaitTerminalDragPayload {
  return {
    terminalId,
    name: name || terminalId,
    ...(projectRoot ? { projectRoot } : {}),
  }
}

export function buildChatDragPayload(sessionId: string, name?: string): JaitChatDragPayload {
  return {
    sessionId,
    name: name || sessionId,
  }
}

type DragGhostKind = 'chat' | 'project' | 'folder' | 'terminal' | 'file'

const DRAG_GHOST_ICONS: Record<DragGhostKind, string> = {
  chat:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  project:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>',
  // Same folder glyph — the sidebar uses the icon, not the label, to distinguish.
  folder:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>',
  terminal:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/></svg>',
  file:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>',
}

/** Chip size cap so long chat/project names don't cover half the screen. */
const DRAG_GHOST_MAX_LABEL = 44
const DRAG_GHOST_ANCHOR = 14

/**
 * Show a small "chip" drag image (icon + label) for the given drag. Chat rows
 * get a usable default ghost from the browser, but project/folder rows render
 * an invisible snapshot (transparent grid rows), so we supply one explicitly
 * for every sidebar drag. The element must exist for the synchronous snapshot
 * only; it is removed right after on a 0 ms timer, following the standard
 * Chrome/Firefox/Safari pattern.
 */
export function setDragImageChip(
  dataTransfer: DataTransfer,
  kind: DragGhostKind,
  label: string,
): void {
  try {
    if (!('setDragImage' in dataTransfer)) return
    if (typeof document === 'undefined') return

    const rootStyle = getComputedStyle(document.documentElement)
    const themeColor = (variable: string, fallback: string): string => {
      // Theme variables are HSL triplets (e.g. "210 12% 80%"), consumed as hsl(var(--x)).
      const value = rootStyle.getPropertyValue(variable).trim()
      return value ? `hsl(${value})` : fallback
    }
    const background = themeColor('--popover', 'hsl(210 18% 16%)')
    const border = themeColor('--border', 'hsl(210 12% 34%)')
    const foreground = themeColor('--foreground', 'hsl(210 20% 96%)')

    const chip = document.createElement('div')
    chip.setAttribute('aria-hidden', 'true')
    chip.style.cssText = [
      'position:fixed',
      'left:-10000px',
      'top:0',
      'z-index:-1',
      'pointer-events:none',
      'display:flex',
      'align-items:center',
      'gap:6px',
      'padding:5px 10px',
      'border-radius:8px',
      `border:1px solid ${border}`,
      `background:${background}`,
      `color:${foreground}`,
      'font:500 12px/1.3 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
      'box-shadow:0 6px 16px rgb(0 0 0 / 0.35)',
      'white-space:nowrap',
    ].join(';')

    const icon = document.createElement('span')
    icon.style.cssText =
      'display:flex;align-items:center;flex:none;opacity:0.9;transform:translateY(0.5px)'
    icon.innerHTML = DRAG_GHOST_ICONS[kind] ?? DRAG_GHOST_ICONS.file
    const svg = icon.firstElementChild
    if (svg) {
      svg.setAttribute('width', '13')
      svg.setAttribute('height', '13')
    }

    const text = document.createElement('span')
    const normalized = label.trim() || kind
    text.textContent =
      normalized.length > DRAG_GHOST_MAX_LABEL
        ? `${normalized.slice(0, DRAG_GHOST_MAX_LABEL - 1)}…`
        : normalized
    text.style.color = foreground

    chip.append(icon, text)
    document.body.appendChild(chip)
    dataTransfer.setDragImage(chip, DRAG_GHOST_ANCHOR, DRAG_GHOST_ANCHOR)
    window.setTimeout(() => chip.remove(), 0)
  } catch {
    /* Ghost chip is cosmetic — never let it break the drag itself. */
  }
}
