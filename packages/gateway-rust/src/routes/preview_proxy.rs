//! Native `/api/dev-proxy/{port}`, `/preview/{token}/proxy/{port}` and `POST /api/preview/access`
//! (server.ts registerDevProxyRoutes and the preview access route).
//! A request is only forwarded to `127.0.0.1:{port}` when that port is registered to the caller in the
//! host-owned `PreviewPortRegistry`; there is no ambient fallback, so an empty registry proxies nothing.
use super::auth::{self, AuthState};
use crate::{
    security::preview_token::{sign_preview_token, verify_preview_token},
    services::users::UserService,
};
use axum::{
    Router,
    body::{Body, Bytes, to_bytes},
    extract::{Path, Request, State},
    http::{HeaderMap, HeaderValue, header},
    response::Response,
    routing::{any, get, post},
};
use regex::{Regex, RegexBuilder};
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet},
    sync::{Arc, OnceLock, RwLock},
    time::Duration,
};

const MAX_REQUEST_BYTES: usize = 32 * 1024 * 1024;
const SANDBOX: &str = "sandbox allow-scripts allow-forms allow-modals allow-popups allow-downloads";

/// Ports a running preview owns, keyed by the owning user. Hosts register a port when a preview
/// starts and unregister it when it stops; the proxy never guesses.
#[derive(Clone, Default)]
pub struct PreviewPortRegistry(Arc<RwLock<HashMap<u16, HashSet<String>>>>);
impl PreviewPortRegistry {
    pub fn register(&self, owner: &str, port: u16) {
        self.0
            .write()
            .unwrap_or_else(|e| e.into_inner())
            .entry(port)
            .or_default()
            .insert(owner.to_owned());
    }
    pub fn unregister(&self, owner: &str, port: u16) {
        let mut ports = self.0.write().unwrap_or_else(|e| e.into_inner());
        if let Some(owners) = ports.get_mut(&port) {
            owners.remove(owner);
            if owners.is_empty() {
                ports.remove(&port);
            }
        }
    }
    pub fn allows(&self, owner: &str, port: u16) -> bool {
        self.0
            .read()
            .unwrap_or_else(|e| e.into_inner())
            .get(&port)
            .is_some_and(|owners| owners.contains(owner))
    }
}

#[derive(Clone)]
pub struct PreviewProxyRoutes {
    pub auth: AuthState,
    pub ports: PreviewPortRegistry,
    /// noVNC ports of live browser views, keyed by owner. Same no-ambient-fallback rule as `ports`.
    pub live_ports: PreviewPortRegistry,
}
impl PreviewProxyRoutes {
    pub fn router(self) -> Router {
        Router::new()
            .route("/api/live-view/{port}/focus", get(focus_dev))
            .route("/preview/{token}/live/{port}/focus", get(focus_token))
            .route("/api/preview/access", post(access))
            .route("/api/dev-proxy/{port}", any(dev_root))
            .route("/api/dev-proxy/{port}/", any(dev_root))
            .route("/api/dev-proxy/{port}/{*rest}", any(dev_rest))
            .route("/preview/{token}/proxy/{port}", any(token_root))
            .route("/preview/{token}/proxy/{port}/", any(token_root))
            .route("/preview/{token}/proxy/{port}/{*rest}", any(token_rest))
            .with_state(self)
    }
}
async fn dev_root(
    State(s): State<PreviewProxyRoutes>,
    Path(port): Path<String>,
    r: Request,
) -> Response {
    proxy(&s, None, port, r).await
}
async fn dev_rest(
    State(s): State<PreviewProxyRoutes>,
    Path((port, _)): Path<(String, String)>,
    r: Request,
) -> Response {
    proxy(&s, None, port, r).await
}
async fn token_root(
    State(s): State<PreviewProxyRoutes>,
    Path((token, port)): Path<(String, String)>,
    r: Request,
) -> Response {
    proxy(&s, Some(token), port, r).await
}
async fn token_rest(
    State(s): State<PreviewProxyRoutes>,
    Path((token, port, _)): Path<(String, String, String)>,
    r: Request,
) -> Response {
    proxy(&s, Some(token), port, r).await
}

async fn focus_dev(
    State(s): State<PreviewProxyRoutes>,
    Path(port): Path<String>,
    headers: HeaderMap,
) -> Response {
    focus(&s, None, port, headers).await
}
async fn focus_token(
    State(s): State<PreviewProxyRoutes>,
    Path((token, port)): Path<(String, String)>,
    headers: HeaderMap,
) -> Response {
    focus(&s, Some(token), port, headers).await
}

