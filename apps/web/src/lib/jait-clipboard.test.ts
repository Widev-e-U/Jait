// @ts-nocheck
import { describe, it, expect, vi } from 'vitest';
import { setupClipboard } from '../../public/noVNC/jait-clipboard.js';

describe('VNC clipboard bridge', () => {
    it('sends clipboard before the remote paste shortcut and receives copied text', async () => {
        const target = new EventTarget();
        const rfb = new EventTarget();
        rfb.viewOnly = false;
        const calls = [];
        rfb.clipboardPasteFrom = text => calls.push(['clipboard', text]);
        rfb.sendKey = (key, code, down) => calls.push([code, down]);
        const clipboard = { writeText: vi.fn().mockResolvedValue() };
        setupClipboard(rfb, target, clipboard);
        const key = new Event('keydown', { cancelable: true });
        Object.assign(key, { ctrlKey: true, altKey: false, metaKey: false, code: 'KeyV', repeat: false });
        target.dispatchEvent(key);
        // The key itself is withheld from the remote until the paste event arrives.
        expect(calls).toHaveLength(0);
        expect(key.defaultPrevented).toBe(false);
        const paste = new Event('paste', { cancelable: true });
        paste.clipboardData = { getData: () => 'local text' };
        target.dispatchEvent(paste);
        expect(paste.defaultPrevented).toBe(true);
        expect(calls).toHaveLength(5);
        expect(calls[0]).toEqual(['clipboard', 'local text']);
        rfb.dispatchEvent(new CustomEvent('clipboard', { detail: { text: 'remote text' } }));
        await vi.waitFor(() => expect(clipboard.writeText).toHaveBeenCalledWith('remote text'));
        rfb.viewOnly = true;
        rfb.dispatchEvent(new CustomEvent('clipboard', { detail: { text: 'private' } }));
        expect(clipboard.writeText).toHaveBeenCalledTimes(1);
    });
});
