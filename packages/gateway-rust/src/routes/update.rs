//! Authenticated update HTTP adapter. Effects are supplied by a host-owned backend.
//! The backend must supervise preparation and cleanup independently of request
//! cancellation, and transfer activation to a controller outside the service.
use super::auth::{self, AuthState, response};
use super::update_failure::describe_update_failure;
use crate::{contracts::bounded_json::Utf16Text, update::safe_update::web_version};
use axum::{
    Router,
    extract::{Request, State},
    response::Response,
    routing::{get, post},
};
use futures_util::future::BoxFuture;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::sync::Arc;

#[derive(Clone, Debug)]
pub struct UpdateError {
    pub detail: String,
    pub code: Option<String>,
}
#[derive(Clone, Debug, Deserialize)]
pub struct Release {
    pub tag_name: Option<String>,
    pub name: Option<String>,
    pub published_at: Option<String>,
    pub html_url: Option<String>,
    #[serde(default)]
    pub assets: Vec<ReleaseAsset>,
}
#[derive(Clone, Debug, Deserialize)]
pub struct ReleaseAsset {
    pub name: String,
    pub browser_download_url: String,
}
#[derive(Clone, Debug, Serialize)]
pub struct Commit {
    pub message: String,
    pub sha: String,
    pub date: String,
}