/// `GET .../live/{port}/focus` (server.ts focusHandler). The remote page is only evaluated for a port
/// registered to the caller. The native browser surface has no script evaluation yet, so a registered
/// port reports `editing: false`, which is what Node answers when the surface cannot evaluate.
async fn focus(
    s: &PreviewProxyRoutes,
    token: Option<String>,
    port_param: String,
    headers: HeaderMap,
) -> Response {
    let user_id = match &token {
        None => match auth::require_user(&s.auth, &headers).await {
            Ok(u) => u.id,
            Err(e) => return *e,
        },
        Some(t) => {
            let secret = s.auth.signing_secret();
            let Some(id) = verify_preview_token(t, &format!("live:{port_param}"), &secret) else {
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
    let mut response = match parse_port(&port_param) {
        Some(port) if s.live_ports.allows(&user_id, port) => {
            auth::response(200, json!({"editing": false}))
        }
        _ => auth::response(403, json!({"error":"LIVE_VIEW_NOT_REGISTERED"})),
    };
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response
}

fn err(status: u16, code: &str, message: &str) -> Response {
    auth::response(status, json!({"error": code, "message": message}))
}

fn parse_port(value: &str) -> Option<u16> {
    value
        .parse::<u32>()
        .ok()
        .filter(|p| (1..=65535).contains(p))
        .map(|p| p as u16)
}

fn client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .no_proxy()
            .connect_timeout(Duration::from_secs(5))
            .timeout(Duration::from_secs(60))
            .build()
            .expect("static client")
    })
}

fn skip_request_header(name: &str) -> bool {
    matches!(
        name,
        "authorization"
            | "cookie"
            | "host"
            | "connection"
            | "content-length"
            | "accept-encoding"
            | "origin"
            | "referer"
            | "upgrade"
            | "te"
            | "trailer"
            | "keep-alive"
            | "transfer-encoding"
            | "proxy-authorization"
            | "proxy-connection"
    )
}

fn skip_response_header(name: &str) -> bool {
    matches!(
        name,
        "set-cookie"
            | "content-length"
            | "content-encoding"
            | "transfer-encoding"
            | "x-frame-options"
            | "content-security-policy"
            | "connection"
            | "keep-alive"
            | "upgrade"
            | "content-type"
            | "cache-control"
    )
}

