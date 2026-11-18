import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'

const shotsDir = path.resolve(__dirname, '../../.jait/shots')

type CardBox = { name: string; x: number; y: number; right: number; bottom: number; width: number; height: number }

const graphAgents = [
  { id: 'agent-1', name: 'Nova', role: 'Lead', avatar: 'Nova', reportsToId: null, providerId: 'codex', model: 'model-a' },
  { id: 'agent-2', name: 'Atlas', role: 'Research', avatar: 'Atlas', reportsToId: 'agent-1', providerId: 'codex', model: 'model-a' },
  { id: 'agent-3', name: 'Pixel', role: 'Design', avatar: 'Pixel', reportsToId: 'agent-1', providerId: 'codex', model: 'model-a' },
  { id: 'agent-4', name: 'Orbit', role: 'Ops', avatar: 'Orbit', reportsToId: 'agent-2', providerId: 'codex', model: 'model-a' },
  { id: 'agent-5', name: 'Echo', role: 'Support', avatar: 'Echo', reportsToId: 'agent-3', providerId: 'codex', model: 'model-a' },
]

async function fixture(page: Page) {
  const agents = graphAgents.map((agent) => ({
    ...agent,
    persona: `${agent.name} keeps the team moving`,
    requiresApproval: true, paused: false, skillIds: [], repositoryIds: [], allowedTools: [], usesAllSkills: false,
    schedule: { kind: 'adaptive', rules: '' }, notificationChannels: [], notificationEvents: [], tasks: [],
    updatedAt: '2026-10-13T09:00:00Z',
  }))
  await page.addInitScript(() => { localStorage.setItem('jait-auth-token', 'fixture-token') })
  await page.route('**/api/**', async route => {
    const request = route.request()
    const pathname = new URL(request.url()).pathname
    let json: unknown = {}
    if (pathname === '/api/persona-agents') json = { agents }
    else if (pathname === '/api/threads') json = { threads: [], hasMore: false }
    else if (pathname.endsWith('/runtime')) json = { running: false, startedAt: null }
    else if (pathname === '/api/auth/me') json = { id: 'fixture-user', username: 'Fixture' }
    else if (pathname === '/api/auth/settings') { await route.fulfill({ status: 404, json: {} }); return }
    else if (pathname === '/api/providers') json = { providers: [{ id: 'codex', name: 'Codex', available: true, isAvailable: true, type: 'codex' }], remoteProviders: [] }
    else if (pathname.includes('models')) json = { models: [{ id: 'model-a', name: 'Model A', isDefault: true }, { id: 'model-b', name: 'Model B' }] }
    else if (pathname === '/api/team-rooms') json = { rooms: [] }
    else if (pathname.includes('skills') || pathname.endsWith('/messages')) json = []
    await route.fulfill({ json })
  })
  await page.goto('/agent-continuation.html', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Graph', exact: true }).click()
  await expect(page.getByTestId('agent-graph-node')).toHaveCount(graphAgents.length)
}

/** The graph marks itself solved once the simulation has settled and the cards have been placed. */
async function settle(page: Page) {
  await page.waitForFunction(() => {
    const container = document.querySelector('[aria-label="Agent reporting graph"]')
    const nodes = Array.from(document.querySelectorAll('[data-testid="agent-graph-node"]')) as HTMLElement[]
    return container?.getAttribute('data-graph-layout') === 'solved' && nodes.length > 0
  }, undefined, { timeout: 30000 })
  // The solve pins every card, so two consecutive samples agreeing means nothing can move them again.
  await page.waitForFunction(() => {
    const nodes = Array.from(document.querySelectorAll('[data-testid="agent-graph-node"]')) as HTMLElement[]
    if (nodes.length === 0) return false
    const signature = nodes.map(node => node.style.transform).join('|')
    const store = window as unknown as { __graphSignature?: { value: string; stable: number } }
    const previous = store.__graphSignature
    store.__graphSignature = previous && previous.value === signature ? { value: signature, stable: previous.stable + 1 } : { value: signature, stable: 0 }
    return store.__graphSignature.stable >= 10
  }, undefined, { timeout: 20000 })
}

async function layout(page: Page) {
  return page.evaluate(() => {
    const container = document.querySelector('[aria-label="Agent reporting graph"]')!.getBoundingClientRect()
    const nodes = Array.from(document.querySelectorAll('[data-testid="agent-graph-node"]')) as HTMLElement[]
    return {
      container: { x: container.x, y: container.y, right: container.right, bottom: container.bottom, width: container.width, height: container.height },
      cards: nodes.map(node => {
        const rect = node.getBoundingClientRect()
        const label = node.querySelector('[aria-label^="Open "]')?.getAttribute('aria-label')?.replace(/^Open /, '') ?? 'unknown'
        return { name: label, x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }
      }),
    }
  })
}

function describeLayout(value: { container: { x: number; y: number; width: number; height: number }; cards: CardBox[] }) {
  return `container ${Math.round(value.container.width)}x${Math.round(value.container.height)} @ ${Math.round(value.container.x)},${Math.round(value.container.y)}\n`
    + value.cards.map(card => `  ${card.name}: ${Math.round(card.width)}x${Math.round(card.height)} @ ${Math.round(card.x - value.container.x)},${Math.round(card.y - value.container.y)}`).join('\n')
}

for (const device of [
  { name: 'mobile', viewport: { width: 390, height: 844 }, minVisibleFraction: 0.5 },
  { name: 'desktop', viewport: { width: 1440, height: 900 }, minVisibleFraction: 0.5 },
] as const) {
  test.describe(`${device.name} viewport`, () => {
    test.use({ viewport: device.viewport })

    test(`agent graph keeps every card inside the graph area (${device.name})`, async ({ page }) => {
      await fixture(page)
      await settle(page)
      const value = await layout(page)
      await page.screenshot({ path: path.join(shotsDir, `agents-graph-${device.name}.png`) })

      const { container, cards } = value
      const outside = cards.filter(card =>
        card.x < container.x - 0.5 || card.y < container.y - 0.5 || card.right > container.x + container.width + 0.5 || card.bottom > container.y + container.height + 0.5)
      expect(outside, `cards clipped by the graph area:\n${describeLayout(value)}`).toEqual([])
    })

    test(`agent graph cards do not overlap (${device.name})`, async ({ page }) => {
      await fixture(page)
      await settle(page)
      const value = await layout(page)
      const { cards } = value
      const overlaps: string[] = []
      for (let a = 0; a < cards.length; a += 1) {
        for (let b = a + 1; b < cards.length; b += 1) {
          const horizontal = Math.min(cards[a].right, cards[b].right) - Math.max(cards[a].x, cards[b].x)
          const vertical = Math.min(cards[a].bottom, cards[b].bottom) - Math.max(cards[a].y, cards[b].y)
          if (horizontal > 1 && vertical > 1) overlaps.push(`${cards[a].name}/${cards[b].name} overlap ${Math.round(horizontal)}x${Math.round(vertical)}px`)
        }
      }
      expect(overlaps, `overlapping agent cards:\n${describeLayout(value)}`).toEqual([])
    })

    test(`agent graph spreads cards across the graph area (${device.name})`, async ({ page }) => {
      await fixture(page)
      await settle(page)
      const value = await layout(page)
      const { container, cards } = value
      const spreadX = Math.max(...cards.map(card => card.right)) - Math.min(...cards.map(card => card.x))
      const spreadY = Math.max(...cards.map(card => card.bottom)) - Math.min(...cards.map(card => card.y))
      expect(spreadX, `horizontal spread of the agent cards:\n${describeLayout(value)}`).toBeGreaterThan(container.width * device.minVisibleFraction)
      expect(spreadY, `vertical spread of the agent cards:\n${describeLayout(value)}`).toBeGreaterThan(container.height * device.minVisibleFraction)
    })
  })
}
