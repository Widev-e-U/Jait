import { isValidElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  normalizeSystemNotification,
  revokeSystemNotification,
  setNativeNotificationsEnabled,
  setVisibleNotificationSession,
  triggerSystemNotification,
} from './system-notifications'

const {
  toastInfo,
  toastSuccess,
  toastWarning,
  toastError,
} = vi.hoisted(() => ({
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    info: toastInfo,
    success: toastSuccess,
    warning: toastWarning,
    error: toastError,
  },
}))

class NotificationMock {
  static permission: NotificationPermission = 'default'
  static requestPermission = vi.fn(async () => 'granted' as const)
  static instances: Array<{ title: string; options?: NotificationOptions }> = []
  static live: NotificationMock[] = []

  closed = false
  readonly listeners = new Map<string, () => void>()

  constructor(title: string, options?: NotificationOptions) {
    NotificationMock.instances.push({ title, options })
    NotificationMock.live.push(this)
  }

  addEventListener(event: string, handler: () => void) {
    this.listeners.set(event, handler)
  }

  close() {
    this.closed = true
    this.listeners.get('close')?.()
  }
}

describe('normalizeSystemNotification', () => {
  beforeEach(() => {
    toastInfo.mockReset()
    toastSuccess.mockReset()
    toastWarning.mockReset()
    toastError.mockReset()
    NotificationMock.permission = 'default'
    NotificationMock.requestPermission.mockReset()
    NotificationMock.requestPermission.mockResolvedValue('granted')
    NotificationMock.instances = []
    NotificationMock.live = []
    setNativeNotificationsEnabled(true)
    setVisibleNotificationSession(null)
    vi.stubGlobal('window', {
      Notification: NotificationMock,
      jaitDesktop: undefined,
      Capacitor: undefined,
    } as unknown as Window & typeof globalThis)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses the installed Android bridge when LocalNotifications is absent', async () => {
    const notify = vi.fn(async () => {})
    vi.stubGlobal('window', {
      Capacitor: { Plugins: { AgentOverlay: { notify } } },
    })
    await triggerSystemNotification({ id: 'chat-complete:session:1', title: 'Chat finished', body: 'Done' })
    expect(notify).toHaveBeenCalledWith({ id: 'chat-complete:session:1', title: 'Chat finished', body: 'Done' })
  })

  it('drops notifications with no visible title or body', () => {
    expect(normalizeSystemNotification({
      id: 'notif-1',
      title: '   ',
      body: '  ',
      level: 'error',
    })).toBeNull()
  })

  it('trims visible notification content', () => {
    expect(normalizeSystemNotification({
      id: 'notif-2',
      title: ' Restart failed ',
      body: ' Try again ',
      level: 'error',
    })).toEqual({
      id: 'notif-2',
      title: 'Restart failed',
      body: 'Try again',
      level: 'error',
    })
  })

  it('promotes body to title when title is blank', () => {
    expect(normalizeSystemNotification({
      id: 'notif-3',
      title: '   ',
      body: ' Restart failed ',
      level: 'error',
    })).toEqual({
      id: 'notif-3',
      title: 'Restart failed',
      body: '',
      level: 'error',
    })
  })

  it('keeps showing the toast when the desktop notify bridge rejects', async () => {
    const notify = vi.fn(async () => {
      throw new Error('bridge offline')
    })
    vi.stubGlobal('window', {
      Notification: NotificationMock,
      jaitDesktop: { notify },
      Capacitor: undefined,
    } as unknown as Window & typeof globalThis)

    await expect(triggerSystemNotification({
      id: 'notif-4',
      title: 'Build failed',
      body: 'Retry the preview',
    })).resolves.toBeUndefined()

    expect(notify).toHaveBeenCalledWith({ id: 'notif-4', title: 'Build failed', body: 'Retry the preview' })
    expect(NotificationMock.requestPermission).toHaveBeenCalledTimes(1)
    expect(NotificationMock.instances).toEqual([
      {
        title: 'Build failed',
        options: { body: 'Retry the preview', tag: 'notif-4', icon: '/apple-touch-icon.png', badge: '/favicon-32x32.png' },
      },
    ])
    expect(toastInfo).toHaveBeenCalledWith('Build failed', { description: 'Retry the preview' })
  })

  it('opens a browser notification immediately when permission is already granted', async () => {
    NotificationMock.permission = 'granted'

    await triggerSystemNotification({
      id: 'notif-5',
      title: 'Agent finished',
      body: 'All checks passed',
      level: 'success',
    })

    expect(NotificationMock.requestPermission).not.toHaveBeenCalled()
    expect(NotificationMock.instances).toEqual([
      {
        title: 'Agent finished',
        options: { body: 'All checks passed', tag: 'notif-5', icon: '/apple-touch-icon.png', badge: '/favicon-32x32.png' },
      },
    ])
    expect(toastSuccess).toHaveBeenCalledWith('Agent finished', { description: 'All checks passed' })
  })

  it('drops to an in-app toast when another surface owns the system notification', async () => {
    NotificationMock.permission = 'granted'
    setNativeNotificationsEnabled(false)

    await triggerSystemNotification({
      id: 'notif-6',
      title: 'Approval needed',
      body: 'terminal.run wants to run',
    })

    expect(NotificationMock.instances).toEqual([])
    expect(toastInfo).toHaveBeenCalledWith('Approval needed', { description: 'terminal.run wants to run' })
  })

  it('closes the browser notification when the request is answered elsewhere', async () => {
    NotificationMock.permission = 'granted'

    await triggerSystemNotification({ id: 'consent:req-1', title: 'Approval needed', body: 'Allow?' })
    await revokeSystemNotification('consent:req-1')

    expect(NotificationMock.live.map((instance) => instance.closed)).toEqual([true])
    // Revoking twice is normal (timeout racing an answer) and must stay quiet.
    await expect(revokeSystemNotification('consent:req-1')).resolves.toBeUndefined()
  })

  it('asks the desktop shell to dismiss its keyed notification', async () => {
    const closeNotification = vi.fn(async () => ({ ok: true }))
    vi.stubGlobal('window', {
      Notification: NotificationMock,
      jaitDesktop: { notify: vi.fn(async () => {}), closeNotification },
      Capacitor: undefined,
    } as unknown as Window & typeof globalThis)

    await revokeSystemNotification('question:req-9')

    expect(closeNotification).toHaveBeenCalledWith('question:req-9')
  })
})


