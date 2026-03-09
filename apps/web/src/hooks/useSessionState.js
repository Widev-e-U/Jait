/**
 * useSessionState — Syncs per-session key-value state with the backend.
 *
 * Usage:
 *   const [value, setValue] = useSessionState<MyType>(sessionId, 'workspace.panel')
 *
 * - On mount / sessionId change: fetches value from GET /api/sessions/:id/state?keys=<key>
 * - setValue does an optimistic local update + debounced PATCH to server
 * - Pass `null` to delete the key
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { getApiUrl } from '@/lib/gateway-url';
const API_URL = getApiUrl();
function authHeaders(token) {
    const h = { 'Content-Type': 'application/json' };
    if (token)
        h['Authorization'] = `Bearer ${token}`;
    return h;
}
export function useSessionState(sessionId, key, token) {
    const [value, setValueLocal] = useState(null);
    const [loading, setLoading] = useState(false);
    const debounceRef = useRef(null);
    const latestRef = useRef(null);
    // Fetch on mount / session change
    useEffect(() => {
        if (!sessionId || !token) {
            setValueLocal(null);
            return;
        }
        let cancelled = false;
        setLoading(true);
        fetch(`${API_URL}/api/sessions/${sessionId}/state?keys=${encodeURIComponent(key)}`, {
            headers: authHeaders(token),
        })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
            if (cancelled)
                return;
            const val = data?.[key] ?? null;
            setValueLocal(val);
            latestRef.current = val;
        })
            .catch(() => {
            if (!cancelled)
                setValueLocal(null);
        })
            .finally(() => {
            if (!cancelled)
                setLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [sessionId, key, token]);
    // Setter: optimistic local + debounced PATCH
    const setValue = useCallback((next) => {
        setValueLocal(next);
        latestRef.current = next;
        if (!sessionId || !token)
            return;
        // Debounce writes to avoid rapid-fire PATCHes
        if (debounceRef.current)
            clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            fetch(`${API_URL}/api/sessions/${sessionId}/state`, {
                method: 'PATCH',
                headers: authHeaders(token),
                body: JSON.stringify({ [key]: latestRef.current }),
            }).catch(() => {
                // Silently ignore write failures — local state stays optimistic
            });
        }, 300);
    }, [sessionId, key, token]);
    // Flush on unmount
    useEffect(() => {
        return () => {
            if (debounceRef.current)
                clearTimeout(debounceRef.current);
        };
    }, []);
    return [value, setValue, loading];
}
//# sourceMappingURL=useSessionState.js.map