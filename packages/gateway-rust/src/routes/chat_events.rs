//! Decoupled per-session event subscription: `GET /api/sessions/{id}/stream`.
//!
//! The POST chat response is a one-shot consumer: it exists only while that
//! request is open. A browser tab needs to attach, detach and re-attach to a
//! session independently of any POST, so this module owns the long-lived
//! subscription, `Last-Event-ID` resume, and heartbeats.
//!
//! Ordering contract: subscribe to the live bus first, then replay durable
//! rows, then drop live frames already covered by replay (`log_id <= last`).
//! An event committed during the gap is therefore delivered exactly once.
use super::auth;
use super::chat::{ChatRoutes, owned_session};
use crate::runtime::chat_events::Frame;
use axum::{
    body::Body,
    extract::{Path, State},
    http::{HeaderMap, header},
    response::{IntoResponse, Response},
};
use futures_util::Stream;
use rusqlite::Connection;
use serde_json::{Value, json};
use std::{
    collections::VecDeque,
    convert::Infallible,
    pin::Pin,
    task::{Context, Poll},
};
use tokio::sync::broadcast;
use tokio::time::{Duration, Interval, MissedTickBehavior};

/// Durable replay ceiling per connection. A tab that fell further behind than
/// this is told to reload rather than being fed an unbounded burst.
const MAX_REPLAY_ROWS: usize = 512;
/// Heartbeat keeps intermediaries from closing an idle subscription and lets a
/// client distinguish "no events" from "connection lost".
const HEARTBEAT: Duration = Duration::from_secs(15);
/// Native turn events only. Foreign rows in a shared database are never replayed
/// to a browser through this endpoint.
const EVENT_TYPE: &str = "rust.chat.message";

fn parse_last_event_id(headers: &HeaderMap) -> Option<i64> {
    headers
        .get("last-event-id")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.trim().parse::<i64>().ok())
        .filter(|value| *value >= 0)
}

fn current_log_id(db: &Connection, session: &str) -> rusqlite::Result<i64> {
    db.query_row(
        "SELECT COALESCE(MAX(log_id), 0) FROM session_events WHERE session_id = ?1",
        [session],
        |row| row.get(0),
    )
}

/// Replay committed frames after `after`, in log order, bounded by rows and
/// bytes. The payload envelope is unwrapped so the browser receives the same
/// shape the POST sink emits.
struct Replay {
    frames: Vec<Frame>,
    complete: bool,
}

fn replay(
    db: &Connection,
    session: &str,
    after: i64,
    max_bytes: usize,
) -> rusqlite::Result<Replay> {
    let mut statement = db.prepare(
        "SELECT log_id, payload FROM session_events \
         WHERE session_id = ?1 AND type = ?2 AND log_id > ?3 \
         ORDER BY log_id ASC LIMIT ?4",
    )?;
    let rows = statement.query_map(
        rusqlite::params![session, EVENT_TYPE, after, (MAX_REPLAY_ROWS + 1) as i64],
        |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)),
    )?;
    let mut frames = Vec::new();
    let mut bytes = 0usize;
    let mut complete = true;
    for row in rows {
        if frames.len() == MAX_REPLAY_ROWS {
            complete = false;
            break;
        }
        let (log_id, payload) = row?;
        let envelope: Value = match serde_json::from_str(&payload) {
            Ok(envelope) => envelope,
            Err(_) => {
                complete = false;
                break;
            }
        };
        let event = match envelope.get("event") {
            Some(event) => event.clone(),
            None => {
                complete = false;
                break;
            }
        };
        let data = match serde_json::to_string(&event) {
            Ok(data) => data,
            Err(_) => {
                complete = false;
                break;
            }
        };
        bytes += data.len() + 32;
        if bytes > max_bytes {
            complete = false;
            break;
        }
        frames.push(Frame { log_id, data });
    }
    Ok(Replay { frames, complete })
}

