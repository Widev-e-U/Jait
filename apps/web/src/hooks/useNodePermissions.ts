import { useCallback, useEffect, useRef, useState } from "react";
import {
  NODE_CAPABILITIES,
  type NodeCapability,
  type NodeWithPermissions,
} from "@jait/shared";
import { getWsUrl } from "@/lib/gateway-url";

const WS_URL = getWsUrl();

export interface NodePermissionsSnapshot {
  nodes: NodeWithPermissions[];
}

export interface NodePermissionsApi {
  /** Registered nodes with their capability grants (id, name, platform, online, firstSeenAt, permissions). */
  nodes: NodeWithPermissions[];
  /** True until the first snapshot has been received from the gateway. */
  loading: boolean;
  /** Connection/load error, if any. */
  error: string | null;
  /** True while a save is in flight (until the next snapshot arrives). */
  saving: boolean;
  /** Error from the most recent save, if any. */
  saveError: string | null;
  /** Send a fresh `nodes.list` request to the gateway. */
  refresh: () => void;
  /** Send `nodes.update-permissions` for a node. Resolved once the gateway broadcasts the new snapshot. */
  updatePermissions: (nodeId: string, grants: Partial<Record<NodeCapability, boolean>>) => void;
}

/**
 * Self-contained gateway WS client for node permission management. It opens its
 * own WebSocket (authenticated with the app token), requests `nodes.list`, and
 * consumes the `nodes.permissions` snapshots the gateway broadcasts on every
 * change. This keeps the settings tab decoupled from the chat automation WS.
 */
export function useNodePermissions(token: string | null): NodePermissionsApi {
  const [nodes, setNodes] = useState<NodeWithPermissions[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const requestList = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "nodes.list" }));
    }
  }, []);

  useEffect(() => {
    if (!token) return;

    let mounted = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (!mounted) return;
      const ws = new WebSocket(`${WS_URL}?token=${token}`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (wsRef.current === ws) requestList();
      };

      ws.onmessage = (event) => {
        let msg: { type?: string; payload?: unknown };
        try {
          msg = JSON.parse(event.data) as { type?: string; payload?: unknown };
        } catch {
          return;
        }
        if (msg.type === "nodes.permissions") {
          const snapshot = (msg.payload ?? {}) as NodePermissionsSnapshot;
          if (!mounted) return;
          setNodes(snapshot.nodes ?? []);
          setLoading(false);
          setSaving(false);
          setError(null);
        } else if (msg.type === "error") {
          const payload = (msg.payload ?? {}) as { message?: string; code?: string };
          const message = payload.message ?? "Gateway returned an error.";
          if (mounted) {
            setSaveError(message);
            setSaving(false);
          }
        }
      };

      ws.onerror = () => {
        if (!mounted) return;
        setError("Failed to reach the gateway for node permissions.");
      };

      ws.onclose = () => {
        if (!mounted) return;
        wsRef.current = null;
        // Keep trying while mounted (e.g. the gateway restarted).
        reconnectTimer = setTimeout(connect, 2500);
      };
    };

    connect();

    return () => {
      mounted = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [token, requestList]);

  const updatePermissions = useCallback(
    (nodeId: string, grants: Partial<Record<NodeCapability, boolean>>) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        setSaveError("Gateway connection is not open yet. Try again in a moment.");
        return;
      }
      setSaveError(null);
      setSaving(true);
      ws.send(JSON.stringify({ type: "nodes.update-permissions", nodeId, grants }));
    },
    [],
  );

  return {
    nodes,
    loading,
    error,
    saving,
    saveError,
    refresh: requestList,
    updatePermissions,
  };
}

export { NODE_CAPABILITIES };
