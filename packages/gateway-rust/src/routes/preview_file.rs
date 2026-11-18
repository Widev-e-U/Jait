//! Native `GET /api/dev-file/*` and `GET /preview/{token}/file/*` (server.ts registerProjectPreviewRoutes).
//! Serves an HTML file and its sibling assets. The HTML file must lie inside a project the caller
//! owns (unlike Node, surface and preview-session roots are not extra grants). The token form uses a
//! resource-scoped preview token and answers with a sandboxing CSP.
use super::auth::{self, AuthState};
use crate::{
    security::preview_token::verify_preview_token,
    services::{projects::ProjectService, users::UserService},
};
use axum::{
    Router,
    body::Body,
    extract::{Path, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
    routing::get,
};
use base64::Engine;
use regex::{Captures, Regex};
use serde_json::json;
use std::{
    path::{Component, Path as FsPath, PathBuf},
    sync::OnceLock,
};

const MAX_FILE_BYTES: u64 = 32 * 1024 * 1024;
const ALLOWED: &[&str] = &[
    "html", "htm", "js", "mjs", "css", "svg", "png", "jpg", "jpeg", "gif", "webp", "ico", "woff",
    "woff2", "ttf", "map", "json", "txt", "wasm", "mp4", "webm",
];

#[derive(Clone)]
pub struct PreviewFileRoutes {
    pub auth: AuthState,
}
impl PreviewFileRoutes {
    pub fn router(self) -> Router {
        Router::new()
            .route("/api/dev-file/{encoded}", get(dev_root))
            .route("/api/dev-file/{encoded}/{*rest}", get(dev_asset))
            .route("/preview/{token}/file/{encoded}", get(token_root))
            .route("/preview/{token}/file/{encoded}/{*rest}", get(token_asset))
            .with_state(self)
    }
}
async fn dev_root(
    State(s): State<PreviewFileRoutes>,
    Path(encoded): Path<String>,
    h: HeaderMap,
) -> Response {
    serve(&s, None, encoded, String::new(), &h).await
}
async fn dev_asset(
    State(s): State<PreviewFileRoutes>,
    Path((encoded, rest)): Path<(String, String)>,
    h: HeaderMap,
) -> Response {
    serve(&s, None, encoded, rest, &h).await
}
async fn token_root(
    State(s): State<PreviewFileRoutes>,
    Path((token, encoded)): Path<(String, String)>,
    h: HeaderMap,
) -> Response {
    serve(&s, Some(token), encoded, String::new(), &h).await
}
async fn token_asset(
    State(s): State<PreviewFileRoutes>,
    Path((token, encoded, rest)): Path<(String, String, String)>,
    h: HeaderMap,
) -> Response {
    serve(&s, Some(token), encoded, rest, &h).await
}

fn err(status: u16, code: &str, message: &str) -> Response {
    auth::response(status, json!({"error": code, "message": message}))
}

pub(crate) fn decode_path(encoded: &str) -> Option<PathBuf> {
    let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(encoded.trim_end_matches('='))
        .ok()?;
    let decoded = String::from_utf8(bytes).ok()?;
    (decoded.starts_with('/') && !decoded.contains('\0')).then(|| PathBuf::from(decoded))
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

fn secret_path(path: &FsPath) -> bool {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"(?i)(?:^|[/\\])(?:\.env(?:\.|$)|\.git|\.ssh|\.aws)(?:[/\\]|$)")
            .expect("static regex")
    })
    .is_match(&path.to_string_lossy())
}

