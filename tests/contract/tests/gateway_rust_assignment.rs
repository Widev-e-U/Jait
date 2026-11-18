#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    db,
    services::{
        project_repositories::{
            AssignmentError, ProjectRepositoryAssignments, RepositoryGit, project_has_git_metadata,
            should_auto_claim_repository_for_node,
        },
        projects::ProjectService,
        repositories::{RepositoryRecord, RepositoryService},
    },
};
use serde_json::{Value, json};
use std::{cell::RefCell, fs, path::PathBuf, rc::Rc};
const NOW: &str = "2026-10-18T12:00:00.000Z";
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn fixture(kind: &str) -> String {
    let p = root()
        .join(".jait/artifacts/gateway-rust/native-assignment")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&p).unwrap();
    match kind {
        "directory" => fs::create_dir(p.join(".git")).unwrap(),
        "file" => fs::write(p.join(".git"), "gitdir: ../elsewhere").unwrap(),
        _ => {}
    }
    p.to_str().unwrap().into()
}
fn observe(call: Value) -> Value {
    let dir = PathBuf::from(fixture("none"));
    internal_driver::call(&root(), &dir, json!({"version":1,"calls":[call]}), &|| {
        false
    })
    .unwrap()[0]
        .clone()
}
struct Git {
    data: Value,
    calls: Rc<RefCell<Vec<Value>>>,
}
impl Git {
    fn answer(&mut self, method: &str, args: Value, fallback: Value) -> Result<Value, String> {
        let mut entry = vec![json!(method)];
        entry.extend(args.as_array().unwrap().clone());
        self.calls.borrow_mut().push(json!(entry));
        if self.data[method]["error"] == true {
            return Err("git failed".into());
        }
        Ok(self.data[method].get("value").cloned().unwrap_or(fallback))
    }
}
impl RepositoryGit for Git {
    fn status(&mut self, r: &str) -> Result<(Option<String>, Option<String>), String> {
        let v = self.answer("status", json!([r]), json!({}))?;
        Ok((
            v["branch"].as_str().map(str::to_string),
            v["remoteUrl"].as_str().map(str::to_string),
        ))
    }
    fn preferred_remote(&mut self, r: &str, b: Option<&str>) -> Result<Option<String>, String> {
        Ok(self
            .answer("preferred", json!([r, b]), Value::Null)?
            .as_str()
            .map(str::to_string))
    }
    fn remote_url(&mut self, r: &str, n: &str) -> Result<Option<String>, String> {
        Ok(self
            .answer("remote", json!([r, n]), Value::Null)?
            .as_str()
            .map(str::to_string))
    }
    fn default_branch(&mut self, r: &str, u: Option<&str>) -> Result<String, String> {
        Ok(self
            .answer("default", json!([r, u]), json!("main"))?
            .as_str()
            .unwrap()
            .into())
    }
}
fn error(e: AssignmentError) -> Value {
    match e {
        AssignmentError::Rejected(code, message) => json!({"code":code,"message":message}),
        _ => json!({"error":true}),
    }
}
fn normalize(v: &mut Value) {
    let replacements: Vec<(String, String)> = v["repositories"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|r| {
            let id = r["id"].as_str().unwrap();
            uuid::Uuid::parse_str(id).ok().map(|uuid| {
                assert_eq!(uuid.get_version_num(), 7);
                (
                    id.into(),
                    format!("<repo:{}>", r["localPath"].as_str().unwrap()),
                )
            })
        })
        .collect();
    fn visit(v: &mut Value, pairs: &[(String, String)]) {
        match v {
            Value::String(s) => {
                for (a, b) in pairs {
                    *s = s.replace(a, b)
                }
            }
            Value::Array(a) => {
                for v in a {
                    visit(v, pairs)
                }
            }
            Value::Object(o) => {
                for v in o.values_mut() {
                    visit(v, pairs)
                }
            }
            _ => {}
        }
    }
    visit(v, &replacements);
}
fn scenario(seed: String, steps: Value, git: Value) -> Value {
    let mut expected =
        observe(json!({"op":"nativeassignment.run","seed":seed,"steps":steps,"git":git,"now":NOW}));
    let db = db::open_database(std::path::Path::new(":memory:")).unwrap();
    db::migrate_database(&db).unwrap();
    db.execute_batch(&seed).unwrap();
    let projects = ProjectService::with_time(&db, NOW);
    let repositories = RepositoryService::with_time(&db, NOW);
    let calls = Rc::new(RefCell::new(vec![]));
    let mut events = vec![];
    let mut service = ProjectRepositoryAssignments {
        projects: &projects,
        repositories: &repositories,
        git: Git {
            data: git,
            calls: calls.clone(),
        },
        emit: |event: &str, repo: &RepositoryRecord| {
            events.push(json!({"event":event,"repo":repo}))
        },
    };
    let mut results = vec![];
    for step in steps.as_array().unwrap() {
        let u = step["user"].as_str();
        results.push(match step["op"].as_str().unwrap_or("assign") {
            "sql" => {
                db.execute_batch(step["sql"].as_str().unwrap()).unwrap();
                Value::Null
            }
            "auto" => service
                .auto_assign(u)
                .map(|v| json!(v))
                .unwrap_or_else(error),
            _ => service
                .assign(step["project"].as_str().unwrap(), u, step["repo"].as_str())
                .map(|v| json!(v))
                .unwrap_or_else(error),
        });
    }
    let mut repos = repositories.list(None).unwrap();
    repos.sort_by(|a, b| a.local_path.cmp(&b.local_path));
    let mut q = db
        .prepare("SELECT id,metadata,last_active_at FROM projects ORDER BY id")
        .unwrap();
    let projs=q.query_map([],|r|Ok(json!({"id":r.get::<_,String>(0)?,"metadata":r.get::<_,Option<String>>(1)?,"lastActiveAt":r.get::<_,String>(2)?}))).unwrap().collect::<rusqlite::Result<Vec<_>>>().unwrap();
    let mut actual = json!({"results":results,"events":events,"calls":*calls.borrow(),"repositories":repos,"projects":projs});
    normalize(&mut actual);
    normalize(&mut expected);
    assert_eq!(actual, expected);
    actual
}
fn project(
    id: &str,
    owner: &str,
    path: Option<&str>,
    node: &str,
    metadata: Option<&str>,
) -> String {
    format!(
        "INSERT INTO projects(id,user_id,title,root_path,node_id,metadata,created_at,last_active_at) VALUES ('{id}','{owner}',' Title ',{},'{node}',{},'{NOW}','{NOW}');",
        path.map(|p| format!("'{}'", p.replace('\'', "''")))
            .unwrap_or("NULL".into()),
        metadata.map(|m| format!("'{m}'")).unwrap_or("NULL".into())
    )
}
fn repo(id: &str, owner: &str, path: &str, device: Option<&str>) -> String {
    format!(
        "INSERT INTO automation_repositories(id,user_id,name,local_path,device_id,created_at,updated_at)VALUES('{id}','{owner}','Repo','{path}',{},'{NOW}','{NOW}');",
        device.map(|d| format!("'{d}'")).unwrap_or("NULL".into())
    )
}
#[test]
fn owner_and_explicit_repository_checks_precede_assignment() {
    let seed = project("p", "owner", None, "gateway", None)
        + &repo("r", "owner", "/absent", None)
        + &repo("foreign", "other", "/foreign", None);
    let v = scenario(
        seed,
        json!([
{"project":"missing","user":"owner"},{"project":"p","user":"other","repo":"r"},{"project":"p","user":"owner","repo":"foreign"},{"project":"p","user":"owner","repo":"missing"},{"project":"p","user":"owner","repo":" r "},{"project":"p","user":"owner","repo":"r"}]),
        json!({}),
    );
    assert_eq!(v["results"][4]["assigned"], true);
    assert_eq!(v["results"][5]["skipped"], true);
    assert_eq!(v["events"].as_array().unwrap().len(), 1);
}
#[test]
fn missing_folder_and_metadata_rejections_are_distinct() {
    let path = fixture("none");
    let seed = project("empty", "owner", None, "gateway", None)
        + &project("plain", "owner", Some(&path), "gateway", None);
    scenario(
        seed,
        json!([{"project":"empty"},{"project":"plain"},{"project":"empty","repo":"  "}]),
        json!({}),
    );
}
#[test]
fn new_repository_uses_git_branch_remote_and_project_title() {
    let path = fixture("directory");
    let v = scenario(
        project("p", "owner", Some(&path), "remote-node", None),
        json!([{"project":"p","user":"owner"},{"project":"p","user":"owner"}]),
        json!({"status":{"value":{"branch":"feature","remoteUrl":"old"}},"preferred":{"value":"upstream"},"remote":{"value":"https://example.com/team/repo.git"},"default":{"value":"trunk"}}),
    );
    assert_eq!(v["repositories"][0]["defaultBranch"], "trunk");
    assert_eq!(v["repositories"][0]["deviceId"], "remote-node");
    assert_eq!(v["events"][0]["event"], "created");
    assert_eq!(v["calls"].as_array().unwrap().len(), 4);
}
#[test]
fn git_errors_fall_back_without_blocking_assignment() {
    let path = fixture("file");
    scenario(
        project("p", "owner", Some(&path), "gateway", None),
        json!([{"project":"p"}]),
        json!({"status":{"error":true},"preferred":{"error":true},"default":{"error":true}}),
    );
}
#[test]
fn default_branch_failure_retains_status_and_remote_failure_retains_url() {
    let path = fixture("directory");
    let v = scenario(
        project("p", "owner", Some(&path), "gateway", None),
        json!([{"project":"p"}]),
        json!({"status":{"value":{"branch":"feature","remoteUrl":"https://example.com/old"}},"preferred":{"value":"upstream"},"remote":{"error":true},"default":{"error":true}}),
    );
    assert_eq!(v["repositories"][0]["defaultBranch"], "feature");
    assert_eq!(v["repositories"][0]["githubUrl"], "https://example.com/old");
}
#[test]
fn gateway_reconciliation_preserves_duplicate_updated_event_order() {
    let path = fixture("directory");
    let seed = project("p", "owner", Some(&path), "gateway", None)
        + &repo("r", "owner", &path, Some("old-node"));
    let v = scenario(
        seed,
        json!([{"project":"p","user":"owner"},{"project":"p","user":"owner"}]),
        json!({}),
    );
    assert_eq!(v["events"].as_array().unwrap().len(), 2);
    assert_eq!(v["repositories"][0]["deviceId"], Value::Null);
    assert!(v["calls"].as_array().unwrap().is_empty());
}
#[test]
fn explicit_skip_still_reconciles_gateway_device() {
    let path = fixture("directory");
    let seed = project(
        "p",
        "owner",
        Some(&path),
        "gateway",
        Some("{\"repositoryId\":\"r\",\"keep\":1}"),
    ) + &repo("r", "owner", &path, Some("old"));
    let v = scenario(
        seed,
        json!([{"project":"p","user":"owner","repo":"r"}]),
        json!({}),
    );
    assert_eq!(v["results"][0]["skipped"], true);
    assert_eq!(v["events"].as_array().unwrap().len(), 1);
}
#[test]
fn stale_foreign_link_is_replaced_and_other_owners_are_isolated() {
    let path = fixture("directory");
    let seed = project(
        "p",
        "owner",
        Some(&path),
        "gateway",
        Some("{\"repositoryId\":\"foreign\"}"),
    ) + &repo("foreign", "other", &path, None);
    let v = scenario(seed, json!([{"project":"p","user":"owner"}]), json!({}));
    assert_eq!(v["repositories"].as_array().unwrap().len(), 2);
    assert_eq!(v["results"][0]["created"], true);
}
#[test]
fn automatic_assignment_reconciles_valid_links_and_skips_unusable_projects() {
    let path = fixture("directory");
    let seed = project(
        "p",
        "owner",
        Some(&path),
        "gateway",
        Some("{\"repositoryId\":\"r\"}"),
    ) + &repo("r", "owner", &path, Some("old"))
        + &project("empty", "owner", None, "gateway", None)
        + &project("foreign", "other", Some(&path), "gateway", None);
    let v = scenario(
        seed,
        json!([{"op":"auto","user":"owner"},{"op":"auto","user":"owner"}]),
        json!({}),
    );
    assert_eq!(v["results"][0].as_array().unwrap().len(), 1);
}
#[test]
fn assignment_failure_keeps_prior_creation_and_emission() {
    let path = fixture("directory");
    let seed = project("p", "owner", Some(&path), "gateway", None)
        + "CREATE TRIGGER reject_assignment BEFORE UPDATE ON projects BEGIN SELECT RAISE(FAIL,'fixture'); END;";
    let v = scenario(seed, json!([{"project":"p"}]), json!({}));
    assert_eq!(v["results"][0], json!({"error":true}));
    assert_eq!(v["repositories"].as_array().unwrap().len(), 1);
    assert_eq!(v["events"].as_array().unwrap().len(), 1);
}
#[test]
fn auto_assignment_swallows_individual_storage_failures() {
    let path = fixture("directory");
    let seed = project("p", "owner", Some(&path), "gateway", None)
        + "CREATE TRIGGER reject_assignment BEFORE UPDATE ON projects BEGIN SELECT RAISE(FAIL,'fixture'); END;";
    let v = scenario(seed, json!([{"op":"auto","user":"owner"}]), json!({}));
    assert_eq!(v["results"][0], json!([]));
    assert_eq!(v["events"].as_array().unwrap().len(), 1);
}
#[test]
fn metadata_and_auto_claim_helpers_use_actual_paths_and_platform_rules() {
    let dir = fixture("directory");
    let file = fixture("file");
    let plain = fixture("none");
    let roots = vec![
        None,
        Some(""),
        Some("  "),
        Some(dir.as_str()),
        Some(file.as_str()),
        Some(plain.as_str()),
    ];
    let claims = json!([{"path":dir,"platform":"linux"},{"path":"C:\\missing\\repo","platform":"windows"},{"path":"C:/missing/repo","platform":"linux"},{"path":"/missing/repo","platform":"linux"},{"path":"/missing/repo","platform":"windows"},{"path":"C:relative","platform":"windows"}]);
    let expected = observe(json!({"op":"nativeassignment.paths","roots":roots,"claims":claims}));
    let actual = json!({"git":roots.into_iter().map(project_has_git_metadata).collect::<Vec<_>>(),"claim":claims.as_array().unwrap().iter().map(|v|should_auto_claim_repository_for_node(v["path"].as_str().unwrap(),v["platform"].as_str().unwrap())).collect::<Vec<_>>()});
    assert_eq!(actual, expected);
}
#[test]
fn untitled_dot_folder_uses_posix_basename_and_preserves_metadata() {
    let path = fixture("directory");
    let dotted = format!("{path}/.");
    let seed = project("p", "owner", Some(&dotted), "gateway", Some("{\"keep\":1}"))
        + "UPDATE projects SET title=NULL;";
    let v = scenario(seed, json!([{"project":"p","user":"owner"}]), json!({}));
    assert_eq!(v["repositories"][0]["name"], ".");
    assert!(
        v["projects"][0]["metadata"]
            .as_str()
            .unwrap()
            .contains("\"keep\":1")
    );
}
#[test]
fn symlink_git_metadata_follows_file_directory_and_broken_targets() {
    #[cfg(unix)]
    {
        let target = fixture("directory");
        let linked = fixture("none");
        let broken = fixture("none");
        std::os::unix::fs::symlink(
            PathBuf::from(&target).join(".git"),
            PathBuf::from(&linked).join(".git"),
        )
        .unwrap();
        std::os::unix::fs::symlink(
            PathBuf::from(&broken).join("absent"),
            PathBuf::from(&broken).join(".git"),
        )
        .unwrap();
        let roots = vec![format!(" \u{feff}{linked} \n"), broken];
        let expected = observe(json!({"op":"nativeassignment.paths","roots":roots,"claims":[]}));
        assert_eq!(
            json!({"git":roots.iter().map(|s|project_has_git_metadata(Some(s))).collect::<Vec<_>>(),"claim":[]}),
            expected
        );
    }
}
