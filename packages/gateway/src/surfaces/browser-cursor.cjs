// Page scripts shared by the in-process Playwright driver and the Node bridge.
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

// A history entry whose page leaves on its own this soon is a redirect hop.
const HISTORY_BOUNCE_WINDOW_MS = 400;

/**
 * Back/forward like a browser's toolbar buttons instead of one raw history step:
 * skips the blank start entry, entries that show the page already on screen,
 * and redirect hops (sign-in pages, consent screens) that would bounce straight
 * back to where the user was.
 */
async function navigateHistory(page, direction, signal) {
  const checkCancelled = () => {
    if (signal?.aborted) throw new Error('Cancelled');
  };
  const step = direction === 'back' ? -1 : 1;
  checkCancelled();
  let cdp;
  try {
    cdp = await page.context().newCDPSession(page);
  } catch {
    // Not Chromium: fall back to Playwright's single step.
    await (step < 0 ? page.goBack({ waitUntil: 'domcontentloaded', timeout: 30000 }) : page.goForward({ waitUntil: 'domcontentloaded', timeout: 30000 }));
    return;
  }
  // What the user sees; an entry that changes none of it on the same document is a no-op.
  const view = () => page.evaluate(() => [performance.timeOrigin, document.title, Math.round(scrollX), Math.round(scrollY),
    document.body?.innerText.length ?? 0].join('|')).catch(() => '');
  const skip = new Set();
  try {
    for (let hop = 0; hop < 8; hop++) {
      checkCancelled();
      const { currentIndex, entries } = await cdp.send('Page.getNavigationHistory');
      const current = entries[currentIndex];
      let target = currentIndex + step;
      while (entries[target] && (skip.has(entries[target].id) || entries[target].url === current.url)) target += step;
      const entry = entries[target];
      if (!entry || entry.url === 'about:blank') return;
      const before = await view();
      await cdp.send('Page.navigateToHistoryEntry', { entryId: entry.id });
      await page.waitForURL(url => url.href !== current.url, { waitUntil: 'commit', timeout: 30000 });
      await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
      const sameDocument = before !== '' && before.split('|')[0] === String(await page.evaluate(() => performance.timeOrigin).catch(() => ''));
      if (sameDocument) {
        // Give popstate/hashchange handlers a moment to render before comparing.
        await new Promise(resolve => setTimeout(resolve, 150));
        if (await view() === before) { skip.add(entry.id); continue; }
      }
      let bounced = false;
      for (let redirect = 0; redirect < 5; redirect++) {
        const landed = page.url();
        if (!await page.waitForURL(url => url.href !== landed, { waitUntil: 'commit', timeout: HISTORY_BOUNCE_WINDOW_MS }).then(() => true, () => false)) break;
        bounced = true;
        await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
      }
      if (!bounced) return;
      skip.add(entry.id);
    }
  } finally {
    await cdp.detach().catch(() => {});
  }
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
    let opensNewTab = false;
    if (page.mouse && page.locator) {
      const target = handle || page.locator(selector).first();
      // One page round trip scrolls the target into view, draws the agent
      // cursor at its center and reports whether the click opens a new tab.
      let prepared = await target.evaluate(prepareCursorClick);
      if (!handle && !prepared.point) {
        // Present but not rendered yet: wait until it shows, then draw the cursor.
        await target.waitFor({ state: 'visible', timeout: 30000 });
        prepared = await target.evaluate(prepareCursorClick);
      }
      checkCancelled();
      opensNewTab = prepared.opensNewTab;
      // page.click moves the pointer itself. Guarded clicks move first so the
      // identity re-check below also covers changes made during the move.
      if (handle && prepared.point) await page.mouse.move(prepared.point.x, prepared.point.y);
    }
    checkCancelled();
    // Links with target=_blank open a tab asynchronously. Wait for it so the
    // agent's next call already runs in the tab the user sees.
    const context = opensNewTab && typeof page.context === 'function' ? page.context() : null;
    const popup = context?.waitForEvent ? context.waitForEvent('page', { timeout: 5000 }).catch(() => null) : null;
    if (handle) {
      if (!await handle.evaluate(matchesGuard, guard)) throw new Error('GUARDED_CLICK_IDENTITY_MISMATCH');
      checkCancelled();
      try { await handle.click({ timeout: 3000 }); }
      catch { throw new Error('GUARDED_CLICK_EXECUTION_FAILED'); }
    } else {
      await page.click(selector);
    }
    const newPage = await popup;
    await newPage?.waitForLoadState?.('domcontentloaded', { timeout: 10000 }).catch(() => {});
  } finally {
    await handle?.dispose();
  }
}

