#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    runtime::blocking::BlockingLane,
    surfaces::{
        filesystem::{
            FileOperation as Op, FileReply, FileSystemError, FileSystemSurface,
            FileSystemSurfaceFactory, GuardOptions,
        },
        registry::{Surface, SurfaceStartInput},
    },
};
use serde_json::{Value, json};
use std::{
    fs,
    num::NonZeroU16,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn seed(work: &Path, case: &Value) {
    let outer = work.parent().unwrap();
    assert_eq!(
        outer.parent().unwrap(),
        root().join(".jait/artifacts/gateway-rust/filesystem/contracts")
    );
    if outer.exists() {
        fs::remove_dir_all(outer).unwrap();
    }
    fs::create_dir_all(work).unwrap();
    for item in case["setup"].as_array().into_iter().flatten() {
        let path = work.join(item["path"].as_str().unwrap());
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        match item["type"].as_str() {
            Some("directory") => fs::create_dir_all(path).unwrap(),
            Some("symlink") => {
                #[cfg(unix)]
                std::os::unix::fs::symlink(item["target"].as_str().unwrap(), path).unwrap();
                #[cfg(not(unix))]
                panic!("symlink corpus needs a separate platform fixture");
            }
            _ => {
                let bytes: Vec<u8> = item["bytes"]
                    .as_array()
                    .map(|a| a.iter().map(|v| v.as_u64().unwrap() as u8).collect())
                    .unwrap_or_else(|| item["content"].as_str().unwrap_or("").as_bytes().to_vec());
                fs::write(&path, bytes).unwrap();
                let time = std::time::UNIX_EPOCH + std::time::Duration::from_secs(1_600_000_000);
                fs::File::open(path)
                    .unwrap()
                    .set_times(fs::FileTimes::new().set_accessed(time).set_modified(time))
                    .unwrap();
            }
        }
    }
}
fn tree(path: &Path, base: &Path, rows: &mut Vec<Value>) {
    let info = fs::symlink_metadata(path).unwrap();
    let rel = path.strip_prefix(base).unwrap();
    let rel = if rel.as_os_str().is_empty() {
        ".".to_owned()
    } else {
        rel.to_string_lossy().to_string()
    };
    if info.file_type().is_symlink() {
        rows.push(json!({"path":rel,"type":"symlink","target":fs::read_link(path).unwrap()}));
    } else if info.is_dir() {
        rows.push(json!({"path":rel,"type":"directory"}));
        let mut entries: Vec<_> = fs::read_dir(path)
            .unwrap()
            .map(|e| e.unwrap().path())
            .collect();
        entries.sort();
        for child in entries {
            tree(&child, base, rows);
        }
    } else {
        rows.push(json!({"path":rel,"type":"file","bytes":fs::read(path).unwrap()}));
    }
}
fn packed(result: Result<FileReply, FileSystemError>, stat: bool) -> Value {
    match result {
        Err(e) => json!({"error":e.details}),
        Ok(FileReply::Undefined) => json!({"undefined":true}),
        Ok(FileReply::Bytes(b)) => json!({"buffer":b}),
        Ok(FileReply::Value(mut v)) => {
            if stat {
                assert!(v["modified"].as_str().unwrap().ends_with('Z'));
                v["modified"] = json!("<mtime>");
            }
            json!({"value":v})
        }
    }
}
async fn native(case: &Value) -> Value {
    let work = Path::new(case["root"].as_str().unwrap());
    seed(work, case);
    let opts = GuardOptions {
        project_root: if case["guard"]["projectRoot"] == true {
            Some(work.join("override"))
        } else {
            None
        },
        denied_paths: case["guard"]["deniedPaths"]
            .as_array()
            .map(|a| a.iter().map(|v| v.as_str().unwrap().to_string()).collect())
            .unwrap_or_default(),
        check_symlinks: case["guard"]["checkSymlinks"].as_bool().unwrap_or(true),
    };
    let lane = BlockingLane::new(NonZeroU16::new(1).unwrap());
    let surface = if case["factory"] == true {
        FileSystemSurfaceFactory::new(opts, lane).create_filesystem("filesystem-fixture")
    } else {
        FileSystemSurface::new("filesystem-fixture", opts, lane)
    }
    .with_clock(Arc::new(|| {
        jait_gateway::time::iso(1_790_000_000_000).unwrap()
    }));
    let events = Arc::new(Mutex::new(Vec::<Value>::new()));
    let output = events.clone();
    let failure = case["outputError"].as_str().map(str::to_string);
    surface.on_output(Some(Arc::new(move |data| {
        output.lock().unwrap().push(json!({"output":data}));
        match &failure {
            Some(e) => Err(FileSystemError::message(e)),
            None => Ok(()),
        }
    })));
    let output = events.clone();
    let failure = case["stateError"].as_str().map(str::to_string);
    surface.on_state_change(Some(Arc::new(move |state| {
        output.lock().unwrap().push(json!({"state":state}));
        match &failure {
            Some(e) => Err(FileSystemError::message(e)),
            None => Ok(()),
        }
    })));
    let mut outcomes = vec![];
    for step in case["ops"].as_array().unwrap() {
        let name = step["op"].as_str().unwrap();
        let path = step["path"].as_str().unwrap_or("").to_string();
        let text = |field: &str| step[field].as_str().unwrap_or("").to_string();
        let immediate = match name {
            "start" => {
                let mut input = json!({"sessionId":"fixture-session","projectRoot":work});
                if let Some(fields) = step["input"].as_object() {
                    for (k, v) in fields {
                        input[k] = v.clone();
                    }
                }
                Some(
                    surface
                        .start_filesystem(
                            serde_json::from_value::<SurfaceStartInput>(input).unwrap(),
                        )
                        .await
                        .map(|_| FileReply::Undefined),
                )
            }
            "stop" => Some(surface.stop_filesystem().map(|_| FileReply::Undefined)),
            "snapshot" => Some(Ok(FileReply::Value(
                serde_json::to_value(surface.filesystem_snapshot()).unwrap(),
            ))),
            "state" => Some(Ok(FileReply::Value(
                json!({"id":surface.id(),"type":surface.kind(),"state":surface.state(),"sessionId":surface.session_id()}),
            ))),
            "allowed" => Some(Ok(FileReply::Value(json!(surface.is_path_allowed(&path))))),
            "hasBackup" => Some(Ok(FileReply::Value(json!(surface.has_backup(&path))))),
            "getBackup" => Some(Ok(match surface.backup(&path) {
                None => FileReply::Undefined,
                Some(v) => FileReply::Value(json!(v)),
            })),
            "clearBackup" => {
                surface.clear_backup(&path);
                Some(Ok(FileReply::Undefined))
            }
            _ => None,
        };
        let result = if let Some(r) = immediate {
            r
        } else {
            let op = match name {
                "read" => Op::Read(path),
                "readBinary" => Op::ReadBinary(path),
                "write" => Op::Write {
                    path,
                    content: text("content"),
                },
                "patch" => Op::Patch {
                    path,
                    search: text("search"),
                    replace: text("replace"),
                },
                "exists" => Op::Exists(path),
                "list" => Op::List(path),
                "stat" => Op::Stat(path),
                "restore" => Op::Restore(path),
                "saveExternalBackup" => Op::SaveExternalBackup(path),
                "deleteFile" => Op::DeleteFile(path),
                "deleteDirectory" => Op::DeleteDirectory(path),
                "rename" => Op::Rename {
                    path,
                    name: text("name"),
                },
                "move" => Op::Move {
                    path,
                    directory: text("destination"),
                },
                "mkdir" => Op::CreateDirectory(path),
                "create" => Op::CreateFile {
                    path,
                    content: text("content"),
                },
                "copy" => Op::Copy {
                    source: path,
                    destination: text("destination"),
                },
                _ => panic!("unknown fixture operation {name}"),
            };
            surface.execute(op).await
        };
        outcomes.push(packed(result, name == "stat"));
    }
    let mut rows = vec![];
    tree(work.parent().unwrap(), work.parent().unwrap(), &mut rows);
    json!({"outcomes":outcomes,"events":*events.lock().unwrap(),"tree":rows})
}
async fn compare(mut cases: Vec<Value>) {
    for case in &mut cases {
        case["root"] = json!(
            root()
                .join(".jait/artifacts/gateway-rust/filesystem/contracts")
                .join(uuid::Uuid::new_v4().to_string())
                .join("work")
        );
    }
    let expected = internal_driver::call(
        &root(),
        &root()
            .join(".jait/artifacts/gateway-rust/filesystem/driver")
            .join(uuid::Uuid::new_v4().to_string()),
        json!({"version":1,"calls":[{"op":"nativefilesystem.cases","cases":cases}]}),
        &|| false,
    )
    .unwrap()[0]
        .clone();
    for (i, case) in cases.iter().enumerate() {
        let actual = native(case).await;
        if actual != expected[i] {
            let output = root()
                .join(".jait/artifacts/gateway-rust/filesystem/diff")
                .join(uuid::Uuid::new_v4().to_string());
            fs::create_dir_all(&output).unwrap();
            fs::write(
                output.join("native.json"),
                serde_json::to_vec_pretty(&actual).unwrap(),
            )
            .unwrap();
            fs::write(
                output.join("reference.json"),
                serde_json::to_vec_pretty(&expected[i]).unwrap(),
            )
            .unwrap();
            for (j, (a, b)) in actual["outcomes"]
                .as_array()
                .unwrap()
                .iter()
                .zip(expected[i]["outcomes"].as_array().unwrap())
                .enumerate()
            {
                assert_eq!(
                    a,
                    b,
                    "filesystem case {i} step {j}: {}; artifacts {}",
                    case["ops"][j],
                    output.display()
                );
            }
            assert_eq!(
                actual,
                expected[i],
                "filesystem case {i}; artifacts {}",
                output.display()
            );
        }
    }
}
#[tokio::test]
async fn lifecycle_reads_backups_patch_and_restore_match_actual_surface() {
    compare(vec![json!({"factory":true,"setup":[{"path":"original","content":"hello 🦀 hello"},{"path":"bytes","bytes":[0,255,240,159,166,128]}],"ops":[
        {"op":"state"},{"op":"snapshot"},{"op":"read","path":"original"},{"op":"allowed","path":"original"},{"op":"getBackup","path":"original"},
        {"op":"start","input":{"panelOpen":false}},{"op":"state"},{"op":"snapshot"},{"op":"allowed","path":"original"},
        {"op":"read","path":"original"},{"op":"readBinary","path":"bytes"},{"op":"read","path":"bytes"},{"op":"stat","path":"original"},
        {"op":"write","path":"original","content":"second"},{"op":"write","path":"original","content":"third"},{"op":"getBackup","path":"./original"},{"op":"hasBackup","path":"original"},
        {"op":"restore","path":"original"},{"op":"read","path":"original"},{"op":"restore","path":"original"},
        {"op":"patch","path":"original","search":"absent","replace":"bad"},{"op":"patch","path":"original","search":"hello","replace":"$$-$&-$`-$'"},
        {"op":"read","path":"original"},{"op":"getBackup","path":"original"},{"op":"restore","path":"original"},
        {"op":"patch","path":"original","search":"","replace":"start"},{"op":"clearBackup","path":"original"},{"op":"getBackup","path":"original"},
        {"op":"write","path":"nested/new","content":"new 🦀"},{"op":"getBackup","path":"nested/new"},{"op":"exists","path":"nested/new"},{"op":"restore","path":"nested/new"},{"op":"exists","path":"nested/new"},
        {"op":"saveExternalBackup","path":"original"},{"op":"write","path":"original","content":"external"},{"op":"saveExternalBackup","path":"original"},{"op":"getBackup","path":"original"},
        {"op":"saveExternalBackup","path":"never-existed"},{"op":"getBackup","path":"never-existed"},{"op":"restore","path":"never-existed"},
        {"op":"snapshot"},{"op":"stop"},{"op":"state"},{"op":"snapshot"},{"op":"read","path":"original"},{"op":"start","input":{"panelOpen":"yes"}},{"op":"getBackup","path":"original"},{"op":"snapshot"}
    ]})]).await;
}
#[tokio::test]
async fn create_copy_move_rename_delete_and_recursive_copy_guards_match() {
    compare(vec![json!({"setup":[{"path":"dir","type":"directory"},{"path":"dir/a","content":"A"},{"path":"dir/b","content":"B"}],"ops":[
        {"op":"start"},{"op":"list","path":"dir"},{"op":"mkdir","path":"empty/deep"},{"op":"create","path":"empty/new"},{"op":"create","path":"empty/🦀","content":"text"},
        {"op":"copy","path":"dir/a","destination":"copy"},{"op":"copy","path":"dir/a","destination":"dir/a"},{"op":"rename","path":"copy","name":"renamed"},
        {"op":"move","path":"renamed","destination":"destination"},{"op":"copy","path":"dir","destination":"dir-copy"},
        {"op":"copy","path":"dir","destination":"dir"},{"op":"copy","path":"dir","destination":"dir/descendant"},
        {"op":"deleteFile","path":"destination/renamed"},{"op":"deleteDirectory","path":"dir-copy"},{"op":"deleteDirectory","path":"empty"},{"op":"list","path":"."},{"op":"snapshot"}
    ]})]).await;
}
#[tokio::test]
async fn path_denials_secondary_paths_and_io_errors_preserve_counts_and_files() {
    let mut ops = vec![json!({"op":"start"})];
    for path in [
        "../outside",
        "../../escape",
        "bad\u{0000}path",
        ".ssh/key",
        "denied/file",
    ] {
        for name in [
            "read",
            "readBinary",
            "write",
            "patch",
            "exists",
            "list",
            "stat",
            "restore",
            "saveExternalBackup",
            "deleteFile",
            "deleteDirectory",
            "mkdir",
            "create",
            "copy",
            "rename",
            "move",
        ] {
            ops.push(json!({"op":name,"path":path,"content":"bad","search":"x","replace":"y","destination":"safe","name":"safe"}));
        }
        for name in ["allowed", "getBackup", "hasBackup", "clearBackup"] {
            ops.push(json!({"op":name,"path":path}));
        }
    }
    ops.extend([
        json!({"op":"rename","path":"original","name":"../../outside"}),
        json!({"op":"copy","path":"original","destination":"../outside"}),
        json!({"op":"move","path":"original","destination":"../outside"}),
    ]);
    for (name, path) in [
        ("read", "missing"),
        ("write", "original/child"),
        ("read", "directory"),
        ("list", "original"),
        ("stat", "missing"),
        ("patch", "missing"),
        ("deleteFile", "directory"),
        ("deleteDirectory", "missing"),
        ("rename", "missing"),
        ("copy", "missing"),
    ] {
        ops.push(json!({"op":name,"path":path,"content":"x","search":"a","replace":"b","destination":"safe","name":"renamed"}));
    }
    ops.push(json!({"op":"snapshot"}));
    compare(vec![json!({"guard":{"deniedPaths":["denied"]},"setup":[{"path":"original","content":"preserved"},{"path":"directory","type":"directory"},{"path":"../outside","content":"outside"}],"ops":ops})]).await;
}
#[cfg(unix)]
#[tokio::test]
async fn symlink_policy_and_options_match_without_leaving_owned_fixtures() {
    let setup = json!([{"path":"original","content":"original"},{"path":"../outside","content":"outside"},{"path":"inside","type":"symlink","target":"original"},{"path":"escape","type":"symlink","target":"../outside"},{"path":"broken","type":"symlink","target":"absent"}]);
    let mut cases = vec![];
    for check in [true, false] {
        cases.push(json!({"guard":{"checkSymlinks":check},"setup":setup,"ops":[{"op":"start"},{"op":"read","path":"inside"},{"op":"read","path":"escape"},{"op":"read","path":"broken"},{"op":"exists","path":"escape"},{"op":"stat","path":"inside"},{"op":"write","path":"escape","content":"test"},{"op":"snapshot"}]}));
    }
    cases.push(json!({"guard":{"projectRoot":true},"setup":[{"path":"override/a","content":"overridden"}],"ops":[{"op":"start"},{"op":"read","path":"a"},{"op":"snapshot"}]}));
    compare(cases).await;
}
#[tokio::test]
async fn callback_failures_preserve_the_references_effect_order() {
    compare(vec![
        json!({"outputError":"output callback failed","setup":[{"path":"a","content":"before"}],"ops":[{"op":"start"},{"op":"write","path":"a","content":"after"},{"op":"read","path":"a"},{"op":"restore","path":"a"},{"op":"snapshot"}]}),
        json!({"stateError":"state callback failed","ops":[{"op":"start"},{"op":"state"},{"op":"stop"},{"op":"snapshot"},{"op":"allowed","path":"a"}]})
    ]).await;
}

#[tokio::test]
async fn every_operation_rejects_before_start_and_after_stop() {
    let mut ops = vec![];
    for phase in 0..2 {
        if phase == 1 {
            ops.push(json!({"op":"start"}));
            ops.push(json!({"op":"stop"}));
        }
        for op in [
            "read",
            "readBinary",
            "write",
            "patch",
            "exists",
            "list",
            "stat",
            "restore",
            "saveExternalBackup",
            "deleteFile",
            "deleteDirectory",
            "mkdir",
            "create",
            "copy",
            "rename",
            "move",
        ] {
            ops.push(json!({"op":op,"path":"a","content":"bad","search":"a","replace":"bad","destination":"b","name":"b"}));
        }
        for op in ["getBackup", "hasBackup", "clearBackup", "allowed"] {
            ops.push(json!({"op":op,"path":"a"}));
        }
        ops.push(json!({"op":"snapshot"}));
    }
    compare(vec![
        json!({"setup":[{"path":"a","content":"unchanged"}],"ops":ops}),
    ])
    .await;
}
#[cfg(unix)]
#[tokio::test]
async fn copy_aliases_nested_symlinks_and_existing_destinations_match() {
    compare(vec![json!({"setup":[
        {"path":"dir/a","content":"A"},{"path":"dir/link","type":"symlink","target":"a"},
        {"path":"alias","type":"symlink","target":"dir"},{"path":"file-alias","type":"symlink","target":"dir/a"},
        {"path":"existing","content":"existing"}
    ],"ops":[
        {"op":"start"},{"op":"copy","path":"dir/a","destination":"file-alias"},
        {"op":"copy","path":"dir","destination":"copy"},
        {"op":"copy","path":"dir","destination":"alias/descendant"},
        {"op":"copy","path":"dir/a","destination":"existing"},
        {"op":"copy","path":"dir","destination":"existing"},
        {"op":"copy","path":"dir/a","destination":"copy"},{"op":"snapshot"}
    ]})]).await;
}

#[tokio::test]
async fn patch_substitution_and_lossy_text_decoding_match_the_real_runtime() {
    let mut cases = vec![];
    for (search, replace) in [
        ("", "$$:$&:$`:$':$1:$<name>"),
        ("hello", "$'/$`/$&/$$/$0/$12"),
        ("🦀", "$&$&"),
        ("absent", "ignored"),
    ] {
        cases.push(json!({"setup":[{"path":"a","content":"hello 🦀 hello"}],"ops":[{"op":"start"},{"op":"patch","path":"a","search":search,"replace":replace},{"op":"read","path":"a"},{"op":"getBackup","path":"a"},{"op":"restore","path":"a"},{"op":"read","path":"a"},{"op":"snapshot"}]}));
    }
    for bytes in [
        vec![0xe2, 0x82],
        vec![0xef, 0xbb, 0xbf, 0, 0xff],
        vec![0xed, 0xa0, 0x80],
        vec![0xf0, 0x80, 0x80, 0x80],
        vec![0x61, 0xc2, 0x20, 0x62],
    ] {
        cases.push(json!({"setup":[{"path":"a","bytes":bytes}],"ops":[{"op":"start"},{"op":"read","path":"a"},{"op":"readBinary","path":"a"},{"op":"write","path":"a","content":"changed"},{"op":"getBackup","path":"a"},{"op":"restore","path":"a"},{"op":"readBinary","path":"a"},{"op":"snapshot"}]}));
    }
    compare(cases).await;
}
