/**
 * Server-Sent Event language shared between the gateway and the web client.
 *
 * The gateway emits two kinds of SSE frames:
 *  - chat stream events (per-turn tokens, tool calls, …) delivered to the
 *    `/api/sessions/:sessionId/stream` consumer, and
 *  - trajectory events (`TrajectoryStreamEvent`) delivered to the
 *    `/api/sessions/:sessionId/trajectory` consumer, which wrap an event
 *    payload together with its persisted `log_id` and timestamp.
 */

/** The on-the-wire trajectory envelope emitted by the gateway trajectory SSE endpoint. */
export type TrajectoryStreamEvent = {
  type: "trajectory_event";
  log_id: number;
  ts: number;
  replay: boolean;
  payload: unknown;
};
