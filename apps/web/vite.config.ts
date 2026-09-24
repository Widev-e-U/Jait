import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const port = Number(process.env.PORT ?? 3000)
const gatewayTarget = process.env.JAIT_GATEWAY_URL ?? 'http://localhost:8000'

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    // Sourcemaps make the production build take hours on this bundle size,
    // so they are opt-in via BUILD_SOURCEMAP=true.
    sourcemap: process.env.BUILD_SOURCEMAP === 'true',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port,
    strictPort: true,
    allowedHosts: ['host.docker.internal'],
    hmr: {
      clientPort: port,
    },
    proxy: {
      '/api': {
        target: gatewayTarget,
        changeOrigin: true,
      },
      '/health': {
        target: gatewayTarget,
        changeOrigin: true,
      },
      '/ws': {
        target: gatewayTarget,
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