/// Implementations must bound network/process output and time, coalesce concurrent
/// latest checks, and retain ownership of effects and cleanup on cancellation.
/// apply must stage and validate before handing off to an independent rollback
/// controller; it must not install into live files in place.
pub trait UpdateBackend: Send + Sync {
    fn latest(&self) -> BoxFuture<'_, Result<String, UpdateError>>;
    fn releases(&self) -> BoxFuture<'_, Result<Vec<Release>, UpdateError>>;
    fn latest_release(&self) -> BoxFuture<'_, Result<Release, UpdateError>>;
    fn commits(
        &self,
        base: String,
        head: String,
    ) -> BoxFuture<'_, Result<Vec<Commit>, UpdateError>>;
    fn apply(&self, version: String) -> BoxFuture<'_, Result<String, UpdateError>>;
}
#[derive(Clone)]
pub struct UpdateRoutes {
    pub auth: AuthState,
    pub backend: Arc<dyn UpdateBackend>,
    pub current_version: String,
    pub systemd_managed: bool,
}
impl UpdateRoutes {
    pub fn router(self) -> Router {
        Router::new()
            .route("/api/update/check", get(handle))
            .route("/api/update/changelog", get(handle))
            .route("/api/update/apply", post(handle))
            .route("/api/mobile-update/check", get(handle))
            .with_state(self)
    }
}
fn compare_versions(a: &str, b: &str) -> f64 {
    let parse = |s: &str| {
        if s.trim().is_empty() {
            0.0
        } else {
            s.trim().parse::<f64>().unwrap_or(f64::NAN)
        }
    };
    let a: Vec<_> = a.split('.').map(parse).collect();
    let b: Vec<_> = b.split('.').map(parse).collect();
    for i in 0..a.len().max(b.len()) {
        let x = a.get(i).copied().unwrap_or(0.0);
        let y = b.get(i).copied().unwrap_or(0.0);
        if x != y {
            return x - y;
        }
    }
    0.0
}
fn mobile_update_payload(current_version: &str, release: &Release) -> Value {
    let current = current_version.trim();
    let latest = release
        .tag_name
        .as_deref()
        .unwrap_or("")
        .trim()
        .strip_prefix('v')
        .unwrap_or_else(|| release.tag_name.as_deref().unwrap_or("").trim())
        .to_owned();
    let apks: Vec<&ReleaseAsset> = release
        .assets
        .iter()
        .filter(|asset| {
            let name = asset.name.to_lowercase();
            name.ends_with(".apk") && !name.contains("unsigned")
        })
        .collect();
    let preferred = apks
        .iter()
        .copied()
        .find(|asset| asset.name.to_lowercase().contains("android"))
        .or_else(|| apks.first().copied());
    let wear = apks
        .iter()
        .copied()
        .find(|asset| asset.name.to_lowercase().contains("wear"));
    let has_update = !current.is_empty()
        && !latest.is_empty()
        && preferred.is_some()
        && compare_versions(&latest, current) > 0.0;
    json!({
        "currentVersion": current,
        "latestVersion": latest,
        "hasUpdate": has_update,
        "downloadUrl": preferred.map(|asset| asset.browser_download_url.clone()),
        "assetName": preferred.map(|asset| asset.name.clone()),
        "wearDownloadUrl": wear.map(|asset| asset.browser_download_url.clone()),
        "wearAssetName": wear.map(|asset| asset.name.clone()),
    })
}
fn query_value(query: &str, key: &str) -> String {
    let mut values = url::form_urlencoded::parse(query.as_bytes()).filter(|(k, _)| k == key);
    let Some((_, value)) = values.next() else {
        return String::new();
    };
    if values.next().is_some() {
        String::new()
    } else {
        value.into_owned()
    }
}
async fn handle(State(state): State<UpdateRoutes>, request: Request) -> Response {
    let headers = request.headers().clone();
    if let Err(r) = auth::require_user(&state.auth, &headers).await {
        return *r;
    }
    let path = request.uri().path().to_owned();
    if path == "/api/update/check" {
        return match state.backend.latest().await {
            Ok(latest) => {
                let latest = latest.trim();
                response(
                    200,
                    json!({"currentVersion":state.current_version,"latestVersion":latest,
                    "hasUpdate":latest != state.current_version && compare_versions(latest, &state.current_version) > 0.0}),
                )
            }
            Err(error) => response(
                502,
                json!({"error":"Failed to check for updates","detail":error.detail}),
            ),
        };
    }
    if path == "/api/mobile-update/check" {
        let query = request.uri().query().unwrap_or("");
        let current = query_value(query, "currentVersion");
        return match state.backend.latest_release().await {
            Ok(release) => response(200, mobile_update_payload(&current, &release)),
            Err(error) => response(
                502,
                json!({"error":"Failed to check for updates","detail":error.detail}),
            ),
        };
    }
    if path == "/api/update/changelog" {
        let query = request.uri().query().unwrap_or("");
        let from = query_value(query, "from");
        let to = query_value(query, "to");
        let raw_limit = query_value(query, "limit");
        let limit = if !raw_limit.is_empty() && raw_limit.bytes().all(|b| b.is_ascii_digit()) {
            raw_limit.parse::<usize>().ok()
        } else {
            None
        };
        let mut releases = match state.backend.releases().await {
            Ok(releases) => releases,
            Err(error) => {
                return response(
                    502,
                    json!({"error":"Failed to fetch release notes","detail":error.detail}),
                );
            }
        };
        let semver = regex::Regex::new(r"^[0-9]+\.[0-9]+\.[0-9]+$").expect("constant regex");
        releases.retain(|r| {
            r.tag_name
                .as_deref()
                .is_some_and(|tag| semver.is_match(tag.strip_prefix('v').unwrap_or(tag)))
        });
        releases.sort_by(|a, b| {
            compare_versions(
                b.tag_name.as_deref().unwrap_or("").trim_start_matches('v'),
                a.tag_name.as_deref().unwrap_or("").trim_start_matches('v'),
            )
            .partial_cmp(&0.0)
            .unwrap_or(std::cmp::Ordering::Equal)
        });
        let mut notes = Vec::new();
        for (i, release) in releases.iter().enumerate() {
            let tag = release.tag_name.as_deref().unwrap_or("");
            let version = tag.strip_prefix('v').unwrap_or(tag);
            if !to.is_empty() && compare_versions(version, &to) > 0.0 {
                continue;
            }
            if limit.unwrap_or(0) == 0
                && !from.is_empty()
                && compare_versions(version, &from) <= 0.0
            {
                break;
            }
            let previous = releases
                .get(i + 1)
                .and_then(|r| r.tag_name.as_deref())
                .unwrap_or("");
            let previous = previous.strip_prefix('v').unwrap_or(previous);
            let commits = if previous.is_empty() {
                Vec::new()
            } else {
                state
                    .backend
                    .commits(previous.into(), version.into())
                    .await
                    .unwrap_or_default()
            };
            notes.push(json!({"version":version,"name":release.name.as_deref().unwrap_or(tag),"publishedAt":release.published_at.as_deref().unwrap_or(""),"url":release.html_url.clone().unwrap_or_else(||format!("https://github.com/Widev-e-U/Jait/releases/tag/v{version}")),"previousVersion":previous,"commits":commits}));
            if limit.is_some_and(|n| n > 0 && notes.len() >= n) {
                break;
            }
        }
        return response(200, json!({"from":from,"to":to,"releases":notes}));
    }
    let body: Value = match auth::parse_body(request.into_body(), &headers).await {
        Ok(body) => body,
        Err(r) => return *r,
    };
    let version = web_version(body.get("version").and_then(Value::as_str));
    if !state.systemd_managed {
        return response(
            409,
            json!({"error":"Web updates require a systemd-managed gateway. Use jait update from a terminal."}),
        );
    }
    match state.backend.apply(version.to_owned()).await {
        Ok(new_version) => response(
            200,
            json!({"ok":true,"previousVersion":state.current_version,"newVersion":new_version,"message":format!("Updated to {new_version}. Restarting...")}),
        ),
        Err(error) => {
            let failure = describe_update_failure(
                &Utf16Text::from(error.detail.as_str()),
                error.code.as_deref(),
            );
            response(
                500,
                json!({"error":failure.hint.unwrap_or("Update failed"),"code":failure.code,"hint":failure.hint,"detail":failure.detail}),
            )
        }
    }
}

