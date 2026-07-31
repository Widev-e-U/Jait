import { describe, expect, it } from 'vitest'
import { APP_VIEWS, appViewToPath, parseAppView } from './app-view'

describe('parseAppView', () => {
  it('accepts every canonical view', () => {
    for (const view of APP_VIEWS) {
      expect(parseAppView(view)).toBe(view)
    }
  })

  it('maps the legacy "reminders" alias to "memory"', () => {
    expect(parseAppView('reminders')).toBe('memory')
  })

  it('maps the plural "emails" alias to "email"', () => {
    expect(parseAppView('emails')).toBe('email')
  })

  it('returns null for unknown segments', () => {
    expect(parseAppView('')).toBeNull()
    expect(parseAppView('bogus')).toBeNull()
    expect(parseAppView('Chat')).toBeNull()
  })
})

describe('appViewToPath', () => {
  it('roots the chat view', () => {
    expect(appViewToPath('chat')).toBe('/')
  })

  it('uses the public email route', () => {
    expect(appViewToPath('email')).toBe('/emails')
  })

  it('uses the calendar route', () => {
    expect(appViewToPath('calendar')).toBe('/calendar')
  })

  it('prefixes other views with a slash', () => {
    expect(appViewToPath('settings')).toBe('/settings')
    expect(appViewToPath('memory')).toBe('/memory')
  })
})
