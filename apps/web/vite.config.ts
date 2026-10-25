import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const matrixCryptoWasm = path.resolve(path.dirname(require.resolve('@matrix-org/matrix-sdk-crypto-wasm')), 'pkg/matrix_sdk_crypto_wasm_bg.wasm')

const port = Number(process.env.PORT ?? 3000)
const gatewayTarget = process.env.JAIT_GATEWAY_URL ?? 'http://localhost:8000'

export default defineConfig({
  plugins: [react()],
  base: '/',
  // Concurrent acceptance stacks also need independent dependency optimizers.
  cacheDir: process.env.JAIT_E2E_ARTIFACT_DIR
    ? path.resolve(process.env.JAIT_E2E_ARTIFACT_DIR, 'vite-cache')
    : undefined,
  optimizeDeps: { exclude: ['matrix-crypto-wasm-asset', 'matrix-crypto-wasm-asset?url'] },

  build: {
    // Sourcemaps make the production build take hours on this bundle size,
    // so they are opt-in via BUILD_SOURCEMAP=true.
    sourcemap: process.env.BUILD_SOURCEMAP === 'true',
  },
  resolve: {
    dedupe: ['@matrix-org/matrix-sdk-crypto-wasm'],
    alias: [
      { find: /^matrix-crypto-wasm-asset(?:\?url)?$/, replacement: matrixCryptoWasm + '?url' },
      { find: '@', replacement: path.resolve(__dirname, './src') },
    ],
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
      '/preview': {
        target: gatewayTarget,
        changeOrigin: true,
        ws: true,
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
