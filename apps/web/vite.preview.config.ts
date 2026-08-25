import { defineConfig } from 'vite'
import base from './vite.config'

// Preview-only config: bind to all interfaces and disable HMR so the
// sandboxed preview browser (which reaches the host only via the dev-proxy)
// can load the app without a direct websocket to the vite server.
export default defineConfig({
  ...base,
  server: {
    ...base.server,
    host: '0.0.0.0',
    port: 5199,
    strictPort: true,
    hmr: false,
  },
})
