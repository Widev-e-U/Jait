import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Minimal throwaway config: builds only the email tool-card repro page so a
// screenshot does not depend on the full app graph (which OOMs / stalls).
export default defineConfig({
  root: __dirname,
  base: './',
  plugins: [react()],
  resolve: {
    alias: [{ find: '@', replacement: path.resolve(__dirname, './src') }],
  },
  build: {
    outDir: '/home/jakob/jait/.jait/artifacts/email-repro-dist',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: { input: path.resolve(__dirname, 'email-toolcard-repro.html') },
  },
})
