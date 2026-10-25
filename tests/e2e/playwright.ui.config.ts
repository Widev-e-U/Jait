import { defineConfig } from '@playwright/test'
import { resolve } from 'node:path'
import base from './playwright.config'

const frontend = process.env.UI_FRONTEND_URL || 'http://127.0.0.1:3150'

// Only fixtures with local state or mocked APIs belong here. Full-app tests keep
// the gateway-backed config and its single-worker default.
export default defineConfig({
  ...base,
  globalSetup: undefined,
  testMatch: [
    'message-links.spec.ts',
    'tool-results.spec.ts',
    'chat-loop.spec.ts',
    'email-workspace.spec.ts',
    'browser-controls.spec.ts',
    'browser-control-transition.spec.ts',
    'chat-browser.spec.ts',
    'browser-mobile-input.spec.ts',
    'browser-handoff.spec.ts',
    'composer-prompts.spec.ts',
    'messenger-tools.spec.ts',
    'messenger-list.spec.ts',
    'agent-controls.spec.ts',
    'agents-graph-layout.spec.ts',
    'sidebar-overflow.spec.ts',
    'message-attachment-regressions.spec.ts',
    'message-send-status.spec.ts',
    'queue-edit-workspace.spec.ts',
    'queue-selection.spec.ts',
    'queued-attachments.spec.ts',
    'usage-prefetch.spec.ts',
    'chat-column-alignment.spec.ts',
    'conversation-bottom-scroll.spec.ts',
    'conversation-edit-scroll.spec.ts',
  ],
  workers: process.env.PLAYWRIGHT_WORKERS ? Number(process.env.PLAYWRIGHT_WORKERS) : 2,
  use: { ...base.use, baseURL: frontend },
  webServer: {
    command: 'bunx vite --config vite.fixtures.config.ts',
    cwd: resolve(__dirname, '../../apps/web'),
    env: { PORT: String(new URL(frontend).port || 3150) },
    url: `${frontend}/src/e2e-fixtures/index.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
})
