// Bridge text clipboard between the local browser and an interactive VNC session.
// Paste uses the DOM paste event (no permission prompt, works on insecure origins);
// copy prefers the async clipboard API and falls back to execCommand.
function sendRemotePaste(rfb) {
    rfb.sendKey(0xffe3, 'ControlLeft', true);
    rfb.sendKey(0x76, 'KeyV', true);
    rfb.sendKey(0x76, 'KeyV', false);
    rfb.sendKey(0xffe3, 'ControlLeft', false);
}

function legacyCopy(doc, text) {
    if (!doc.body || typeof doc.execCommand !== 'function') return false;
    const area = doc.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
    const active = doc.activeElement;
    doc.body.appendChild(area);
    try {
        area.select();
        return doc.execCommand('copy');
    } catch {
        return false;
    } finally {
        area.remove();
        active?.focus?.({ preventScroll: true });
    }
}

export function setupClipboard(rfb, target, clipboard = globalThis.navigator?.clipboard) {
    const isPasteKey = event => event.ctrlKey && !event.altKey && !event.metaKey && event.code === 'KeyV';
    let pasteKeyDown = false;
    const onKeyDown = (event) => {
        if (rfb.viewOnly || !isPasteKey(event)) return;
        // Keep the shortcut away from the remote and let the browser raise a paste event.
        event.stopImmediatePropagation();
        pasteKeyDown = true;
    };
    const onKeyUp = event => {
        if (event.code === 'KeyV' && pasteKeyDown) {
            event.preventDefault();
            event.stopImmediatePropagation();
            pasteKeyDown = false;
        }
    };
    const onPaste = event => {
        if (rfb.viewOnly) return;
        event.preventDefault();
        const text = event.clipboardData?.getData('text/plain');
        if (text) rfb.clipboardPasteFrom(text);
        sendRemotePaste(rfb);
    };
    const onClipboard = event => {
        const text = event.detail?.text;
        if (rfb.viewOnly || typeof text !== 'string') return;
        const fallback = () => { legacyCopy(target.ownerDocument ?? target, text); };
        if (!clipboard?.writeText) return fallback();
        Promise.resolve().then(() => clipboard.writeText(text)).catch(fallback);
    };
    target.addEventListener('keydown', onKeyDown, true);
    target.addEventListener('keyup', onKeyUp, true);
    target.addEventListener('paste', onPaste, true);
    rfb.addEventListener('clipboard', onClipboard);
    return () => {
        target.removeEventListener('keydown', onKeyDown, true);
        target.removeEventListener('keyup', onKeyUp, true);
        target.removeEventListener('paste', onPaste, true);
        rfb.removeEventListener('clipboard', onClipboard);
    };
}
