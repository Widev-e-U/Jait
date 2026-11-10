//! Production `/api/team-rooms` mount: the team-chat service on the gateway database.
//!
//! Rooms, messages and deliveries live in `team_rooms`, `team_room_messages` and
//! `team_room_deliveries` as the same JSON blobs the Node gateway writes. Agent personas come from
//! `persona_agents`; delivery fan-out creates idle `agent_threads` rows owned by the caller. The
//! Node delivery dispatcher (which starts those threads) is part of the execution runtime and is
//! not mounted here, so a posted message is recorded and routed but no agent turn runs yet.
use crate::routes::auth::{self, AuthState, response};
use crate::routes::team_chat::{self as handlers, AuthUser as TeamUser};
use crate::services::team_chat::{
    AgentDirectory, NewThread, PersonaAgentProfile, SessionLookup, SessionRef, TeamChatService,
    TeamChatStore, TeamDelivery, TeamRoom, TeamRoomMessage, ThreadRef, ThreadWriter,
};
use axum::{
    Router,
    extract::{Path, Request, State},
    response::Response,
    routing::{get, post},
};
use rusqlite::{Connection, OptionalExtension, params};
use serde_json::Value;

#[derive(Clone)]
pub struct TeamChatRoutes {
    pub auth: AuthState,
}

impl TeamChatRoutes {
    pub fn router(self) -> Router {
        Router::new()
            .route("/api/team-rooms", get(list).post(create))
            .route("/api/team-rooms/{id}", get(get_room))
            .route("/api/team-rooms/{id}/messages", post(post_message))
            .with_state(self)
    }
}

struct SqlStore<'a>(&'a Connection);

fn decode<T: serde::de::DeserializeOwned>(data: String) -> Option<T> {
    serde_json::from_str(&data).ok()
}

