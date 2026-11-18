import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfigFromFile } from 'vite'
import { expect, it } from 'vitest'

it('loads the maintained Vite config for default frontend builds', async () => {
  const webRoot = fileURLToPath(new URL('../..', import.meta.url))
  const loaded = await loadConfigFromFile({ command: 'build', mode: 'production' }, undefined, webRoot)

  expect(loaded?.path).toBe(resolve(webRoot, 'vite.config.ts'))
})