/// Read-only implementation. Activation is deliberately unavailable until a host
/// supplies an independent controller with rollback and health verification.
pub struct ReadOnlyUpdateBackend {
    client: reqwest::Client,
    latest_check: fn() -> BoxFuture<'static, Result<String, UpdateError>>,
    latest: Arc<
        tokio::sync::Mutex<
            Option<futures_util::future::Shared<BoxFuture<'static, Result<String, UpdateError>>>>,
        >,
    >,
    releases_cache: tokio::sync::Mutex<Option<(std::time::Instant, Vec<Release>)>>,
    compare_cache: tokio::sync::Mutex<
        std::collections::HashMap<(String, String), (std::time::Instant, Vec<Commit>)>,
    >,
}

impl ReadOnlyUpdateBackend {
    pub fn new() -> Result<Self, UpdateError> {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .redirect(reqwest::redirect::Policy::none())
            .user_agent("jait-gateway")
            .build()
            .map_err(update_error)?;
        Ok(Self {
            client,
            latest_check: || Box::pin(npm_latest()),
            latest: Arc::new(tokio::sync::Mutex::new(None)),
            releases_cache: tokio::sync::Mutex::new(None),
            compare_cache: tokio::sync::Mutex::new(std::collections::HashMap::new()),
        })
    }

    async fn github_json(&self, path: &str) -> Result<Value, UpdateError> {
        use futures_util::StreamExt;
        let response = self
            .client
            .get(format!(
                "https://api.github.com/repos/Widev-e-U/Jait/{path}"
            ))
            .header(reqwest::header::ACCEPT, "application/vnd.github+json")
            .send()
            .await
            .map_err(update_error)?
            .error_for_status()
            .map_err(update_error)?;
        let mut stream = response.bytes_stream();
        let mut bytes = Vec::new();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(update_error)?;
            if bytes.len().saturating_add(chunk.len()) > 2 * 1024 * 1024 {
                return Err(update_error("GitHub response exceeds 2 MiB"));
            }
            bytes.extend_from_slice(&chunk);
        }
        serde_json::from_slice(&bytes).map_err(update_error)
    }
}

fn update_error(error: impl std::fmt::Display) -> UpdateError {
    UpdateError {
        detail: error.to_string(),
        code: None,
    }
}