it('deduplicates the same completion but replaces the card for the next turn', async () => {
  const notify = vi.fn(async (_input: unknown) => {})
  vi.stubGlobal('window', { jaitDesktop: { notify } })
  try {
    const input = { id: 'completion:dedupe:1', replaceId: 'chat:dedupe', kind: 'completion' as const, sessionId: 'dedupe', title: 'Response ready', body: 'Done', link: '/chat?sessionId=dedupe', includeToast: false }
    await triggerSystemNotification(input)
    await triggerSystemNotification(input)
    await triggerSystemNotification({ ...input, id: 'completion:dedupe:2' })
    expect(notify).toHaveBeenCalledTimes(2)
    expect(notify.mock.calls[1]?.[0]).toMatchObject({ id: 'completion:dedupe:2', replaceId: 'chat:dedupe', link: input.link })
  } finally { vi.unstubAllGlobals() }
})

it('suppresses only the visible focused chat completion', async () => {
  const notify = vi.fn(async (_input: unknown) => {})
  vi.stubGlobal('window', { jaitDesktop: { notify } })
  vi.stubGlobal('document', { visibilityState: 'visible', hasFocus: () => true })
  setVisibleNotificationSession('visible-chat')
  try {
    const input = { id: 'visible:1', kind: 'completion' as const, sessionId: 'visible-chat', title: 'Done', body: 'Result', includeToast: false }
    await triggerSystemNotification(input)
    expect(notify).not.toHaveBeenCalled()
    await triggerSystemNotification({ ...input, id: 'other:1', sessionId: 'other-chat' })
    expect(notify).toHaveBeenCalledOnce()
  } finally { setVisibleNotificationSession(null); vi.unstubAllGlobals() }
})

