//! Native port of the HTTP surface in `packages/gateway/src/routes/team-chat.ts`.
//!
//! The TypeScript handler registers four Fastify routes plus a per-delivery
//! dispatcher. The dispatcher drives the model turn (`/api/threads/:id/start`
//! injection, worktree preparation, halt assertions) and therefore belongs to
//! the execution runtime, not to the transport layer; it is intentionally not
//! ported here. The deterministic request handlers implement:
//! status codes, response bodies, zod-style request validation and the two
//! distinct error renderings the TS code uses (`String(error)` on room
//! creation, which yields an `Error: ` prefix, versus `error.message` on
//! message posting, which does not).
//!
//! Vectors in `tests/contract/tests/native_team_chat_parity.rs` come from
//! `.jait/artifacts/gateway-rust/team-chat-w2/probe_team_chat.ts`, which calls
//! the real TypeScript handler through the driver harness.

use crate::services::team_chat::{CreateRoomInput, PostInput, TeamChatService, TeamSender};
use serde_json::{Value, json};

/// Minimal authenticated principal (`requireAuth` in the TS code).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthUser {
    pub id: String,
    pub username: String,
}

/// Transport-neutral route result.
#[derive(Debug, Clone, PartialEq)]
pub struct RouteResponse {
    pub status: u16,
    pub body: Value,
}

impl RouteResponse {
    pub fn ok(body: Value) -> RouteResponse {
        RouteResponse { status: 200, body }
    }

    pub fn created(body: Value) -> RouteResponse {
        RouteResponse { status: 201, body }
    }

    pub fn error(status: u16, message: &str) -> RouteResponse {
        RouteResponse {
            status,
            body: json!({ "error": message }),
        }
    }
}

const MESSAGE_KINDS: [&str; 8] = [
    "discussion",
    "assignment",
    "question",
    "review",
    "result",
    "verification",
    "blocked",
    "relay",
];

fn str_field<'v>(body: &'v Value, key: &str) -> Option<&'v str> {
    body.get(key).and_then(Value::as_str)
}

/// `z.string().trim().min(1).max(100)`
fn valid_room_name(value: &str) -> bool {
    let trimmed = value.trim();
    !trimmed.is_empty() && trimmed.encode_utf16().count() <= 100
}

/// `z.array(z.string().min(1)).min(1).max(50)`
fn valid_member_ids(value: Option<&Value>) -> Option<Vec<String>> {
    let items = value?.as_array()?;
    if items.is_empty() || items.len() > 50 {
        return None;
    }
    let mut ids = Vec::with_capacity(items.len());
    for item in items {
        let id = item.as_str()?;
        if id.is_empty() {
            return None;
        }
        ids.push(id.to_string());
    }
    Some(ids)
}

/// `postSchema` from the TS route.
fn parse_post_body(body: &Value) -> Result<PostInput, ()> {
    let Some(object) = body.as_object() else {
        return Err(());
    };
    let content = str_field(body, "content").ok_or(())?;
    let content = content.trim();
    if content.is_empty() || content.encode_utf16().count() > 20_000 {
        return Err(());
    }
    let client_key = str_field(body, "clientKey").ok_or(())?;
    if client_key.is_empty() || client_key.encode_utf16().count() > 200 {
        return Err(());
    }
    let attachments = match object.get("attachments") {
        None => None,
        Some(value) => {
            let items = value.as_array().ok_or(())?;
            if items.len() > 10 {
                return Err(());
            }
            for item in items {
                let file = item.as_object().ok_or(())?;
                let name = file.get("name").and_then(Value::as_str).ok_or(())?;
                let mime = file.get("mimeType").and_then(Value::as_str).ok_or(())?;
                let data = file.get("data").and_then(Value::as_str).ok_or(())?;
                if name.encode_utf16().count() > 500
                    || mime.encode_utf16().count() > 200
                    || data.encode_utf16().count() > 8_000_000
                {
                    return Err(());
                }
            }
            Some(value.clone())
        }
    };
    let recipient_ids = match object.get("recipientIds") {
        None => None,
        Some(value) => {
            let items = value.as_array().ok_or(())?;
            if items.len() > 10 {
                return Err(());
            }
            let mut ids = Vec::with_capacity(items.len());
            for item in items {
                ids.push(item.as_str().ok_or(())?.to_string());
            }
            Some(ids)
        }
    };
    let target_session_id = match object.get("targetSessionId") {
        None => None,
        Some(value) => Some(value.as_str().ok_or(())?.to_string()),
    };
    let kind = match object.get("kind") {
        None => None,
        Some(value) => {
            let kind = value.as_str().ok_or(())?;
            if !MESSAGE_KINDS.contains(&kind) {
                return Err(());
            }
            Some(kind.to_string())
        }
    };
    Ok(PostInput {
        content: content.to_string(),
        attachments,
        sender: TeamSender {
            kind: "user".to_string(),
            id: String::new(),
            name: String::new(),
            avatar: None,
            source_session_id: None,
            source_thread_id: None,
        },
        kind,
        recipient_ids,
        routing_decision: None,
        client_key: client_key.to_string(),
        parent_message_id: None,
        work_session_id: None,
        work_thread_id: None,
        target_session_id,
    })
}