async fn npm_latest() -> Result<String, UpdateError> {
    use std::process::Stdio;
    use tokio::io::AsyncReadExt;
    let mut command = tokio::process::Command::new(if cfg!(windows) { "npm.cmd" } else { "npm" });
    command
        .args(["view", "@jait/gateway", "version"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    let mut child = command.spawn().map_err(update_error)?;
    let mut stdout = child
        .stdout
        .take()
        .ok_or_else(|| update_error("missing stdout"))?
        .take(65537);
    let mut stderr = child
        .stderr
        .take()
        .ok_or_else(|| update_error("missing stderr"))?
        .take(65537);
    let result = tokio::time::timeout(std::time::Duration::from_secs(15), async {
        let (out, err, status) = tokio::join!(
            async {
                let mut b = Vec::new();
                stdout.read_to_end(&mut b).await.map(|_| b)
            },
            async {
                let mut b = Vec::new();
                stderr.read_to_end(&mut b).await.map(|_| b)
            },
            child.wait()
        );
        let (out, err, status) = (
            out.map_err(update_error)?,
            err.map_err(update_error)?,
            status.map_err(update_error)?,
        );
        if out.len() > 65536 || err.len() > 65536 {
            return Err(update_error("npm output exceeds 64 KiB"));
        }
        if !status.success() {
            return Err(update_error(String::from_utf8_lossy(&err)));
        }
        Ok(String::from_utf8_lossy(&out).trim().to_owned())
    })
    .await;
    match result {
        Ok(result) => result,
        Err(_) => {
            let _ = child.kill().await;
            Err(update_error("npm check timed out"))
        }
    }
}

impl UpdateBackend for ReadOnlyUpdateBackend {
    fn latest(&self) -> BoxFuture<'_, Result<String, UpdateError>> {
        use futures_util::FutureExt;
        Box::pin(async move {
            let future = {
                let mut slot = self.latest.lock().await;
                if let Some(future) = &*slot {
                    future.clone()
                } else {
                    let check = (self.latest_check)();
                    let future = async { tokio::spawn(check).await.map_err(update_error)? }
                        .boxed()
                        .shared();
                    *slot = Some(future.clone());
                    let cleanup_future = future.clone();
                    let cleanup_slot = Arc::clone(&self.latest);
                    tokio::spawn(async move {
                        let _ = cleanup_future.await;
                        *cleanup_slot.lock().await = None;
                    });
                    future
                }
            };
            future.await
        })
    }
    fn releases(&self) -> BoxFuture<'_, Result<Vec<Release>, UpdateError>> {
        Box::pin(async move {
            let mut cache = self.releases_cache.lock().await;
            if let Some((at, data)) = &*cache
                && at.elapsed() < std::time::Duration::from_secs(600)
            {
                return Ok(data.clone());
            }
            let data: Vec<Release> =
                serde_json::from_value(self.github_json("releases?per_page=100").await?)
                    .map_err(update_error)?;
            *cache = Some((std::time::Instant::now(), data.clone()));
            Ok(data)
        })
    }
    fn latest_release(&self) -> BoxFuture<'_, Result<Release, UpdateError>> {
        Box::pin(async move {
            serde_json::from_value(self.github_json("releases/latest").await?).map_err(update_error)
        })
    }
    fn commits(
        &self,
        base: String,
        head: String,
    ) -> BoxFuture<'_, Result<Vec<Commit>, UpdateError>> {
        Box::pin(async move {
            let valid = |s: &str| {
                regex::Regex::new(r"^[0-9]+\.[0-9]+\.[0-9]+$")
                    .expect("constant regex")
                    .is_match(s)
            };
            if !valid(&base) || !valid(&head) {
                return Err(update_error("Invalid release version"));
            }
            let mut cache = self.compare_cache.lock().await;
            let key = (base.clone(), head.clone());
            if let Some((at, data)) = cache.get(&key)
                && at.elapsed() < std::time::Duration::from_secs(1800)
            {
                return Ok(data.clone());
            }
            let value = self
                .github_json(&format!("compare/v{base}...v{head}"))
                .await?;
            let data: Vec<Commit> = value
                .get("commits")
                .and_then(Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .map(|item| Commit {
                            message: item
                                .pointer("/commit/message")
                                .and_then(Value::as_str)
                                .unwrap_or("")
                                .to_owned(),
                            sha: item
                                .get("sha")
                                .and_then(Value::as_str)
                                .unwrap_or("")
                                .to_owned(),
                            date: item
                                .pointer("/commit/author/date")
                                .and_then(Value::as_str)
                                .unwrap_or("")
                                .to_owned(),
                        })
                        .collect()
                })
                .unwrap_or_default();
            if cache.len() >= 100 {
                cache.clear();
            }
            cache.insert(key, (std::time::Instant::now(), data.clone()));
            Ok(data)
        })
    }
    fn apply(&self, _version: String) -> BoxFuture<'_, Result<String, UpdateError>> {
        Box::pin(async {
            Err(update_error(
                "Update activation requires an independent rollback controller",
            ))
        })
    }
}