describe('in-app agent identity fallback', () => {
  const base = {
    id: 'completion:identity:0',
    kind: 'completion' as const,
    sessionId: 'identity',
    title: 'Response ready',
    body: 'Ada finished the refactor',
    level: 'success' as const,
  }

  /** The element the app hands to sonner, rendered to markup so we can read it. */
  function renderedToast(): string {
    const [rendered] = toastSuccess.mock.calls[0] ?? []
    expect(isValidElement(rendered)).toBe(true)
    return renderToStaticMarkup(rendered as ReactElement)
  }

  beforeEach(() => {
    toastInfo.mockReset()
    toastSuccess.mockReset()
    toastWarning.mockReset()
    toastError.mockReset()
    NotificationMock.permission = 'denied'
    NotificationMock.instances = []
    NotificationMock.live = []
    setNativeNotificationsEnabled(true)
    setVisibleNotificationSession(null)
    vi.stubGlobal('window', {
      Notification: NotificationMock,
      jaitDesktop: undefined,
      Capacitor: undefined,
    } as unknown as Window & typeof globalThis)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('draws the originating agent avatar and name in-app when the browser API is denied', async () => {
    await triggerSystemNotification({
      ...base,
      agentId: 'agent-lady-merge-a-lot',
      agentName: 'Lady Merge-a-Lot',
      agentRole: 'Junior Software Engineer',
      agentAvatar: 'Pixel',
    })

    // The OS surface produced nothing, so the in-app toast is the only surface.
    expect(NotificationMock.instances).toEqual([])
    const html = renderedToast()
    expect(html).toContain('agent-creature')
    expect(html).toContain('data-agent-avatar="Pixel"')
    expect(html).toContain('Lady Merge-a-Lot')
    expect(html).toContain('Junior Software Engineer')
  })

  it('falls back in-app on the macOS desktop shell, which only draws the app icon', async () => {
    const notify = vi.fn(async (_input: unknown) => {})
    vi.stubGlobal('window', { jaitDesktop: { notify }, Capacitor: undefined })
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' })

    await triggerSystemNotification({ ...base, id: 'completion:identity:1', agentName: 'Lady Merge-a-Lot', agentAvatar: 'Nova' })

    // The shell still owns the OS notification...
    expect(notify).toHaveBeenCalledOnce()
    // ...and the app compensates with the agent's own avatar.
    const html = renderedToast()
    expect(html).toContain('agent-creature')
    expect(html).toContain('fill="#a78bfa"')
    expect(html).toContain('Lady Merge-a-Lot')
  })

  it('shows identity in-app when another client on this machine owns the OS toast', async () => {
    const notify = vi.fn(async (_input: unknown) => {})
    vi.stubGlobal('window', { jaitDesktop: { notify } })
    setNativeNotificationsEnabled(false)

    await triggerSystemNotification({ ...base, id: 'completion:identity:2', agentName: 'Lady Merge-a-Lot', agentAvatar: 'Pixel' })

    expect(notify).not.toHaveBeenCalled()
    expect(renderedToast()).toContain('Lady Merge-a-Lot')
  })

  it('carries the notification action through the identity fallback', async () => {
    await triggerSystemNotification({ ...base, id: 'completion:identity:3', agentName: 'Ada', link: '/chat?sessionId=identity' })

    expect(renderedToast()).toContain('Open')
  })

  it('keeps the plain text toast byte-identical when no agent identity is present', async () => {
    const notify = vi.fn(async (_input: unknown) => {})
    vi.stubGlobal('window', { jaitDesktop: { notify }, Capacitor: undefined })
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh)' })

    // An id without a name or avatar is not an identity, so this must not take
    // the identity path.
    await triggerSystemNotification({ ...base, id: 'completion:identity:4', agentId: 'agent-1' })

    expect(toastSuccess).toHaveBeenCalledTimes(1)
    expect(toastSuccess.mock.calls[0]?.[0]).toBe('Response ready')
    expect(toastSuccess.mock.calls[0]?.[1]).toEqual({ description: 'Ada finished the refactor' })
  })

  it('leaves the notification text untouched when identity is added', async () => {
    const notify = vi.fn(async (_input: unknown) => {})
    vi.stubGlobal('window', { jaitDesktop: { notify }, Capacitor: undefined })
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh)' })
    const payload = { ...base, title: 'Ticket 2 landed', body: 'Merged the 5-file patch' }

    await triggerSystemNotification({ ...payload, id: 'completion:identity:5a' })
    const plainText = { title: toastSuccess.mock.calls[0]?.[0], description: (toastSuccess.mock.calls[0]?.[1] as { description?: string } | undefined)?.description }

    toastSuccess.mockReset()
    await triggerSystemNotification({ ...payload, id: 'completion:identity:5b', agentName: 'Lady Merge-a-Lot', agentAvatar: 'Pixel' })
    const html = renderedToast()

    // Same words, same order — the identity is added alongside, not instead.
    expect(plainText).toEqual({ title: 'Ticket 2 landed', description: 'Merged the 5-file patch' })
    expect(html).toContain('Ticket 2 landed')
    expect(html).toContain('Merged the 5-file patch')
    expect(html).toContain('Lady Merge-a-Lot')
  })
})
