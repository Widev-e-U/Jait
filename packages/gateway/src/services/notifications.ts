/**
 * NotificationService — broadcasts notifications to all connected clients.
 *
 * Sends a WS "notification" event that each client handles according to
 * its platform:
 *   - Electron desktop → native toast via desktop:notify IPC
 *   - Web browser → Notification API (with permission)
 *   - Android/Capacitor → local notification plugin
 *
 * Notifications are fire-and-forget; the gateway doesn't track delivery.
 * All supervision happens in real-time via connected clients.
 */

import type { WsControlPlane } from "../ws.js";
import type { WsEventType } from "@jait/shared";

export type NotificationLevel = "info" | "success" | "warning" | "error";

export interface JaitNotification {
  /** Unique ID for deduplication on the client */
  id: string;
  /** Notification title (short) */
  title: string;
  /** Notification body (detail) */
  body: string;
  /** Severity level */
  level: NotificationLevel;
  /** Optional deep-link path within the Jait UI (e.g. "/plans/abc123") */
  link?: string;
  /** ISO timestamp */
  timestamp: string;
}

/** Extra delivery path for notifications, e.g. a messaging channel. */
export type NotificationSink = (notification: JaitNotification) => void;

export class NotificationService {
  private sinks: NotificationSink[] = [];

  constructor(private ws: WsControlPlane) {}

  /**
   * Register an additional delivery path. Used to forward notifications to
   * messaging channels the user opted in (Settings → Channels), so alerts
   * reach a phone that has no Jait client open.
   */
  addSink(sink: NotificationSink): () => void {
    this.sinks.push(sink);
    return () => { this.sinks = this.sinks.filter((candidate) => candidate !== sink); };
  }

  /**
   * Send a notification to all connected clients.
   */
  send(notification: Omit<JaitNotification, "timestamp">): void {
    const payload: JaitNotification = {
      ...notification,
      timestamp: new Date().toISOString(),
    };

    this.ws.broadcastAll({
      type: "notification" as WsEventType,
      sessionId: "",
      timestamp: payload.timestamp,
      payload,
    });

    // Sinks are best-effort: a broken channel must not swallow the broadcast
    // that already went out to connected clients.
    for (const sink of this.sinks) {
      try { sink(payload); } catch { /* delivery is fire-and-forget */ }
    }
  }

  /** Shorthand for info-level notifications */
  info(title: string, body: string, link?: string): void {
    this.send({ id: `notif-${Date.now()}`, title, body, level: "info", link });
  }

  /** Shorthand for success-level notifications */
  success(title: string, body: string, link?: string): void {
    this.send({ id: `notif-${Date.now()}`, title, body, level: "success", link });
  }

  /** Shorthand for warning-level notifications */
  warning(title: string, body: string, link?: string): void {
    this.send({ id: `notif-${Date.now()}`, title, body, level: "warning", link });
  }

  /** Shorthand for error-level notifications */
  error(title: string, body: string, link?: string): void {
    this.send({ id: `notif-${Date.now()}`, title, body, level: "error", link });
  }
}
