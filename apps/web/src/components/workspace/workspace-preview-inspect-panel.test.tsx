import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { WorkspacePreviewInspectPanel, type PreviewInspectRenderState } from './workspace-preview-inspect-panel'

describe('WorkspacePreviewInspectPanel', () => {
  it('renders active element, dialogs, obstruction, and selector diagnostics', () => {
    const inspectState: PreviewInspectRenderState = {
      status: 'ready',
      url: '/api/dev-proxy/4173/',
      snapshot: 'Title: Preview App',
      page: {
        url: 'http://127.0.0.1:4173/',
        title: 'Preview App',
        text: 'Ready',
        elements: [],
        activeElement: {
          role: 'textbox',
          name: 'Email',
          selector: '#email',
        },
        dialogs: [
          {
            title: 'Sign in',
            selector: '[data-testid="login-dialog"]',
          },
        ],
        obstruction: {
          hasModal: true,
          dialogCount: 1,
          activeDialogTitle: 'Sign in',
          topLayer: [],
          notes: ['Top-layer obstruction diagnostics are heuristic.'],
        },
      },
      target: {
        selector: '#submit',
        found: true,
        obscured: true,
        obstructionReason: 'Another element is receiving pointer hits at the target center point.',
        interceptedBy: {
          role: 'dialog',
          selector: '[data-testid="login-dialog"]',
          reason: 'hit-test interceptor',
        },
      },
    }

    const markup = renderToStaticMarkup(
      createElement(WorkspacePreviewInspectPanel, { inspectState }),
    )

    expect(markup).toContain('Preview App')
    expect(markup).toContain('Active Element')
    expect(markup).toContain('textbox - Email')
    expect(markup).toContain('Sign in')
    expect(markup).toContain('Modal: yes')
    expect(markup).toContain('Selector Diagnosis')
    expect(markup).toContain('Obscured: yes')
    expect(markup).toContain('Intercepted by dialog')
  })

  it('renders suppression state', () => {
    const markup = renderToStaticMarkup(
      createElement(WorkspacePreviewInspectPanel, {
        inspectState: {
          status: 'ready',
          url: null,
          page: null,
          snapshot: null,
          captureSuppressed: true,
          suppressionReason: 'Preview capture is suppressed while secret-safe mode is active.',
        },
      }),
    )

    expect(markup).toContain('Preview capture is suppressed while secret-safe mode is active.')
  })
})
