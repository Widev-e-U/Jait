#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    Gateway,
    config::GatewayConfig,
    db,
    health::HealthState,
    routes::{
        auth::AuthState,
        filesystem::{
            BrowseEnvironment, BrowseError, BrowseFuture, FilesystemNodes, FilesystemRoutes,
        },
    },
    security::http_auth::{self, AuthUser},
};
use serde_json::{Value, json};
use std::{
    fs,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Duration,
};
const NOW: &str = "2026-10-21T12:00:00.000Z";
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
struct Nodes {
    input: Value,
    calls: Mutex<Vec<Value>>,
    nodes: Mutex<Vec<Value>>,
}
impl Nodes {
    fn result(&self, op: &str, node: Value, path: Option<Value>) -> Result<Value, BrowseError> {
        let mut call = json!({"op":op,"node":node});
        if let Some(path) = path {
            call["path"] = path;
        }
        self.calls.lock().unwrap().push(call);
        if let Some(error) = self.input["error"].as_str() {
            return Err(BrowseError::Message(error.into()));
        }
        if let Some(thrown) = self.input.get("thrown") {
            return Err(BrowseError::Thrown(thrown.clone()));
        }
        Ok(if op == "roots" {
            self.input.get("remoteRoots").cloned().unwrap_or(json!([]))
        } else {
            self.input
                .get("remoteBrowse")
                .cloned()
                .unwrap_or(json!({"path":"remote","parent":null,"entries":[]}))
        })
    }
}
impl FilesystemNodes for Nodes {
    fn register_gateway(&self, node: Value) {
        self.calls
            .lock()
            .unwrap()
            .push(json!({"op":"register","node":node}));
        self.nodes.lock().unwrap().push(node);
    }
    fn nodes(&self) -> Value {
        json!(*self.nodes.lock().unwrap())
    }
    fn roots<'a>(&'a self, node: Value) -> BrowseFuture<'a> {
        Box::pin(async move { self.result("roots", node, None) })
    }
    fn browse<'a>(&'a self, node: Value, path: Value) -> BrowseFuture<'a> {
        Box::pin(async move { self.result("browse", node, Some(path)) })
    }
}
async fn scenario(mut input: Value, prepare: impl FnOnce(&std::path::Path)) -> Value {
    let dir = root()
        .join(".jait/artifacts/gateway-rust/filesystem-http")
        .join(uuid::Uuid::new_v4().to_string());
    let home = dir.join("home");
    fs::create_dir_all(&home).unwrap();
    prepare(&home);
    input["now"] = json!(NOW);
    input["home"] = json!(home);
    input["artifactRoot"] = json!(dir);
    // Test path placeholders retain exact percent-encoded query values.
    for step in input["steps"].as_array_mut().unwrap() {
        if let Some(path) = step["path"].as_str() {
            step["path"] = json!(path.replace("$home", &percent_encode(home.to_str().unwrap())));
        }
    }
    let reference_input = input.clone();
    let reference_dir = dir.clone();
    let expected = tokio::task::spawn_blocking(move || {
        internal_driver::call(
            &root(),
            &reference_dir,
            {
                let mut call = reference_input;
                call["op"] = json!("nativefilesystemhttp.run");
                json!({"version":1,"calls":[call]})
            },
            &|| false,
        )
    })
    .await
    .unwrap();
    let expected = expected.unwrap()[0].clone();
    let db = db::open_database(std::path::Path::new(":memory:")).unwrap();
    db::migrate_database(&db).unwrap();
    db.execute_batch("INSERT INTO users(id,username,password_hash,created_at,updated_at)VALUES('owner','alice','fixture','old','old')").unwrap();
    let auth = AuthState::new(db, "filesystem-http-fixture".into()).unwrap();
    let nodes = Arc::new(Nodes {
        input: input.clone(),
        calls: Mutex::new(vec![]),
        nodes: Mutex::new(input["nodes"].as_array().cloned().unwrap_or_default()),
    });
    let drives = input
        .get("drives")
        .and_then(Value::as_str)
        .unwrap_or("Name\nC:\nD:\n")
        .to_string();
    let drive_error = input["driveError"] == true;
    let env = BrowseEnvironment {
        home,
        cwd: root(),
        hostname: "fixture-host".into(),
        platform: input["platform"].as_str().unwrap_or("linux").into(),
        drives: Arc::new(move || {
            if drive_error {
                Err("drive failure".into())
            } else {
                Ok(drives.clone())
            }
        }),
    };
    let routes = FilesystemRoutes::new(
        auth.clone(),
        env,
        if input["ws"] == false {
            None
        } else {
            Some(nodes.clone())
        },
        NOW.into(),
    );
    let gateway = Gateway::bind_authenticated(
        GatewayConfig {
            address: "127.0.0.1:0".parse().unwrap(),
        },
        HealthState::default(),
        auth.clone(),
    )
    .await
    .unwrap()
    .with_filesystem(routes);
    let base = format!("http://{}", gateway.local_addr().unwrap());
    let (send, receive) = tokio::sync::oneshot::channel();
    let task = tokio::spawn(gateway.serve(async {
        let _ = receive.await;
    }));
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .unwrap();
    let mut results = vec![];
    for step in input["steps"].as_array().unwrap() {
        if step["deleteUser"] == true {
            auth.with_database(|db| {
                db.execute("DELETE FROM users WHERE id='owner'", [])?;
                Ok(())
            })
            .await
            .unwrap();
            continue;
        }
        let mut request = client.request(
            step["method"].as_str().unwrap_or("GET").parse().unwrap(),
            format!("{base}{}", step["path"].as_str().unwrap()),
        );
        if let Some(headers) = step["headers"].as_object() {
            for (k, v) in headers {
                request = request.header(k, v.as_str().unwrap());
            }
        }
        if let Some(user) = step["user"].as_str() {
            let token = http_auth::sign_auth_token(
                &AuthUser {
                    id: user.into(),
                    username: "alice".into(),
                },
                "filesystem-http-fixture",
            )
            .unwrap();
            request = request.bearer_auth(token);
        }
        let res = request.send().await.unwrap();
        let status = res.status().as_u16();
        let raw = res.text().await.unwrap();
        let body = serde_json::from_str::<Value>(&raw).unwrap_or(json!(raw));
        results.push(json!({"status":status,"body":body}));
    }
    send.send(()).unwrap();
    task.await.unwrap().unwrap();
    let actual = json!({"results":results,"calls":*nodes.calls.lock().unwrap()});
    if actual != expected {
        fs::write(
            dir.join("native.json"),
            serde_json::to_vec_pretty(&actual).unwrap(),
        )
        .unwrap();
        fs::write(
            dir.join("reference.json"),
            serde_json::to_vec_pretty(&expected).unwrap(),
        )
        .unwrap();
        assert_eq!(
            actual,
            expected,
            "filesystem HTTP parity; artifacts {}",
            dir.display()
        );
    }
    actual
}
fn percent_encode(value: &str) -> String {
    url_encode(value)
}
fn url_encode(value: &str) -> String {
    value
        .bytes()
        .map(|b| {
            if b.is_ascii_alphanumeric() || b"-_.~".contains(&b) {
                (b as char).to_string()
            } else {
                format!("%{b:02X}")
            }
        })
        .collect()
}
#[tokio::test]
async fn local_browse_filters_sorts_and_preserves_lexical_paths() {
    let steps = json!([
     {"path":"/api/filesystem/nodes","user":"owner"},
     {"path":"/api/filesystem/roots","user":"owner"},
     {"path":"/api/filesystem/browse","user":"owner"},
     {"path":"/api/filesystem/browse?path=$home%2Fsub%2F..","user":"owner"},
     {"path":"/api/filesystem/browse?path=$home%2Fplain.txt","user":"owner"},
     {"path":"/api/filesystem/browse?path=$home%2Fmissing","user":"owner"},
     {"path":"/api/filesystem/browse?path=$home%2Fplain.txt%2Fx","user":"owner"},
     {"path":"/api/filesystem/browse?path=%2F","user":"owner"}
    ]);
    scenario(json!({"steps":steps}), |home| {
        fs::create_dir(home.join("sub")).unwrap();
        for name in ["z-dir", "a-dir", ".hidden-dir", "System Volume Information"] {
            fs::create_dir(home.join(name)).unwrap();
        }
        for name in [
            "plain.txt",
            "z.txt",
            "A.txt",
            "a.txt",
            "á.txt",
            "ä.txt",
            "2.txt",
            "10.txt",
            ".hidden",
            "pagefile.sys",
            "$WinREAgent",
            "swapfile.sys",
        ] {
            fs::write(home.join(name), "fixture").unwrap();
        }
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(home.join("sub"), home.join("dir-link")).unwrap();
            std::os::unix::fs::symlink(home.join("plain.txt"), home.join("file-link")).unwrap();
        }
    })
    .await;
}
#[tokio::test]
async fn remote_control_plane_forwarding_errors_and_optional_adapter() {
    for options in [
        json!({}),
        json!({"error":"device disconnected"}),
        json!({"thrown":"opaque"}),
        json!({"ws":false}),
    ] {
        let mut input = options;
        input["steps"] = json!([
         {"path":"/api/filesystem/roots?nodeId=remote","user":"owner"},
         {"path":"/api/filesystem/browse?nodeId=remote","user":"owner"},
         {"path":"/api/filesystem/browse?nodeId=remote&path=","user":"owner"},
         {"path":"/api/filesystem/browse?nodeId=remote&path=%2Fdata","user":"owner"},
         {"path":"/api/filesystem/roots?nodeId=gateway","user":"owner"},
         {"path":"/api/filesystem/browse?nodeId=gateway","user":"owner"},
         {"path":"/api/filesystem/browse?nodeId=x&nodeId=y&path=a&path=b","user":"owner"}
        ]);
        scenario(input, |_| {}).await;
    }
}
#[tokio::test]
async fn roots_identity_windows_drive_parsing_and_fallback() {
    for options in [
        json!({"platform":"win32","drives":"Name\r\n C: \r\n d:\n1:\nlong\nE:\n"}),
        json!({"platform":"win32","driveError":true}),
        json!({"platform":"win32","drives":"Name\ninvalid\n"}),
        json!({"platform":"darwin"}),
        json!({"platform":"unknown"}),
    ] {
        let mut input = options;
        input["steps"] = json!([{"path":"/api/filesystem/nodes","user":"owner"},{"path":"/api/filesystem/roots","user":"owner"}]);
        scenario(input, |_| {}).await;
    }
}
#[tokio::test]
async fn central_auth_blocks_requests_before_remote_effects() {
    scenario(json!({"steps":[
  {"path":"/api/filesystem/roots?nodeId=remote"},
  {"path":"/api/filesystem/browse?nodeId=remote","user":"owner","headers":{"origin":"https://evil.invalid"}},
  {"path":"/api/filesystem/nodes","user":"missing"},
  {"deleteUser":true},
  {"path":"/api/filesystem/roots?nodeId=remote","user":"owner"}
 ]}),|_|{}).await;
}
#[tokio::test]
async fn duplicate_local_path_parameters_match_errors() {
    scenario(json!({"steps":[{"path":"/api/filesystem/browse?path=a&path=b","user":"owner"},{"path":"/api/filesystem/browse?path=","user":"owner"},{"path":"/api/filesystem/browse?path=%00","user":"owner"}]}),|_|{}).await;
}
