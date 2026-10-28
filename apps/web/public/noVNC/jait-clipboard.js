// Bridge text clipboard between the local browser and an interactive VNC session.
export function setupClipboard(rfb, target, clipboard = navigator.clipboard) {
    let pastePending = false;
    const onKeyDown = (event) => {
        if (rfb.viewOnly || !event.ctrlKey || event.altKey || event.metaKey || event.code !== 'KeyV') return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.repeat || pastePending) return;
        pastePending = true;
        // Read during the user gesture; send the shortcut only after the server
        // has received the new clipboard contents.
        Promise.resolve().then(() => clipboard?.readText()).then(text => {
            if (rfb.viewOnly) return;
            if (typeof text === 'string') rfb.clipboardPasteFrom(text);
            rfb.sendKey(0xffe3, 'ControlLeft', true);
            rfb.sendKey(0x76, 'KeyV', true);
            rfb.sendKey(0x76, 'KeyV', false);
            rfb.sendKey(0xffe3, 'ControlLeft', false);
        }).catch(() => {
            // Clipboard permission can be denied; preserve remote paste behavior.
            if (!rfb.viewOnly) {
                rfb.sendKey(0xffe3, 'ControlLeft', true);
                rfb.sendKey(0x76, 'KeyV', true);
                rfb.sendKey(0x76, 'KeyV', false);
                rfb.sendKey(0xffe3, 'ControlLeft', false);
            }
        }).finally(() => { pastePending = false; });
    };
    const onKeyUp = event => {
        if (event.code === 'KeyV' && pastePending) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }
    };
    const onClipboard = event => {
        if (!rfb.viewOnly && typeof event.detail?.text === 'string') {
            void clipboard?.writeText(event.detail.text).catch(() => {});
        }
    };
    target.addEventListener('keydown', onKeyDown, true);
    target.addEventListener('keyup', onKeyUp, true);
    rfb.addEventListener('clipboard', onClipboard);
    return () => {
        target.removeEventListener('keydown', onKeyDown, true);
        target.removeEventListener('keyup', onKeyUp, true);
        rfb.removeEventListener('clipboard', onClipboard);
    };
}
