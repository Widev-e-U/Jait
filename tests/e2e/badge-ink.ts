import path from 'node:path'
import { expect, type Locator } from '@playwright/test'

/** Check the painted glyph pixels, not the line boxes around them. */
export async function expectBadgeInkCentered(badge: Locator, kind: 'count' | 'reaction', name: string) {
  const buffer = await badge.screenshot({ path: path.resolve(__dirname, '../../.jait/shots/badge-ink-' + name + '.png'), scale: 'css' })
  const offsets = await badge.page().evaluate(async ({ data, kind }) => {
    const bytes = Uint8Array.from(atob(data), character => character.charCodeAt(0))
    const image = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d')!
    context.drawImage(image, 0, 0)
    const pixels = context.getImageData(0, 0, image.width, image.height).data
    let left = image.width, right = -1, top = image.height, bottom = -1
    for (let y = 1; y < image.height - 1; y++) for (let x = 1; x < image.width - 1; x++) {
      const index = (y * image.width + x) * 4
      const red = pixels[index]!, green = pixels[index + 1]!, blue = pixels[index + 2]!
      const low = Math.min(red, green, blue), high = Math.max(red, green, blue)
      const ink = kind === 'count' ? low > 250 && high - low < 5 : high < 160 || high - low > 60
      if (ink) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y) }
    }
    image.close()
    return { found: right >= left, x: (left + right + 1 - canvas.width) / 2, y: (top + bottom + 1 - canvas.height) / 2 }
  }, { data: buffer.toString('base64'), kind })
  expect(offsets.found).toBe(true)
  // At 1x scale, rasterization and the rounded screenshot crop can differ by one pixel.
  expect(Math.abs(offsets.x)).toBeLessThanOrEqual(1)
  expect(Math.abs(offsets.y)).toBeLessThanOrEqual(1)
}
