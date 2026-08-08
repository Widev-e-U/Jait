/**
 * The central catalogue of keyboard-driven commands.
 *
 * Adding a shortcut anywhere in the web UI means adding an entry here and
 * registering a handler with `useHotkeyAction(id, fn)`. Defaults live next to
 * the command so the settings screen, the help overlay and the dispatcher all
 * read from one source of truth.
 *
 * Default-binding rules of thumb:
 * - Never use combos browsers reserve and won't let us cancel
 *   (`ctrl+n/t/w`, `ctrl+shift+n/t/w`, `ctrl+1..9`, `ctrl+shift+a`).
 * - `mod` is ⌘ on macOS and Ctrl elsewhere.
 * - View switching uses `alt+<digit>` because `ctrl+<digit>` is tab switching.
 */

import { normalizeChord } from './keys'

export const HOTKEY_CATEGORIES = [
  { id: 'general', label: 'General' },
  { id: 'navigation', label: 'Navigation' },
  { id: 'chat', label: 'Chat' },
  { id: 'workspace', label: 'Workspace' },
  { id: 'voice', label: 'Voice' },
] as const

export type HotkeyCategoryId = (typeof HOTKEY_CATEGORIES)[number]['id']

export interface HotkeyCommandDefinition {
  /** Stable id — persisted in user overrides, never rename without a migration. */
  id: string
  label: string
  description: string
  category: HotkeyCategoryId
  /** Canonical chord, or `null` for a command that ships unbound. */
  defaultBinding: string | null
  /**
   * Fire even while a text field, textarea or rich composer has focus.
   * Off by default so plain typing never triggers commands.
   */
  allowInInput?: boolean
  /** Extra words matched by the settings search box. */
  keywords?: readonly string[]
}