/// Adapt the broadcast receiver (which only exposes `async recv`) into a stream
/// that terminates on `Closed` and surfaces `Lagged` without consuming the
/// receiver, so the subscription can react to lag in `poll_next`.
fn frames_stream(
    receiver: broadcast::Receiver<Frame>,
) -> impl Stream<Item = Result<Frame, broadcast::error::RecvError>> {
    futures_util::stream::unfold(receiver, |mut receiver| async move {
        match receiver.recv().await {
            Ok(frame) => Some((Ok(frame), receiver)),
            Err(broadcast::error::RecvError::Lagged(n)) => {
                Some((Err(broadcast::error::RecvError::Lagged(n)), receiver))
            }
            Err(broadcast::error::RecvError::Closed) => None,
        }
    })
}

struct SessionEventStream {
    receiver: Pin<Box<dyn Stream<Item = Result<Frame, broadcast::error::RecvError>> + Send>>,
    heartbeat: Interval,
    queued: VecDeque<String>,
    last: i64,
    bytes: usize,
    max_bytes: usize,
    done: bool,
}

impl SessionEventStream {
    /// Charge one frame against the connection budget. Exceeding it ends the
    /// subscription with `replay_required` so the client reloads from history
    /// instead of silently missing the tail.
    fn charge(&mut self, frame: String) -> Option<String> {
        self.bytes = self.bytes.saturating_add(frame.len());
        if self.bytes > self.max_bytes {
            self.done = true;
            self.queued.clear();
            return Some("data: {\"type\":\"replay_required\"}\n\n".to_owned());
        }
        Some(frame)
    }
}

impl Stream for SessionEventStream {
    type Item = Result<String, Infallible>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        loop {
            if self.done && self.queued.is_empty() {
                return Poll::Ready(None);
            }
            if let Some(frame) = self.queued.pop_front() {
                if let Some(frame) = self.charge(frame) {
                    return Poll::Ready(Some(Ok(frame)));
                }
                return Poll::Ready(None);
            }
            if self.done {
                return Poll::Ready(None);
            }
            match self.receiver.as_mut().poll_next(cx) {
                Poll::Ready(Some(Ok(Frame { log_id, data }))) => {
                    // Already covered by replay for this connection.
                    if log_id <= self.last {
                        continue;
                    }
                    self.last = log_id;
                    let frame = format!("id: {log_id}\ndata: {data}\n\n");
                    if let Some(frame) = self.charge(frame) {
                        return Poll::Ready(Some(Ok(frame)));
                    }
                    return Poll::Ready(None);
                }
                // The subscriber fell behind the bounded queue. Serving a gap
                // would corrupt the resumed sequence, so the connection ends
                // and the client reloads history.
                Poll::Ready(Some(Err(broadcast::error::RecvError::Lagged(_)))) => {
                    self.done = true;
                    return Poll::Ready(Some(Ok(
                        "data: {\"type\":\"replay_required\"}\n\n".to_owned()
                    )));
                }
                Poll::Ready(Some(Err(broadcast::error::RecvError::Closed))) | Poll::Ready(None) => {
                    return Poll::Ready(None);
                }
                Poll::Pending => match self.heartbeat.poll_tick(cx) {
                    Poll::Ready(_) => {
                        let frame = "data: {\"type\":\"heartbeat\"}\n\n".to_owned();
                        if let Some(frame) = self.charge(frame) {
                            return Poll::Ready(Some(Ok(frame)));
                        }
                        return Poll::Ready(None);
                    }
                    Poll::Pending => return Poll::Pending,
                },
            }
        }
    }
}

