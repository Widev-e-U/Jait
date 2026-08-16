import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { TrajectoryPanel } from './trajectory-panel'

describe('TrajectoryPanel', () => {
  it('participates in the chat flex layout without claiming the composer height', () => {
    const markup = renderToStaticMarkup(<TrajectoryPanel onClose={() => {}} />)

    expect(markup).toContain('flex flex-1 min-h-0 min-w-0 flex-col')
    expect(markup).toContain('aria-label="Trajectory timeline"')
    expect(markup).not.toContain('flex flex-col h-full')
  })
})
