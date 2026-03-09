import { useState, useCallback, useEffect } from 'react';
import { getApiUrl } from '@/lib/gateway-url';
const API_URL = getApiUrl();
function authHeaders(token) {
    if (!token)
        return {};
    return { Authorization: `Bearer ${token}` };
}
export function useSessions(token, onLoginRequired) {
    const [sessions, setSessions] = useState([]);
    const [activeSessionId, setActiveSessionId] = useState(null);
    const [loading, setLoading] = useState(true);
    const fetchSessions = useCallback(async () => {
        if (!token) {
            setSessions(prev => prev.length === 0 ? prev : []);
            setActiveSessionId(null);
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const [sessionsRes, lastActiveRes] = await Promise.all([
                fetch(`${API_URL}/api/sessions?status=active`, { headers: authHeaders(token) }),
                fetch(`${API_URL}/api/sessions/last-active`, { headers: authHeaders(token) }),
            ]);
            if (sessionsRes.status === 401 || lastActiveRes.status === 401) {
                onLoginRequired?.();
            }
            if (sessionsRes.ok) {
                const data = (await sessionsRes.json());
                setSessions(data.sessions);
            }
            if (lastActiveRes.ok) {
                const data = (await lastActiveRes.json());
                if (data.session) {
                    setActiveSessionId((prev) => prev ?? data.session.id);
                }
            }
        }
        catch (err) {
            console.error('Failed to fetch sessions:', err);
        }
        finally {
            setLoading(false);
        }
    }, [onLoginRequired, token]);
    const createSession = useCallback(async (name) => {
        if (!token) {
            onLoginRequired?.();
            return null;
        }
        try {
            const res = await fetch(`${API_URL}/api/sessions`, {
                method: 'POST',
                headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name || `Session ${new Date().toLocaleString()}` }),
            });
            if (res.status === 401) {
                onLoginRequired?.();
                return null;
            }
            if (res.ok) {
                const session = (await res.json());
                setSessions((prev) => [session, ...prev]);
                setActiveSessionId(session.id);
                return session;
            }
        }
        catch (err) {
            console.error('Failed to create session:', err);
        }
        return null;
    }, [onLoginRequired, token]);
    const switchSession = useCallback((sessionId) => {
        setActiveSessionId(sessionId);
    }, []);
    const archiveSession = useCallback(async (sessionId) => {
        if (!token) {
            onLoginRequired?.();
            return;
        }
        try {
            const response = await fetch(`${API_URL}/api/sessions/${sessionId}/archive`, {
                method: 'POST',
                headers: authHeaders(token),
            });
            if (response.status === 401) {
                onLoginRequired?.();
                return;
            }
            setSessions((prev) => prev.filter((s) => s.id !== sessionId));
            if (activeSessionId === sessionId) {
                setActiveSessionId(null);
            }
        }
        catch (err) {
            console.error('Failed to archive session:', err);
        }
    }, [activeSessionId, onLoginRequired, token]);
    // Load sessions on mount
    useEffect(() => {
        fetchSessions();
    }, [fetchSessions]);
    return {
        sessions,
        activeSessionId,
        loading,
        fetchSessions,
        createSession,
        switchSession,
        archiveSession,
    };
}
//# sourceMappingURL=useSessions.js.map