async fn proxy(
    s: &PreviewProxyRoutes,
    token: Option<String>,
    port_param: String,
    req: Request,
) -> Response {
    let Some(port) = parse_port(&port_param) else {
        return err(400, "INVALID_PORT", "A valid localhost port is required");
    };
    let headers = req.headers().clone();
    let user_id = match &token {
        None => match auth::require_user(&s.auth, &headers).await {
            Ok(u) => u.id,
            Err(e) => return *e,
        },
        Some(t) => {
            let secret = s.auth.signing_secret();
            let Some(id) = verify_preview_token(t, &format!("proxy:{port_param}"), &secret) else {
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
    if !s.ports.allows(&user_id, port) {
        return auth::response(403, json!({"error":"PREVIEW_NOT_REGISTERED"}));
    }
    let prefix = match &token {
        Some(t) => format!("/preview/{t}/proxy/{port_param}"),
        None => format!("/api/dev-proxy/{port_param}"),
    };
    let raw_path = req.uri().path().to_owned();
    let proxied_path = match raw_path.strip_prefix(&prefix) {
        Some(rest) if rest.starts_with('/') => rest.to_owned(),
        _ => "/".to_owned(),
    };
    let query = req
        .uri()
        .query()
        .map(|q| format!("?{q}"))
        .unwrap_or_default();
    let target = format!("http://127.0.0.1:{port}{proxied_path}{query}");
    let Ok(target_url) = reqwest::Url::parse(&target) else {
        return err(400, "INVALID_PORT", "A valid localhost port is required");
    };
    let method = req.method().clone();
    let Ok(body) = to_bytes(req.into_body(), MAX_REQUEST_BYTES).await else {
        return err(413, "DEV_PROXY_FAILED", "Request body is too large");
    };
    let send = || {
        let mut out = client().request(method.clone(), target_url.clone());
        for (name, value) in &headers {
            if !skip_request_header(name.as_str()) {
                out = out.header(name, value);
            }
        }
        if !matches!(method.as_str(), "GET" | "HEAD") && !body.is_empty() {
            out = out.body(body.clone());
        }
        out.send()
    };
    let mut upstream = match send().await {
        Ok(r) => r,
        Err(e) => return err(502, "DEV_PROXY_FAILED", &e.to_string()),
    };
    if upstream.status().as_u16() == 504 && proxied_path.starts_with("/node_modules/.vite/deps/") {
        tokio::time::sleep(Duration::from_millis(250)).await;
        upstream = match send().await {
            Ok(r) => r,
            Err(e) => return err(502, "DEV_PROXY_FAILED", &e.to_string()),
        };
    }
    let status = upstream.status();
    let content_type = upstream
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/octet-stream")
        .to_owned();
    let mut builder = Response::builder().status(status);
    for (name, value) in upstream.headers() {
        let lower = name.as_str();
        if skip_response_header(lower) {
            continue;
        }
        if lower == "location" {
            let rewritten = value
                .to_str()
                .ok()
                .and_then(|v| target_url.join(v).ok())
                .filter(|u| u.origin() == target_url.origin())
                .map(|u| {
                    let hash = u.fragment().map(|f| format!("#{f}")).unwrap_or_default();
                    let q = u.query().map(|q| format!("?{q}")).unwrap_or_default();
                    format!("{prefix}{}{q}{hash}", u.path())
                })
                .and_then(|v| HeaderValue::from_str(&v).ok());
            builder = builder.header(name, rewritten.unwrap_or_else(|| value.clone()));
        } else {
            builder = builder.header(name, value);
        }
    }
    builder = builder.header(header::CACHE_CONTROL, "no-store");
    let is_html = content_type.contains("text/html");
    if token.is_some() && is_html {
        builder = builder.header(header::CONTENT_SECURITY_POLICY, SANDBOX);
    }
    let finish = |builder: axum::http::response::Builder, ct: &str, body: Body| {
        builder
            .header(header::CONTENT_TYPE, ct)
            .body(body)
            .unwrap_or_else(|_| auth::internal_error())
    };
    if is_html && module_like(&proxied_path) {
        return err(
            502,
            "DEV_PROXY_MODULE_FALLBACK",
            &format!(
                "Dev server returned HTML for module request {proxied_path}. Open the server root or fix absolute asset routing."
            ),
        );
    }
    let textual = is_html
        || content_type.contains("javascript")
        || content_type.contains("ecmascript")
        || content_type.contains("css");
    let bytes: Bytes = match upstream.bytes().await {
        Ok(b) => b,
        Err(e) => return err(502, "DEV_PROXY_FAILED", &e.to_string()),
    };
    if textual {
        let text = rewrite_text(
            &String::from_utf8_lossy(&bytes),
            &content_type,
            &prefix,
            &proxied_path,
        );
        return finish(builder, &content_type, Body::from(text));
    }
    finish(builder, &content_type, Body::from(bytes))
}

fn module_like(path: &str) -> bool {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"^/(?:@fs/|@vite/|node_modules/|src/)|\.(?:m?js|cjs|ts|tsx|jsx|css)(?:$|[?#])")
            .expect("static regex")
    })
    .is_match(path)
}

