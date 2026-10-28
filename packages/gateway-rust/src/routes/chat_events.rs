//! Decoupled per-session event subscription at `/events` and `/stream`.
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
use crate::runtime::chat_events::{Frame, Message};
use axum::{
    body::Body,
    extract::{Path, State},
    http::{HeaderMap, header},
    response::{IntoResponse, Response},
};
use futures_util::{Stream, StreamExt};
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
/// Only durable UI stream frames are replayed; model history has a separate format.
const EVENT_TYPE: &str = "rust.chat.stream";

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
/// bytes. Stored payloads are UI frames, separate from model history.
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
    // A cursor from another session or a reset database cannot safely resume:
    // accepting it would silently discard all live frames until IDs catch up.
    if after > current_log_id(db, session)? {
        return Ok(Replay {
            frames: Vec::new(),
            complete: false,
        });
    }
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
        let mut event: Value = match serde_json::from_str(&payload) {
            Ok(event) => event,
            Err(_) => {
                complete = false;
                break;
            }
        };
        if !event.is_object() || !event.get("type").is_some_and(Value::is_string) {
            complete = false;
            break;
        }
        // The UI avoids repeating turn-end effects for historical frames.
        if let Some(object) = event.as_object_mut() {
            object.insert("replay".into(), Value::Bool(true));
        }
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

// Authority is checked on the database worker at replay and before each
// emitted item. Errors fail closed. The check is the delivery authorization
// point; bytes already yielded to the HTTP stack cannot be recalled.
fn is_owner(db: &Connection, session: &str, owner: &str) -> rusqlite::Result<bool> {
    db.query_row(
        "SELECT EXISTS(SELECT 1 FROM sessions WHERE id=?1 AND user_id=?2 AND status='active')",
        rusqlite::params![session, owner],
        |row| row.get(0),
    )
}

fn authorized_stream<S>(
    stream: S,
    auth: auth::AuthState,
    session: String,
    owner: String,
) -> impl Stream<Item = Result<String, Infallible>> + Send
where
    S: Stream<Item = Result<String, Infallible>> + Send + Unpin + 'static,
{
    futures_util::stream::unfold(
        (stream, auth, session, owner),
        |(mut stream, auth, session, owner)| async move {
            let item = stream.next().await?;
            let query_session = session.clone();
            let query_owner = owner.clone();
            let authorized = auth
                .with_database(move |db| Ok(is_owner(db, &query_session, &query_owner)?))
                .await
                .unwrap_or(false);
            if authorized {
                Some((item, (stream, auth, session, owner)))
            } else {
                None
            }
        },
    )
}

