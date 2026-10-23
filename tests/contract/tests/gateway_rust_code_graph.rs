#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{contracts::ecmascript_json::JsonDocument, services::code_graph::graph::*};
use serde_json::{Value, json};
use std::path::PathBuf;
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
fn native(call: &Value) -> Value {
    let graph = parse_graph(&call["graph"]);
    let index = call
        .get("index")
        .cloned()
        .unwrap_or(json!({"graphVersion":"v","graphRagStatus":"not-prepared"}));
    let p = &call["params"];
    match call["op"].as_str().unwrap() {
        "nativecodegraph.parse" => json!(graph),
        "nativecodegraph.snapshot" => snapshot(&graph, &index, p["maxNodes"].as_f64()),
        "nativecodegraph.query" => query(
            &graph,
            &index,
            p["query"].as_str().unwrap(),
            p["mode"].as_str(),
            p["maxNodes"].as_f64(),
            p["maxDepth"].as_f64(),
        )
        .unwrap_or_else(|error| json!({"error":error})),
        _ => shortest_path(
            &graph,
            p["source"].as_str().unwrap(),
            p["target"].as_str().unwrap(),
            p["maxDepth"].as_f64(),
        ),
    }
}
fn compare(calls: &[Value]) {
    let work = root()
        .join(".jait/artifacts/gateway-rust/code-graph/algorithms")
        .join(uuid::Uuid::new_v4().to_string());
    for chunk in calls.chunks(20) {
        let expected = internal_driver::call(
            &root(),
            &work.join(uuid::Uuid::new_v4().to_string()),
            json!({"version":1,"calls":chunk}),
            &|| false,
        )
        .unwrap();
        for (call, expected) in chunk.iter().zip(expected.as_array().unwrap()) {
            assert_eq!(normalized(native(call)), *expected, "case: {call}");
        }
    }
}
#[test]
fn graph_normalization_matches_reference_for_aliases_duplicates_provenance_and_numbers() {
    let graphs = vec![
        Value::Null,
        json!([]),
        json!(7),
        json!({}),
        json!({"nodes":[null,[],false,{"id":""},{"id":" a ","label":" Label ","node_type":" function ","line":"0x10","end_line":"1e2","community":0},{"id":"a","label":"ignored"},{"key":0,"title":0,"fileType":"code","path":"src/zero.ts"},{"name":"b","line":"Infinity","start_line":"0b101","endLine":"0o12"}],
        "links":[{"source":"a","target":0,"relation":" calls ","confidence":" inferred ","confidence_score":"0.75","source_file":" src/a.ts ","line":"42"},{"source":{"id":"b"},"target":{"key":"a"},"weight":"-0"},{"source":"a","target":"a"},{"source":"missing","target":"a"},null]}),
        json!({"nodes":[{"id":"a","type":"constructor"},{"id":"b","type":"__proto__"},{"id":" c "},{"id":9007199254740993u64}],
        "edges":[{"source":"a","target":"b","relation":"constructor"},{"source":"a","target":" c "},{"source":"c","target":9007199254740993u64,"confidence":"EXTRACTED"}]}),
        json!({"nodes":[{"id":"a"},{"id":"b"}],"links":[],"edges":[{"source":"a","target":"b"}]}),
        json!({"nodes":[{"id":"1e+21","line":"1_000","startLine":"-1.5"},{"id":1e21},{"id":1e-7}],"links":[{"source":1e21,"target":1e-7,"confidence":1}]}),
    ];
    compare(
        &graphs
            .into_iter()
            .map(|graph| json!({"op":"nativecodegraph.parse","graph":graph}))
            .collect::<Vec<_>>(),
    );
}
fn example() -> Value {
    json!({"nodes":[
        {"id":"auth","label":"AuthService","source_file":"src/auth.ts","line":12},
        {"id":"store","label":"SessionStore"},{"id":"db","label":"DatabasePool"},{"id":"solo","label":"Isolated"},
        {"id":"db-copy","label":"DatabasePool"},{"id":"doc","label":"Readme","file_type":"document"}],
        "links":[{"id":"duplicate","source":"auth","target":"store","relation":"calls","source_file":"src/auth.ts","line":42,"confidence":"EXTRACTED"},
        {"source":"store","target":"db","relation":"uses","confidence":"INFERRED"},
        {"source":"db","target":"db","relation":"self"},{"id":"duplicate","source":"db","target":"auth","relation":"reverse"},
        {"source":"doc","target":"db","relation":"describes"}]})
}
#[test]
fn bounded_snapshots_and_ranked_queries_preserve_stable_reference_order() {
    let graph = example();
    let mut calls = vec![];
    for limit in [
        None,
        Some(-3.0),
        Some(1.0),
        Some(2.5),
        Some(4.0),
        Some(6.0),
        Some(100000.0),
    ] {
        calls.push(json!({"op":"nativecodegraph.snapshot","graph":graph,"params":limit.map(|v|json!({"maxNodes":v})).unwrap_or(json!({}))}));
    }
    for text in [
        "auth",
        "database",
        "the how does",
        "does not match",
        "solo",
        "store",
        "Read",
        "src/auth.ts",
        "   ",
        "\u{feff}AUTH\u{a0}",
    ] {
        for (nodes, depth) in [
            (1.0, 0.0),
            (3.0, 1.0),
            (120.0, 2.0),
            (2.5, 1.5),
            (10000.0, 99.0),
        ] {
            calls.push(json!({"op":"nativecodegraph.query","graph":graph,"params":{"query":text,"mode":"local","maxNodes":nodes,"maxDepth":depth}}));
        }
    }
    compare(&calls);
}
#[test]
fn shortest_paths_match_for_label_priority_reverse_edges_cycles_and_depth_bounds() {
    let graph = example();
    let mut calls = vec![];
    for (a, b) in [
        ("AuthService", "DatabasePool"),
        ("DB", "AUTH"),
        ("auth", "auth"),
        ("solo", "db"),
        ("", "Read"),
        ("missing", "db"),
        ("DatabasePool", "store"),
        (" SessionStore ", " Readme "),
    ] {
        for depth in [
            None,
            Some(-1.0),
            Some(1.0),
            Some(1.5),
            Some(2.0),
            Some(99.0),
        ] {
            calls.push(json!({"op":"nativecodegraph.path","graph":graph,"params":{"source":a,"target":b,"maxDepth":depth}}));
        }
    }
    compare(&calls);
}
#[test]
fn empty_and_large_graphs_keep_snapshot_and_context_caps() {
    let mut graphs = vec![
        json!({}),
        json!({"nodes":[{"id":"single","label":"Single"}]}),
    ];
    let nodes: Vec<_> = (0..150)
        .map(|i| json!({"id":format!("n{i}"),"label":format!("Node{i}")}))
        .collect();
    let links: Vec<_> = (0..149)
        .map(|i| json!({"source":format!("n{i}"),"target":format!("n{}",i+1)}))
        .collect();
    graphs.push(json!({"nodes":nodes,"links":links}));
    for graph in graphs {
        compare(&[
            json!({"op":"nativecodegraph.snapshot","graph":graph,"params":{"maxNodes":40}}),
            json!({"op":"nativecodegraph.query","graph":graph,"params":{"query":"unknown","maxNodes":1000,"maxDepth":8}}),
            json!({"op":"nativecodegraph.path","graph":graph,"params":{"source":"n0","target":"n149","maxDepth":50}}),
        ]);
    }
}
