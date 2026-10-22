#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::tools::core_search::{SearchError, SearchPort};
use serde_json::{Value, json};
use std::{
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicUsize, Ordering},
    },
};
fn error(step: &Value) -> Option<SearchError> {
    if let Some(v) = step.get("unavailable") {
        Some(SearchError::Unavailable {
            reason: v["reason"].as_str().unwrap().into(),
            message: v["message"].as_str().unwrap().into(),
        })
    } else if let Some(s) = step["error"].as_str() {
        Some(SearchError::Error(s.into()))
    } else {
        step.get("thrown").map(|v| SearchError::Thrown(v.clone()))
    }
}
fn thrown(e: SearchError) -> Value {
    match e {
        SearchError::Error(s) => json!({"error":s}),
        SearchError::Unavailable { message, .. } => json!({"error":message}),
        SearchError::Thrown(v) => json!({"value":v}),
    }
}
async fn compare(cases: Vec<Value>) {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    for batch in cases.chunks(12) {
        let expected = internal_driver::call(
            &root,
            &root.join(".jait/artifacts/gateway-rust/core-search/contracts"),
            json!({"version":1,"calls":[{"op":"nativecoresearch.run","cases":batch}]}),
            &|| false,
        )
        .unwrap()[0]
            .clone();
        let mut actual = vec![];
        for test in batch {
            let events = Arc::new(Mutex::new(vec![]));
            let index = Arc::new(AtomicUsize::new(0));
            let port: SearchPort = {
                let test = test.clone();
                let events = events.clone();
                let index = index.clone();
                Arc::new(move |op, args| {
                    events.lock().unwrap().push(json!({"op":op,"args":args}));
                    let result = match op {
                        "resolve" => {
                            if let Some(s) = test["rootError"].as_str() {
                                Err(SearchError::Error(s.into()))
                            } else {
                                Ok(test.get("root").cloned().unwrap_or(json!("/owned/project")))
                            }
                        }
                        "stat" => {
                            if let Some(s) = test["statError"].as_str() {
                                Err(SearchError::Error(s.into()))
                            } else {
                                Ok(json!({"isFile":test["isFile"].as_bool().unwrap_or(false)}))
                            }
                        }
                        "search" => {
                            let n = index.fetch_add(1, Ordering::SeqCst);
                            let step = test["steps"].get(n).cloned().unwrap_or(
                                json!({"response":{"mode":"content","matches":[],"limited":false}}),
                            );
                            if let Some(e) = error(&step) {
                                Err(e)
                            } else {
                                Ok(step["response"].clone())
                            }
                        }
                        _ => unreachable!(),
                    };
                    Box::pin(async move { result })
                })
            };
            let tool = jait_gateway::tools::core::create_search_tool(port);
            let context = test.get("context").cloned().unwrap_or(json!({}));
            let result = tool.execute(&test["input"], &context).await;
            let mut output = json!({"metadata":tool.definition(),"events":*events.lock().unwrap()});
            match result {
                Ok(v) => output["result"] = v,
                Err(e) => output["thrown"] = thrown(e),
            };
            actual.push(output);
        }
        for (index, (actual, expected)) in
            actual.iter().zip(expected.as_array().unwrap()).enumerate()
        {
            assert_eq!(actual, expected, "case {:?}", batch[index]);
        }
    }
}
fn content(matches: Value, limited: bool) -> Value {
    json!({"response":{"mode":"content","matches":matches,"limited":limited}})
}
fn files(n: usize, limited: bool) -> Value {
    json!({"response":{"mode":"files","files":(0..n).map(|i|json!({"path":format!("f-{i}"),"relativePath":"discarded","score":99})).collect::<Vec<_>>(),"limited":limited}})
}
#[tokio::test]
async fn root_resolution_file_rewrite_defaults_limits_and_failure_paths_match() {
    let mut cases = vec![];
    let context = json!({"sessionId":"session","projectRoot":"/fallback","userId":"owner"});
    for root in ["/owned/project", "/", "/owned/project/", "//owned//project"] {
        for path in [
            None,
            Some(""),
            Some("src/file.ts"),
            Some("./src//../app/"),
            Some("/absolute/../target/"),
            Some("../../../root"),
            Some("literal\\name"),
            Some("a;$(literal)\nfile"),
        ] {
            for is_file in [true, false] {
                let mut input = json!({"pattern":"a|b","include":"*.ignored","isRegexp":false,"includeIgnoredFiles":true});
                if let Some(p) = path {
                    input["path"] = json!(p);
                }
                cases.push(json!({"input":input,"context":context,"root":root,"isFile":is_file,"steps":[content(json!([]),false),content(json!([{"file":"a","line":2,"content":"result","score":99,"extra":false}]),false)]}));
            }
        }
    }
    for limit in [
        json!(null),
        json!(0),
        json!(-1),
        json!(0.5),
        json!(1),
        json!(20),
        json!(200),
        json!(201),
        json!(1e20),
    ] {
        cases.push(json!({"input":{"pattern":"q","limit":limit},"statError":"missing","steps":[content(json!([]),false),{"error":"retry failed"}]}));
    }
    cases.push(json!({"input":{"pattern":"q"},"rootError":"root denied"}));
    for step in [
        json!({"error":"search denied"}),
        json!({"unavailable":{"reason":"missing_tool","message":"tool missing"}}),
        json!({"thrown":null}),
        json!({"thrown":{"detail":"opaque"}}),
        json!({"response":{"mode":"files","files":[],"limited":false}}),
    ] {
        cases.push(json!({"input":{"pattern":"q"},"steps":[step]}));
    }
    compare(cases).await;
}
#[tokio::test]
async fn files_and_content_retry_singular_plural_limits_and_projection_match() {
    let mut cases = vec![];
    for n in [0, 1, 2, 5] {
        for limited in [false, true] {
            cases.push(json!({"input":{"pattern":"quoted \"term\"","mode":"files","limit":3},"steps":[files(n,limited)]}));
        }
    }
    for initial in [false, true] {
        for initial_matches in [
            json!([]),
            json!([{"file":"first","line":1,"content":"initial","score":10}]),
        ] {
            for retry in [
                content(json!([]), true),
                content(
                    json!([{"file":"retry","line":2,"content":"found","score":4},{"file":"retry2","line":3,"content":"found2","extra":true}]),
                    true,
                ),
                json!({"response":{"mode":"files","files":[]}}),
                json!({"error":"bad regex"}),
                json!({"thrown":"opaque"}),
            ] {
                cases.push(json!({"input":{"pattern":"^abc|def","isRegexp":initial,"mode":"unknown","limit":2},"steps":[content(initial_matches.clone(),false),retry]}));
            }
        }
    }
    cases.push(json!({"input":{"pattern":"unicode 🦀","isRegexp":null,"include":null,"includeIgnoredFiles":null},"steps":[content(json!([]),false),content(json!([]),false)]}));
    compare(cases).await;
}