// Runs in the page against the click target. Self-contained: Playwright
// serializes it, so it must not reference module scope.
function prepareCursorClick(element) {
  const rect = element.getBoundingClientRect();
  if (rect.bottom < 0 || rect.right < 0 || rect.top > innerHeight || rect.left > innerWidth
    || rect.top < 0 || rect.left < 0 || rect.bottom > innerHeight || rect.right > innerWidth) {
    element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
  }
  const box = element.getBoundingClientRect();
  let point = null;
  if (box.width > 0 && box.height > 0) {
    point = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    const id = '__jait_agent_cursor__';
    let cursor = document.getElementById(id);
    if (!cursor) {
      cursor = document.createElement('div');
      cursor.id = id;
      cursor.setAttribute('aria-hidden', 'true');
      cursor.style.cssText = 'position:fixed;left:0;top:0;width:22px;height:28px;z-index:2147483647;pointer-events:none;display:none;filter:drop-shadow(0 1px 3px #0008);transition:transform 100ms ease-out';
      const shadow = cursor.attachShadow({ mode: 'closed' });
      shadow.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="28" viewBox="0 0 22 28"><path d="M2 2v21l5-6 5 9 4-2-5-9h9Z" fill="#2563eb" stroke="white" stroke-width="2"/></svg>';
      document.documentElement.appendChild(cursor);
    }
    cursor.style.display = 'block';
    cursor.style.transform = `translate(${point.x}px, ${point.y}px)`;
  }
  const opensTab = target => {
    const name = String(target || '').trim().toLowerCase();
    return name !== '' && name !== '_self' && name !== '_parent' && name !== '_top'
      && !Array.from(document.querySelectorAll('iframe[name], frame[name]')).some(frame => frame.name.toLowerCase() === name);
  };
  const link = element.closest('a[href][target], area[href][target]');
  const submitter = element.closest('button, input[type="submit"], input[type="image"]');
  const form = submitter && (submitter.type === 'submit' || submitter.type === 'image') ? submitter.form : null;
  const opensNewTab = Boolean(link && opensTab(link.getAttribute('target')))
    || Boolean(form && opensTab(submitter.getAttribute('formtarget') ?? form.getAttribute('target')));
  return { point, opensNewTab };
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

// Page-side snapshot collector shared by the in-process Playwright driver and
// the Node bridge. Playwright serializes this function into the page, so it
// must stay self-contained (no references to module scope).
//
// Cost matters: agents capture a snapshot after every action. The collector
// therefore avoids whole-document style scans: interactive candidates stop at
// the element cap, visibility uses the native checkVisibility() when present,
// and overlay detection hit-tests a viewport grid instead of calling
// getComputedStyle() on every element in <body>.
function collectPageSnapshot(requestedTarget) {
  const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  const title = document.title || "(untitled)";
  const esc = (raw) => {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(raw);
    return String(raw ?? "").replace(/[^a-zA-Z0-9_-]/g, "_");
  };
  const isVisible = (el) => {
    if (!el || !(el instanceof Element)) return false;
    const rect = el.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) return false;
    if (typeof el.checkVisibility === "function") {
      if (!el.checkVisibility({ visibilityProperty: true })) return false;
      return window.getComputedStyle(el).opacity !== "0";
    }
    const style = window.getComputedStyle(el);
    return !(style.display === "none" || style.visibility === "hidden" || style.opacity === "0");
  };
  const guessRole = (el, tag) =>
    el.getAttribute("role")
    ?? (tag === "a" ? "link" : tag === "textarea" ? "textbox" : tag === "input" ? (el.type === "checkbox" ? "checkbox" : "textbox") : tag);
  // innerText lays out the subtree, so read it at most once per element.
  const getName = (el, inner) => normalize(
    el.getAttribute("aria-label")
      ?? el.getAttribute("aria-labelledby")
      ?? el.getAttribute("name")
      ?? el.getAttribute("title")
      ?? el.getAttribute("placeholder")
      ?? (inner !== undefined ? inner : el.innerText ?? el.textContent)
      ?? "",
  ).slice(0, 200);
  const buildSelectors = (el, tag, role, name) => {
    const suggestions = [];
    const push = (kind, value, selector) => {
      if (!value || !selector || suggestions.some((item) => item.selector === selector)) return;
      suggestions.push({ kind, value: normalize(value).slice(0, 200), selector });
    };
    const id = el.getAttribute("id");
    const testId = el.getAttribute("data-testid");
    const placeholder = el.getAttribute("placeholder");
    const fieldName = el.getAttribute("name");
    if (role && name) push("role", `${role}:${name}`, `role=${role}[name="${name.replace(/"/g, '\\"')}"]`);
    if (fieldName) push("name", fieldName, `${tag}[name="${fieldName.replace(/"/g, '\\"')}"]`);
    if (placeholder) push("placeholder", placeholder, `${tag}[placeholder=${esc(placeholder)}]`);
    if (testId) push("testId", testId, `[data-testid="${testId.replace(/"/g, '\\"')}"]`);
    if (id) push("id", id, `#${esc(id)}`);
    const css = id
      ? `#${esc(id)}`
      : testId
        ? `${tag}[data-testid="${testId.replace(/"/g, '\\"')}"]`
        : `${tag}${fieldName ? `[name="${fieldName.replace(/"/g, '\\"')}"]` : ""}`;
    push("css", css, css);
    return suggestions;
  };
  const serializeElement = (el) => {
    const tag = el.tagName.toLowerCase();
    const role = guessRole(el, tag);
    const inner = el.innerText ?? el.textContent ?? "";
    const name = getName(el, inner);
    const text = normalize(inner).slice(0, 200);
    const id = el.getAttribute("id") ?? undefined;
    const testId = el.getAttribute("data-testid") ?? undefined;
    const placeholder = el.getAttribute("placeholder") ?? undefined;
    const selectors = buildSelectors(el, tag, role, name);
    const selectedValue = tag === "select"
      ? normalize(Array.from(el.selectedOptions ?? []).map((option) => option.textContent ?? option.value ?? "").join(", ")).slice(0, 200)
      : role === "tab" || role === "radio" || role === "checkbox"
        ? String(el.getAttribute("aria-selected") === "true" || el.getAttribute("aria-checked") === "true" || el.checked === true)
        : undefined;
    return {
      role,
      name,
      text,
      selector: (tag === "textarea" ? selectors.find(item => item.kind === "id") ?? selectors.find(item => item.kind === "placeholder") ?? selectors.find(item => item.kind === "name") : undefined)?.selector ?? selectors[0]?.selector ?? undefined,
      selectors,
      tagName: tag,
      placeholder,
      testId,
      id,
      disabled: el.disabled === true || el.getAttribute("aria-disabled") === "true",
      selected: el.selected === true || el.checked === true || el.getAttribute("aria-selected") === "true",
      active: document.activeElement === el,
      value: selectedValue,
      inputType: tag === "input" ? String(el.type ?? "text").toLowerCase() : undefined,
      readOnly: el.readOnly === true,
      options: tag === "select" ? Array.from(el.options ?? []).slice(0, 30).map((option) => ({ value: String(option.value).slice(0, 200), label: normalize(option.textContent ?? "").slice(0, 200), disabled: option.disabled === true || option.parentElement?.disabled === true })) : undefined,
    };
  };

  const normalizeMatch = (value) => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
  const intent = requestedTarget === undefined ? "" : ` ${normalizeMatch(requestedTarget)} `;
  const clickRoles = new Set(["button", "link", "checkbox", "radio", "menuitem", "menuitemcheckbox", "menuitemradio", "switch", "tab"]);
  const matchesTarget = (el) => {
    if (el.disabled === true || el.getAttribute("aria-disabled") === "true") return false;
    const tag = el.tagName.toLowerCase();
    const role = guessRole(el, tag).toLowerCase();
    if (!(clickRoles.has(role) || tag === "button" || tag === "a")) return false;
    const rawLabel = getName(el) || normalize(el.innerText ?? el.textContent ?? "").slice(0, 200);
    if (rawLabel.length >= 200) return false;
    const label = normalizeMatch(rawLabel);
    return Boolean(label && intent.includes(` ${label} `));
  };
  const limit = requestedTarget === undefined ? 60 : 32;
  const elements = [];
  // Stop at the cap: large pages can hold tens of thousands of candidates.
  for (const el of document.querySelectorAll("a, button, input, textarea, select, [role], [onclick], [tabindex]")) {
    if (elements.length >= limit) break;
    if (requestedTarget !== undefined && !matchesTarget(el)) continue;
    if (!isVisible(el)) continue;
    elements.push(serializeElement(el));
  }
  if (requestedTarget !== undefined) return { url: window.location.href, documentTimeOrigin: performance.timeOrigin, title, text: "", elements };

  const bodyText = normalize(document.body?.innerText ?? "").slice(0, 12000);
  const activeElement = document.activeElement && document.activeElement !== document.body
    ? {
      ...serializeElement(document.activeElement),
      type: document.activeElement.getAttribute("type") ?? undefined,
      readOnly: document.activeElement.readOnly === true,
      isContentEditable: document.activeElement.isContentEditable === true,
    }
    : null;
  // A <dialog> opened with showModal() blocks the page like aria-modal does.
  const isModalDialog = (el) => {
    if (el.tagName !== "DIALOG") return false;
    try { return el.matches(":modal"); } catch { return false; }
  };
  const dialogs = Array.from(document.querySelectorAll("dialog[open], [role='dialog'], [role='alertdialog'], [aria-modal='true']"))
    .filter((el) => isVisible(el))
    .slice(0, 10)
    .map((el) => ({
      ...serializeElement(el),
      title: normalize(
        el.getAttribute("aria-label")
          ?? document.getElementById(el.getAttribute("aria-labelledby") ?? "")?.textContent
          ?? el.querySelector("h1, h2, h3, [data-dialog-title]")?.textContent
          ?? el.innerText
          ?? "",
      ).slice(0, 200),
      ariaModal: el.getAttribute("aria-modal") === "true" || isModalDialog(el),
      open: el.hasAttribute("open") || el.getAttribute("aria-hidden") !== "true",
    }));

  // Large fixed/sticky layers (at least 35% x 20% of the viewport) always
  // cover a point of this grid, so hit-testing it finds every candidate that
  // can intercept clicks without scanning the whole document.
  const minWidth = window.innerWidth * 0.35;
  const minHeight = window.innerHeight * 0.2;
  const layerCandidates = new Set();
  const checked = new Set();
  if (window.innerWidth > 0 && window.innerHeight > 0 && typeof document.elementsFromPoint === "function") {
    for (const fx of [0.02, 0.2, 0.4, 0.6, 0.8, 0.98]) {
      for (const fy of [0.01, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 0.99]) {
        for (const hit of document.elementsFromPoint(window.innerWidth * fx, window.innerHeight * fy)) {
          for (let el = hit; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
            if (checked.has(el)) break;
            checked.add(el);
            const style = window.getComputedStyle(el);
            if (style.position !== "fixed" && style.position !== "sticky") continue;
            if (style.pointerEvents === "none") continue;
            const rect = el.getBoundingClientRect();
            if (rect.width >= minWidth && rect.height >= minHeight && isVisible(el)) layerCandidates.add(el);
          }
        }
      }
    }
  }
  const dialogSelectors = new Set(dialogs.map((dialog) => dialog.selector));
  const topLayer = Array.from(layerCandidates)
    .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
    .slice(0, 6)
    .map((el) => {
      const serialized = serializeElement(el);
      return {
        ...serialized,
        reason: dialogSelectors.has(serialized.selector) ? "open dialog" : "fixed or sticky overlay",
        zIndex: Number.parseInt(window.getComputedStyle(el).zIndex || "0", 10) || 0,
      };
    });

  return {
    url: window.location.href,
    documentTimeOrigin: performance.timeOrigin,
    scrollPosition: { x: window.scrollX, y: window.scrollY, height: window.innerHeight },
    title,
    text: bodyText,
    elements,
    visualContent: {
      canvas: Array.from(document.querySelectorAll("canvas")).some(isVisible),
      iframe: Array.from(document.querySelectorAll("iframe")).some(isVisible),
    },
    activeElement,
    dialogs,
    obstruction: {
      hasModal: dialogs.some((dialog) => dialog.ariaModal),
      dialogCount: dialogs.length,
      activeDialogTitle: dialogs[0]?.title ?? null,
      topLayer,
      notes: [
        dialogs.length > 0 ? `${dialogs.length} dialog(s) visible.` : "No visible dialogs detected.",
        topLayer.length > 0
          ? "Top-layer obstruction diagnostics are heuristic and should be confirmed with a hit test when an action fails."
          : "No likely top-layer blockers detected from static DOM inspection.",
      ],
    },
  };
}

module.exports = { clickWithVisibleCursor, guardedFieldAction, collectPageSnapshot, navigateHistory };
