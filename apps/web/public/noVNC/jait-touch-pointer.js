// Original browser implementation of RustDesk's mobile mouse-mode gestures.
// Behavior reference: rustdesk/rustdesk flutter/lib/common/widgets/remote_input.dart.
// Coordinates passed to noVNC are CSS canvas coordinates; noVNC handles scaling.
export function setupTouchPointer(rfb, screen, button) {
    const canvas = screen.querySelector('canvas');
    if (!canvas || !button) return;
    let mouseMode = true;
    try { mouseMode = localStorage.getItem('jait-vnc-touch-mode') !== 'direct'; } catch { /* private browsing */ }
    let position = null;
    let gesture = null;
    let pressed = false;
    let holdTimer;
    let lastTap = 0;
    const cursor = document.createElement('div');
    cursor.setAttribute('aria-hidden', 'true');
    cursor.dataset.touchCursor = '';
    cursor.style.cssText = 'position:fixed;left:0;top:0;width:20px;height:26px;z-index:19;pointer-events:none;filter:drop-shadow(0 1px 2px #0008)';
    cursor.innerHTML = '<svg viewBox="0 0 20 26" width="20" height="26"><path d="M2 2v20l5-5 4 8 4-2-4-8h7Z" fill="white" stroke="#18181b" stroke-width="2"/></svg>';
    document.body.appendChild(cursor);
    const rect = () => canvas.getBoundingClientRect();
    const show = () => {
        const box = rect();
        if (box.width <= 1 || box.height <= 1) { cursor.hidden = true; return; }
        if (!position) position = { x: box.width / 2, y: box.height / 2 };
        position.x = Math.max(0, Math.min(Math.max(0, box.width - 1), position.x));
        position.y = Math.max(0, Math.min(Math.max(0, box.height - 1), position.y));
        cursor.style.transform = `translate(${box.left + position.x}px, ${box.top + position.y}px)`;
        cursor.hidden = !mouseMode || rfb.viewOnly;
    };
    const send = mask => rfb._handleMouseButton(position.x, position.y, mask);
    const release = () => { if (pressed) { send(0); pressed = false; } };
    const reset = () => { clearTimeout(holdTimer); release(); gesture = null; };
    const click = mask => { send(mask); send(0); };
    const distance = touches => touches.length === 2 ? Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY) : 0;
    const center = touches => Array.from(touches).reduce((sum, touch) => ({ x: sum.x + touch.clientX / touches.length, y: sum.y + touch.clientY / touches.length }), { x: 0, y: 0 });
    const updateMode = () => {
        button.classList.toggle('visible', !rfb.viewOnly);
        button.textContent = mouseMode ? 'Mouse' : 'Touch';
        button.setAttribute('aria-pressed', String(mouseMode));
        button.title = mouseMode
            ? 'Mouse mode: slide to move, tap to click, double-tap and hold to drag, hold or two-finger tap to right-click, two fingers to pan/pinch, three fingers to scroll'
            : 'Direct touch mode: tap where you want to click';
        show();
    };
    button.addEventListener('pointerdown', event => event.preventDefault());
    button.addEventListener('click', () => {
        if (rfb.viewOnly) return;
        reset(); lastTap = 0; mouseMode = !mouseMode;
        try { localStorage.setItem('jait-vnc-touch-mode', mouseMode ? 'mouse' : 'direct'); } catch { /* private browsing */ }
        updateMode();
    });
    const handle = event => {
        if (!mouseMode || rfb.viewOnly) return;
        event.preventDefault();
        event.stopImmediatePropagation(); // Do not also send noVNC direct-touch gestures.
        show();
        if (event.type === 'touchcancel') { reset(); lastTap = 0; return; }
        if (event.type === 'touchstart') {
            const previous = gesture;
            reset();
            const point = center(event.touches);
            gesture = { point, start: point, fingers: Math.max(previous?.fingers || 0, event.touches.length), moved: previous?.moved || false, started: performance.now(), scrollX: 0, scrollY: 0, handled: false, startDistance: distance(event.touches), distance: distance(event.touches) };
            if (event.touches.length === 1) {
                if (performance.now() - lastTap < 300 && lastTap > 0) {
                    pressed = true; send(1); // Second tap can become a held left-button drag.
                } else {
                    holdTimer = setTimeout(() => {
                        if (gesture && !gesture.moved && gesture.fingers === 1) { click(4); gesture.handled = true; }
                    }, 550);
                }
            }
            return;
        }
        if (!gesture) return;
        if (event.type === 'touchmove') {
            const point = center(event.touches);
            const dx = point.x - gesture.point.x, dy = point.y - gesture.point.y;
            const span = distance(event.touches);
            if (Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) > 6 || Math.abs(span - gesture.startDistance) > 6) {
                gesture.moved = true; clearTimeout(holdTimer);
            }
            // Accumulate sub-threshold motion so a slow pinch/pan starts from
            // its original position rather than losing the first few pixels.
            if (!gesture.moved) return;
            if (gesture.fingers === 1 && !gesture.handled) {
                position.x += dx; position.y += dy; show();
                rfb._handleMouseMove(position.x, position.y);
            } else if (gesture.fingers === 2 && event.touches.length === 2 && gesture.moved) {
                // Match RustDesk: two fingers pan/zoom the local view; three scroll the remote page.
                const viewport = rfb._screen;
                const display = rfb._display;
                if (viewport && display) {
                    const before = rect();
                    const oldScale = display.scale;
                    const nextScale = Math.max(0.1, Math.min(5, oldScale * (gesture.distance > 0 ? span / gesture.distance : 1)));
                    const ratio = nextScale / oldScale;
                    if (Math.abs(ratio - 1) > 0.001) {
                        const focalX = gesture.point.x - before.left, focalY = gesture.point.y - before.top;
                        rfb.scaleViewport = false;
                        display.scale = nextScale;
                        const after = rect();
                        viewport.scrollLeft += after.left + focalX * ratio - point.x;
                        viewport.scrollTop += after.top + focalY * ratio - point.y;
                        position.x *= ratio; position.y *= ratio;
                    } else {
                        viewport.scrollLeft -= dx; viewport.scrollTop -= dy;
                    }
                    show();
                }
            } else if (gesture.fingers === 3 && event.touches.length === 3 && gesture.moved) {
                gesture.scrollX += dx; gesture.scrollY += dy;
                for (const [axis, positive, negative] of [['scrollY', 8, 16], ['scrollX', 32, 64]]) {
                    // Limit events per input sample, including malformed synthetic input.
                    let count = 0;
                    while (Math.abs(gesture[axis]) >= 24 && count++ < 8) {
                        const direction = Math.sign(gesture[axis]);
                        click(direction > 0 ? positive : negative); gesture[axis] -= direction * 24;
                    }
                }
            }
            gesture.point = point;
            gesture.distance = span;
            return;
        }
        if (event.type === 'touchend') {
            clearTimeout(holdTimer);
            if (event.touches.length) return; // Wait for all fingers before deciding a tap.
            if (!gesture.moved && !gesture.handled && performance.now() - gesture.started < 550) {
                if (pressed) release(); else if (gesture.fingers <= 2) click(gesture.fingers === 2 ? 4 : 1);
                lastTap = gesture.fingers === 1 ? performance.now() : 0;
            } else lastTap = 0;
            reset();
        }
    };
    for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) {
        canvas.addEventListener(type, handle, { capture: true, passive: false });
    }
    const observer = new ResizeObserver(show);
    observer.observe(canvas);
    window.addEventListener('blur', reset);
    const viewport = rfb._screen;
    viewport?.addEventListener('scroll', show, { passive: true });
    rfb.addEventListener('disconnect', () => {
        reset(); observer.disconnect(); cursor.remove(); button.classList.remove('visible');
        window.removeEventListener('blur', reset);
        viewport?.removeEventListener('scroll', show);
        for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) canvas.removeEventListener(type, handle, true);
    }, { once: true });
    updateMode();
    return { reset: () => { reset(); lastTap = 0; }, update: updateMode };
}
