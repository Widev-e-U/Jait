//! Complete opt-in executable composition against an owned HTTP model fixture.
use super::{
    application::{Application, ApplicationConfig},
    chat_config::ChatConfiguration,
};
use crate::config::GatewayConfig;
use axum::{
    Json, Router,
    extract::State,
    response::{IntoResponse, Response},
    routing::post,
};
use futures_util::StreamExt;
use serde_json::{Value, json};
use std::{
    convert::Infallible,
    future::IntoFuture,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::sync::oneshot;

async fn model(
    State(requests): State<Arc<Mutex<Vec<Value>>>>,
    Json(body): Json<Value>,
) -> Response {
    let hold = body["messages"].as_array().unwrap().last().unwrap()["content"] == "hold";
    let mut seen = requests.lock().unwrap();
    let index = seen.len();
    seen.push(body);
    drop(seen);
    let text = if hold {
        "partial"
    } else if index == 0 {
        "Hello from configured model"
    } else {
        "Resumed from history"
    };
    let chunk = json!({"choices":[{"delta":{"content":text},"finish_reason":if hold {Value::Null}else{json!("stop")}}]});
    let frame = format!(
        "data: {chunk}\n\n{}",
        if hold { "" } else { "data: [DONE]\n\n" }
    );
    let body = if hold {
        axum::body::Body::from_stream(
            futures_util::stream::once(async move {
                Ok::<_, Infallible>(axum::body::Bytes::from(frame))
            })
            .chain(futures_util::stream::pending()),
        )
    } else {
        axum::body::Body::from(frame)
    };
    ([("content-type", "text/event-stream")], body).into_response()
}
async fn start(
    path: &Path,
    model_url: &str,
) -> (String, oneshot::Sender<()>, tokio::task::JoinHandle<()>) {
    let configuration = ChatConfiguration::from_lookup(|key| match key {
        "JAIT_RUST_CHAT" | "JAIT_RUST_APPLICATION" => Some("1".into()),
        "JAIT_RUST_CHAT_BASE_URL" => Some(model_url.into()),
        "JAIT_RUST_CHAT_MODEL" => Some("fixture".into()),
        _ => None,
    })
    .unwrap()
    .unwrap();
    let application = Application::bind_with_chat(
        GatewayConfig {
            address: "127.0.0.1:0".parse().unwrap(),
            allow_non_loopback: false,
        },
        ApplicationConfig {
            database_path: path.join("application.sqlite"),
            project_root: path.into(),
            jwt_secret: "fixture-signing-secret".into(),
            cors_origin: String::new(),
            web_root: None,
            health: None,
        },
        Some(configuration.factory()),
    )
    .await
    .unwrap();
    let base = format!("http://{}", application.local_addr().unwrap());
    let (send, receive) = oneshot::channel();
    let task = tokio::spawn(async move {
        application
            .serve(async {
                let _ = receive.await;
            })
            .await
            .unwrap();
    });
    (base, send, task)
}
#[tokio::test]
async fn client_message_id_is_persisted_deduplicated_and_ignored_when_malformed() {
    let work: PathBuf = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../.jait/artifacts/gateway-rust/chat-client-message-id")
        .join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(&work).unwrap();
    let requests = Arc::new(Mutex::new(Vec::new()));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let model_url = format!("http://{}/v1", listener.local_addr().unwrap());
    let (model_stop, model_stopped) = oneshot::channel();
    let server = tokio::spawn(
        axum::serve(
            listener,
            Router::new()
                .route("/v1/chat/completions", post(model))
                .with_state(requests.clone()),
        )
        .with_graceful_shutdown(async {
            let _ = model_stopped.await;
        })
        .into_future(),
    );
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .unwrap();
    let (base, stop, app) = start(&work, &model_url).await;
    let registration: Value = client
        .post(format!("{base}/api/auth/register"))
        .json(&json!({"username":"fixture-user","password":"fixture password"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let token = registration["access_token"].as_str().unwrap();
    let session: Value = client
        .post(format!("{base}/api/sessions"))
        .bearer_auth(token)
        .json(&json!({"name":"client ids"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let id = session["id"].as_str().unwrap();
    let send = |body: Value| {
        client
            .post(format!("{base}/api/chat"))
            .bearer_auth(token)
            .json(&body)
            .send()
    };
    let first = send(json!({"sessionId":id,"content":"hello","clientMessageId":"user-abcdefgh-1"}))
        .await
        .unwrap();
    assert_eq!(first.status(), 200);
    assert!(first.text().await.unwrap().contains("\"type\":\"done\""));
    let duplicate =
        send(json!({"sessionId":id,"content":"again","clientMessageId":"user-abcdefgh-1"}))
            .await
            .unwrap();
    assert_eq!(duplicate.status(), 409);
    assert_eq!(
        duplicate.json::<Value>().await.unwrap()["error"],
        "MESSAGE_ID_ALREADY_EXISTS"
    );
    for malformed in [json!("bad"), json!("user-short"), json!(7)] {
        let ignored = send(json!({"sessionId":id,"content":"x","clientMessageId":malformed}))
            .await
            .unwrap();
        assert_eq!(ignored.status(), 200);
        assert!(ignored.text().await.unwrap().contains("\"type\":\"done\""));
    }
    let messages: Value = client
        .get(format!("{base}/api/sessions/{id}/messages"))
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(
        messages["messages"][0]["clientMessageId"],
        "user-abcdefgh-1"
    );
    assert_eq!(messages["total"], 8);
    stop.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(10), app)
        .await
        .unwrap()
        .unwrap();
    let _ = model_stop.send(());
    let _ = server.await;
}
#[tokio::test]
async fn configured_http_chat_restarts_with_ui_rows_and_shutdown_preserves_live_partial() {
    let work: PathBuf = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../.jait/artifacts/gateway-rust/chat-http-application")
        .join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(&work).unwrap();
    let requests = Arc::new(Mutex::new(Vec::new()));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let model_url = format!("http://{}/v1", listener.local_addr().unwrap());
    let (model_stop, model_stopped) = oneshot::channel();
    let server = tokio::spawn(
        axum::serve(
            listener,
            Router::new()
                .route("/v1/chat/completions", post(model))
                .with_state(requests.clone()),
        )
        .with_graceful_shutdown(async {
            let _ = model_stopped.await;
        })
        .into_future(),
    );
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .unwrap();
    let (base, stop, app) = start(&work, &model_url).await;
    let registration: Value = client
        .post(format!("{base}/api/auth/register"))
        .json(&json!({"username":"fixture-user","password":"fixture password"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let token = registration["access_token"].as_str().unwrap();
    let invitation: Value = client
        .post(format!("{base}/api/auth/invitations"))
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let other: Value = client
        .post(format!("{base}/api/auth/register"))
        .json(&json!({"username":"other-user","password":"fixture password","invitation":invitation["invitation"]}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let other_token = other["access_token"].as_str().unwrap();
    let foreign: Value = client
        .post(format!("{base}/api/sessions"))
        .bearer_auth(token)
        .json(&json!({"name":"foreign history"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let foreign_id = foreign["id"].as_str().unwrap();
    {
        let db = rusqlite::Connection::open(work.join("application.sqlite")).unwrap();
        db.execute(
            "INSERT INTO messages(id,session_id,role,content,created_at) VALUES(?1,?2,'user','old context','2026-10-21T00:00:00Z')",
            rusqlite::params!["user-abcdefgh", foreign_id],
        ).unwrap();
    }
    let rejected = client
        .post(format!("{base}/api/chat"))
        .bearer_auth(token)
        .json(&json!({"sessionId":foreign_id,"content":"continue"}))
        .send()
        .await
        .unwrap();
    assert_eq!(rejected.status(), 503);
    assert_eq!(
        rejected.json::<Value>().await.unwrap()["error"],
        "CHAT_ADMISSION_UNAVAILABLE"
    );
    assert!(requests.lock().unwrap().is_empty());
    // Each stored message fits the configured history limit, but the incoming
    // message pushes the combined provider history over it.
    let large_session: Value = client
        .post(format!("{base}/api/sessions"))
        .bearer_auth(token)
        .json(&json!({"name":"large native history"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let large_id = large_session["id"].as_str().unwrap();
    {
        let mut db = rusqlite::Connection::open(work.join("application.sqlite")).unwrap();
        let tx = db.transaction().unwrap();
        for log_id in 1..=32 {
            let payload = json!({"version":1,"event":{"type":"user","content":"x".repeat(32_000)}})
                .to_string();
            tx.execute(
                "INSERT INTO session_events(session_id,log_id,type,payload,created_at) VALUES(?1,?2,'rust.chat.message',?3,0)",
                rusqlite::params![large_id, log_id, payload],
            ).unwrap();
        }
        super::chat_projection::project_log(&tx, large_id).unwrap();
        tx.commit().unwrap();
    }
    let rejected = client
        .post(format!("{base}/api/chat"))
        .bearer_auth(token)
        .json(&json!({"sessionId":large_id,"content":"y".repeat(25_000)}))
        .send()
        .await
        .unwrap();
    assert_eq!(rejected.status(), 503);
    assert_eq!(
        rejected.json::<Value>().await.unwrap()["error"],
        "CHAT_ADMISSION_UNAVAILABLE"
    );
    assert!(requests.lock().unwrap().is_empty());
    let persisted: Value = client
        .get(format!("{base}/api/sessions/{large_id}/messages"))
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(persisted["total"], 32);
    let accepted = client
        .post(format!("{base}/api/chat"))
        .bearer_auth(token)
        .json(&json!({"sessionId":large_id,"content":"small"}))
        .send()
        .await
        .unwrap();
    assert_eq!(accepted.status(), 200);
    assert!(accepted.text().await.unwrap().contains("\"type\":\"done\""));
    assert_eq!(requests.lock().unwrap().len(), 1);
    requests.lock().unwrap().clear();
    let session: Value = client
        .post(format!("{base}/api/sessions"))
        .bearer_auth(token)
        .json(&json!({"name":"native workflow"}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let id = session["id"].as_str().unwrap();
    let answer = client
        .post(format!("{base}/api/chat"))
        .bearer_auth(token)
        .json(&json!({"sessionId":id,"content":"hello"}))
        .send()
        .await
        .unwrap();
    assert_eq!(answer.status(), 200);
    assert_eq!(answer.headers()["content-type"], "text/event-stream");
    let text = answer.text().await.unwrap();
    assert!(text.contains("Hello from configured model"));
    assert!(text.contains("\"type\":\"done\""));
    let messages: Value = client
        .get(format!("{base}/api/sessions/{id}/messages"))
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(messages["total"], 2);
    assert_eq!(
        messages["messages"][1]["content"],
        "Hello from configured model"
    );
    stop.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(10), app)
        .await
        .unwrap()
        .unwrap();
    let (base, stop, app) = start(&work, &model_url).await;
    let restored: Value = client
        .get(format!("{base}/api/sessions/{id}/messages"))
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(restored["messages"], messages["messages"]);
    let text = client
        .post(format!("{base}/api/chat"))
        .bearer_auth(token)
        .json(&json!({"sessionId":id,"content":"again"}))
        .send()
        .await
        .unwrap()
        .text()
        .await
        .unwrap();
    assert!(text.contains("Resumed from history"));
    {
        let seen = requests.lock().unwrap();
        assert_eq!(seen.len(), 2);
        assert_eq!(seen[0]["messages"].as_array().unwrap().len(), 2);
        assert_eq!(seen[1]["messages"].as_array().unwrap().len(), 4);
        assert_eq!(seen[1]["messages"][0]["role"], "system");
        assert!(seen[1].get("tools").is_none());
    }
    let mut live = client
        .post(format!("{base}/api/chat"))
        .bearer_auth(token)
        .json(&json!({"sessionId":id,"content":"hold"}))
        .send()
        .await
        .unwrap();
    let mut partial = String::new();
    while !partial.contains("partial") {
        partial.push_str(&String::from_utf8_lossy(
            &live.chunk().await.unwrap().unwrap(),
        ));
    }
    let streaming: Value = client
        .get(format!("{base}/api/sessions/streaming"))
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(streaming["sessionIds"], json!([id]));
    assert_eq!(
        client
            .get(format!("{base}/api/sessions/streaming"))
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
    let other_streaming: Value = client
        .get(format!("{base}/api/sessions/streaming"))
        .bearer_auth(other_token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(other_streaming["sessionIds"], json!([]));
    // Change status without ending the held turn, so the endpoint must filter
    // a still-live turn against the persisted session status.
    let db = rusqlite::Connection::open(work.join("application.sqlite")).unwrap();
    db.execute(
        "UPDATE sessions SET status = 'archived' WHERE id = ?1",
        [id],
    )
    .unwrap();
    let archived_streaming: Value = client
        .get(format!("{base}/api/sessions/streaming"))
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(archived_streaming["sessionIds"], json!([]));
    db.execute("UPDATE sessions SET status = 'active' WHERE id = ?1", [id])
        .unwrap();
    drop(db);
    stop.send(()).unwrap();
    let terminal = live.text().await.unwrap();
    assert!(terminal.contains("cancelled"));
    tokio::time::timeout(Duration::from_secs(10), app)
        .await
        .unwrap()
        .unwrap();
    let (base, stop, app) = start(&work, &model_url).await;
    let restored: Value = client
        .get(format!("{base}/api/sessions/{id}/messages"))
        .bearer_auth(token)
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(restored["total"], 6);
    assert_eq!(restored["messages"][5]["content"], "partial");
    stop.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(10), app)
        .await
        .unwrap()
        .unwrap();
    model_stop.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(10), server)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
}
