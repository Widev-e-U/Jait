#!/usr/bin/env node
// Copies apps/web/dist → packages/gateway/web-dist so the gateway always
// ships with the latest frontend build, both locally and when published.
import { cpSync, rmSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const src = join(__dirname, '../../../apps/web/dist')
const dest = join(__dirname, '../web-dist')

if (!existsSync(join(src, 'index.html'))) {
  console.error('⚠ apps/web/dist not found — skipping web bundle')
  process.exit(0)
}

rmSync(dest, { recursive: true, force: true })
cpSync(src, dest, { recursive: true })
console.log('✅ Bundled web frontend → packages/gateway/web-dist')
