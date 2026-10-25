// Shared by the in-process Playwright driver and the Node bridge.
const positions = new WeakMap();

function installCursor() {
  const id = '__jait_agent_cursor__';
  if (document.getElementById(id)) return;
  const cursor = document.createElement('div');
  cursor.id = id;
  cursor.setAttribute('aria-hidden', 'true');
  cursor.style.cssText = 'position:fixed;left:0;top:0;width:22px;height:28px;z-index:2147483647;pointer-events:none;display:none;filter:drop-shadow(0 1px 3px #0008)';
  const shadow = cursor.attachShadow({ mode: 'closed' });
  shadow.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="28" viewBox="0 0 22 28"><path d="M2 2v21l5-6 5 9 4-2-5-9h9Z" fill="#2563eb" stroke="white" stroke-width="2"/></svg>';
  document.documentElement.appendChild(cursor);
  document.addEventListener('mousemove', event => {
    cursor.style.display = 'block';
    cursor.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`;
  }, { passive: true });
}

async function clickWithVisibleCursor(page, selector, signal) {
  const checkCancelled = () => {
    if (signal?.aborted) throw new Error('Cancelled');
  };
  checkCancelled();
  if (page.mouse && page.locator) {
    const target = page.locator(selector).first();
    // Preserve Playwright actionability and selector semantics for the actual click.
    await target.waitFor({ state: 'visible', timeout: 30000 });
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    checkCancelled();
    if (box) {
      await page.evaluate(installCursor);
      const start = positions.get(page) || { x: 0, y: 0 };
      const end = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      for (let step = 1; step <= 10; step++) {
        checkCancelled();
        const fraction = step / 10;
        const point = { x: start.x + (end.x - start.x) * fraction, y: start.y + (end.y - start.y) * fraction };
        await page.mouse.move(point.x, point.y);
        positions.set(page, point);
        await new Promise(resolve => setTimeout(resolve, 16));
      }
    }
  }
  checkCancelled();
  await page.click(selector);
}

module.exports = { clickWithVisibleCursor };
