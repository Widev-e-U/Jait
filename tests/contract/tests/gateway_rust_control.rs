#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    db,
    security::{control_access::*, worktree_sandbox::worktree_git_mount_args},
    services::{
        device_registry::{DeviceRegistry, RegisterDevice},
        sessions::SessionService,
    },
};
use serde_json::{Value, json};
use std::{
    fs,
    path::{Path, PathBuf},
};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn fixture() -> PathBuf {
    let path = root()
        .join(".jait/artifacts/gateway-rust/native-control")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&path).unwrap();
    path
}
fn observe(call: Value) -> Value {
    let dir = fixture();
    internal_driver::call(&root(), &dir, json!({"version":1,"calls":[call]}), &|| {
        false
    })
    .unwrap()[0]
        .clone()
}
#[test]
fn device_registration_deduplicates_capabilities_preserves_connection_time_and_sorts_stable_ties() {
    let steps = json!([
        {"op":"count"},{"op":"heartbeat","id":"missing"},
        {"op":"register","data":{"id":"a","name":"one","platform":"linux","capabilities":["terminal","fs","terminal","FS","🦀","🦀"]}},
        {"op":"register","data":{"id":"b","name":"two","platform":"windows","capabilities":[]}},
        {"op":"list"},{"op":"count"},
        {"op":"register","now":"2026-10-19T13:00:00.000Z","data":{"id":"a","name":"updated","platform":"macos","capabilities":["screen"]}},
        {"op":"list"},{"op":"heartbeat","now":"2026-10-19T14:00:00.000Z","id":"b"},
        {"op":"list"},{"op":"heartbeat","id":"a"},{"op":"list"},{"op":"count"},
        {"op":"register","data":{"id":"","name":"","platform":"android","capabilities":[""]}},{"op":"list"}
    ]);
    let expected = observe(json!({"op":"nativecontrol.devices","steps":steps}));
    let mut registry = DeviceRegistry::default();
    let mut now = "2026-10-18T12:00:00.000Z";
    let mut actual = vec![];
    for step in steps.as_array().unwrap() {
        if let Some(time) = step["now"].as_str() {
            now = time;
        }
        actual.push(match step["op"].as_str().unwrap() {
            "count" => json!(registry.count()),
            "register" => json!(registry.register(
                serde_json::from_value::<RegisterDevice>(step["data"].clone()).unwrap(),
                now
            )),
            "heartbeat" => json!(registry.heartbeat(step["id"].as_str().unwrap(), now)),
            "list" => json!(registry.list()),
            _ => panic!("unknown step"),
        });
    }
    assert_eq!(json!(actual), expected);
    assert_eq!(actual[6]["connectedAt"], "2026-10-18T12:00:00.000Z");
    assert_eq!(actual[11][0]["id"], "a");
}
struct Fixture(Value);
impl SurfaceAccess for Fixture {
    fn surface(&self, id: &str) -> AccessResult<Option<AccessSurface>> {
        Ok(self.0["surfaces"]
            .get(id)
            .filter(|v| !v.is_null())
            .map(|v| AccessSurface {
                session_id: v["sessionId"].as_str().map(String::from),
                owner: self.0["owners"][id].as_str().map(String::from),
            }))
    }
}
impl ConsentAccess for Fixture {
    fn request(&self, id: &str) -> AccessResult<Option<AccessConsent>> {
        Ok(self.0["consent"]
            .get(id)
            .filter(|v| !v.is_null())
            .map(|v| AccessConsent {
                status: v["status"].as_str().unwrap_or("").into(),
                session_id: v["sessionId"].as_str().unwrap_or("").into(),
            }))
    }
}
impl ThreadAccess for Fixture {
    fn owner(&self, id: &str) -> AccessResult<Option<String>> {
        Ok(self.0["threads"][id]["userId"].as_str().map(String::from))
    }
}
fn access(mut input: Value) -> Value {
    input["op"] = json!("nativecontrol.access");
    let expected = observe(input.clone());
    let db = db::open_database(Path::new(":memory:")).unwrap();
    db::migrate_database(&db).unwrap();
    if let Some(sql) = input["sql"].as_str() {
        db.execute_batch(sql).unwrap();
    }
    let sessions = SessionService::new(&db);
    let fixture = Fixture(input.clone());
    let policy = ControlAccess {
        sessions: (input["sessions"] != false).then_some(&sessions as &dyn SessionAccess),
        surfaces: input
            .get("surfaces")
            .map(|_| &fixture as &dyn SurfaceAccess),
        consent: input.get("consent").map(|_| &fixture as &dyn ConsentAccess),
        threads: input.get("threads").map(|_| &fixture as &dyn ThreadAccess),
    };
    let actual=input["steps"].as_array().unwrap().iter().map(|step|{
        let id=step["id"].as_str().unwrap();let user=step["user"].as_str();
        let result=match step["op"].as_str().unwrap(){
            "session"=>policy.session(id,user).map(|v|json!(v)),
            "surface"=>policy.surface(id,user).map(|v|json!(v)),
            "consent"=>policy.consent_request(id,user).map(|v|json!(v)),
            "execution"=>policy.execution_session(id,user.unwrap(),step["root"].as_str().unwrap()).map(|result|{
                if id=="default"&&policy.sessions.is_some(){
                    let record=sessions.get(&result,None).unwrap().unwrap();
                    json!({"created":result!="default","user":record.user_id,"name":record.name,"path":record.project_path})
                }else{json!(result)}
            }),
            _=>panic!("unknown step"),
        };result.unwrap_or_else(|_|json!({"error":true}))
    }).collect::<Vec<_>>();
    let count: i64 = db
        .query_row("SELECT count(*) FROM sessions", [], |r| r.get(0))
        .unwrap();
    let result = json!({"results":actual,"count":count});
    assert_eq!(result, expected);
    result
}
#[test]
fn control_policy_enforces_user_sessions_threads_surface_owners_and_pending_consent() {
    let seed = "INSERT INTO sessions(id,user_id,name,project_path,created_at,last_active_at) VALUES('owned','alice','one','/fixture','2020','2020'),('foreign','bob','two','/fixture','2020','2020'),('unowned',NULL,'three','/fixture','2020','2020');";
    let mut steps = vec![];
    for op in ["session", "surface", "consent"] {
        for id in [
            "owned", "foreign", "unowned", "thread", "shadow", "missing", "empty", "pending",
            "done",
        ] {
            for user in [json!("alice"), json!("bob"), Value::Null, json!("")] {
                steps.push(json!({"op":op,"id":id,"user":user}));
            }
        }
    }
    // The bridge protocol limits requests to 64 KiB, while one scenario may contain many policy checks.
    access(json!({"sql":seed,
        "threads":{"thread":{"userId":"alice"},"shadow":{"userId":"alice"}},
        "surfaces":{"owned":{"sessionId":"owned"},"foreign":{"sessionId":"owned"},"unowned":{"sessionId":"unowned"},"thread":{"sessionId":"thread"},"shadow":{"sessionId":"foreign"},"empty":{}},
        "owners":{"foreign":"bob","shadow":"alice","empty":""},
        "consent":{"pending":{"sessionId":"owned","status":"pending"},"done":{"sessionId":"owned","status":"approved"},"thread":{"sessionId":"thread","status":"pending"},"foreign":{"sessionId":"foreign","status":"pending"}},
        "steps":steps}));
}
#[test]
fn control_defaults_create_distinct_owned_execution_sessions_and_optional_stores_deny() {
    let result = access(json!({"steps":[
        {"op":"execution","id":"default","user":"alice","root":"/fixture/root"},
        {"op":"execution","id":"default","user":"bob","root":"/fixture/second"},
        {"op":"execution","id":"chosen","user":"alice","root":"/fixture/root"},
        {"op":"session","id":"chosen","user":"alice"},{"op":"surface","id":"unknown","user":"alice"},{"op":"consent","id":"unknown","user":"alice"}
    ]}));
    assert_eq!(result["count"], 2);
    access(
        json!({"sessions":false,"steps":[{"op":"execution","id":"default","user":"alice","root":"/fixture"},{"op":"session","id":"default","user":"alice"}]}),
    );
    access(
        json!({"sql":"DROP TABLE sessions; CREATE TABLE sessions(id TEXT);","steps":[{"op":"session","id":"x","user":"alice"},{"op":"execution","id":"default","user":"alice","root":"/fixture"}]}),
    );
}
fn mount(path: &Path) {
    let expected = observe(json!({"op":"nativecontrol.mount","root":path}));
    let actual = match worktree_git_mount_args(path) {
        Ok(args) => json!({"args":args}),
        Err(_) => json!({"error":true}),
    };
    assert_eq!(actual, expected, "{}", path.display());
}
fn worktree(base: &Path, common_name: &str) -> (PathBuf, PathBuf, PathBuf) {
    let root = base.join("checkout");
    let common = base.join(common_name).join(".git");
    let admin = common.join("worktrees/branch");
    fs::create_dir_all(&root).unwrap();
    fs::create_dir_all(&admin).unwrap();
    fs::write(root.join(".git"), format!("gitdir: {}\n", admin.display())).unwrap();
    fs::write(admin.join("commondir"), "../..\n").unwrap();
    fs::write(
        admin.join("gitdir"),
        format!("{}\n", root.join(".git").display()),
    )
    .unwrap();
    (root, common, admin)
}
#[test]
fn worktree_mounts_only_registered_common_metadata_read_only() {
    let dir = fixture();
    let (root, common, admin) = worktree(&dir, "main checkout");
    mount(&root);
    assert_eq!(
        worktree_git_mount_args(&root).unwrap(),
        vec![
            "-v".to_string(),
            format!("{}:{}:ro", common.display(), common.display())
        ]
    );
    fs::write(
        root.join(".git"),
        "gitdir: ../main checkout/.git/worktrees/branch\r\n",
    )
    .unwrap();
    mount(&root);
    fs::write(admin.join("gitdir"), "../../../..//checkout/.git\n").unwrap();
    mount(&root);
    fs::write(
        root.join(".git"),
        "prefix ignored\ngitdir: ../main checkout/.git/worktrees/branch\nsuffix ignored\n",
    )
    .unwrap();
    mount(&root);
}
#[test]
fn worktree_rejects_forged_backlinks_unregistered_admins_colons_and_invalid_markers() {
    for mode in [
        "bad-backlink",
        "bad-admin",
        "bad-common",
        "colon",
        "bad-marker",
        "missing-common",
    ] {
        let dir = fixture();
        let (root, _, admin) = worktree(
            &dir,
            if mode == "colon" {
                "main:checkout"
            } else {
                "main"
            },
        );
        match mode {
            "bad-backlink" => {
                fs::write(admin.join("gitdir"), "missing").unwrap();
            }
            "bad-admin" => {
                let moved = dir.join("forged");
                fs::rename(&admin, &moved).unwrap();
                fs::write(root.join(".git"), format!("gitdir: {}", moved.display())).unwrap();
            }
            "bad-common" => {
                fs::write(admin.join("commondir"), dir.to_str().unwrap()).unwrap();
            }
            "bad-marker" => {
                fs::write(root.join(".git"), "not a git pointer").unwrap();
            }
            "missing-common" => {
                fs::remove_file(admin.join("commondir")).unwrap();
            }
            _ => {}
        };
        mount(&root);
        assert!(worktree_git_mount_args(&root).is_err());
    }
}
#[test]
#[cfg(unix)]
fn worktree_marker_symlinks_and_ordinary_checkout_behavior_match() {
    use std::os::unix::fs::symlink;
    let dir = fixture();
    let (root, _, _) = worktree(&dir, "main");
    fs::rename(root.join(".git"), root.join("pointer")).unwrap();
    symlink(root.join("pointer"), root.join(".git")).unwrap();
    mount(&root);
    assert!(worktree_git_mount_args(&root).is_err());
    fs::remove_file(root.join("pointer")).unwrap();
    mount(&root);
    assert!(worktree_git_mount_args(&root).unwrap().is_empty());
    fs::remove_file(root.join(".git")).unwrap();
    fs::create_dir(root.join(".git")).unwrap();
    mount(&root);
    fs::remove_dir(root.join(".git")).unwrap();
    mount(&root);
    mount(&dir.join("missing"));
}