#[cfg(test)]
mod native_update_backend_focused_tests {
    use super::*;

    #[tokio::test]
    async fn coalesces_checks_and_cleans_up_after_caller_cancellation() {
        use std::sync::atomic::{AtomicUsize, Ordering};
        static CALLS: AtomicUsize = AtomicUsize::new(0);
        fn check() -> BoxFuture<'static, Result<String, UpdateError>> {
            Box::pin(async {
                CALLS.fetch_add(1, Ordering::SeqCst);
                tokio::time::sleep(std::time::Duration::from_millis(40)).await;
                Ok("1.2.3".into())
            })
        }
        CALLS.store(0, Ordering::SeqCst);
        let mut backend = ReadOnlyUpdateBackend::new().unwrap();
        backend.latest_check = check;
        let backend = Arc::new(backend);
        let caller = tokio::spawn({
            let backend = backend.clone();
            async move { backend.latest().await }
        });
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        caller.abort();
        let (a, b) = tokio::join!(backend.latest(), backend.latest());
        assert_eq!(a.unwrap(), "1.2.3");
        assert_eq!(b.unwrap(), "1.2.3");
        assert_eq!(CALLS.load(Ordering::SeqCst), 1);
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        assert_eq!(backend.latest().await.unwrap(), "1.2.3");
        assert_eq!(CALLS.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn mobile_payload_prefers_android_apk_and_skips_unsigned_builds() {
        let release = Release {
            tag_name: Some(" v1.4.0 ".into()),
            name: None,
            published_at: None,
            html_url: Some("https://example.invalid/release".into()),
            assets: vec![
                ReleaseAsset {
                    name: "jait-unsigned.apk".into(),
                    browser_download_url: "https://example.invalid/unsigned".into(),
                },
                ReleaseAsset {
                    name: "jait-wear-1.4.0.apk".into(),
                    browser_download_url: "https://example.invalid/wear".into(),
                },
                ReleaseAsset {
                    name: "jait-android-1.4.0.apk".into(),
                    browser_download_url: "https://example.invalid/android".into(),
                },
            ],
        };
        let payload = mobile_update_payload("1.3.0", &release);
        assert_eq!(payload["currentVersion"], "1.3.0");
        assert_eq!(payload["latestVersion"], "1.4.0");
        assert_eq!(payload["hasUpdate"], true);
        assert_eq!(payload["downloadUrl"], "https://example.invalid/android");
        assert_eq!(payload["assetName"], "jait-android-1.4.0.apk");
        assert_eq!(payload["wearDownloadUrl"], "https://example.invalid/wear");
        assert_eq!(payload["wearAssetName"], "jait-wear-1.4.0.apk");
    }

    #[test]
    fn mobile_payload_reports_no_update_without_a_newer_signed_apk() {
        let same = Release {
            tag_name: Some("v1.4.0".into()),
            name: None,
            published_at: None,
            html_url: None,
            assets: vec![ReleaseAsset {
                name: "jait.apk".into(),
                browser_download_url: "https://example.invalid/apk".into(),
            }],
        };
        assert_eq!(mobile_update_payload("1.4.0", &same)["hasUpdate"], false);

        let unsigned_only = Release {
            tag_name: Some("v2.0.0".into()),
            assets: vec![ReleaseAsset {
                name: "Jait-UNSIGNED.apk".into(),
                browser_download_url: "https://example.invalid/unsigned".into(),
            }],
            ..same.clone()
        };
        let payload = mobile_update_payload("1.4.0", &unsigned_only);
        assert_eq!(payload["latestVersion"], "2.0.0");
        assert_eq!(payload["hasUpdate"], false);
        assert_eq!(payload["downloadUrl"], serde_json::Value::Null);

        let no_current = mobile_update_payload("  ", &same);
        assert_eq!(no_current["hasUpdate"], false);
    }

    #[tokio::test]
    async fn refuses_activation_and_rejects_compare_path_injection() {
        let backend = ReadOnlyUpdateBackend::new().unwrap();
        let err = backend.apply("latest".into()).await.unwrap_err();
        assert!(err.detail.contains("independent rollback controller"));
        assert!(
            backend
                .commits("../x".into(), "1.2.3".into())
                .await
                .is_err()
        );
    }

    struct FakeReleaseBackend {
        release: Release,
    }

    impl UpdateBackend for FakeReleaseBackend {
        fn latest(&self) -> BoxFuture<'_, Result<String, UpdateError>> {
            Box::pin(async { Ok("0.9.0".into()) })
        }
        fn releases(&self) -> BoxFuture<'_, Result<Vec<Release>, UpdateError>> {
            Box::pin(async { Ok(Vec::new()) })
        }
        fn latest_release(&self) -> BoxFuture<'_, Result<Release, UpdateError>> {
            Box::pin(async { Ok(self.release.clone()) })
        }
        fn commits(
            &self,
            _base: String,
            _head: String,
        ) -> BoxFuture<'_, Result<Vec<Commit>, UpdateError>> {
            Box::pin(async { Ok(Vec::new()) })
        }
        fn apply(&self, _version: String) -> BoxFuture<'_, Result<String, UpdateError>> {
            Box::pin(async {
                Err(UpdateError {
                    detail: "fixture backend does not activate".into(),
                    code: None,
                })
            })
        }
    }

    /// The route table must actually serve the mobile endpoint, apply the same
    /// authentication as the TypeScript handler, and project the backend release
    /// through the shared selection helper.
    #[tokio::test]
    async fn router_serves_authenticated_mobile_update_check() {
        use crate::security::http_auth::{AuthUser, sign_auth_token};
        use axum::body::{Body, to_bytes};
        use tower::ServiceExt;

        const SECRET: &str = "update-router-fixture-secret";
        let root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../.jait/artifacts/gateway-rust/update-routes")
            .join(uuid::Uuid::new_v4().to_string());
        std::fs::create_dir_all(&root).expect("fixture dir");
        let db = crate::db::open_database(&root.join("update.sqlite")).expect("db");
        crate::db::migrate_database(&db).expect("migrate");
        db.execute(
            "INSERT INTO users(id, username, password_hash, created_at, updated_at) \
             VALUES ('owner', 'owner', 'unused', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z')",
            [],
        )
        .expect("seed user");

        let release = Release {
            tag_name: Some("v1.0.0".into()),
            name: Some("1.0.0".into()),
            published_at: None,
            html_url: None,
            assets: vec![
                ReleaseAsset {
                    name: "jait-unsigned.apk".into(),
                    browser_download_url: "https://example.invalid/unsigned.apk".into(),
                },
                ReleaseAsset {
                    name: "jait-android-release.apk".into(),
                    browser_download_url: "https://example.invalid/android.apk".into(),
                },
                ReleaseAsset {
                    name: "jait-wear-release.apk".into(),
                    browser_download_url: "https://example.invalid/wear.apk".into(),
                },
            ],
        };
        let routes = UpdateRoutes {
            auth: AuthState::new(db, SECRET.to_string()).expect("auth state"),
            backend: Arc::new(FakeReleaseBackend { release }),
            current_version: "0.9.0".into(),
            systemd_managed: false,
        };
        let uri = "/api/mobile-update/check?currentVersion=0.9.0";

        let anonymous = routes
            .clone()
            .router()
            .oneshot(
                axum::http::Request::builder()
                    .method("GET")
                    .uri(uri)
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("response");
        assert_eq!(anonymous.status().as_u16(), 401);

        let token = sign_auth_token(
            &AuthUser {
                id: "owner".into(),
                username: "owner".into(),
            },
            SECRET,
        )
        .expect("token");
        let authorized = routes
            .router()
            .oneshot(
                axum::http::Request::builder()
                    .method("GET")
                    .uri(uri)
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("response");
        assert_eq!(authorized.status().as_u16(), 200);
        let bytes = to_bytes(authorized.into_body(), usize::MAX)
            .await
            .expect("body");
        let payload: Value = serde_json::from_slice(&bytes).expect("json");
        assert_eq!(payload["currentVersion"], "0.9.0");
        assert_eq!(payload["latestVersion"], "1.0.0");
        assert_eq!(payload["hasUpdate"], true);
        assert_eq!(payload["assetName"], "jait-android-release.apk");
        assert_eq!(
            payload["downloadUrl"],
            "https://example.invalid/android.apk"
        );
        assert_eq!(payload["wearAssetName"], "jait-wear-release.apk");
        assert_eq!(
            payload["wearDownloadUrl"],
            "https://example.invalid/wear.apk"
        );
    }
}
