#!/usr/bin/env node
// Development entrypoint: anchor runtime state to this checkout, never terminal CWD.
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
if (!process.argv.includes('--project-root')) {
  process.argv.push('--project-root', resolve(dirname(fileURLToPath(import.meta.url)), '..'))
}
await import('../packages/gateway/bin/matrix-stack.mjs')
