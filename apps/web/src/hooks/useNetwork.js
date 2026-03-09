import { useState, useCallback, useRef } from 'react';
import { getApiUrl } from '@/lib/gateway-url';
const API_URL = getApiUrl();
// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useNetwork(token) {
    const [interfaces, setInterfaces] = useState([]);
    const [scanResult, setScanResult] = useState(null);
    const [nodes, setNodes] = useState([]);
    const [scanning, setScanning] = useState(false);
    const [error, setError] = useState(null);
    const abortRef = useRef(null);
    const headers = useCallback(() => {
        const h = { 'Content-Type': 'application/json' };
        if (token)
            h['Authorization'] = `Bearer ${token}`;
        return h;
    }, [token]);
    /** Fetch local network interfaces */
    const fetchInterfaces = useCallback(async () => {
        try {
            const res = await fetch(`${API_URL}/api/network/interfaces`, { headers: headers() });
            if (res.ok) {
                const data = await res.json();
                setInterfaces(data.interfaces);
            }
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch interfaces');
        }
    }, [headers]);
    /** Fetch the latest cached scan result (from the scheduled job) */
    const fetchLatestScan = useCallback(async () => {
        try {
            const res = await fetch(`${API_URL}/api/network/scan/latest`, { headers: headers() });
            if (res.ok) {
                const data = await res.json();
                if (data.hosts) {
                    setScanResult(data);
                }
            }
        }
        catch {
            // ignore — no cached scan yet
        }
    }, [headers]);
    /** Run a network scan (ARP + port probe) */
    const scan = useCallback(async (subnet) => {
        setScanning(true);
        setError(null);
        abortRef.current?.abort();
        abortRef.current = new AbortController();
        try {
            const res = await fetch(`${API_URL}/api/network/scan`, {
                method: 'POST',
                headers: headers(),
                body: JSON.stringify({ subnet }),
                signal: abortRef.current.signal,
            });
            if (!res.ok)
                throw new Error(`Scan failed: ${res.status}`);
            const data = await res.json();
            setScanResult(data);
            return data;
        }
        catch (err) {
            if (err.name !== 'AbortError') {
                setError(err instanceof Error ? err.message : 'Scan failed');
            }
            return null;
        }
        finally {
            setScanning(false);
        }
    }, [headers]);
    /** Test SSH connectivity to a host */
    const testSsh = useCallback(async (ip, port = 22) => {
        try {
            const res = await fetch(`${API_URL}/api/network/ssh/test`, {
                method: 'POST',
                headers: headers(),
                body: JSON.stringify({ ip, port }),
            });
            if (!res.ok)
                return null;
            return await res.json();
        }
        catch {
            return null;
        }
    }, [headers]);
    /** Get SSH enable instructions for a platform */
    const getSshEnableInfo = useCallback(async (targetPlatform) => {
        try {
            const res = await fetch(`${API_URL}/api/network/ssh/enable`, {
                method: 'POST',
                headers: headers(),
                body: JSON.stringify({ platform: targetPlatform }),
            });
            if (!res.ok)
                return null;
            return await res.json();
        }
        catch {
            return null;
        }
    }, [headers]);
    /** Deploy gateway to a remote host */
    const deploy = useCallback(async (ip, username, authMethod = 'password') => {
        try {
            const res = await fetch(`${API_URL}/api/network/deploy`, {
                method: 'POST',
                headers: headers(),
                body: JSON.stringify({ ip, username, authMethod }),
            });
            if (!res.ok)
                return null;
            return await res.json();
        }
        catch {
            return null;
        }
    }, [headers]);
    /** Fetch known gateway mesh nodes */
    const fetchNodes = useCallback(async () => {
        try {
            const res = await fetch(`${API_URL}/api/network/nodes`, { headers: headers() });
            if (res.ok) {
                const data = await res.json();
                setNodes(data.nodes);
            }
        }
        catch {
            // ignore
        }
    }, [headers]);
    /** Cancel an ongoing scan */
    const cancelScan = useCallback(() => {
        abortRef.current?.abort();
        setScanning(false);
    }, []);
    return {
        interfaces,
        scanResult,
        nodes,
        scanning,
        error,
        fetchInterfaces,
        fetchLatestScan,
        scan,
        testSsh,
        getSshEnableInfo,
        deploy,
        fetchNodes,
        cancelScan,
    };
}
//# sourceMappingURL=useNetwork.js.map