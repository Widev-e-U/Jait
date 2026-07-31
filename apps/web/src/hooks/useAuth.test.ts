import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AuthProvider, useAuth } from './useAuth'

describe('AuthProvider', () => {
  it('shares one auth state across all consumers', () => {
    const observedAuth: ReturnType<typeof useAuth>[] = []

    function Consumer() {
      observedAuth.push(useAuth())
      return null
    }

    renderToStaticMarkup(
      createElement(
        AuthProvider,
        null,
        createElement(Consumer),
        createElement(Consumer),
      ),
    )

    expect(observedAuth).toHaveLength(2)
    expect(observedAuth[0]).toBe(observedAuth[1])
  })
})