/// Mirrors `rewriteDevProxyText`.
fn rewrite_text(body: &str, content_type: &str, prefix: &str, proxied_path: &str) -> String {
    static VITE: OnceLock<Regex> = OnceLock::new();
    static ABS: OnceLock<Regex> = OnceLock::new();
    static CONNECT: OnceLock<Regex> = OnceLock::new();
    if content_type.contains("text/html") {
        let vite = VITE.get_or_init(|| {
            RegexBuilder::new(
                r#"<script\b[^>]*type=["']module["'][^>]*src=["']/@vite/client(?:\?[^"']*)?["'][^>]*>\s*</script>\s*"#,
            )
            .case_insensitive(true)
            .build()
            .expect("static regex")
        });
        return super::preview_file::rewrite_html(&vite.replace_all(body, ""), prefix);
    }
    let abs = ABS.get_or_init(|| {
        Regex::new(r#"(["'`(])/(@fs/|@vite/|node_modules/|src/)"#).expect("static regex")
    });
    let rewritten = abs
        .replace_all(body, |c: &regex::Captures| {
            format!("{}{prefix}/{}", &c[1], &c[2])
        })
        .into_owned();
    if proxied_path == "/@vite/client" {
        let connect = CONNECT.get_or_init(|| {
            Regex::new(r"console\.info\(`\[vite\] connecting\.\.\.`\);?").expect("static regex")
        });
        return connect.replace_all(&rewritten, "").into_owned();
    }
    rewritten
}

/// `POST /api/preview/access`: exchange a same-origin preview source for a token URL.
async fn access(State(s): State<PreviewProxyRoutes>, headers: HeaderMap, body: Bytes) -> Response {
    let user = match auth::require_user(&s.auth, &headers).await {
        Ok(u) => u,
        Err(e) => return *e,
    };
    let source = serde_json::from_slice::<Value>(&body)
        .ok()
        .and_then(|v| v.get("source").and_then(Value::as_str).map(str::to_owned))
        .filter(|v| !v.is_empty());
    let Some(source) = source else {
        return auth::response(400, json!({"error":"Preview source required"}));
    };
    let host = headers
        .get(header::HOST)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("localhost");
    let Ok(origin) = reqwest::Url::parse(&format!("http://{host}")) else {
        return auth::response(400, json!({"error":"Preview must belong to this gateway"}));
    };
    let url = match reqwest::Url::options()
        .base_url(Some(&origin))
        .parse(&source)
    {
        Ok(u) => u,
        Err(_) => {
            return auth::response(400, json!({"error":"Preview must belong to this gateway"}));
        }
    };
    if url.host_str() != origin.host_str()
        || url.port() != origin.port()
        || !matches!(url.scheme(), "http" | "https")
    {
        return auth::response(400, json!({"error":"Preview must belong to this gateway"}));
    }
    static PROXY: OnceLock<Regex> = OnceLock::new();
    static FILE: OnceLock<Regex> = OnceLock::new();
    let proxy =
        PROXY.get_or_init(|| Regex::new(r"^/api/dev-proxy/(\d+)(/.*)?$").expect("static regex"));
    let file =
        FILE.get_or_init(|| Regex::new(r"^/api/dev-file/([^/]+)(/.*)?$").expect("static regex"));
    let search = url.query().map(|q| format!("?{q}")).unwrap_or_default();
    let (resource, url_path) = if let Some(c) = proxy.captures(url.path()) {
        let Some(port) = c.get(1).and_then(|m| parse_port(m.as_str())) else {
            return auth::response(404, json!({"error":"Preview not found"}));
        };
        if !s.ports.allows(&user.id, port) {
            return auth::response(404, json!({"error":"Preview not found"}));
        }
        (
            format!("proxy:{}", &c[1]),
            format!(
                "/proxy/{}{}{search}",
                &c[1],
                c.get(2).map_or("/", |m| m.as_str())
            ),
        )
    } else if let Some(c) = file.captures(url.path()) {
        // The file handler validates canonical project paths before reading anything.
        (
            format!("file:{}", &c[1]),
            format!(
                "/file/{}{}{search}",
                &c[1],
                c.get(2).map_or("", |m| m.as_str())
            ),
        )
    } else {
        return auth::response(400, json!({"error":"Unsupported preview source"}));
    };
    let secret = s.auth.signing_secret();
    let Ok(token) = sign_preview_token(&user.id, &resource, &secret) else {
        return auth::internal_error();
    };
    auth::response(
        200,
        json!({"url": format!("{}/preview/{token}{url_path}", url.origin().ascii_serialization())}),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_scopes_ports_to_owners() {
        let r = PreviewPortRegistry::default();
        r.register("a", 3000);
        assert!(r.allows("a", 3000));
        assert!(!r.allows("b", 3000));
        assert!(!r.allows("a", 3001));
        r.unregister("a", 3000);
        assert!(!r.allows("a", 3000));
    }

    #[test]
    fn port_must_be_in_range() {
        assert_eq!(parse_port("3000"), Some(3000));
        assert_eq!(parse_port("0"), None);
        assert_eq!(parse_port("65536"), None);
        assert_eq!(parse_port("abc"), None);
    }

    #[test]
    fn js_rewrite_prefixes_vite_paths() {
        let out = rewrite_text(
            r#"import "/@vite/client";x("/src/a.js")"#,
            "text/javascript",
            "/p",
            "/a.js",
        );
        assert_eq!(out, r#"import "/p/@vite/client";x("/p/src/a.js")"#);
        assert!(module_like("/src/main.tsx"));
        assert!(!module_like("/"));
    }
}
