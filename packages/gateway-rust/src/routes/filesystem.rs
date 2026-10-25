//! Opt-in filesystem browsing API. Local I/O uses a bounded blocking lane;
//! remote node requests require an explicitly supplied control-plane adapter.
use super::auth::{self, AuthState, response};
use crate::{runtime::blocking::BlockingLane, surfaces::filesystem::FileSystemError};
use axum::{
    Router,
    extract::{Request, State},
    response::Response,
    routing::get,
};
use icu_collator::{Collator, options::CollatorOptions};
use serde_json::{Value, json};
use std::{
    fs,
    future::Future,
    path::{Path, PathBuf},
    pin::Pin,
    sync::Arc,
};

pub type BrowseFuture<'a> = Pin<Box<dyn Future<Output = Result<Value, BrowseError>> + Send + 'a>>;
#[derive(Clone, Debug)]
pub enum BrowseError {
    Message(String),
    Thrown(Value),
}
impl BrowseError {
    fn message(self, fallback: &str) -> String {
        match self {
            Self::Message(s) => s,
            Self::Thrown(_) => fallback.into(),
        }
    }
}
/// Transport adapters enforce their existing node authorization and deadlines.
/// Query values retain arrays from repeated parameters just like Fastify.
pub trait FilesystemNodes: Send + Sync {
    fn register_gateway(&self, node: Value);
    fn nodes(&self) -> Value;
    fn roots<'a>(&'a self, node: Value) -> BrowseFuture<'a>;
    fn browse<'a>(&'a self, node: Value, path: Value) -> BrowseFuture<'a>;
}
#[derive(Clone)]
pub struct BrowseEnvironment {
    pub home: PathBuf,
    pub cwd: PathBuf,
    pub hostname: String,
    /// Node platform names (win32/darwin/linux).
    pub platform: String,
    /// Windows drive discovery is an explicit host port, never a shell interpolation.
    pub drives: Arc<dyn Fn() -> Result<String, String> + Send + Sync>,
}
#[derive(Clone)]
pub struct FilesystemRoutes {
    pub auth: AuthState,
    pub environment: BrowseEnvironment,
    pub nodes: Option<Arc<dyn FilesystemNodes>>,
    pub lane: BlockingLane,
}
impl FilesystemRoutes {
    pub fn new(
        auth: AuthState,
        environment: BrowseEnvironment,
        nodes: Option<Arc<dyn FilesystemNodes>>,
        now: String,
    ) -> Self {
        if let Some(nodes) = &nodes {
            let platform = match environment.platform.as_str() {
                "win32" => "windows",
                "darwin" => "macos",
                _ => "linux",
            };
            nodes.register_gateway(json!({"id":"gateway","name":format!("Gateway ({})",environment.hostname),"platform":platform,"clientId":"gateway","isGateway":true,"registeredAt":now}));
        }
        Self {
            auth,
            environment,
            nodes,
            lane: BlockingLane::new(std::num::NonZeroU16::new(2).unwrap()),
        }
    }
    pub fn router(self) -> Router {
        Router::new()
            .route("/api/filesystem/nodes", get(handle))
            .route("/api/filesystem/roots", get(handle))
            .route("/api/filesystem/browse", get(handle))
            .with_state(self)
    }
}
fn query(raw: &str) -> Value {
    let mut map = serde_json::Map::new();
    for (key, value) in url::form_urlencoded::parse(raw.as_bytes()) {
        let value = json!(value);
        match map.get_mut(key.as_ref()) {
            Some(Value::Array(values)) => values.push(value),
            Some(old) => {
                let first = old.take();
                *old = json!([first, value]);
            }
            None => {
                map.insert(key.into_owned(), value);
            }
        }
    }
    Value::Object(map)
}
fn truthy(v: &Value) -> bool {
    match v {
        Value::Null => false,
        Value::String(s) => !s.is_empty(),
        _ => true,
    }
}
async fn handle(State(state): State<FilesystemRoutes>, request: Request) -> Response {
    if let Err(error) = auth::require_user(&state.auth, request.headers()).await {
        return *error;
    }
    let path = request.uri().path();
    let query = query(request.uri().query().unwrap_or(""));
    if path.ends_with("/nodes") {
        return response(
            200,
            json!({"nodes":state.nodes.as_ref().map(|n|n.nodes()).unwrap_or(json!([]))}),
        );
    }
    if truthy(&query["nodeId"])
        && query["nodeId"] != "gateway"
        && let Some(nodes) = &state.nodes
    {
        let result = if path.ends_with("/roots") {
            nodes
                .roots(query["nodeId"].clone())
                .await
                .map(|roots| json!({"roots":roots}))
        } else {
            nodes
                .browse(
                    query["nodeId"].clone(),
                    if truthy(&query["path"]) {
                        query["path"].clone()
                    } else {
                        json!("~")
                    },
                )
                .await
        };
        return match result {
            Ok(v) => response(200, v),
            Err(error) => response(
                502,
                json!({"error":"NODE_BROWSE_FAILED","message":error.message("Failed to browse remote node")}),
            ),
        };
    }
    let roots = path.ends_with("/roots");
    let environment = state.environment;
    match state
        .lane
        .run(move || {
            if roots {
                local_roots(&environment)
            } else {
                local_browse(&environment, &query["path"])
            }
        })
        .await
    {
        Ok(result) => result,
        Err(_) => response(503, json!({"error":"BROWSE_BUSY"})),
    }
}
fn local_roots(env: &BrowseEnvironment) -> Response {
    let mut roots = vec![];
    if env.platform == "win32" {
        match (env.drives)() {
            Ok(raw) => {
                for line in raw.split('\n').map(crate::text::js_trim) {
                    let bytes = line.as_bytes();
                    if bytes.len() == 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':' {
                        roots.push(json!({"name":line,"path":format!("{line}\\"),"type":"dir"}));
                    }
                }
            }
            Err(_) => roots.push(json!({"name":"C:","path":"C:\\","type":"dir"})),
        }
    } else {
        roots.push(json!({"name":"/","path":"/","type":"dir"}));
    }
    roots.push(json!({"name":"Home","path":env.home,"type":"dir"}));
    response(200, json!({"roots":roots}))
}
fn absolute(cwd: &Path, value: &str) -> PathBuf {
    let target = Path::new(value);
    let joined = if target.is_absolute() {
        target.to_path_buf()
    } else {
        cwd.join(target)
    };
    // Lexical path.resolve; do not canonicalize links or require the target to exist.
    let mut result = PathBuf::new();
    for part in joined.components() {
        use std::path::Component;
        match part {
            Component::ParentDir => {
                result.pop();
            }
            Component::CurDir => {}
            _ => result.push(part),
        }
    }
    result
}
fn local_browse(env: &BrowseEnvironment, path: &Value) -> Response {
    let target = if !truthy(path) {
        env.home.clone()
    } else if let Some(s) = path.as_str() {
        absolute(&env.cwd, s)
    } else {
        return response(
            400,
            json!({"error":"BROWSE_FAILED","message":"The \"paths[0]\" property must be of type string, got array"}),
        );
    };
    if target.as_os_str().as_encoded_bytes().contains(&0) {
        return response(
            400,
            json!({"error":"BROWSE_FAILED","message":format!("The argument 'path' must be a string, Uint8Array, or URL without null bytes. Received {}",serde_json::to_string(&target).unwrap())}),
        );
    }
    let failure = |error, syscall| {
        response(
            400,
            json!({"error":"BROWSE_FAILED","message":FileSystemError::io(error,syscall,Some(&target),None).to_string()}),
        )
    };
    let metadata = match fs::metadata(&target) {
        Ok(v) => v,
        Err(e) => {
            return failure(e, "stat");
        }
    };
    if !metadata.is_dir() {
        return response(
            400,
            json!({"error":"NOT_A_DIRECTORY","message":"Path is not a directory"}),
        );
    }
    let raw = match fs::read_dir(&target) {
        Ok(v) => v,
        Err(e) => return failure(e, "scandir"),
    };
    let mut entries = vec![];
    for entry in raw {
        let entry = match entry {
            Ok(v) => v,
            Err(e) => return failure(e, "scandir"),
        };
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.')
            || [
                "$RECYCLE.BIN",
                "System Volume Information",
                "$WinREAgent",
                "DumpStack.log.tmp",
                "pagefile.sys",
                "hiberfil.sys",
                "swapfile.sys",
            ]
            .contains(&name.as_str())
        {
            continue;
        }
        let kind = match entry.file_type() {
            Ok(v) => v,
            Err(e) => return failure(e, "scandir"),
        };
        let kind = if kind.is_dir() {
            "dir"
        } else if kind.is_file() {
            "file"
        } else {
            continue;
        };
        entries.push(json!({"name":name,"path":target.join(entry.file_name()),"type":kind}));
    }
    let collator = Collator::try_new(Default::default(), CollatorOptions::default())
        .expect("compiled collation data");
    entries.sort_by(|a, b| {
        if a["type"] != b["type"] {
            return if a["type"] == "dir" {
                std::cmp::Ordering::Less
            } else {
                std::cmp::Ordering::Greater
            };
        }
        collator.compare(a["name"].as_str().unwrap(), b["name"].as_str().unwrap())
    });
    let parent = target.parent().filter(|p| *p != target);
    response(
        200,
        json!({"path":target,"parent":parent,"entries":entries}),
    )
}