pub async fn stream(
    State(state): State<ChatRoutes>,
    Path(session_id): Path<String>,
    headers: HeaderMap,
) -> Response {
    let user = match auth::require_user(&state.auth, &headers).await {
        Ok(user) => user,
        Err(error) => return *error,
    };
    match owned_session(&state, &user.id, &session_id).await {
        Ok(_) => {}
        Err(error) => return *error,
    }
    // Subscribe before replay so nothing committed in between is lost.
    let receiver = match state.events.subscribe(&session_id) {
        Ok(receiver) => receiver,
        Err(_) => return auth::response(503, json!({"error":"STREAM_CAPACITY_UNAVAILABLE"})),
    };
    let resume = parse_last_event_id(&headers);
    let limits = state.limits.clone();
    let session_key = session_id.clone();
    let auth_state = state.auth.clone();
    let bus = state.events.clone();
    let query = session_id.clone();
    let replay_result = auth_state
        .with_database(move |db| {
            let start = match resume {
                Some(start) => start,
                // No resume token: start at the current end, exactly like the
                // seeded counter, so a fresh tab does not re-read history.
                None => current_log_id(db, &query)?,
            };
            let frames = replay(db, &query, start, 512 * 1024)?;
            Ok((start, frames))
        })
        .await;
    let (start, frames) = match replay_result {
        Ok(result) => result,
        Err(_) => {
            bus.unsubscribe(&session_key);
            return auth::internal_error();
        }
    };
    let mut queued = VecDeque::new();
    let mut last = start;
    for Frame { log_id, data } in frames.frames {
        last = log_id;
        queued.push_back(format!("id: {log_id}\ndata: {data}\n\n"));
    }
    if !frames.complete {
        queued.push_back("data: {\"type\":\"replay_required\"}\n\n".to_owned());
    }
    let mut heartbeat =
        tokio::time::interval_at(tokio::time::Instant::now() + HEARTBEAT, HEARTBEAT);
    heartbeat.set_missed_tick_behavior(MissedTickBehavior::Delay);
    let stream = SessionEventStream {
        receiver: Box::pin(frames_stream(receiver)),
        heartbeat,
        queued,
        last,
        bytes: 0,
        max_bytes: limits.stream_bytes,
        done: !frames.complete,
    };
    (
        [
            (header::CONTENT_TYPE, "text/event-stream"),
            (header::CACHE_CONTROL, "no-cache, no-transform"),
            (header::CONTENT_ENCODING, "identity"),
            (header::HeaderName::from_static("x-accel-buffering"), "no"),
        ],
        Body::from_stream(stream),
    )
        .into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn database() -> Connection {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch(
            "CREATE TABLE session_events(session_id TEXT,log_id INTEGER,type TEXT,payload TEXT)",
        )
        .unwrap();
        db
    }
    fn append(db: &Connection, id: i64, payload: &str) {
        db.execute(
            "INSERT INTO session_events VALUES('session',?1,?2,?3)",
            rusqlite::params![id, EVENT_TYPE, payload],
        )
        .unwrap();
    }
    #[test]
    fn replay_never_silently_skips_corrupt_or_oversize_events() {
        for invalid in ["{broken", r#"{"version":1}"#] {
            let db = database();
            append(&db, 1, invalid);
            append(&db, 2, r#"{"event":{"type":"user","content":"later"}}"#);
            let result = replay(&db, "session", 0, 512 * 1024).unwrap();
            assert!(!result.complete);
            assert!(result.frames.is_empty());
        }
        let db = database();
        append(&db, 1, r#"{"event":{"type":"user","content":"large"}}"#);
        let result = replay(&db, "session", 0, 2).unwrap();
        assert!(!result.complete);
        assert!(result.frames.is_empty());
    }
    #[test]
    fn replay_row_ceiling_is_explicit_and_resumable_in_order() {
        let db = database();
        for id in 1..=(MAX_REPLAY_ROWS as i64 + 1) {
            append(&db, id, r#"{"event":{"type":"user","content":"hello"}}"#);
        }
        let result = replay(&db, "session", 0, 512 * 1024).unwrap();
        assert!(!result.complete);
        assert_eq!(result.frames.len(), MAX_REPLAY_ROWS);
        let result = replay(&db, "session", MAX_REPLAY_ROWS as i64, 512 * 1024).unwrap();
        assert!(result.complete);
        assert_eq!(result.frames.len(), 1);
        assert_eq!(result.frames[0].log_id, MAX_REPLAY_ROWS as i64 + 1);
    }
}
