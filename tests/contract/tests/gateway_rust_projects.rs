#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    db,
    services::projects::{
        ProjectError, ProjectService, parse_metadata, project_kind, repository_id,
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
        .join(".jait/artifacts/gateway-rust/native-projects")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&dir).unwrap();
    internal_driver::call(&root, &dir, json!({"version":1,"calls":[call]}), &|| false).unwrap()[0]
        .clone()
}
fn rows(db: &rusqlite::Connection, table: &str) -> Value {
    let mut statement = db
        .prepare(&format!("SELECT * FROM {table} ORDER BY id"))
        .unwrap();
    let columns = statement
        .column_names()
        .into_iter()
        .map(String::from)
        .collect::<Vec<_>>();
    json!(
        statement
            .query_map([], |r| {
                let mut row = serde_json::Map::new();
                for (i, key) in columns.iter().enumerate() {
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
    let ids = value["projects"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|r| uuid::Uuid::parse_str(r["id"].as_str().unwrap()).is_ok())
        .map(|r| {
            (
                r["id"].as_str().unwrap().to_string(),
                format!(
                    "<project:{}:{}:{}>",
                    r["title"], r["root_path"], r["node_id"]
                ),
            )
        })
        .collect::<BTreeMap<_, _>>();
    fn visit(value: &mut Value, ids: &BTreeMap<String, String>) {
        match value {
            Value::String(s) => {
                if let Some(id) = ids.get(s) {
                    *s = id.clone()
                }
            }
            Value::Array(values) => {
                for v in values {
                    visit(v, ids)
                }
            }
            Value::Object(values) => {
                if let Some(Value::String(raw)) = values.get("metadata")
                    && let Ok(v) = serde_json::from_str::<Value>(raw)
                {
                    values.insert("metadata".into(), v);
                }
                for value in values.values_mut() {
                    visit(value, ids)
                }
            }
            _ => {}
        }
    }
    visit(value, &ids);
    value["projects"]
        .as_array_mut()
        .unwrap()
        .sort_by_key(Value::to_string);
}
fn scenario(seed: &str, steps: Vec<Value>) {
    let mut expected =
        observe(json!({"op":"nativeprojects.run","now":NOW,"seed":seed,"steps":steps}));
    let connection = db::open_database(Path::new(":memory:")).unwrap();
    db::migrate_database(&connection).unwrap();
    connection.execute_batch(seed).unwrap();
    let service = ProjectService::with_time(&connection, NOW);
    let mut created = String::new();
    let mut results = vec![];
    for step in &steps {
        let id = step["id"].as_str().unwrap_or("");
        let resolved = if id == "$created" {
            created.clone()
        } else {
            id.into()
        };
        let id = resolved.as_str();
        let user = step["user"].as_str();
        let value = (|| -> Result<Value, ProjectError> {
            Ok(match step["op"].as_str().unwrap() {
                "create" => {
                    let row =
                        service.create(serde_json::from_value(step["data"].clone()).unwrap())?;
                    created = row.id.clone();
                    json!(row)
                }
                "get" => json!(service.get(id, user)?),
                "list" => {
                    json!(service.list(step["status"].as_str(), user, step["limit"].as_f64())?)
                }
                "withSessions" => service.list_with_sessions(
                    user,
                    step["status"].as_str().unwrap_or("active"),
                    step["limit"].as_f64(),
                )?,
                "search" => {
                    service.search_with_sessions(user.unwrap(), step["query"].as_str().unwrap())?
                }
                "find" => json!(service.find_by_root(
                    step["root"].as_str().unwrap(),
                    step["node"].as_str().unwrap_or("gateway"),
                    user
                )?),
                "adopt" => {
                    let row = service.get_or_create_for_root(
                        serde_json::from_value(step["data"].clone()).unwrap(),
                    )?;
                    created = row.id.clone();
                    json!(row)
                }
                "touch" => {
                    service.touch(id)?;
                    Value::Null
                }
                "update" => {
                    service.update(id, step["data"].as_object().unwrap(), user)?;
                    Value::Null
                }
                "move" => json!(service.move_project(id, step["parent"].as_str(), user)?),
                "chain" => json!(
                    serde_json::to_string(&service.resolve_instruction_chain(id, user)?).unwrap()
                ),
                "root" => json!(service.effective_root_path(id, user)?),
                "descendants" => json!(service.list_descendant_ids(id, user)?),
                "assign" => json!(service.assign_repository(
                    id,
                    step["repository"].as_str().unwrap(),
                    user
                )?),
                "clear" => json!(service.clear_repository(id, user)?),
                "metadata" => json!(parse_metadata(service.get(id, user)?.as_ref())),
                "repository" => json!(repository_id(service.get(id, user)?.as_ref())),
                "kind" => json!(project_kind(step["root"].as_str())),
                "archive" => json!(service.archive(id, user)?),
                "restore" | "delete" => {
                    service.set_status(
                        id,
                        if step["op"] == "restore" {
                            "active"
                        } else {
                            "deleted"
                        },
                        user,
                    )?;
                    Value::Null
                }
                "deleteArchived" => json!(service.delete_archived(user.unwrap())?),
                "countSessions" => json!(service.count_sessions_in_subtree(id, user)?),
                "counts" => json!(service.active_session_counts(user.unwrap())?),
                "sql" => {
                    connection.execute_batch(step["sql"].as_str().unwrap())?;
                    Value::Null
                }
                _ => panic!("unknown operation"),
            })
        })()
        .unwrap_or_else(|e| match e {
            ProjectError::Move(code) => json!({"error":code}),
            _ => json!({"error":true}),
        });
        results.push(value);
    }
    let mut actual = json!({"results":results,"projects":rows(&connection,"projects"),"sessions":rows(&connection,"sessions")});
    normalize(&mut actual);
    normalize(&mut expected);
    for (i, step) in steps.iter().enumerate() {
        assert_eq!(
            actual["results"][i], expected["results"][i],
            "step {i}: {step}"
        );
    }
    assert_eq!(actual, expected, "durable effects");
}
const SEED:&str="INSERT INTO projects(id,user_id,title,root_path,node_id,created_at,last_active_at,status,parent_id,instructions,description,kind) VALUES
('p','owner','Root','/root','gateway','2026-01-01','2026-10-18T09:00:00.000Z','active',NULL,'root policy','home','workspace'),
('child','owner','Child',NULL,'gateway','2026-01-01','2026-10-18T11:00:00.000Z','active','p','child policy','nested','folder'),
('leaf','owner','Leaf',NULL,'gateway','2026-01-01','2026-10-18T10:00:00.000Z','active','child','leaf policy',NULL,'folder'),
('foreign','foreign','Other','/other','gateway','2026-01-01','2026-10-18T11:30:00.000Z','active','p','private',NULL,'workspace'),
('archived','owner',NULL,NULL,NULL,'2026-01-01','2026-10-18T08:00:00.000Z','archived',NULL,NULL,NULL,'folder');
INSERT INTO sessions(id,user_id,project_id,name,project_path,created_at,last_active_at,status) VALUES
('s1','owner','leaf','needle','/leaf','2026-01-01','2026-10-18T11:40:00.000Z','active'),
('s2','foreign','leaf','foreign needle',NULL,'2026-01-01','2026-10-18T11:45:00.000Z','active'),
('s3','owner',NULL,'Personal needle',NULL,'2026-01-01','2026-10-18T11:50:00.000Z','active'),
('s4','owner','leaf','archived needle',NULL,'2026-01-01','2026-10-18T11:20:00.000Z','archived'),
('s5','owner','missing','orphan needle',NULL,'2026-01-01','2026-10-18T11:10:00.000Z','active');";
#[test]
fn projects_crud_nullable_patches_kind_color_and_directory_titles_match_reference() {
    for data in [
        json!({}),
        json!({"userId":"owner","rootPath":" C:\\資料\\project\\ ","color":" #AABBCC ","instructions":" policy ","description":" text "}),
        json!({"userId":"owner","rootPath":"/","nodeId":null,"title":"","color":"rgb(0,0,0)"}),
        json!({"rootPath":"\u{feff} ","title":"  Folder  ","color":"BLUE","metadata":{}}),
    ] {
        scenario(
            SEED,
            vec![
                json!({"op":"create","data":data}),
                json!({"op":"get","id":"$created"}),
                json!({"op":"update","id":"$created","data":{"title":"","rootPath":"/new","color":"invalid","description":null,"instructions":""}}),
                json!({"op":"get","id":"$created"}),
                json!({"op":"update","id":"$created","data":{"rootPath":null,"nodeId":null,"metadata":{"repositoryId":" r "}}}),
                json!({"op":"get","id":"$created"}),
                json!({"op":"repository","id":"$created"}),
                json!({"op":"touch","id":"$created"}),
                json!({"op":"get","id":"$created"}),
            ],
        );
    }
    scenario(
        SEED,
        vec![
            json!({"op":"update","id":"p","user":"foreign","data":{"title":"wrong"}}),
            json!({"op":"get","id":"p","user":"owner"}),
            json!({"op":"get","id":"p","user":"foreign"}),
            json!({"op":"get","id":"missing"}),
            json!({"op":"update","id":"p","data":{}}),
            json!({"op":"get","id":"p"}),
        ],
    );
}
#[test]
fn projects_tree_paging_search_counts_and_personal_sessions_match_reference() {
    let mut steps = vec![
        json!({"op":"list","user":"owner"}),
        json!({"op":"counts","user":"owner"}),
    ];
    for limit in [
        None,
        Some(1.0),
        Some(2.0),
        Some(0.0),
        Some(0.5),
        Some(-1.0),
        Some(1.8),
    ] {
        let mut s = json!({"op":"withSessions","user":"owner"});
        if let Some(limit) = limit {
            s["limit"] = json!(limit)
        }
        steps.push(s);
    }
    for query in [
        "", "   ", "needle", "CHILD", "home", "/leaf", "other", "missing",
    ] {
        steps.push(json!({"op":"search","user":"owner","query":query}));
    }
    steps.extend([
        json!({"op":"countSessions","id":"p","user":"owner"}),
        json!({"op":"countSessions","id":"p"}),
        json!({"op":"descendants","id":"p","user":"owner"}),
    ]);
    scenario(SEED, steps);
}
#[test]
fn project_moves_reject_foreign_targets_cycles_and_excessive_subtree_depth() {
    scenario(
        SEED,
        vec![
            json!({"op":"move","id":"p","parent":"leaf","user":"owner"}),
            json!({"op":"move","id":"leaf","parent":"leaf","user":"owner"}),
            json!({"op":"move","id":"leaf","parent":"foreign","user":"owner"}),
            json!({"op":"move","id":"leaf","parent":"missing","user":"owner"}),
            json!({"op":"move","id":"leaf","parent":null,"user":"owner"}),
            json!({"op":"move","id":"leaf","parent":"p","user":"owner"}),
            json!({"op":"move","id":"missing","parent":null,"user":"owner"}),
            json!({"op":"descendants","id":"p","user":"owner"}),
        ],
    );
    let mut seed = SEED.to_string();
    for i in 0..6 {
        seed.push_str(&format!("INSERT INTO projects(id,user_id,title,created_at,last_active_at,status,parent_id,kind) VALUES('d{i}','owner','Depth','x','2026-01-01','active',{},'folder');",if i==0{"NULL".into()}else{format!("'d{}'",i-1)}));
    }
    scenario(
        &seed,
        vec![
            json!({"op":"move","id":"p","parent":"d3","user":"owner"}),
            json!({"op":"move","id":"leaf","parent":"d3","user":"owner"}),
            json!({"op":"move","id":"leaf","parent":"d2","user":"owner"}),
        ],
    );
}
#[test]
fn projects_effective_roots_instruction_order_truncation_and_scope_match_reference() {
    scenario(
        SEED,
        vec![
            json!({"op":"root","id":"leaf","user":"owner"}),
            json!({"op":"chain","id":"leaf","user":"owner"}),
            json!({"op":"chain","id":"leaf","user":"foreign"}),
            json!({"op":"root","id":"missing"}),
            json!({"op":"update","id":"child","data":{"rootPath":"/near","instructions":" "},"user":"owner"}),
            json!({"op":"root","id":"leaf","user":"owner"}),
            json!({"op":"chain","id":"leaf","user":"owner"}),
            json!({"op":"sql","sql":format!("UPDATE projects SET instructions='{}' WHERE id='child'","x".repeat(7900))}),
            json!({"op":"chain","id":"leaf","user":"owner"}),
            json!({"op":"sql","sql":format!("UPDATE projects SET instructions='{}🦀' WHERE id='leaf'","a".repeat(7991))}),
            json!({"op":"chain","id":"leaf","user":"owner"}),
        ],
    );
}
#[test]
fn projects_root_adoption_normalizes_remote_windows_paths_without_cross_user_claims() {
    let seed = format!(
        "{SEED} INSERT INTO projects(id,user_id,title,root_path,node_id,created_at,last_active_at,status) VALUES('remote','owner','Remote','C:\\Work\\Repo\\','node','x','2026-01-01','active'),('linux','owner','Linux','/srv/repo/','node','x','2026-01-02','active');"
    );
    scenario(
        &seed,
        vec![
            json!({"op":"find","root":" C:/WORK/REPO/ ","user":"owner"}),
            json!({"op":"find","root":"/srv/repo","user":"owner"}),
            json!({"op":"find","root":"C:/Work/Repo","user":"foreign"}),
            json!({"op":"find","root":"C:/Work/Repo","node":"different","user":"owner"}),
            json!({"op":"adopt","data":{"rootPath":"C:/Work/Repo","userId":"owner","title":"unused"}}),
            json!({"op":"find","root":"/root","user":"owner"}),
            json!({"op":"adopt","data":{"rootPath":"/fresh","userId":"owner"}}),
            json!({"op":"get","id":"$created","user":"owner"}),
        ],
    );
}
#[test]
fn projects_repository_metadata_fallback_assignment_and_clear_match_reference() {
    let mut steps = vec![];
    for metadata in [
        "bad",
        "null",
        "[]",
        "true",
        "{\"repoId\":\" legacy \"}",
        "{\"repositoryId\":null,\"repoId\":\"fallback\"}",
        "{\"repositoryId\":false,\"repoId\":\"ignored\"}",
        "{\"repositoryId\":\" repo \",\"keep\":1}",
    ] {
        steps.push(json!({"op":"sql","sql":format!("UPDATE projects SET metadata='{}' WHERE id='p'",metadata.replace('\'',"''"))}));
        steps.push(json!({"op":"metadata","id":"p"}));
        steps.push(json!({"op":"repository","id":"p"}));
        steps.push(json!({"op":"assign","id":"p","repository":"new","user":"foreign"}));
        steps.push(json!({"op":"clear","id":"p","user":"owner"}));
        steps.push(json!({"op":"assign","id":"p","repository":"new","user":"owner"}));
        steps.push(json!({"op":"repository","id":"p","user":"owner"}));
    }
    scenario(SEED, steps);
}
#[test]
fn projects_subtree_archive_restore_delete_and_sql_partial_failure_match_reference() {
    scenario(
        SEED,
        vec![
            json!({"op":"countSessions","id":"p","user":"owner"}),
            json!({"op":"archive","id":"p","user":"owner"}),
            json!({"op":"list","user":"owner"}),
            json!({"op":"restore","id":"p","user":"owner"}),
            json!({"op":"list","user":"owner"}),
            json!({"op":"deleteArchived","user":"owner"}),
            json!({"op":"deleteArchived","user":"owner"}),
            json!({"op":"delete","id":"p","user":"foreign"}),
            json!({"op":"get","id":"p","user":"owner"}),
            json!({"op":"delete","id":"p","user":"owner"}),
            json!({"op":"get","id":"p","user":"owner"}),
        ],
    );
    let seed = format!(
        "{SEED} CREATE TRIGGER reject_project BEFORE UPDATE ON projects WHEN OLD.id='p' BEGIN SELECT RAISE(FAIL,'rejected'); END;"
    );
    scenario(
        &seed,
        vec![
            json!({"op":"archive","id":"p","user":"owner"}),
            json!({"op":"list","user":"owner"}),
        ],
    );
}
#[test]
fn project_cycles_and_nullable_legacy_rows_do_not_loop_or_escape_owner_filters() {
    let seed = format!(
        "{SEED} UPDATE projects SET parent_id='leaf' WHERE id='p';UPDATE projects SET title=NULL,node_id=NULL,root_path=NULL,metadata='broken' WHERE id='child';"
    );
    scenario(
        &seed,
        vec![
            json!({"op":"descendants","id":"p","user":"owner"}),
            json!({"op":"root","id":"child","user":"owner"}),
            json!({"op":"chain","id":"leaf","user":"owner"}),
            json!({"op":"withSessions","user":"owner","limit":1}),
            json!({"op":"get","id":"child","user":"owner"}),
        ],
    );
}