impl TeamChatStore for SqlStore<'_> {
    fn insert_room(&mut self, user_id: &str, room: &TeamRoom) {
        let _ = self.0.execute(
            "INSERT INTO team_rooms (id, user_id, root_agent_id, data) VALUES (?1,?2,?3,?4)",
            params![
                room.id,
                user_id,
                room.root_agent_id,
                serde_json::to_string(room).unwrap_or_default()
            ],
        );
    }
    fn update_room(&mut self, room: &TeamRoom) {
        let _ = self.0.execute(
            "UPDATE team_rooms SET root_agent_id=?2, data=?3 WHERE id=?1",
            params![
                room.id,
                room.root_agent_id,
                serde_json::to_string(room).unwrap_or_default()
            ],
        );
    }
    fn rooms_for_user(&self, user_id: &str) -> Vec<TeamRoom> {
        let Ok(mut statement) = self
            .0
            .prepare("SELECT data FROM team_rooms WHERE user_id=?1 ORDER BY rowid")
        else {
            return Vec::new();
        };
        statement
            .query_map(params![user_id], |row| row.get::<_, String>(0))
            .map(|rows| rows.flatten().filter_map(decode).collect())
            .unwrap_or_default()
    }
    fn room_by_id(&self, room_id: &str) -> Option<TeamRoom> {
        self.0
            .query_row(
                "SELECT data FROM team_rooms WHERE id=?1",
                params![room_id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .ok()
            .flatten()
            .and_then(decode)
    }
    fn room_owner(&self, room_id: &str) -> Option<String> {
        self.0
            .query_row(
                "SELECT user_id FROM team_rooms WHERE id=?1",
                params![room_id],
                |row| row.get(0),
            )
            .optional()
            .ok()
            .flatten()
    }
    fn find_room(&self, user_id: &str, room_id: &str) -> Option<TeamRoom> {
        self.0
            .query_row(
                "SELECT data FROM team_rooms WHERE id=?1 AND user_id=?2",
                params![room_id, user_id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .ok()
            .flatten()
            .and_then(decode)
    }
    fn insert_message(&mut self, room_id: &str, client_key: &str, message: &TeamRoomMessage) {
        let _ = self.0.execute(
            "INSERT INTO team_room_messages (id, room_id, client_key, data) VALUES (?1,?2,?3,?4)",
            params![
                message.id,
                room_id,
                client_key,
                serde_json::to_string(message).unwrap_or_default()
            ],
        );
    }
    fn message_by_client_key(&self, room_id: &str, client_key: &str) -> Option<TeamRoomMessage> {
        self.0
            .query_row(
                "SELECT data FROM team_room_messages WHERE room_id=?1 AND client_key=?2",
                params![room_id, client_key],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .ok()
            .flatten()
            .and_then(decode)
    }
    fn messages(&self, room_id: &str) -> Vec<TeamRoomMessage> {
        let Ok(mut statement) = self
            .0
            .prepare("SELECT data FROM team_room_messages WHERE room_id=?1 ORDER BY rowid")
        else {
            return Vec::new();
        };
        statement
            .query_map(params![room_id], |row| row.get::<_, String>(0))
            .map(|rows| rows.flatten().filter_map(decode).collect())
            .unwrap_or_default()
    }
    fn insert_delivery(&mut self, delivery: &TeamDelivery) {
        let _ = self.0.execute(
            "INSERT OR REPLACE INTO team_room_deliveries (id, room_id, message_id, agent_id, session_id, status, error) \
             VALUES (?1,?2,?3,?4,?5,?6,?7)",
            params![
                delivery.id,
                delivery.room_id,
                delivery.message_id,
                delivery.agent_id,
                delivery.session_id,
                delivery.status,
                delivery.error
            ],
        );
    }
    fn deliveries(&self, room_id: &str) -> Vec<TeamDelivery> {
        let Ok(mut statement) = self.0.prepare(
            "SELECT id, room_id, message_id, agent_id, session_id, status, error \
             FROM team_room_deliveries WHERE room_id=?1 ORDER BY rowid",
        ) else {
            return Vec::new();
        };
        statement
            .query_map(params![room_id], |row| {
                Ok(TeamDelivery {
                    id: row.get(0)?,
                    room_id: row.get(1)?,
                    message_id: row.get(2)?,
                    agent_id: row.get(3)?,
                    session_id: row.get(4)?,
                    status: row.get(5)?,
                    error: row.get(6)?,
                    thread_id: None,
                    thread_status: None,
                })
            })
            .map(|rows| rows.flatten().collect())
            .unwrap_or_default()
    }
    fn latest_delivery_for_session(&self, session_id: &str) -> Option<TeamDelivery> {
        self.0
            .query_row(
                "SELECT id, room_id, message_id, agent_id, session_id, status, error \
                 FROM team_room_deliveries WHERE session_id=?1 ORDER BY rowid DESC LIMIT 1",
                params![session_id],
                |row| {
                    Ok(TeamDelivery {
                        id: row.get(0)?,
                        room_id: row.get(1)?,
                        message_id: row.get(2)?,
                        agent_id: row.get(3)?,
                        session_id: row.get(4)?,
                        status: row.get(5)?,
                        error: row.get(6)?,
                        thread_id: None,
                        thread_status: None,
                    })
                },
            )
            .optional()
            .ok()
            .flatten()
    }
}

struct SqlDirectory<'a>(&'a Connection);

impl AgentDirectory for SqlDirectory<'_> {
    fn list_persona_agents(&self, user_id: &str) -> Vec<PersonaAgentProfile> {
        let Ok(mut statement) = self
            .0
            .prepare("SELECT id, data FROM persona_agents WHERE user_id=?1 ORDER BY rowid")
        else {
            return Vec::new();
        };
        let rows = statement
            .query_map(params![user_id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map(|rows| rows.flatten().collect::<Vec<_>>())
            .unwrap_or_default();
        rows.into_iter()
            .filter_map(|(id, data)| {
                let mut value: Value = serde_json::from_str(&data).ok()?;
                value
                    .as_object_mut()?
                    .insert("id".into(), Value::String(id));
                serde_json::from_value(value).ok()
            })
            .collect()
    }
    fn thread_by_id(&self, thread_id: &str) -> Option<ThreadRef> {
        self.0
            .query_row(
                "SELECT id, status FROM agent_threads WHERE id=?1",
                params![thread_id],
                |row| {
                    Ok(ThreadRef {
                        id: row.get(0)?,
                        status: row.get(1)?,
                    })
                },
            )
            .optional()
            .ok()
            .flatten()
    }
    fn thread_owner(&self, thread_id: &str) -> Option<String> {
        self.0
            .query_row(
                "SELECT user_id FROM agent_threads WHERE id=?1",
                params![thread_id],
                |row| row.get(0),
            )
            .optional()
            .ok()
            .flatten()
            .flatten()
    }
    fn thread_persona(&self, user_id: &str, thread_id: &str) -> Option<String> {
        self.0
            .query_row(
                "SELECT persona_agent_id FROM agent_threads WHERE id=?1 AND user_id=?2",
                params![thread_id, user_id],
                |row| row.get(0),
            )
            .optional()
            .ok()
            .flatten()
            .flatten()
    }
}

impl ThreadWriter for SqlDirectory<'_> {
    fn create(&mut self, thread: NewThread) -> ThreadRef {
        let id = crate::db::identifiers::uuidv7().to_string();
        let now = chrono_now();
        let skills = thread
            .skill_ids
            .as_ref()
            .and_then(|ids| serde_json::to_string(ids).ok());
        let _ = self.0.execute(
            "INSERT INTO agent_threads (id, user_id, persona_agent_id, title, provider_id, model, \
             runtime_mode, kind, skill_ids, working_directory, status, created_at, updated_at) \
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,'idle',?11,?11)",
            params![
                id,
                thread.user_id,
                thread.persona_agent_id,
                thread.title,
                thread.provider_id,
                thread.model,
                thread.runtime_mode,
                thread.kind,
                skills,
                thread.working_directory,
                now
            ],
        );
        ThreadRef {
            id,
            status: "idle".into(),
        }
    }
    fn mark_error(&mut self, thread_id: &str, message: &str) {
        let _ = self.0.execute(
            "UPDATE agent_threads SET status='error', error=?2, updated_at=?3 WHERE id=?1",
            params![thread_id, message, chrono_now()],
        );
    }
}

fn chrono_now() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

struct SqlSessions<'a>(&'a Connection);

impl SessionLookup for SqlSessions<'_> {
    fn get_by_id(&self, user_id: &str, session_id: &str) -> Option<SessionRef> {
        crate::services::sessions::SessionService::new(self.0)
            .get(session_id, Some(user_id))
            .ok()
            .flatten()
            .map(|s| SessionRef {
                id: s.id,
                name: s.name,
                project_id: s.project_id,
                project_path: s.project_path,
            })
    }
    fn metadata(&self, user_id: &str, session_id: &str) -> Option<String> {
        crate::services::sessions::SessionService::new(self.0)
            .get(session_id, Some(user_id))
            .ok()
            .flatten()
            .and_then(|s| s.metadata)
    }
}

async fn serve(
    state: TeamChatRoutes,
    request: Request,
    run: impl FnOnce(&mut TeamChatService<'_>, &TeamUser, Value) -> handlers::RouteResponse
    + Send
    + 'static,
) -> Response {
    let headers = request.headers().clone();
    let user = match auth::require_user(&state.auth, &headers).await {
        Ok(user) => user,
        Err(error) => return *error,
    };
    let body = match auth::parse_body(request.into_body(), &headers).await {
        Ok(body) => body,
        Err(error) => return *error,
    };
    let user = TeamUser {
        id: user.id,
        username: user.username,
    };
    let out = state
        .auth
        .with_database(move |db| {
            let mut store = SqlStore(db);
            let sessions = SqlSessions(db);
            let directory = SqlDirectory(db);
            let mut writer = SqlDirectory(db);
            let mut service = TeamChatService::new(&mut store, &sessions, &directory, &mut writer);
            Ok::<_, Box<dyn std::error::Error + Send + Sync>>(run(&mut service, &user, body))
        })
        .await;
    match out {
        Ok(out) => response(out.status, out.body),
        Err(_) => response(
            500,
            serde_json::json!({"error": "Database operation failed"}),
        ),
    }
}

async fn list(State(state): State<TeamChatRoutes>, request: Request) -> Response {
    serve(state, request, |service, user, _| {
        handlers::list_rooms(service, user)
    })
    .await
}

async fn create(State(state): State<TeamChatRoutes>, request: Request) -> Response {
    serve(state, request, |service, user, body| {
        handlers::create_room(service, user, &body)
    })
    .await
}

async fn get_room(
    State(state): State<TeamChatRoutes>,
    Path(id): Path<String>,
    request: Request,
) -> Response {
    serve(state, request, move |service, user, _| {
        handlers::get_room(service, user, &id)
    })
    .await
}

async fn post_message(
    State(state): State<TeamChatRoutes>,
    Path(id): Path<String>,
    request: Request,
) -> Response {
    serve(state, request, move |service, user, body| {
        handlers::post_message(service, user, &id, &body)
    })
    .await
}