/// Adapt the broadcast receiver (which only exposes `async recv`) into a stream
/// that terminates on `Closed` and surfaces `Lagged` without consuming the
/// receiver, so the subscription can react to lag in `poll_next`.
fn frames_stream(
    receiver: broadcast::Receiver<Message>,
) -> impl Stream<Item = Result<Message, broadcast::error::RecvError>> {
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
    receiver: Pin<Box<dyn Stream<Item = Result<Message, broadcast::error::RecvError>> + Send>>,
    heartbeat: Interval,
    owner: String,
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
                Poll::Ready(Some(Ok(Message::Durable(Frame { log_id, data })))) => {
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
                Poll::Ready(Some(Ok(Message::Failure { owner, data }))) => {
                    if owner != self.owner {
                        continue;
                    }
                    let frame = format!("data: {data}\n\n");
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
    let (receiver, failure) = match state.events.subscribe(&session_id, &user.id) {
        Ok(result) => result,
        Err(_) => return auth::response(503, json!({"error":"STREAM_CAPACITY_UNAVAILABLE"})),
    };
    let resume = parse_last_event_id(&headers);
    let limits = state.limits.clone();
    let session_key = session_id.clone();
    let auth_state = state.auth.clone();
    let bus = state.events.clone();
    let query = session_id.clone();
    let owner = user.id.clone();
    let replay_result = auth_state
        .with_database(move |db| {
            // Read authority and replay from one SQLite snapshot, including
            // when another connection transfers the session concurrently.
            let snapshot = db.unchecked_transaction()?;
            if !is_owner(&snapshot, &query, &owner)? {
                return Ok(None);
            }
            let start = match resume {
                Some(start) => start,
                // No resume token: start at the current end, exactly like the
                // seeded counter, so a fresh tab does not re-read history.
                None => current_log_id(&snapshot, &query)?,
            };
            let frames = replay(&snapshot, &query, start, 512 * 1024)?;
            snapshot.commit()?;
            Ok(Some((start, frames)))
        })
        .await;
    let (start, frames) = match replay_result {
        Ok(Some(result)) => result,
        Ok(None) => {
            drop(receiver);
            bus.unsubscribe(&session_key);
            return auth::response(404, json!({"error":"SESSION_NOT_FOUND"}));
        }
        Err(_) => {
            drop(receiver);
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
    if frames.complete {
        if let Some(data) = failure {
            queued.push_back(format!("data: {data}\n\n"));
        }
    }
    let mut heartbeat =
        tokio::time::interval_at(tokio::time::Instant::now() + HEARTBEAT, HEARTBEAT);
    heartbeat.set_missed_tick_behavior(MissedTickBehavior::Delay);
    let stream = SessionEventStream {
        receiver: Box::pin(frames_stream(receiver)),
        heartbeat,
        owner: user.id.clone(),
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
        Body::from_stream(authorized_stream(
            stream,
            state.auth.clone(),
            session_id,
            user.id,
        )),
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
    fn authority_database() -> auth::AuthState {
        let db = database();
        db.execute_batch("CREATE TABLE sessions(id TEXT, user_id TEXT, status TEXT); INSERT INTO sessions VALUES('session','owner','active')").unwrap();
        auth::AuthState::new(
            db,
            "test-secret-that-is-long-enough-for-authentication".into(),
        )
        .unwrap()
    }

    #[tokio::test]
    async fn transfer_revokes_queued_and_live_delivery() {
        let auth = authority_database();
        let (sender, receiver) = broadcast::channel(8);
        let heartbeat =
            tokio::time::interval_at(tokio::time::Instant::now() + HEARTBEAT, HEARTBEAT);
        let inner = SessionEventStream {
            receiver: Box::pin(frames_stream(receiver)),
            heartbeat,
            owner: "owner".into(),
            queued: VecDeque::from(["replay one".into(), "replay two".into()]),
            last: 2,
            bytes: 0,
            max_bytes: 4096,
            done: false,
        };
        let stream = authorized_stream(inner, auth.clone(), "session".into(), "owner".into());
        futures_util::pin_mut!(stream);
        assert_eq!(stream.next().await.unwrap().unwrap(), "replay one");
        auth.with_database(|db| {
            db.execute(
                "UPDATE sessions SET user_id='new-owner' WHERE id='session'",
                [],
            )?;
            Ok(())
        })
        .await
        .unwrap();
        sender
            .send(Message::Durable(Frame {
                log_id: 3,
                data: "live".into(),
            }))
            .unwrap();
        assert!(stream.next().await.is_none());
    }

    #[tokio::test]
    async fn transfer_while_live_frame_waits_ends_subscription() {
        let auth = authority_database();
        let (sender, receiver) = broadcast::channel(8);
        let heartbeat =
            tokio::time::interval_at(tokio::time::Instant::now() + HEARTBEAT, HEARTBEAT);
        let inner = SessionEventStream {
            receiver: Box::pin(frames_stream(receiver)),
            heartbeat,
            owner: "owner".into(),
            queued: VecDeque::new(),
            last: 0,
            bytes: 0,
            max_bytes: 4096,
            done: false,
        };
        let stream = authorized_stream(inner, auth.clone(), "session".into(), "owner".into());
        futures_util::pin_mut!(stream);
        assert!(futures_util::poll!(stream.next()).is_pending());
        auth.with_database(|db| {
            db.execute(
                "UPDATE sessions SET user_id='new-owner' WHERE id='session'",
                [],
            )?;
            Ok(())
        })
        .await
        .unwrap();
        sender
            .send(Message::Durable(Frame {
                log_id: 1,
                data: "secret".into(),
            }))
            .unwrap();
        assert!(stream.next().await.is_none());
    }

    #[tokio::test]
    async fn authority_check_rejects_transfer_and_inactive_session() {
        let auth = authority_database();
        assert!(
            auth.with_database(|db| Ok(is_owner(db, "session", "owner")?))
                .await
                .unwrap()
        );
        auth.with_database(|db| {
            db.execute(
                "UPDATE sessions SET user_id='new-owner' WHERE id='session'",
                [],
            )?;
            Ok(())
        })
        .await
        .unwrap();
        assert!(
            !auth
                .with_database(|db| Ok(is_owner(db, "session", "owner")?))
                .await
                .unwrap()
        );
        assert!(
            auth.with_database(|db| Ok(is_owner(db, "session", "new-owner")?))
                .await
                .unwrap()
        );
        auth.with_database(|db| {
            db.execute(
                "UPDATE sessions SET status='archived' WHERE id='session'",
                [],
            )?;
            Ok(())
        })
        .await
        .unwrap();
        assert!(
            !auth
                .with_database(|db| Ok(is_owner(db, "session", "new-owner")?))
                .await
                .unwrap()
        );
    }

    #[test]
    fn replay_never_silently_skips_corrupt_or_oversize_events() {
        for invalid in ["{broken", r#"{"version":1}"#] {
            let db = database();
            append(&db, 1, invalid);
            append(&db, 2, r#"{"type":"token","content":"later"}"#);
            let result = replay(&db, "session", 0, 512 * 1024).unwrap();
            assert!(!result.complete);
            assert!(result.frames.is_empty());
        }
        let db = database();
        append(&db, 1, r#"{"type":"token","content":"large"}"#);
        let result = replay(&db, "session", 0, 2).unwrap();
        assert!(!result.complete);
        assert!(result.frames.is_empty());
    }
    #[test]
    fn future_cursor_requires_recovery_instead_of_dropping_live_events() {
        let db = database();
        append(&db, 1, r#"{"type":"token","content":"hello"}"#);
        let result = replay(&db, "session", 2, 512 * 1024).unwrap();
        assert!(!result.complete);
        assert!(result.frames.is_empty());
        assert!(replay(&db, "session", 1, 512 * 1024).unwrap().complete);
    }

    #[test]
    fn replay_returns_stream_frames_and_excludes_history() {
        let db = database();
        db.execute(
            "INSERT INTO session_events VALUES('session',1,'rust.chat.message',?1)",
            [r#"{"event":{"type":"user"}}"#],
        )
        .unwrap();
        append(&db, 2, r#"{"type":"token","content":"hello"}"#);
        let result = replay(&db, "session", 0, 512 * 1024).unwrap();
        assert!(result.complete);
        assert_eq!(result.frames.len(), 1);
        assert_eq!(result.frames[0].log_id, 2);
        let value: Value = serde_json::from_str(&result.frames[0].data).unwrap();
        assert_eq!(value["type"], "token");
        assert_eq!(value["content"], "hello");
        assert_eq!(value["replay"], true);
    }
    #[test]
    fn replay_row_ceiling_is_explicit_and_resumable_in_order() {
        let db = database();
        for id in 1..=(MAX_REPLAY_ROWS as i64 + 1) {
            append(&db, id, r#"{"type":"token","content":"hello"}"#);
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
