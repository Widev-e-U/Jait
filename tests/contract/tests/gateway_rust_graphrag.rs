#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{contracts::ecmascript_json::JsonDocument, services::code_graph::graphrag::*};
use serde_json::{Value, json};
use std::{path::PathBuf, sync::Arc};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn normalized(value: Value) -> Value {
    serde_json::from_str(
        &JsonDocument::parse(&serde_json::to_string(&value).unwrap())
            .unwrap()
            .stringify(),
    )
    .unwrap()
}
fn snapshot(nodes: Value, edges: Value) -> Value {
    json!({"index":{"graphVersion":"version-😀"},"nodes":nodes,"edges":edges,"truncated":false})
}
fn node(id: &str, label: &str, file: Option<&str>) -> Value {
    let mut node = json!({"id":id,"label":label,"type":"function","degree":2,"properties":{}});
    if let Some(file) = file {
        node["sourceFile"] = json!(file);
    }
    node
}
fn edge(id: &str, source: &str, target: &str, file: Option<&str>) -> Value {
    let mut edge = json!({"id":id,"source":source,"target":target,"relation":"CALLS","confidence":"EXTRACTED","properties":{}});
    if let Some(file) = file {
        edge["sourceFile"] = json!(file);
    }
    edge
}
fn prepare(snapshot: Value) -> Value {
    json!({"op":"nativegraphrag.prepare","snapshot":snapshot})
}
fn native(call: &Value) -> Value {
    let snapshot: GraphSnapshot = serde_json::from_value(call["snapshot"].clone()).unwrap();
    if call["op"] == "nativegraphrag.prepare" {
        return normalized(json!({"prepared":to_graph_rag_data(&snapshot),"unchanged":true}));
    }
    let relative = call["directory"].as_str().unwrap();
    let output = PathBuf::from(call["absoluteDirectory"].as_str().unwrap());
    let target = if call["relative"] == true {
        PathBuf::from(relative)
    } else {
        output.clone()
    };
    if call["collision"] == "directory-file" {
        std::fs::create_dir_all(output.parent().unwrap()).unwrap();
        std::fs::write(&output, "original directory marker").unwrap();
    } else if let Some(name) = call["collision"].as_str() {
        std::fs::create_dir_all(output.join(name)).unwrap();
    }
    let now = call["now"].as_i64().unwrap_or(1740000000000);
    let clock: jait_gateway::time::Clock = Arc::new(move || now);
    let result = match write_graph_rag_export_with_clock(&snapshot, &target, &clock) {
        Ok(manifest) => json!({"manifest":manifest}),
        Err(error) => json!({"error":match error.raw_os_error(){
            Some(17)=>"EEXIST".into(),Some(20)=>"ENOTDIR".into(),Some(21)=>"EISDIR".into(),Some(2)=>"ENOENT".into(),
            _=>{let message=error.to_string();if message.contains("Invalid time")||message.contains("out of range"){String::from("InvalidDate")}else{message}}
        }}),
    };
    let mut files = serde_json::Map::new();
    for name in [
        "entities.jsonl",
        "relationships.jsonl",
        "text_units.jsonl",
        "manifest.json",
    ] {
        if let Ok(text) = std::fs::read_to_string(output.join(name)) {
            files.insert(name.into(), json!(text));
        }
    }
    json!({"result":result,"files":files})
}
fn compare(calls: Vec<Value>) {
    for call in calls {
        let work = root()
            .join(".jait/artifacts/gateway-rust/graphrag")
            .join(uuid::Uuid::new_v4().to_string());
        let mut reference = call.clone();
        if call["op"] != "nativegraphrag.prepare" {
            let directory = work.join("export");
            reference["absoluteDirectory"] = json!(directory);
            let cwd = std::env::current_dir().unwrap();
            reference["cwd"] = json!(cwd);
            reference["directory"] = if call["relative"] == true {
                let prefix = if cwd == root() {
                    ""
                } else {
                    assert_eq!(cwd, root().join("tests/contract"));
                    "../../"
                };
                json!(format!(
                    "{prefix}{}",
                    directory.strip_prefix(root()).unwrap().to_str().unwrap()
                ))
            } else {
                json!(directory)
            };
        }
        let expected = internal_driver::call(
            &root(),
            &work.join("bridge"),
            json!({"version":1,"calls":[reference.clone()]}),
            &|| false,
        )
        .unwrap()[0]
            .clone();
        // Export the exact same paths after removing reference-created output.
        if call["op"] != "nativegraphrag.prepare" {
            let output = PathBuf::from(reference["absoluteDirectory"].as_str().unwrap());
            if output.is_dir() {
                std::fs::remove_dir_all(output).unwrap();
            } else if output.exists() {
                std::fs::remove_file(output).unwrap();
            }
        }
        assert_eq!(native(&reference), expected, "call {reference}");
    }
}
#[test]
fn empty_graphs_missing_files_and_optional_node_locations_match() {
    let mut n = node("empty", "", Some(""));
    n["line"] = json!(0);
    n["endLine"] = json!(0);
    n["community"] = json!("");
    n["fileType"] = json!("typescript");
    let mut located = node("f", "function 😀", Some("source.ts"));
    located["line"] = json!(-1.25);
    located["endLine"] = json!(0);
    compare(vec![
        prepare(snapshot(json!([]), json!([]))),
        prepare(snapshot(
            json!([n, located, node("missing", "no file", None)]),
            json!([edge("unknown", "missing-id", "f", None)]),
        )),
    ]);
}
#[test]
fn duplicate_ids_overrides_weights_and_degree_fallbacks_match() {
    let mut first = node("dup", "old", Some("one.ts"));
    first["degree"] = json!(3);
    first["properties"] = json!({"source_file":"override","line":null,"2":"integer two","1":"integer one","nested":{"9":"nine","2":"two"}});
    let mut last = node("dup", "new", Some("two.ts"));
    last["degree"] = json!(7.5);
    let mut calls = vec![];
    for confidence in ["EXTRACTED", "INFERRED", "AMBIGUOUS", "UNKNOWN"] {
        for score in [Value::Null, json!(0), json!(-0.5), json!(1e-7), json!(3)] {
            let mut e = edge("edge", "dup", "missing", Some("edge-only.ts"));
            e["confidence"] = json!(confidence);
            e["confidenceScore"] = score;
            e["properties"] = json!({"relation":"OVERRIDE","source_file":null,"line":false});
            calls.push(prepare(snapshot(
                json!([first.clone(), last.clone()]),
                json!([e]),
            )));
        }
    }
    compare(calls);
}
#[test]
fn text_units_sort_by_utf16_and_count_utf16_tokens() {
    let files = [
        "\u{e000}.ts",
        "😀.ts",
        "é.ts",
        "e\u{301}.ts",
        "A.ts",
        "a.ts",
    ];
    let nodes: Vec<_> = files
        .iter()
        .enumerate()
        .map(|(i, file)| node(&i.to_string(), "symbol 😀", Some(file)))
        .collect();
    compare(vec![prepare(snapshot(
        json!(nodes),
        json!([edge("e", "0", "1", Some("only-edge.ts"))]),
    ))]);
}
#[test]
fn symbol_summary_caps_at_one_hundred_but_retains_complete_ids() {
    let mut nodes: Vec<_> = (0..123)
        .map(|i| node(&i.to_string(), &format!("symbol-{i}"), Some("large.ts")))
        .collect();
    nodes.push(node("0", "replacement label", Some("other.ts")));
    compare(vec![prepare(snapshot(json!(nodes), json!([])))]);
}
#[test]
fn actual_jsonl_and_pretty_manifest_bytes_match_reference() {
    let mut n = node("unicode", "a\n😀", Some("path/é.ts"));
    n["properties"] = json!({"10":10,"2":2,"nested":{"negative_zero":-0.0,"number":1e21},"untrusted":"</script>"});
    let snap = snapshot(
        json!([n]),
        json!([edge("self", "unicode", "unicode", Some("path/é.ts"))]),
    );
    let mut calls = vec![];
    for relative in [false, true] {
        calls.push(json!({"op":"nativegraphrag.export","snapshot":snap,"relative":relative}));
        calls.push(json!({"op":"nativegraphrag.export","snapshot":snapshot(json!([]),json!([])),"relative":relative}));
    }
    compare(calls);
}
#[test]
fn missing_version_is_rejected_before_creating_output_and_existing_file_errors_match() {
    let mut snap = snapshot(json!([]), json!([]));
    snap["index"]["graphVersion"] = json!("");
    compare(vec![
        json!({"op":"nativegraphrag.export","snapshot":snap}),
        json!({"op":"nativegraphrag.export","snapshot":snapshot(json!([]),json!([])),"collision":"directory-file"}),
    ]);
}
#[test]
fn writes_attempt_siblings_even_when_one_target_is_a_directory() {
    let dir = root()
        .join(".jait/artifacts/gateway-rust/graphrag")
        .join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(dir.join("entities.jsonl")).unwrap();
    let snap: GraphSnapshot = serde_json::from_value(snapshot(json!([]), json!([]))).unwrap();
    assert!(write_graph_rag_export(&snap, &dir).is_err());
    for file in ["relationships.jsonl", "text_units.jsonl", "manifest.json"] {
        assert!(dir.join(file).is_file());
    }
    assert!(dir.join("entities.jsonl").is_dir());
}
