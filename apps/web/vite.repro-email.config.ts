import path from 'node:path'
import { mergeConfig } from 'vite'
import base from './vite.config'

// Throwaway config used to produce a static build of the email tool card repro
// page, so the mobile card layout can be screenshotted without a dev server.
export default mergeConfig(base, {
  base: './',
  build: {
    outDir: path.resolve(__dirname, '../../.jait/artifacts/email-repro-dist'),
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: path.resolve(__dirname, './email-toolcard-repro.html'),
    },
  },
})