/// `GET /api/team-rooms`
pub fn list_rooms(service: &TeamChatService<'_>, user: &AuthUser) -> RouteResponse {
    RouteResponse::ok(json!({ "rooms": service.list(&user.id) }))
}

/// `POST /api/team-rooms` — discriminated union of create-vs-ensure.
pub fn create_room(
    service: &mut TeamChatService<'_>,
    user: &AuthUser,
    body: &Value,
) -> RouteResponse {
    let name_ok = str_field(body, "name")
        .map(valid_room_name)
        .unwrap_or(false);
    let members = valid_member_ids(body.get("memberIds"));
    let source_session_id = match body.get("sourceSessionId") {
        None => Some(None),
        Some(value) => value.as_str().map(|id| Some(id.to_string())),
    };
    let source_session_id = match source_session_id {
        Some(value) => value,
        None => return RouteResponse::error(400, "Invalid room request."),
    };
    if name_ok && members.is_some() {
        let input = CreateRoomInput {
            name: str_field(body, "name").unwrap_or_default().to_string(),
            member_ids: members.unwrap_or_default(),
            source_session_id,
        };
        return match service.create_room(&user.id, input) {
            Ok(room) => RouteResponse::ok(json!({ "room": room })),
            Err(error) => RouteResponse::error(400, &format!("Error: {error}")),
        };
    }
    let agent_id = str_field(body, "agentId").filter(|value| !value.is_empty());
    if let Some(agent_id) = agent_id {
        return match service.ensure_room(&user.id, agent_id, source_session_id.as_deref()) {
            Ok(room) => RouteResponse::ok(json!({ "room": room })),
            Err(error) => RouteResponse::error(400, &format!("Error: {error}")),
        };
    }
    RouteResponse::error(400, "Invalid room request.")
}

/// `GET /api/team-rooms/:id`
pub fn get_room(service: &TeamChatService<'_>, user: &AuthUser, room_id: &str) -> RouteResponse {
    let room = match service.get(&user.id, room_id) {
        Ok(room) => room,
        Err(_) => return RouteResponse::error(404, "Team room not found."),
    };
    let members = match service.room_members(&user.id, &room.id) {
        Ok(members) => members,
        Err(_) => return RouteResponse::error(404, "Team room not found."),
    };
    let messages = service.history(&user.id, &room.id).unwrap_or_default();
    let deliveries = service.deliveries(&user.id, &room.id).unwrap_or_default();
    RouteResponse::ok(json!({
        "room": room,
        "members": members,
        "messages": messages,
        "deliveries": deliveries,
    }))
}

/// `POST /api/team-rooms/:id/messages`
pub fn post_message(
    service: &mut TeamChatService<'_>,
    user: &AuthUser,
    room_id: &str,
    body: &Value,
) -> RouteResponse {
    let mut input = match parse_post_body(body) {
        Ok(input) => input,
        Err(()) => return RouteResponse::error(400, "Invalid team message."),
    };
    input.sender = TeamSender {
        kind: "user".to_string(),
        id: user.id.clone(),
        name: user.username.clone(),
        avatar: None,
        // The TS route builds `{ kind: "user", id, name, avatar: null }` only.
        source_session_id: None,
        source_thread_id: None,
    };
    match service.post_routed(&user.id, room_id, input) {
        Ok(message) => RouteResponse::created(json!({ "message": message })),
        Err(error) => RouteResponse::error(400, error.message()),
    }
}

/// Route table, mirroring the Fastify registrations, for hosts that want to
/// wire the handlers generically.
pub const ROUTES: [(&str, &str); 4] = [
    ("GET", "/api/team-rooms"),
    ("POST", "/api/team-rooms"),
    ("GET", "/api/team-rooms/:id"),
    ("POST", "/api/team-rooms/:id/messages"),
];
