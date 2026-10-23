import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import base from './vite.config'

// Component browser checks need React and their fixture, not App startup or a gateway.
export default defineConfig({
  ...base,
  cacheDir: resolve(__dirname, '../../.jait/artifacts/vite-ui-cache'),
  optimizeDeps: {
    ...base.optimizeDeps,
    entries: [
      'src/e2e-fixtures/chat-column-alignment.tsx',
      'src/e2e-fixtures/chat-loop.tsx',
      'src/e2e-fixtures/email-workspace.tsx',
      'src/e2e-fixtures/browser-controls.tsx',
      'src/e2e-fixtures/messenger-tools.tsx',
      'src/e2e-fixtures/agent-controls.tsx',
      'src/e2e-fixtures/agents-graph-layout.tsx',
      'src/e2e-fixtures/sidebar-overflow.tsx',
      'src/e2e-fixtures/message-attachment-regressions.tsx',
      'src/e2e-fixtures/message-send-status.tsx',
      'src/e2e-fixtures/queue-edit-workspace.tsx',
      'src/e2e-fixtures/queue-selection.tsx',
      'src/e2e-fixtures/queued-attachments.tsx',
      'src/e2e-fixtures/usage-prefetch.tsx',
    ],
    include: ['react', 'react-dom/client', 'react/jsx-runtime'],
  },
  server: { ...base.server, host: '127.0.0.1', port: Number(process.env.PORT ?? 3150), hmr: false },
})