fn content_type(ext: &str) -> &'static str {
    match ext {
        "html" | "htm" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "json" | "map" => "application/json; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "ico" => "image/x-icon",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "ttf" => "font/ttf",
        "wasm" => "application/wasm",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "txt" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

/// Mirrors `rewritePreviewHtml`: root-relative references gain the preview prefix and a `<base>` is added.
pub(crate) fn rewrite_html(html: &str, prefix: &str) -> String {
    static ATTR: OnceLock<Regex> = OnceLock::new();
    static META: OnceLock<Regex> = OnceLock::new();
    static BASE: OnceLock<Regex> = OnceLock::new();
    static HEAD: OnceLock<Regex> = OnceLock::new();
    let attr = ATTR.get_or_init(|| {
        Regex::new(r#"(?i)\b(src|href|action|poster)=("|')/(.?)"#).expect("static regex")
    });
    let meta = META.get_or_init(|| {
        Regex::new(r#"(?i)\bcontent=("|')([^"']*url=)/(.?)"#).expect("static regex")
    });
    let step1 = attr.replace_all(html, |c: &Captures| {
        if &c[3] == "/" {
            c[0].to_string()
        } else {
            format!("{}={}{}/{}", &c[1], &c[2], prefix, &c[3])
        }
    });
    let step2 = meta.replace_all(&step1, |c: &Captures| {
        if &c[3] == "/" {
            c[0].to_string()
        } else {
            format!("content={}{}{}/{}", &c[1], &c[2], prefix, &c[3])
        }
    });
    let base = BASE.get_or_init(|| Regex::new(r"(?i)<base\b").expect("static regex"));
    if base.is_match(&step2) {
        return step2.into_owned();
    }
    let head = HEAD.get_or_init(|| Regex::new(r"(?i)<head([^>]*)>").expect("static regex"));
    head.replacen(&step2, 1, |c: &Captures| {
        format!("<head{}><base href=\"{}/\">", &c[1], prefix)
    })
    .into_owned()
}

async fn serve(
    s: &PreviewFileRoutes,
    token: Option<String>,
    encoded: String,
    rest: String,
    headers: &HeaderMap,
) -> Response {
    let Some(root_file) = decode_path(&encoded) else {
        return err(400, "INVALID_PATH", "A valid HTML file path is required");
    };
    let user_id = match &token {
        None => match auth::require_user(&s.auth, headers).await {
            Ok(u) => u.id,
            Err(e) => return *e,
        },
        Some(t) => {
            let secret = s.auth.signing_secret();
            let Some(id) = verify_preview_token(t, &format!("file:{encoded}"), &secret) else {
                return auth::response(401, json!({"detail":"preview_access_required"}));
            };
            let owner = id.clone();
            match s
                .auth
                .with_database(move |db| Ok(UserService::new(db).find_by_id(&owner)?.is_some()))
                .await
            {
                Ok(true) => id,
                Ok(false) => {
                    return auth::response(401, json!({"detail":"preview_access_required"}));
                }
                Err(_) => return auth::internal_error(),
            }
        }
    };
    let uid = user_id.clone();
    let roots = match s
        .auth
        .with_database(move |db| Ok(ProjectService::new(db).list(None, Some(&uid), None)?))
        .await
    {
        Ok(p) => p
            .into_iter()
            .filter_map(|p| p.root_path)
            .collect::<Vec<_>>(),
        Err(_) => return auth::internal_error(),
    };
    let resolved_root = normalize(&root_file);
    let is_html = |p: &FsPath| {
        matches!(
            p.extension()
                .and_then(|e| e.to_str())
                .map(str::to_ascii_lowercase)
                .as_deref(),
            Some("html" | "htm")
        )
    };
    let canonical_root_file = tokio::fs::canonicalize(&resolved_root)
        .await
        .unwrap_or_else(|_| resolved_root.clone());
    let mut allowed = false;
    for root in roots {
        let canon = tokio::fs::canonicalize(&root)
            .await
            .unwrap_or_else(|_| normalize(FsPath::new(&root)));
        if canonical_root_file.starts_with(&canon) {
            allowed = true;
            break;
        }
    }
    if !allowed {
        return err(
            403,
            "PATH_FORBIDDEN",
            "Preview path must stay within an authorized project",
        );
    }
    if !is_html(&resolved_root) {
        return err(
            400,
            "UNSUPPORTED_FILE",
            "Only HTML files can be opened in preview",
        );
    }
    let dir = resolved_root
        .parent()
        .map(FsPath::to_path_buf)
        .unwrap_or_default();
    let target = if rest.is_empty() {
        resolved_root.clone()
    } else {
        if FsPath::new(&rest)
            .components()
            .any(|c| !matches!(c, Component::Normal(_)))
        {
            return err(
                403,
                "PATH_FORBIDDEN",
                "Preview asset path must stay within the HTML file directory",
            );
        }
        dir.join(&rest)
    };
    let Ok(meta) = tokio::fs::metadata(&target).await else {
        return err(404, "NOT_FOUND", "Preview file not found");
    };
    if !meta.is_file() {
        return err(404, "NOT_FOUND", "Preview file not found");
    }
    let Ok(canonical_target) = tokio::fs::canonicalize(&target).await else {
        return err(404, "NOT_FOUND", "Preview file not found");
    };
    let canonical_dir = tokio::fs::canonicalize(&dir).await.unwrap_or(dir);
    if !canonical_target.starts_with(&canonical_dir)
        || secret_path(&target)
        || secret_path(&canonical_target)
    {
        return auth::response(403, json!({"error":"PATH_FORBIDDEN"}));
    }
    let ext = target
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_ascii_lowercase)
        .unwrap_or_default();
    if !ALLOWED.contains(&ext.as_str()) {
        return auth::response(403, json!({"error":"PATH_FORBIDDEN"}));
    }
    if meta.len() > MAX_FILE_BYTES {
        return err(413, "FILE_TOO_LARGE", "Preview file is too large");
    }
    let Ok(data) = tokio::fs::read(&canonical_target).await else {
        return err(404, "NOT_FOUND", "Preview file not found");
    };
    let mut response = if ext == "html" || ext == "htm" {
        let prefix = match &token {
            Some(t) => format!("/preview/{t}/file/{encoded}"),
            None => format!("/api/dev-file/{encoded}"),
        };
        let html = rewrite_html(&String::from_utf8_lossy(&data), &prefix);
        (
            StatusCode::OK,
            [(header::CONTENT_TYPE, content_type("html"))],
            Body::from(html),
        )
            .into_response()
    } else {
        (
            StatusCode::OK,
            [(header::CONTENT_TYPE, content_type(&ext))],
            Body::from(data),
        )
            .into_response()
    };
    let h = response.headers_mut();
    h.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    if token.is_some() && (ext == "html" || ext == "htm") {
        h.insert(
            header::CONTENT_SECURITY_POLICY,
            HeaderValue::from_static(
                "sandbox allow-scripts allow-forms allow-modals allow-popups allow-downloads",
            ),
        );
    }
    response
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rewrite_prefixes_root_relative_urls_only() {
        let out = rewrite_html(
            r#"<head></head><img src="/a.png"><a href="//cdn/x"><a href="rel.css">"#,
            "/p",
        );
        assert!(out.contains(r#"src="/p/a.png""#));
        assert!(out.contains(r#"href="//cdn/x""#));
        assert!(out.contains(r#"href="rel.css""#));
        assert!(out.contains(r#"<head><base href="/p/">"#));
    }

    #[test]
    fn decode_requires_absolute_path() {
        let enc = |s: &str| base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(s);
        assert_eq!(
            decode_path(&enc("/a/b.html")),
            Some(PathBuf::from("/a/b.html"))
        );
        assert_eq!(decode_path(&enc("a/b.html")), None);
        assert_eq!(decode_path("***"), None);
    }

    #[test]
    fn secret_segments_are_denied() {
        assert!(secret_path(FsPath::new("/p/.env")));
        assert!(secret_path(FsPath::new("/p/.git/config")));
        assert!(!secret_path(FsPath::new("/p/environment.js")));
    }
}
