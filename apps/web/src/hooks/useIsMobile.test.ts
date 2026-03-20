import { describe, expect, it } from 'vitest'
import { detectMobileViewport } from '@/lib/device-layout'

function createWindowStub(input: {
  innerWidth: number
  innerHeight: number
  userAgent?: string
  coarsePointer?: boolean
  mobileUAData?: boolean
}): Window {
  const {
    innerWidth,
    innerHeight,
    userAgent = 'Mozilla/5.0',
    coarsePointer = false,
    mobileUAData = false,
  } = input

  return {
    innerWidth,
    innerHeight,
    navigator: {
      userAgent,
      userAgentData: { mobile: mobileUAData },
    },
    matchMedia: (query: string) => ({
      matches: query === '(pointer: coarse)' ? coarsePointer : false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  } as unknown as Window
}

describe('detectMobileViewport', () => {
  it('treats narrow viewports as mobile', () => {
    expect(detectMobileViewport(createWindowStub({ innerWidth: 430, innerHeight: 932 }))).toBe(true)
  })

  it('keeps phones in landscape on the mobile layout', () => {
    expect(detectMobileViewport(createWindowStub({
      innerWidth: 932,
      innerHeight: 430,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
    }))).toBe(true)
  })

  it('treats coarse-pointer tablets as mobile workspaces', () => {
    expect(detectMobileViewport(createWindowStub({
      innerWidth: 1024,
      innerHeight: 768,
      coarsePointer: true,
    }))).toBe(true)
  })

  it('keeps desktop browsers on the desktop layout', () => {
    expect(detectMobileViewport(createWindowStub({
      innerWidth: 1440,
      innerHeight: 900,
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
    }))).toBe(false)
  })
})
