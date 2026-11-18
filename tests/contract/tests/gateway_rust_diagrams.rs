#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    db,
    security::path_guard::{PathGuard, PathTraversalError},
    services::architecture_diagrams::ArchitectureDiagramService,
};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn work() -> PathBuf {
    let p = root()
        .join(".jait/artifacts/gateway-rust/diagrams")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&p).unwrap();
    p
}
fn reference(dir: &Path, call: Value) -> Value {
    internal_driver::call(&root(), dir, json!({"version":1,"calls":[call]}), &|| false).unwrap()[0]
        .clone()
}
fn service(steps: Value) {
    let dir = work();
    let project = dir.join("project");
    let name = project.to_str().unwrap();
    let now = "2026-10-19T08:00:00.000Z";
    let expected = reference(
        &dir,
        json!({"op":"nativediagrams.service","root":name,"now":now,"steps":steps}),
    );
    fs::remove_dir_all(&project).unwrap();
    fs::create_dir_all(&project).unwrap();
    let db = db::open_database(Path::new(":memory:")).unwrap();
    db::migrate_database(&db).unwrap();
    let service = ArchitectureDiagramService::with_time(&db, now);
    let mut results = vec![];
    let mut ids = HashMap::<String, Value>::new();
    for s in steps.as_array().unwrap() {
        let project = s["root"].as_str().unwrap_or("$ROOT").replace("$ROOT", name);
        let user = s["user"].as_str();
        let value=(||->Result<Value,Box<dyn std::error::Error+Send+Sync>> {
            let mut v=match s["op"].as_str().unwrap() {
                "save"=>service.save(&project,s["diagram"].as_str().unwrap(),user)?,
                "get"=>service.get_by_project(&project,user)?.unwrap_or(Value::Null),
                "list"=>json!(service.list(user)?),
                "path"=>json!(service.get_file_path(&project)?.to_string_lossy()),
                "sql"=>{db.execute_batch(&s["sql"].as_str().unwrap().replace("$ROOT",name))?;Value::Null},
                "file"=>{
                    let path=service.get_file_path(&project)?;
                    if s["remove"]==true {
                        if path.is_dir(){fs::remove_dir_all(path)?;}else if path.exists(){fs::remove_file(path)?;}
                    }else if s["directory"]==true {fs::create_dir_all(path)?;}
                    else {
                        fs::create_dir_all(path.parent().unwrap())?;
                        let bytes=s["bytes"].as_array().map(|a|a.iter().map(|v|v.as_u64().unwrap()as u8).collect::<Vec<_>>())
                            .unwrap_or_else(||s["content"].as_str().unwrap().as_bytes().to_vec());
                        fs::write(path,bytes)?;
                    }
                    Value::Null
                },
                "read"=>json!(String::from_utf8_lossy(&fs::read(service.get_file_path(&project)?)?)),
                _=>panic!("unknown step"),
            };
            if let Some(alias)=s["alias"].as_str(){ids.insert(alias.into(),v["id"].clone());}
            if let Some(alias)=s["sameAs"].as_str(){v=json!({"sameId":v["id"]==ids[alias],"record":v});}
            Ok(v)
        })().unwrap_or_else(|e|{let e=e.to_string();json!({"error":if ["projectRoot is required","diagram is required"].contains(&e.as_str()){json!(e)}else{json!(true)}})});
        results.push(value);
    }
    let text = serde_json::to_string(&results)
        .unwrap()
        .replace(name, "<root>");
    let mut actual: Value = serde_json::from_str(&text).unwrap();
    fn normalize(v: &mut Value) {
        match v {
            Value::String(s) if uuid::Uuid::parse_str(s).is_ok() => *s = "<uuid>".into(),
            Value::Array(a) => {
                for v in a {
                    normalize(v)
                }
            }
            Value::Object(o) => {
                for v in o.values_mut() {
                    normalize(v)
                }
            }
            _ => {}
        }
    }
    normalize(&mut actual);
    assert_eq!(actual, expected);
}
#[test]
fn diagram_file_first_fallback_ownership_update_and_unicode_trim() {
    service(json!([
        {"op":"get"},{"op":"get","root":" "},{"op":"path","root":" "},
        {"op":"save","diagram":" "},{"op":"save","root":" ","diagram":"graph TD"},
        {"op":"file","content":"\u{feff} graph TD; A-->B \n"},
        {"op":"get","user":"a"},{"op":"get"},{"op":"list"},
        {"op":"save","diagram":"graph TD; B-->C","user":"a","alias":"a"},
        {"op":"save","diagram":"graph TD; C-->D","user":"a","sameAs":"a"},
        {"op":"get","user":"b"},{"op":"list","user":"a"},{"op":"list","user":"b"},{"op":"list"},
        {"op":"save","diagram":"graph TD; E-->F","user":"b","alias":"b"},
        {"op":"file","content":"  \n "},{"op":"get","user":"a"},{"op":"get","user":"b"},{"op":"get"},
        {"op":"file","remove":true},{"op":"get","user":"a"},
        {"op":"save","diagram":"\u{feff} graph LR; X-->Y \n","alias":"null"},
        {"op":"get","user":""},{"op":"list","user":""},{"op":"read"},
        {"op":"save","root":"  $ROOT/other \n","diagram":"graph TD; Other","alias":"other"},{"op":"list"}
    ]));
}
#[test]
fn diagram_failed_database_write_leaves_file_and_legacy_rows_order_by_time() {
    service(json!([
        {"op":"save","diagram":"old","user":"a","alias":"a"},
        {"op":"sql","sql":"CREATE TRIGGER reject_diagram BEFORE UPDATE ON architecture_diagrams BEGIN SELECT RAISE(ABORT,'forced update failure'); END"},
        {"op":"save","diagram":"new","user":"a"},{"op":"read"},{"op":"get","user":"a","sameAs":"a"},{"op":"list","user":"a"},
        {"op":"sql","sql":"DROP TRIGGER reject_diagram; CREATE TRIGGER reject_insert BEFORE INSERT ON architecture_diagrams BEGIN SELECT RAISE(ABORT,'forced insert failure'); END"},
        {"op":"save","diagram":"untracked","user":"b"},{"op":"get","user":"b"},{"op":"list","user":"b"},
        {"op":"sql","sql":"DROP TRIGGER reject_insert; UPDATE architecture_diagrams SET updated_at='2020-01-01';"},
        {"op":"save","root":"$ROOT/second","diagram":"second","user":"a"},{"op":"list","user":"a"},
        {"op":"file","remove":true},{"op":"file","directory":true},{"op":"get","user":"a"},{"op":"save","diagram":"blocked","user":"a"},{"op":"list","user":"a"},
        {"op":"file","remove":true},{"op":"file","bytes":[255,65,254]},{"op":"get","user":"a"},
        {"op":"sql","sql":"DROP TABLE architecture_diagrams"},{"op":"get","user":"a"},{"op":"save","diagram":"written before db failure","user":"a"},{"op":"read"},{"op":"list"}
    ]));
}
fn paths(dir: &Path, project: &Path, steps: Value, denied: Vec<String>, symlinks: bool) {
    let expected = reference(
        dir,
        json!({"op":"nativediagrams.paths","root":project,"steps":steps,"denied":denied,"checkSymlinks":symlinks}),
    );
    let guard = PathGuard::new(project, &denied, symlinks).unwrap();
    let results:Vec<_>=steps.as_array().unwrap().iter().map(|s|{
        let target=s["target"].as_str().unwrap();
        let value=if s["symlink"]==true{guard.validate_with_symlink_check(target)}else{guard.validate(target)};
        match value {
            Ok(path)=>json!({"path":path,"allowed":guard.is_allowed(target),"root":guard.project_root()}),
            Err(e)=>if let Some(e)=e.downcast_ref::<PathTraversalError>() {
                json!({"error":e.message,"name":"PathTraversalError","code":PathTraversalError::CODE,"path":e.path,"boundary":e.boundary,"allowed":guard.is_allowed(target)})
            }else{json!({"error":true})}
        }
    }).collect();
    assert_eq!(json!(results), expected);
}
#[test]
fn path_normalization_boundary_null_precedence_denied_case_and_relative_roots() {
    let dir = work();
    let project = dir.join("root");
    fs::create_dir_all(&project).unwrap();
    let targets = vec![
        "",
        ".",
        "./file",
        "foo/../file",
        "foo//bar",
        "../root/file",
        "../other/file",
        "..hidden",
        "..",
        "../../../../../../etc/passwd",
        "a\0b",
        "../\0",
        ".ssh",
        ".SSH/id",
        ".ssh-other",
        "nested/.ssh/id",
        "custom/private",
        "custom/private-other",
        "C:\\Windows/system.ini",
        "\\windows",
        "/etc/passwd",
        "/usr/bin/x",
    ];
    let steps: Vec<_> = targets
        .iter()
        .map(|target| json!({"target":target}))
        .chain([
            json!({"target":project.join("absolute")}),
            json!({"target":dir.join("root-other/file")}),
        ])
        .collect();
    paths(
        &dir,
        &project,
        json!(steps),
        vec!["custom/private".into()],
        true,
    );
    paths(
        &dir,
        &root().join(".jait/artifacts/../artifacts"),
        json!([{"target":"."},{"target":"missing"},{"target":"../outside"}]),
        vec![],
        false,
    );
}
#[cfg(unix)]
#[test]
fn final_symlink_checks_internal_external_dangling_loops_and_disabled_checks() {
    use std::os::unix::fs::symlink;
    let dir = work();
    let project = dir.join("root");
    fs::create_dir_all(&project).unwrap();
    fs::write(project.join("inside"), "in").unwrap();
    fs::write(dir.join("outside"), "out").unwrap();
    symlink("inside", project.join("internal")).unwrap();
    symlink("../outside", project.join("external")).unwrap();
    symlink("missing", project.join("dangling")).unwrap();
    symlink("loop", project.join("loop")).unwrap();
    fs::create_dir_all(dir.join("outside-dir")).unwrap();
    fs::write(dir.join("outside-dir/file"), "out").unwrap();
    symlink("../outside-dir", project.join("parent")).unwrap();
    let steps = json!([{"target":"internal","symlink":true},{"target":"external","symlink":true},{"target":"external"},{"target":"dangling","symlink":true},{"target":"loop","symlink":true},{"target":"missing","symlink":true},{"target":"parent/file","symlink":true}]);
    paths(&dir, &project, steps.clone(), vec![], true);
    paths(&dir, &project, steps, vec![], false);
}

