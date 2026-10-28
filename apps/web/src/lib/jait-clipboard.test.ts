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
        const clipboard = { readText: vi.fn().mockResolvedValue('local text'), writeText: vi.fn().mockResolvedValue() };
        setupClipboard(rfb, target, clipboard);
        const key = new Event('keydown', { cancelable: true });
        Object.assign(key, { ctrlKey: true, altKey: false, metaKey: false, code: 'KeyV', repeat: false });
        target.dispatchEvent(key);
        await vi.waitFor(() => expect(calls).toHaveLength(5));
        expect(key.defaultPrevented).toBe(true);
        expect(calls[0]).toEqual(['clipboard', 'local text']);
        rfb.dispatchEvent(new CustomEvent('clipboard', { detail: { text: 'remote text' } }));
        expect(clipboard.writeText).toHaveBeenCalledWith('remote text');
        rfb.viewOnly = true;
        rfb.dispatchEvent(new CustomEvent('clipboard', { detail: { text: 'private' } }));
        expect(clipboard.writeText).toHaveBeenCalledTimes(1);
    });
});
