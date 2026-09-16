import { test, expect } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Perf budget for the parallel chat panels.
 *
 * Two independent costs are measured in `apps/web/src/repro/parallel-chat-perf-repro.tsx`:
 *
 *  1. `idle-parent-render` — sibling panels are mounted but idle while the
 *     parent App re-renders (one chat streams, another panel mounts, a resize
 *     tick...). The siblings must NOT re-render: their props are unchanged, so
 *     `memo(ParallelChatPanel, areParallelChatPanelPropsEqual)` must bail out.
 *     This is the regression that made the whole app feel laggy with extra
 *     panels open, because every parent render re-rendered every panel with its
 *     full 80-message history.
 *  2. `streaming` — every panel streams concurrently (the worst case the user
 *     hits when several agents answer at once). Commits here are legitimate but
 *     each one must stay cheap.
 *
 * `renders` is the ground truth: a `<Profiler>` still fires `onRender` for a
 * commit in which every descendant bailed out, so its `commits` count cannot
 * distinguish "the panel rendered" from "the parent committed". The repro
 * therefore counts renders inside a memoized wrapper that uses the panel's own
 * comparator; the two control tests below prove those counts are neither stuck
 * at zero nor insensitive to prop churn.
 */

interface PerfEntry { commits: number; duration: number; phases: Record<string, number>; renders: number }
type PerfReport = Record<string, PerfEntry>

const reportDir = resolve(__dirname, '.artifacts')

const PANELS = 3
const HISTORY = 80
const IDLE_PARENT_RENDERS = 120
const STREAM_TOKENS = 60

/** Sibling panels may render at most this often across 120 unrelated parent renders. */
const IDLE_RENDER_BUDGET_PER_PANEL = 2
/** Total panel render time (ms, all commits) the idle scenario may spend per panel. */
const IDLE_DURATION_BUDGET_MS = 10
/** React can commit more than once per streamed token (nested updates). */
const STREAMING_COMMIT_BUDGET_PER_PANEL = STREAM_TOKENS * 2 + 20
const STREAMING_MEAN_COMMIT_BUDGET_MS = 12
/** Any run that re-renders panels this often is unambiguously the regression. */
const CHURN_RENDER_FLOOR = IDLE_PARENT_RENDERS - 20

async function readReport(page: import('@playwright/test').Page): Promise<PerfReport> {
  return JSON.parse(await page.evaluate('Reflect.get(window, "__perfReport")()')) as PerfReport
}

function persist(name: string, report: PerfReport) {
  mkdirSync(reportDir, { recursive: true })
  const path = resolve(reportDir, name)
  writeFileSync(path, JSON.stringify(report, null, 2))
  console.log(`[perf] ${name} -> ${path}\n${JSON.stringify(report, null, 2)}`)
}

async function open(page: import('@playwright/test').Page, query = '') {
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto(`/parallel-chat-perf-repro.html?panels=${PANELS}&history=${HISTORY}${query}`)
  await page.waitForFunction(() => Reflect.get(window, '__panelStreamsReady')?.())
  await expect(page.getByRole('region', { name: 'Secondary chat panel' })).toHaveCount(PANELS)
  // Let history + minimap layout settle before measuring.
  await page.waitForTimeout(600)
}

/** Re-renders the parent with identical panel props, then reads the report. */
async function measureIdle(page: import('@playwright/test').Page, renders: number) {
  await page.evaluate('Reflect.get(window, "__perfReset")()')
  await page.evaluate((frames) => Reflect.get(window, '__forceParentRenders')(frames, 16), renders)
  return readReport(page)
}