export const HOTKEY_COMMANDS = [
  // ── General ────────────────────────────────────────────────────────────
  {
    id: 'app.settings',
    label: 'Open settings',
    description: 'Jump to the settings page',
    category: 'general',
    defaultBinding: 'mod+,',
    allowInInput: true,
    keywords: ['preferences', 'options', 'config'],
  },
  {
    id: 'app.shortcuts',
    label: 'Keyboard shortcuts',
    description: 'Show the shortcut cheat sheet',
    category: 'general',
    defaultBinding: 'mod+/',
    allowInInput: true,
    keywords: ['help', 'cheat sheet', 'hotkeys'],
  },
  {
    id: 'app.toggleTheme',
    label: 'Toggle light / dark',
    description: 'Switch between the light and dark theme',
    category: 'general',
    defaultBinding: 'mod+shift+l',
    keywords: ['appearance', 'dark mode', 'light mode'],
  },
  {
    id: 'app.toggleDebugPanel',
    label: 'Toggle debug panel',
    description: 'Show or hide the SSE debug panel',
    category: 'general',
    defaultBinding: 'mod+shift+d',
    keywords: ['sse', 'developer', 'diagnostics'],
  },

  // ── Navigation ─────────────────────────────────────────────────────────
  {
    id: 'view.chat',
    label: 'Go to Chat',
    description: 'Open the chat workspace',
    category: 'navigation',
    defaultBinding: 'alt+1',
    allowInInput: true,
  },
  {
    id: 'view.pulls',
    label: 'Go to Pull requests',
    description: 'Open the pull request view',
    category: 'navigation',
    defaultBinding: 'alt+2',
    allowInInput: true,
    keywords: ['pr', 'merge request'],
  },
  {
    id: 'view.todo',
    label: 'Go to Todos',
    description: 'Open the todo view',
    category: 'navigation',
    defaultBinding: 'alt+3',
    allowInInput: true,
    keywords: ['tasks'],
  },
  {
    id: 'view.email',
    label: 'Go to Mail',
    description: 'Open the mail view',
    category: 'navigation',
    defaultBinding: 'alt+4',
    allowInInput: true,
    keywords: ['inbox', 'email'],
  },
  {
    id: 'view.calendar',
    label: 'Go to Calendar',
    description: 'Open the calendar view',
    category: 'navigation',
    defaultBinding: 'alt+5',
    allowInInput: true,
    keywords: ['events', 'agenda'],
  },
  {
    id: 'view.memory',
    label: 'Go to Memory',
    description: 'Open memories and reminders',
    category: 'navigation',
    defaultBinding: 'alt+6',
    allowInInput: true,
    keywords: ['reminders', 'notes'],
  },
  {
    id: 'view.jobs',
    label: 'Go to Jobs',
    description: 'Open scheduled jobs',
    category: 'navigation',
    defaultBinding: 'alt+7',
    allowInInput: true,
    keywords: ['cron', 'schedule'],
  },
  {
    id: 'view.network',
    label: 'Go to Network',
    description: 'Open the network view',
    category: 'navigation',
    defaultBinding: 'alt+8',
    allowInInput: true,
    keywords: ['nodes', 'devices'],
  },

  // ── Chat ───────────────────────────────────────────────────────────────
  {
    id: 'chat.new',
    label: 'New chat',
    description: 'Start a fresh chat session',
    category: 'chat',
    defaultBinding: 'mod+shift+o',
    allowInInput: true,
    keywords: ['session', 'conversation'],
  },
  {
    id: 'chat.newTab',
    label: 'New chat in a tab',
    description: 'Start a new chat in a separate browser tab',
    category: 'chat',
    defaultBinding: 'mod+alt+o',
    allowInInput: true,
  },
  {
    id: 'chat.focusComposer',
    label: 'Focus the composer',
    description: 'Move the caret into the message input',
    category: 'chat',
    defaultBinding: 'shift+escape',
    allowInInput: true,
    keywords: ['input', 'prompt', 'write'],
  },
  {
    id: 'chat.stop',
    label: 'Stop generating',
    description: 'Cancel the in-flight agent response',
    category: 'chat',
    defaultBinding: 'mod+.',
    allowInInput: true,
    keywords: ['cancel', 'abort', 'interrupt'],
  },
  {
    id: 'chat.toggleSidebar',
    label: 'Toggle the sidebar',
    description: 'Show or hide projects and sessions',
    category: 'chat',
    defaultBinding: 'mod+b',
    allowInInput: true,
    keywords: ['sessions', 'projects', 'navigation'],
  },

  // ── Workspace ──────────────────────────────────────────────────────────
  {
    id: 'workspace.toggleTerminal',
    label: 'Toggle the terminal',
    description: 'Show or hide the terminal panel',
    category: 'workspace',
    defaultBinding: 'mod+j',
    allowInInput: true,
    keywords: ['shell', 'console'],
  },
  {
    id: 'workspace.toggleEditor',
    label: 'Toggle the editor',
    description: 'Show or hide the project files and editor',
    category: 'workspace',
    defaultBinding: 'mod+shift+e',
    keywords: ['files', 'explorer', 'code'],
  },
  {
    id: 'workspace.togglePreview',
    label: 'Toggle the dev preview',
    description: 'Show or hide the live preview panel',
    category: 'workspace',
    defaultBinding: 'mod+shift+p',
    keywords: ['browser', 'live'],
  },
  {
    id: 'workspace.toggleArchitecture',
    label: 'Toggle the architecture view',
    description: 'Show or hide the architecture diagram',
    category: 'workspace',
    defaultBinding: 'mod+alt+a',
    keywords: ['diagram', 'graph'],
  },
  {
    id: 'workspace.toggleScreenShare',
    label: 'Toggle screen share',
    description: 'Open or close the screen share window',
    category: 'workspace',
    defaultBinding: 'mod+shift+s',
    keywords: ['cast', 'display'],
  },

  // ── Voice ──────────────────────────────────────────────────────────────
  {
    id: 'voice.toggleRecording',
    label: 'Push to talk',
    description: 'Start or stop voice dictation',
    category: 'voice',
    defaultBinding: 'mod+alt+v',
    allowInInput: true,
    keywords: ['microphone', 'dictate', 'speech'],
  },
] as const satisfies readonly HotkeyCommandDefinition[]

export type HotkeyCommandId = (typeof HOTKEY_COMMANDS)[number]['id']

/** A catalogue entry, with its id narrowed to the known command union. */
export type HotkeyCommand = HotkeyCommandDefinition & { id: HotkeyCommandId }

export type HotkeyBindings = Record<HotkeyCommandId, string | null>

export const HOTKEY_COMMAND_IDS = HOTKEY_COMMANDS.map((command) => command.id) as HotkeyCommandId[]

const COMMANDS_BY_ID = new Map<string, HotkeyCommand>(
  HOTKEY_COMMANDS.map((command) => [command.id, command]),
)

export function getHotkeyCommand(id: string): HotkeyCommand | null {
  return COMMANDS_BY_ID.get(id) ?? null
}

export function isHotkeyCommandId(id: string): id is HotkeyCommandId {
  return COMMANDS_BY_ID.has(id)
}

/** Default bindings, run through {@link normalizeChord} so they stay canonical. */
export const DEFAULT_HOTKEY_BINDINGS: HotkeyBindings = Object.freeze(
  Object.fromEntries(
    HOTKEY_COMMANDS.map((command) => [command.id, normalizeChord(command.defaultBinding)]),
  ),
) as HotkeyBindings

/** Commands of one category, in declaration order. */
export function getCommandsByCategory(category: HotkeyCategoryId): HotkeyCommand[] {
  return HOTKEY_COMMANDS.filter((command) => command.category === category)
}

/** True when any of the command's searchable text contains `query`. */
export function commandMatchesQuery(command: HotkeyCommandDefinition, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  const haystack = [command.label, command.description, command.id, ...(command.keywords ?? [])]
  return haystack.some((term) => term.toLowerCase().includes(needle))
}
