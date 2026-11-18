#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    db,
    services::{
        plans::{PlanService, new_task_id},
        repo_proposals::RepoProposalService,
        repositories::RepositoryService,
    },
};
use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
};
const NOW: &str = "2026-10-18T12:00:00.000Z";
fn observe(call: Value) -> Value {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let dir = root
        .join(".jait/artifacts/gateway-rust/native-automation")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&dir).unwrap();
    internal_driver::call(&root, &dir, json!({"version":1,"calls":[call]}), &|| false).unwrap()[0]
        .clone()
}
fn rows(db: &rusqlite::Connection, table: &str) -> Value {
    let mut query = db
        .prepare(&format!("SELECT * FROM {table} ORDER BY id"))
        .unwrap();
    let names = query
        .column_names()
        .into_iter()
        .map(String::from)
        .collect::<Vec<_>>();
    json!(
        query
            .query_map([], |r| {
                let mut row = serde_json::Map::new();
                for (i, key) in names.iter().enumerate() {
                    let value = match r.get_ref(i)? {
                        rusqlite::types::ValueRef::Null => Value::Null,
                        rusqlite::types::ValueRef::Text(v) => {
                            json!(std::str::from_utf8(v).unwrap())
                        }
                        _ => panic!("unexpected non-text field"),
                    };
                    row.insert(key.clone(), value);
                }
                Ok(Value::Object(row))
            })
            .unwrap()
            .collect::<rusqlite::Result<Vec<_>>>()
            .unwrap()
    )
}
fn normalize(value: &mut Value) {
    fn visit(value: &mut Value, ids: &mut BTreeMap<String, String>) {
        match value {
            Value::String(s) => {
                if let Ok(id) = uuid::Uuid::parse_str(s) {
                    assert_eq!(id.get_version_num(), 7, "created identifiers remain UUIDv7");
                    let next = format!("<id:{}>", ids.len());
                    *s = ids.entry(s.clone()).or_insert(next).clone();
                }
            }
            Value::Array(v) => {
                for value in v {
                    visit(value, ids)
                }
            }
            Value::Object(v) => {
                for value in v.values_mut() {
                    visit(value, ids)
                }
            }
            _ => {}
        }
    }
    // UUID creation entropy is the only normalization; times, serialized JSON,
    // omitted/null fields and every durable table value remain exact.
    let mut ids = BTreeMap::new();
    visit(&mut value["results"], &mut ids);
    for table in ["repositories", "proposals", "plans"] {
        visit(&mut value[table], &mut ids);
        value[table]
            .as_array_mut()
            .unwrap()
            .sort_by_key(Value::to_string);
    }
}
fn scenario(seed: &str, steps: Vec<Value>) -> Value {
    let mut expected =
        observe(json!({"op":"nativeautomation.run","now":NOW,"seed":seed,"steps":steps}));
    let db = db::open_database(Path::new(":memory:")).unwrap();
    db::migrate_database(&db).unwrap();
    db.execute_batch(seed).unwrap();
    let repos = RepositoryService::with_time(&db, NOW);
    let proposals = RepoProposalService::with_time(&db, NOW);
    let plans = PlanService::with_time(&db, NOW);
    let mut created = String::new();
    let mut results = vec![];
    for step in &steps {
        let raw = step["id"].as_str().unwrap_or("");
        let id = if raw == "$created" {
            created.as_str()
        } else {
            raw
        };
        let value = (|| -> rusqlite::Result<Value> {
            Ok(match step["op"].as_str().unwrap() {
                "repo.create" => {
                    json!(repos.create(serde_json::from_value(step["data"].clone()).unwrap())?)
                }
                "repo.get" => json!(repos.get(id)?),
                "repo.list" => json!(repos.list(step["user"].as_str())?),
                "repo.find" => json!(
                    repos.find_by_path(step["path"].as_str().unwrap(), step["user"].as_str())?
                ),
                "repo.update" => {
                    json!(repos.update(id, serde_json::from_value(step["data"].clone()).unwrap())?)
                }
                "repo.delete" => {
                    repos.delete(id)?;
                    Value::Null
                }
                "proposal.create" => {
                    json!(proposals.create(serde_json::from_value(step["data"].clone()).unwrap())?)
                }
                "proposal.get" => json!(proposals.get(id)?),
                "proposal.list" => json!(proposals.list_by_repo(step["repo"].as_str().unwrap())?),
                "proposal.update" => json!(
                    proposals.update(id, serde_json::from_value(step["data"].clone()).unwrap())?
                ),
                "proposal.delete" => {
                    proposals.delete(id)?;
                    Value::Null
                }
                "plan.create" => {
                    json!(plans.create(serde_json::from_value(step["data"].clone()).unwrap())?)
                }
                "plan.get" => json!(plans.get(id)?),
                "plan.list" => json!(plans.list_by_repo(step["repo"].as_str().unwrap())?),
                "plan.listUser" => json!(plans.list_by_user(step["user"].as_str().unwrap())?),
                "plan.update" => {
                    json!(plans.update(id, serde_json::from_value(step["data"].clone()).unwrap())?)
                }
                "plan.task" => json!(plans.update_task(
                    id,
                    step["task"].as_str().unwrap(),
                    step["data"].as_object().unwrap()
                )?),
                "plan.delete" => {
                    plans.delete(id)?;
                    Value::Null
                }
                "sql" => {
                    db.execute_batch(step["sql"].as_str().unwrap())?;
                    Value::Null
                }
                _ => panic!("unknown step"),
            })
        })();
        let value = value.unwrap_or_else(|_| json!({"error":true}));
        if step["op"].as_str().unwrap().ends_with(".create")
            && let Some(id) = value["id"].as_str()
        {
            created = id.into()
        }
        results.push(value);
    }
    let mut actual = json!({"results":results,"repositories":rows(&db,"automation_repositories"),"proposals":rows(&db,"automation_repo_proposals"),"plans":rows(&db,"automation_plans")});
    normalize(&mut expected);
    normalize(&mut actual);
    assert_eq!(actual, expected);
    actual
}
const REPOS: &str = "INSERT INTO automation_repositories(id,user_id,name,local_path,created_at,updated_at) VALUES('r','owner','repo','/owned','2020','2020'),('other-r','other','foreign','/foreign','2021','2021');";
#[test]
fn repository_registration_uses_owner_path_uniqueness_without_normalization() {
    let result = scenario(
        REPOS,
        vec![
            json!({"op":"repo.create","data":{"userId":"owner","name":"duplicate","localPath":"/owned","forgeUrl":"ignored"}}),
            json!({"op":"repo.create","data":{"userId":"other","name":"second owner","localPath":"/owned","githubUrl":"","forgeUrl":"fallback","deviceId":"device","defaultBranch":"dev"}}),
            json!({"op":"repo.create","data":{"name":"unowned","localPath":"/owned"}}),
            json!({"op":"repo.create","data":{"name":"unowned duplicate","localPath":"/owned"}}),
            json!({"op":"repo.create","data":{"userId":"owner","name":"literal","localPath":"/owned/","forgeUrl":"https://forge/repo"}}),
            json!({"op":"repo.list","user":"owner"}),
            json!({"op":"repo.list","user":"other"}),
            json!({"op":"repo.list"}),
            json!({"op":"repo.list","user":""}),
            json!({"op":"repo.find","path":"/owned","user":"owner"}),
            json!({"op":"repo.find","path":"/foreign","user":"owner"}),
            json!({"op":"repo.find","path":"/owned"}),
            json!({"op":"repo.get","id":"missing"}),
        ],
    );
    assert_eq!(result["results"][0]["id"], "r");
    assert_eq!(result["repositories"].as_array().unwrap().len(), 5);
}
#[test]
fn repository_patches_preserve_nulls_url_precedence_and_constraint_errors() {
    scenario(
        REPOS,
        vec![
            json!({"op":"repo.update","id":"r","data":{"forgeUrl":"forge","deviceId":"node","strategy":"instructions"}}),
            json!({"op":"repo.update","id":"r","data":{"forgeUrl":"ignored","githubUrl":"legacy","deviceId":null,"strategy":null,"defaultBranch":"","name":"renamed"}}),
            json!({"op":"repo.update","id":"r","data":{"githubUrl":null,"forgeUrl":"ignored"}}),
            json!({"op":"repo.update","id":"r","data":{"localPath":"/foreign"}}),
            json!({"op":"repo.update","id":"r","data":{}}),
            json!({"op":"repo.update","id":"r","data":{"name":null}}),
            json!({"op":"repo.update","id":"missing","data":{"name":"gone"}}),
            json!({"op":"repo.delete","id":"missing"}),
            json!({"op":"repo.delete","id":"r"}),
            json!({"op":"repo.get","id":"r"}),
        ],
    );
}
#[test]
fn repository_failed_insert_recovers_only_if_a_path_record_exists() {
    let seed = format!(
        "{REPOS} CREATE TRIGGER repo_reject BEFORE INSERT ON automation_repositories BEGIN SELECT RAISE(ABORT,'fixture'); END;"
    );
    scenario(
        &seed,
        vec![
            json!({"op":"repo.create","data":{"userId":"owner","name":"conflict","localPath":"/owned"}}),
            json!({"op":"repo.create","data":{"userId":"owner","name":"failure","localPath":"/new"}}),
        ],
    );
}
#[test]
fn proposal_completion_reopen_and_recompletion_retain_history_and_source() {
    scenario(
        REPOS,
        vec![
            json!({"op":"proposal.create","data":{"repoId":"r","userId":"owner","message":" \u{feff}fix 🦀 \n","sourceThreadId":"thread","sourceThreadTitle":"origin"}}),
            json!({"op":"proposal.update","id":"$created","data":{"status":"done","tags":["one","one","🦀"],"dueDate":"2027-01-01","priority":"high"}}),
            json!({"op":"proposal.update","id":"$created","data":{"status":"done"}}),
            json!({"op":"proposal.update","id":"$created","data":{"status":"in_progress","dueDate":null}}),
            json!({"op":"proposal.update","id":"$created","data":{"status":"done","message":" updated ","tags":[]}}),
            json!({"op":"proposal.get","id":"$created"}),
            json!({"op":"proposal.list","repo":"r"}),
            json!({"op":"proposal.list","repo":"other-r"}),
            json!({"op":"proposal.create","data":{"repoId":"other-r","message":"already done","status":"done","priority":"low","tags":[],"sourceThreadId":null,"sourceThreadTitle":null}}),
            json!({"op":"proposal.update","id":"missing","data":{}}),
            json!({"op":"proposal.delete","id":"$created"}),
            json!({"op":"proposal.delete","id":"missing"}),
            json!({"op":"proposal.get","id":"$created"}),
        ],
    );
}
fn proposal_seed(history: &str) -> String {
    format!(
        "{REPOS} INSERT INTO automation_repo_proposals(id,repo_id,user_id,message,status,completed_at,completion_history,created_at,updated_at) VALUES('p','r','owner','legacy','open',NULL,'{}','2020','2020');",
        history.replace("'", "''")
    )
}
#[test]
fn proposal_history_filters_invalid_entries_but_retains_valid_extra_fields() {
    for history in [
        "broken",
        "null",
        "{}",
        "1",
        "[]",
        r#"[null,3,{},[],{"completedAt":"t"},{"completedAt":"t","previousStatus":3},{"completedAt":"t","previousStatus":null,"extra":{"1":1,"0":1e-7}},{"completedAt":"t2","previousStatus":"open"}]"#,
    ] {
        scenario(
            &proposal_seed(history),
            vec![
                json!({"op":"proposal.update","id":"p","data":{"status":"done"}}),
                json!({"op":"proposal.update","id":"p","data":{"status":"open"}}),
                json!({"op":"proposal.update","id":"p","data":{"status":"done"}}),
            ],
        );
    }
}
#[test]
fn proposal_history_has_a_100_entry_ceiling_and_failed_writes_are_atomic() {
    let history = json!(
        (0..105)
            .map(|i| json!({"completedAt":i.to_string(),"previousStatus":"open"}))
            .collect::<Vec<_>>()
    )
    .to_string();
    let seed = format!(
        "{} CREATE TRIGGER proposal_reject BEFORE UPDATE ON automation_repo_proposals WHEN NEW.priority='reject' BEGIN SELECT RAISE(ABORT,'fixture'); END;",
        proposal_seed(&history)
    );
    let result = scenario(
        &seed,
        vec![
            json!({"op":"proposal.update","id":"p","data":{"status":"done","priority":"reject"}}),
            json!({"op":"proposal.get","id":"p"}),
            json!({"op":"proposal.update","id":"p","data":{"status":"done"}}),
        ],
    );
    let history: Value =
        serde_json::from_str(result["results"][2]["completionHistory"].as_str().unwrap()).unwrap();
    assert_eq!(history.as_array().unwrap().len(), 100);
}
#[test]
fn plans_persist_tasks_and_patch_every_matching_task_without_replacing_other_fields() {
    scenario(
        REPOS,
        vec![
            json!({"op":"plan.create","data":{"repoId":"r","userId":"owner","title":"Plan","tasks":[{"id":"t","title":"first","status":"proposed","dependsOn":["x"],"extra":{"1":1,"0":1e-7}},{"id":"t","title":"duplicate"},{"id":"other"}]}}),
            json!({"op":"plan.task","id":"$created","task":"t","data":{"status":"approved","description":"🦀","threadId":"thread"}}),
            json!({"op":"plan.task","id":"$created","task":"missing","data":{"title":"ignored"}}),
            json!({"op":"plan.update","id":"$created","data":{"title":"renamed","status":"active"}}),
            json!({"op":"plan.get","id":"$created"}),
            json!({"op":"plan.list","repo":"r"}),
            json!({"op":"plan.listUser","user":"owner"}),
            json!({"op":"plan.listUser","user":"other"}),
            json!({"op":"plan.create","data":{"repoId":"other-r","title":"defaults"}}),
            json!({"op":"plan.update","id":"$created","data":{"tasks":[]}}),
            json!({"op":"plan.update","id":"missing","data":{}}),
            json!({"op":"plan.task","id":"missing","task":"t","data":{}}),
            json!({"op":"plan.delete","id":"$created"}),
            json!({"op":"plan.delete","id":"missing"}),
        ],
    );
}
#[test]
fn plans_hydrate_malformed_legacy_json_and_preserve_null_task_failure() {
    for tasks in [
        "invalid",
        "null",
        "{}",
        r#"[1,"text",[],{"id":"t","status":"proposed"}]"#,
        "[null]",
    ] {
        let seed = format!(
            "{REPOS} INSERT INTO automation_plans(id,repo_id,user_id,title,status,tasks,created_at,updated_at) VALUES('plan','r','owner','legacy','draft','{}','2020','2020');",
            tasks.replace("'", "''")
        );
        scenario(
            &seed,
            vec![
                json!({"op":"plan.get","id":"plan"}),
                json!({"op":"plan.task","id":"plan","task":"t","data":{"status":"running"}}),
                json!({"op":"plan.list","repo":"r"}),
            ],
        );
    }
}
#[test]
fn generated_task_ids_are_eight_lowercase_hex_digits() {
    let expected = observe(json!({"op":"nativeautomation.taskids"}));
    for id in expected
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v.as_str().unwrap().to_string())
        .chain((0..32).map(|_| new_task_id()))
    {
        assert_eq!(id.len(), 8);
        assert!(
            id.bytes()
                .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
        );
    }
}
