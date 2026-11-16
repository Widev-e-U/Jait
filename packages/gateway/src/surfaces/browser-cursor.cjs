// Shared by the in-process Playwright driver and the Node bridge.
function installCursor() {
  const id = '__jait_agent_cursor__';
  if (document.getElementById(id)) return;
  const cursor = document.createElement('div');
  cursor.id = id;
  cursor.setAttribute('aria-hidden', 'true');
  cursor.style.cssText = 'position:fixed;left:0;top:0;width:22px;height:28px;z-index:2147483647;pointer-events:none;display:none;filter:drop-shadow(0 1px 3px #0008);transition:transform 100ms ease-out';
  const shadow = cursor.attachShadow({ mode: 'closed' });
  shadow.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="28" viewBox="0 0 22 28"><path d="M2 2v21l5-6 5 9 4-2-5-9h9Z" fill="#2563eb" stroke="white" stroke-width="2"/></svg>';
  document.documentElement.appendChild(cursor);
}

function updateCursor(point) {
  const cursor = document.getElementById('__jait_agent_cursor__');
  if (!cursor) return;
  cursor.style.display = 'block';
  cursor.style.transform = `translate(${point.x}px, ${point.y}px)`;
}

function matchesGuard(element, guard) {
  const normalize = value => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
  const name = normalize(element.getAttribute('aria-label') ?? element.getAttribute('aria-labelledby')
    ?? element.getAttribute('name') ?? element.getAttribute('title') ?? element.getAttribute('placeholder')
    ?? element.innerText ?? element.textContent ?? '');
  const text = normalize(element.innerText ?? element.textContent ?? '');
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return element.isConnected && window.location.href === guard.documentUrl
    && performance.timeOrigin === guard.documentTimeOrigin
    && element.tagName.toLowerCase() === guard.tagName && name === guard.name && text === guard.text
    && (!guard.inputType || (element.type === guard.inputType && !element.readOnly))
    && (!guard.option || Array.from(element.options || []).some(option => option.value === guard.option.value && normalize(option.textContent) === guard.option.label && !option.disabled && !option.parentElement?.disabled))
    && !element.disabled && element.getAttribute('aria-disabled') !== 'true'
    && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'
    && rect.width > 0 && rect.height > 0;
}

async function clickWithVisibleCursor(page, selector, signal, guard) {
  const checkCancelled = () => {
    if (signal?.aborted) throw new Error('Cancelled');
  };
  checkCancelled();
  let handle;
  try {
    if (guard) {
      if (!page.locator) throw new Error('The browser cannot verify this target.');
      const locator = page.locator(selector);
      if (await locator.count() !== 1) throw new Error('GUARDED_CLICK_TARGET_COUNT');
      handle = await locator.elementHandle();
      if (!handle || !await handle.evaluate(matchesGuard, guard)) throw new Error('GUARDED_CLICK_IDENTITY_MISMATCH');
    }
    if (page.mouse && page.locator) {
      const target = handle || page.locator(selector).first();
      if (!handle) await target.waitFor({ state: 'visible', timeout: 30000 });
      await target.scrollIntoViewIfNeeded();
      const box = await target.boundingBox();
      checkCancelled();
      if (box) {
        await page.evaluate(installCursor);
        const end = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        // Animate the overlay in the page instead of awaiting ten pairs of CDP
        // messages and ten timer delays before every click.
        await page.mouse.move(end.x, end.y);
        await page.evaluate(updateCursor, end);
      }
    }
    checkCancelled();
    if (handle) {
      if (!await handle.evaluate(matchesGuard, guard)) throw new Error('GUARDED_CLICK_IDENTITY_MISMATCH');
      checkCancelled();
      try { await handle.click({ timeout: 3000 }); }
      catch { throw new Error('GUARDED_CLICK_EXECUTION_FAILED'); }
    } else {
      await page.click(selector);
    }
  } finally {
    await handle?.dispose();
  }
}

async function guardedFieldAction(page, selector, value, operation, signal, guard) {
  if (signal?.aborted) throw new Error('Cancelled');
  const locator = page.locator(selector);
  if (await locator.count() !== 1) throw new Error('The browser target is ambiguous or has changed.');
  const handle = await locator.elementHandle();
  try {
    if (!handle || !await handle.evaluate(matchesGuard, guard)) throw new Error('The browser target or page has changed.');
    if (signal?.aborted) throw new Error('Cancelled');
    if (operation === 'fill') await handle.fill(value, { timeout: 3000 });
    else if (operation === 'select') await handle.selectOption(value, { timeout: 3000 });
    else throw new Error('Unsupported field action.');
  } finally { await handle?.dispose(); }
}

module.exports = { clickWithVisibleCursor, guardedFieldAction };
