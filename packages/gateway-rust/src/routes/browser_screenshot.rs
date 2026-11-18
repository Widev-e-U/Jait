//! Native `GET /api/browser/screenshot` (server.ts registerBrowserAssetRoutes).
//! Streams an image that lies inside the caller's own chat project. Unlike Node, authentication is
//! always required and a `sessionId` is mandatory: there is no unauthenticated gateway-cwd fallback.
use super::auth::{self, AuthState};
use crate::services::{projects::ProjectService, sessions::SessionService};
use axum::{
    Router,
    body::Body,
    extract::{RawQuery, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
    routing::get,
};
use serde_json::json;
use std::path::{Component, Path as FsPath, PathBuf};

const MAX_IMAGE_BYTES: u64 = 32 * 1024 * 1024;

#[derive(Clone)]
pub struct BrowserScreenshotRoutes {
    pub auth: AuthState,
}

fn query_value(raw: &str, key: &str) -> Option<String> {
    url::form_urlencoded::parse(raw.as_bytes())
        .find(|(k, _)| k == key)
        .map(|(_, v)| v.into_owned())
}

impl BrowserScreenshotRoutes {
    pub fn router(self) -> Router {
        Router::new()
            .route("/api/browser/screenshot", get(screenshot))
            .with_state(self)
    }
}

fn err(status: u16, code: &str, message: &str) -> Response {
    auth::response(status, json!({"error": code, "message": message}))
}

fn normalize(path: &FsPath) -> PathBuf {
    let mut out = PathBuf::new();
    for c in path.components() {
        match c {
            Component::ParentDir => {
                out.pop();
            }
            Component::CurDir => {}
            other => out.push(other),
        }
    }
    out
}

fn image_type(ext: &str) -> Option<&'static str> {
    match ext {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "webp" => Some("image/webp"),
        "gif" => Some("image/gif"),
        _ => None,
    }
}

async fn screenshot(
    State(s): State<BrowserScreenshotRoutes>,
    RawQuery(raw): RawQuery,
    headers: HeaderMap,
) -> Response {
    let user = match auth::require_user(&s.auth, &headers).await {
        Ok(u) => u,
        Err(e) => return *e,
    };
    let raw = raw.unwrap_or_default();
    let Some(path) = query_value(&raw, "path").filter(|p| !p.trim().is_empty()) else {
        return err(400, "MISSING_PATH", "path is required");
    };
    let Some(session_id) = query_value(&raw, "sessionId").filter(|v| !v.is_empty()) else {
        return err(400, "MISSING_SESSION", "sessionId is required");
    };
    if path.contains('\0') {
        return err(400, "MISSING_PATH", "path is invalid");
    }
    let uid = user.id.clone();
    let sid = session_id.clone();
    let lookup = s
        .auth
        .with_database(move |db| {
            let Some(session) = SessionService::new(db).get(&sid, Some(&uid))? else {
                return Ok(None);
            };
            let root = match session.project_path.filter(|p| !p.is_empty()) {
                Some(p) => Some(p),
                None => match session.project_id {
                    Some(pid) => ProjectService::new(db)
                        .list(None, Some(&uid), None)?
                        .into_iter()
                        .find(|p| p.id == pid)
                        .and_then(|p| p.root_path),
                    None => None,
                },
            };
            Ok(Some(root))
        })
        .await;
    let root = match lookup {
        Ok(None) => return err(404, "NOT_FOUND", "Chat not found"),
        Ok(Some(None)) => return err(404, "NO_PROJECT", "Chat has no project"),
        Ok(Some(Some(r))) => r,
        Err(_) => return auth::internal_error(),
    };

    let resolved_root = normalize(FsPath::new(&root));
    let resolved_path = normalize(&resolved_root.join(&path));
    let canonical_root = tokio::fs::canonicalize(&resolved_root)
        .await
        .unwrap_or_else(|_| resolved_root.clone());
    let canonical_path = tokio::fs::canonicalize(&resolved_path)
        .await
        .unwrap_or_else(|_| resolved_path.clone());
    if !resolved_path.starts_with(&resolved_root) || !canonical_path.starts_with(&canonical_root) {
        return err(
            403,
            "PATH_FORBIDDEN",
            "Screenshot path must stay within the chat project",
        );
    }
    let ext = resolved_path
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_ascii_lowercase)
        .unwrap_or_default();
    let Some(content_type) = image_type(&ext) else {
        return err(
            400,
            "UNSUPPORTED_FILE",
            "Only image screenshots can be served",
        );
    };
    let Ok(meta) = tokio::fs::metadata(&canonical_path).await else {
        return err(404, "NOT_FOUND", "Screenshot file not found");
    };
    if !meta.is_file() {
        return err(404, "NOT_FOUND", "Screenshot file not found");
    }
    if meta.len() > MAX_IMAGE_BYTES {
        return err(413, "FILE_TOO_LARGE", "Screenshot is too large");
    }
    match tokio::fs::read(&canonical_path).await {
        Ok(data) => (
            StatusCode::OK,
            [
                (header::CONTENT_TYPE, HeaderValue::from_static(content_type)),
                (header::CACHE_CONTROL, HeaderValue::from_static("no-store")),
            ],
            Body::from(data),
        )
            .into_response(),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            err(404, "NOT_FOUND", "Screenshot file not found")
        }
        Err(_) => auth::internal_error(),
    }
}