test.describe('parallel chat panel perf', () => {
  test('idle sibling panels do not re-render when the parent re-renders', async ({ page }) => {
    await open(page)

    const tick = page.getByRole('button', { name: /Toggle editor fixture/ })
    const tickBefore = await tick.textContent()

    const report = await measureIdle(page, IDLE_PARENT_RENDERS)
    persist('idle-parent-render.json', report)

    // Guard against a vacuous pass: the parent really did re-render.
    await expect(tick).not.toHaveText(tickBefore ?? '')

    for (let id = 1; id <= PANELS; id++) {
      const entry = report[`panel-${id}`]
      expect(entry, `panel-${id} missing from report`).toBeTruthy()
      expect(
        entry.renders,
        `panel-${id} re-rendered ${entry.renders}x for ${IDLE_PARENT_RENDERS} unrelated parent renders`,
      ).toBeLessThanOrEqual(IDLE_RENDER_BUDGET_PER_PANEL)
      expect(
        entry.duration,
        `panel-${id} spent ${entry.duration.toFixed(2)}ms on ${IDLE_PARENT_RENDERS} unrelated parent renders`,
      ).toBeLessThanOrEqual(IDLE_DURATION_BUDGET_MS)
    }

    // Control: the profiler is live and the panels are isolated — streaming into
    // panel-1 commits work in panel-1's subtree while the idle siblings commit
    // nothing at all. (Streamed tokens update a store inside the panel's
    // `useChat` subtree rather than the panel component itself, so `renders` for
    // panel-1 stays 0 here; the render-level liveness control is the next test.)
    await page.evaluate('Reflect.get(window, "__perfReset")()')
    await page.evaluate(() => Reflect.get(window, '__streamPanel')('panel-1', 1, 8))
    await expect(page.getByRole('region', { name: 'Secondary chat panel' }).first()).toContainText('control0')
    const control = await readReport(page)
    expect(control['panel-1']?.commits ?? 0, 'panel-1 should have committed its streamed token').toBeGreaterThan(0)
    for (const sibling of ['panel-2', 'panel-3']) {
      expect(control[sibling]?.commits ?? 0, `${sibling} should not commit for panel-1's token`).toBe(0)
      expect(control[sibling]?.renders ?? 0, `${sibling} should not render for panel-1's token`).toBe(0)
    }
  })

  /**
   * Non-vacuity controls: the idle budget above can only pass if the harness is
   * both connected and sensitive. Each control forces the panels to genuinely
   * re-render — once via live props, once via the pre-fix App's per-render prop
   * churn — and asserts the meter notices.
   */
  test('the idle meter detects live prop changes and pre-fix prop churn', async ({ page }) => {
    await open(page)
    // (a) A prop the panel actually reads changes every frame.
    await page.evaluate('Reflect.get(window, "__perfReset")()')
    await page.evaluate((frames) => Reflect.get(window, '__forceLiveParentRenders')(frames, 16), IDLE_PARENT_RENDERS)
    const live = await readReport(page)
    for (let id = 1; id <= PANELS; id++) {
      const entry = live[`panel-${id}`]
      expect(entry.renders, `live control: panel-${id} should have re-rendered`).toBeGreaterThanOrEqual(CHURN_RENDER_FLOOR)
      expect(entry.duration, `live control: panel-${id} render time should dominate the idle budget`).toBeGreaterThan(
        IDLE_DURATION_BUDGET_MS,
      )
    }

    // (b) The pre-fix App re-created these props on every render. The same
    // parent-only churn that must cost nothing with stable props must now be
    // detected, i.e. the idle assertion is not passing because the meter is dead.
    await open(page, '&unstable=1')
    const churn = await measureIdle(page, IDLE_PARENT_RENDERS)
    persist('unstable-props-control.json', churn)
    for (let id = 1; id <= PANELS; id++) {
      const entry = churn[`panel-${id}`]
      expect(
        entry.renders,
        `churn control: panel-${id} re-rendered ${entry.renders}x — the meter would catch the regression`,
      ).toBeGreaterThanOrEqual(CHURN_RENDER_FLOOR)
    }
  })

  test('all panels streaming concurrently stays within the commit budget', async ({ page }) => {
    await open(page)

    await page.evaluate('Reflect.get(window, "__perfReset")()')
    await page.evaluate((tokens) => Reflect.get(window, '__streamAllPanels')(tokens, 8), STREAM_TOKENS)
    // Wait until every panel shows the final chunk.
    await expect(page.getByRole('region', { name: 'Secondary chat panel' }).last()).toContainText(`chunk${STREAM_TOKENS - 1}`)
    const report = await readReport(page)
    persist('streaming.json', report)

    for (let id = 1; id <= PANELS; id++) {
      const entry = report[`panel-${id}`]
      expect(entry, `panel-${id} should have streamed`).toBeTruthy()
      expect(entry.commits, `panel-${id} over-committed while streaming`).toBeLessThanOrEqual(STREAMING_COMMIT_BUDGET_PER_PANEL)
      const mean = entry.duration / Math.max(entry.commits, 1)
      expect(mean, `panel-${id} mean commit ${mean.toFixed(2)}ms is too slow`).toBeLessThanOrEqual(STREAMING_MEAN_COMMIT_BUDGET_MS)
    }
  })
})