#[test]
fn diagram_tool_metadata_and_utf16_input_boundaries() {
    use jait_gateway::tools::diagrams::{metadata, render_diagram};
    let dir = work();
    assert_eq!(
        *metadata(),
        reference(&dir, json!({"op":"nativediagrams.metadata"}))
    );
    let mut values = vec![
        json!({}),
        json!({"diagram":null}),
        json!({"diagram":false}),
        json!({"diagram":0}),
        json!({"diagram":[]}),
        json!({"diagram":" "}),
        json!({"diagram":"  graph TD; A-->B \n"}),
        json!({"diagram":"graph LR","title":""}),
        json!({"diagram":"graph LR","title":null}),
        json!({"diagram":"graph LR","title":200}),
        json!({"diagram":"graph LR","title":"\u{feff} Name \n"}),
    ];
    for length in [19999, 20000, 20001] {
        values.push(json!({"diagram":"x".repeat(length)}));
    }
    for length in [99, 100, 101] {
        values.push(json!({"diagram":"graph TD","title":"😀".repeat(length)}));
    }
    for length in [9999, 10000, 10001] {
        values.push(json!({"diagram":"😀".repeat(length)}));
    }
    // Keep each reference request within the 64 KiB input ceiling.
    for chunk in values.chunks(1) {
        let expected = reference(&dir, json!({"op":"nativediagrams.render","values":chunk}));
        assert_eq!(
            json!(chunk.iter().map(render_diagram).collect::<Vec<_>>()),
            expected
        );
    }
}
fn tool(mut call: Value) {
    use jait_gateway::{
        services::architecture_diagrams::DiagramError,
        tools::diagrams::{ArchitectureContext, generate_architecture},
    };
    let dir = work();
    let project = dir.join("project");
    let name = project.to_str().unwrap();
    let now = "2026-10-19T08:00:00.000Z";
    call["op"] = json!("nativediagrams.tool");
    call["root"] = json!(name);
    call["now"] = json!(now);
    let expected = reference(&dir, call.clone());
    if project.exists() {
        fs::remove_dir_all(&project).unwrap();
    }
    let db = db::open_database(Path::new(":memory:")).unwrap();
    db::migrate_database(&db).unwrap();
    if call["failStore"] == true {
        db.execute_batch("DROP TABLE architecture_diagrams")
            .unwrap();
    }
    let store = ArchitectureDiagramService::with_time(&db, now);
    let mut events = vec![];
    let mut sink = |command: Value, session: Option<&str>| -> Result<(), DiagramError> {
        events.push(json!({"command":command,"session":session}));
        if call["failSink"] == true {
            Err("sink failed".into())
        } else {
            Ok(())
        }
    };
    let result = generate_architecture(
        &call["input"],
        ArchitectureContext {
            project_root: if call.get("projectRoot").is_some() {
                call["projectRoot"].as_str()
            } else {
                Some(name)
            },
            user_id: call["user"].as_str(),
            session_id: call["session"].as_str(),
        },
        (call["store"] != false).then_some(&store),
        if call["ws"] == true {
            Some(&mut sink)
        } else {
            None
        },
    )
    .unwrap_or_else(|_| json!({"error":true}));
    let file = fs::read_to_string(project.join(".jait/architecture.mmd")).ok();
    let id = result["data"]["requestId"].as_str().or_else(|| {
        events
            .first()
            .and_then(|e| e["command"]["data"]["requestId"].as_str())
    });
    let id_valid = id.map(|s| {
        s.len() == 21
            && s.bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
    });
    let id_consistent = id.map(|id| {
        events
            .iter()
            .all(|e| e["command"]["data"]["requestId"] == id)
    });
    let rows = db
        .prepare("SELECT user_id,diagram FROM architecture_diagrams ORDER BY rowid")
        .ok()
        .and_then(|mut q| {
            q.query_map([], |r| {
                Ok(json!({"user_id":r.get::<_,Option<String>>(0)?,"diagram":r.get::<_,String>(1)?}))
            })
            .ok()?
            .collect::<Result<Vec<_>, _>>()
            .ok()
        });
    let text=serde_json::to_string(&json!({"result":result,"events":events,"fileText":file,"idValid":id_valid,"idConsistent":id_consistent,"rows":rows})).unwrap().replace(name,"<root>");
    let text = if let Some(id) = id {
        text.replace(id, "<request>")
    } else {
        text
    };
    assert_eq!(
        serde_json::from_str::<Value>(&text).unwrap(),
        expected,
        "input: {call}"
    );
}
#[test]
fn architecture_tool_validation_optional_store_and_ws_delivery_share_request_identity() {
    for input in [
        json!({}),
        json!({"diagram":null}),
        json!({"diagram":""}),
        json!({"diagram":" "}),
        json!({"diagram":42}),
        json!({"diagram":[]}),
    ] {
        tool(json!({"input":input,"ws":true}));
    }
    for project in [Value::Null, json!(""), json!("  ")] {
        tool(json!({"input":{"diagram":"graph TD"},"projectRoot":project,"ws":true}));
    }
    for store in [false, true] {
        for ws in [false, true] {
            tool(
                json!({"input":{"diagram":" \u{feff}graph TD; 😀-->B \n","userId":"injected"},"user":"owner","session":"s","store":store,"ws":ws}),
            );
        }
    }
    tool(json!({"input":{"diagram":"graph LR"},"ws":true}));
}
#[test]
fn architecture_tool_store_and_sink_failures_retain_earlier_file_effects() {
    tool(json!({"input":{"diagram":"db failure"},"user":"o","ws":true,"failStore":true}));
    tool(json!({"input":{"diagram":"sink failure"},"user":"o","ws":true,"failSink":true}));
}
