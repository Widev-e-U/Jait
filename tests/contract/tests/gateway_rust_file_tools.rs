#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::tools::{
    core_io::{HostError, HostPort},
    file_tools::*,
};
use serde_json::{Value, json};
use std::{
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicUsize, Ordering},
    },
};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn thrown(e: HostError) -> Value {
    match e {
        HostError::Error(s) => json!({"error":s}),
        HostError::Thrown(v) => json!({"value":v}),
    }
}
async fn compare(cases: Vec<Value>) {
    for batch in cases.chunks(4) {
        let root = root();
        let expected = internal_driver::call(
            &root,
            &root.join(".jait/artifacts/gateway-rust/file-tools/contracts"),
            json!({"version":1,"calls":[{"op":"nativefiletools.run","cases":batch}]}),
            &|| false,
        )
        .unwrap()[0]
            .clone();
        let mut actual = vec![];
        for test in batch {
            let context = Arc::new(test.get("context").cloned().unwrap_or(json!({})));
            let context_id = Arc::as_ptr(&context) as usize;
            let events = Arc::new(Mutex::new(vec![]));
            let cursor = Arc::new(AtomicUsize::new(0));
            let port: HostPort<Value> = {
                let test = test.clone();
                let events = events.clone();
                let cursor = cursor.clone();
                Arc::new(move |op, args, ctx| {
                    let i = cursor.fetch_add(1, Ordering::SeqCst);
                    let step = test["steps"][i].clone();
                    events.lock().unwrap().push(json!({"op":op,"args":args,"sameContext":ctx as *const _ as usize==context_id}));
                    Box::pin(async move {
                        if let Some(ms) = step["delay"].as_u64() {
                            tokio::time::sleep(std::time::Duration::from_millis(ms)).await;
                        }
                        if let Some(s) = step["error"].as_str() {
                            return Err(HostError::Error(s.into()));
                        }
                        if let Some(v) = step.get("thrown") {
                            return Err(HostError::Thrown(v.clone()));
                        }
                        if let Some(unit) = step["repeatText"]["unit"].as_str() {
                            return Ok(json!(
                                unit.repeat(step["repeatText"]["count"].as_u64().unwrap() as usize)
                            ));
                        }
                        if let Some(n) = step["bytes"]["count"].as_u64() {
                            let offset = step["bytes"]["offset"].as_u64().unwrap_or(0);
                            return Ok(json!(
                                (0..n).map(|i| (i + offset) % 256).collect::<Vec<_>>()
                            ));
                        }
                        Ok(step.get("response").cloned().unwrap_or(json!({})))
                    })
                })
            };
            let kind = test["kind"].as_str().unwrap();
            let tool = match kind {
                "read" => create_file_read_tool(port),
                "write" => create_file_write_tool(port),
                "patch" => create_file_patch_tool(port),
                "list" => create_file_list_tool(port),
                "stat" => create_file_stat_tool(port),
                "image" => create_image_view_tool(port),
                _ => panic!("unknown file tool"),
            };
            let definition = tool.definition();
            let result: Result<Value, HostError> = Ok(tool.execute(&test["input"], &context).await);
            let mut output = json!({"metadata":definition,"events":*events.lock().unwrap()});
            match result {
                Ok(v) => output["result"] = v,
                Err(e) => output["thrown"] = thrown(e),
            };
            actual.push(output);
        }
        for (index, (actual, expected)) in
            actual.iter().zip(expected.as_array().unwrap()).enumerate()
        {
            assert_eq!(
                actual.get("result"),
                expected.get("result"),
                "case {:?}",
                batch[index]
            );
            assert_eq!(actual, expected, "case {:?}", batch[index]);
        }
    }
}
#[tokio::test]
async fn read_write_preserve_exact_text_utf8_size_paths_and_context() {
    let mut cases = vec![];
    for content in ["", "line\n", "é中🦀\r\n\r\n", "\\n\\r\\t", "  \n\n\0"] {
        for path in [
            "relative.txt",
            "/scope/a",
            "../outside",
            "C:\\remote\\a",
            "a\nline",
        ] {
            cases.push(json!({"kind":"read","input":{"path":path,"unused":true},"context":{"userId":"owner","sessionId":"session","environmentId":"remote"},"steps":[{},{"response":content}]}));
            cases.push(json!({"kind":"write","input":{"path":path,"content":content,"unused":true},"steps":[{},{}]}));
        }
    }
    compare(cases).await;
}
#[tokio::test]
async fn patch_keeps_literal_search_replace_and_matched_branch() {
    let mut cases = vec![];
    for (search, replace) in [
        ("", ""),
        ("same", "same"),
        ("  old\r\n", "  new\r\n"),
        ("a", "$&$1$$"),
        ("🦀", "中"),
    ] {
        for matched in [
            json!(true),
            json!(false),
            json!(0),
            json!(null),
            json!("yes"),
            json!({}),
        ] {
            cases.push(json!({"kind":"patch","input":{"path":"p","search":search,"replace":replace},"steps":[{},{"response":{"matched":matched}}]}));
        }
    }
    compare(cases).await;
}
#[tokio::test]
async fn list_preserves_raw_entries_and_eight_item_preview() {
    let mut cases = vec![];
    for entries in [
        json!([]),
        json!(["file",{"name":"dir","isDirectory":true},{"name":"plain","isDirectory":false},{"name":""},{},null,7,false]),
        json!([[],["a",null,"b"],{"name":7,"isDirectory":"yes"},true]),
        json!((0..12).map(|i| format!("entry-{i}")).collect::<Vec<_>>()),
    ] {
        cases.push(json!({"kind":"list","input":{"path":"dir"},"steps":[{},{"response":entries}]}));
    }
    compare(cases).await;
}
#[tokio::test]
async fn stat_retains_optional_null_fields_and_spread_precedence() {
    let mut cases = vec![];
    for info in [
        json!({}),
        json!({"size":0,"isDirectory":false,"modified":"2026-01-01T00:00:00.000Z"}),
        json!({"size":19,"isDirectory":true,"modified":null,"path":"overridden","extra":{"opaque":1}}),
        json!(null),
    ] {
        cases.push(json!({"kind":"stat","input":{"path":"p"},"steps":[{},{"response":info}]}));
    }
    compare(cases).await;
}
#[tokio::test]
async fn image_extension_directory_guard_mime_base64_threshold_and_original_path_match() {
    let mut cases = vec![];
    for path in [
        "",
        "file.svg",
        "file.png/",
        "file.PNG?x=1",
        "no-extension",
        "a.png\nwrong",
    ] {
        cases.push(json!({"kind":"image","input":{"path":path}}));
    }
    for path in [
        "relative.png",
        " /scope/🦀.JPG \r\n",
        "/a.gif",
        "C:\\a.JpEg",
        "/a.WEBP",
        "\u{feff}a.png\u{a0}",
    ] {
        for n in [0, 1, 2, 3, 255, 7_999, 8_000, 8_001, 16_000] {
            cases.push(json!({"kind":"image","input":{"path":path},"context":{"environmentId":"remote"},"steps":[{},{"response":{"modified":"stamp","isDirectory":false}},{"bytes":{"count":n,"offset":129}}]}));
        }
        for info in [
            json!({"isDirectory":true}),
            json!({"isDirectory":"yes"}),
            json!({}),
            json!({"isDirectory":null,"modified":null}),
        ] {
            cases.push(json!({"kind":"image","input":{"path":path},"steps":[{},{"response":info},{"bytes":{"count":1,"offset":255}}]}));
        }
    }
    compare(cases).await;
}
#[tokio::test]
async fn all_factories_stop_after_each_host_failure_and_keep_error_fallbacks() {
    let mut cases = vec![];
    for kind in ["read", "write", "patch", "list", "stat", "image"] {
        for index in 0..if kind == "image" { 3 } else { 2 } {
            for error in [
                json!({"error":"scope or host denied"}),
                json!({"error":""}),
                json!({"thrown":null}),
                json!({"thrown":"opaque"}),
                json!({"thrown":{"detail":1}}),
            ] {
                let mut steps = vec![
                    json!({}),
                    json!({"response":{"isDirectory":false}}),
                    json!({"bytes":{"count":2,"offset":0}}),
                ];
                steps[index] = error;
                cases.push(json!({"kind":kind,"input":{"path":"../p.png","content":"  \n","search":"a","replace":"b"},"context":{"userId":"owner"},"steps":steps}));
            }
        }
    }
    compare(cases).await;
}
