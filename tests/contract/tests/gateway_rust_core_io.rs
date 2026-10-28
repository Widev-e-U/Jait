#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::tools::{
    core,
    core_io::{HostError, HostPort},
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
            &root.join(".jait/artifacts/gateway-rust/core-io/contracts"),
            json!({"version":1,"calls":[{"op":"nativecoreio.run","cases":batch}]}),
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
                        Ok(step.get("response").cloned().unwrap_or(json!({})))
                    })
                })
            };
            let kind = test["kind"].as_str().unwrap();
            let (definition, result) = match kind {
                "edit" => {
                    let tool = core::create_edit_tool(port);
                    (
                        tool.definition(),
                        Ok(tool.execute(&test["input"], &context).await),
                    )
                }
                "read" => {
                    let tool = core::create_read_tool(port);
                    (
                        tool.definition(),
                        Ok(tool.execute(&test["input"], &context).await),
                    )
                }
                "execute" => {
                    let tool = core::create_execute_tool(port);
                    (
                        tool.definition(),
                        tool.execute(&test["input"], &context).await,
                    )
                }
                "web" => {
                    let tool = core::create_web_tool(port);
                    (
                        tool.definition(),
                        tool.execute(&test["input"], &context).await,
                    )
                }
                _ => unreachable!(),
            };
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
async fn execute_preserves_factory_wiring_context_errors_and_all_forwarded_fields() {
    let mut cases = vec![];
    for background in [
        None,
        Some(Value::Null),
        Some(json!(false)),
        Some(json!(true)),
    ] {
        let mut input = json!({"command":"printf '%s' '$literal'","explanation":"display only","goal":"display only","terminalId":"id","timeout":0,"yieldTimeMs":25,"cwd":"../scope","sandbox":true,"sandboxMountMode":"read-only","nodeId":"device-windows","unknown":42});
        if let Some(v) = background {
            input["isBackground"] = v;
        }
        for step in [
            json!({"response":{"ok":true,"message":"done","extra":null}}),
            json!({"response":null}),
            json!({"error":"consent denied"}),
            json!({"thrown":{"opaque":true}}),
        ] {
            cases.push(json!({"kind":"execute","input":input,"context":{"userId":"owner","sessionId":"session"},"steps":[step]}));
        }
    }
    cases.push(json!({"kind":"execute","input":{},"steps":[{"response":false}]}));
    for key in [
        "command",
        "terminalId",
        "timeout",
        "cwd",
        "sandbox",
        "sandboxMountMode",
    ] {
        let mut input = json!({"command":"x"});
        input[key] = Value::Null;
        cases.push(json!({"kind":"execute","input":input,"steps":[{"response":{}}]}));
    }
    compare(cases).await;
}
#[tokio::test]
async fn edit_preserves_mode_validation_order_utf8_bytes_newlines_and_host_failures() {
    let mut cases = vec![];
    for input in [
        json!({}),
        json!({"path":"a","explanation":"e","search":"a"}),
        json!({"path":"a","search":"","replace":""}),
        json!({"content":"","search":""}),
        json!({"content":"x","replace":""}),
        json!({"content":null,"search":null,"replace":null}),
    ] {
        cases.push(json!({"kind":"edit","input":input}));
    }
    for content in ["", "a", "a\n", "é中🦀\r\n", "\\n", "  \n\n", "\0"] {
        for path in ["relative.txt", "/scope/a", "../outside", "a\nline"] {
            let input = json!({"path":path,"explanation":"preserve whitespace","content":content});
            cases.push(json!({"kind":"edit","input":input,"steps":[{},{}]}));
            for (index, step) in [
                (0, json!({"error":"scope denied"})),
                (1, json!({"error":"write failed"})),
                (1, json!({"thrown":null})),
                (1, json!({"thrown":"opaque"})),
            ] {
                let mut steps = vec![json!({}), json!({})];
                steps[index] = step;
                cases.push(json!({"kind":"edit","input":input,"steps":steps}));
            }
        }
    }
    for matched in [json!(true), json!(false), json!(null), json!("yes")] {
        cases.push(json!({"kind":"edit","input":{"path":"p","explanation":"patch","search":"  old\n","replace":"  new\n"},"steps":[{}, {"response":{"matched":matched}}]}));
    }
    compare(cases).await;
}
#[tokio::test]
async fn web_mode_inference_single_multi_aggregation_and_parallel_failure_order_match() {
    let mut cases = vec![];
    for input in [
        json!({}),
        json!({"mode":"fetch"}),
        json!({"urls":[]}),
        json!({"url":""}),
        json!({"query":""}),
        json!({"mode":"unknown","query":"x","url":"ignored"}),
        json!({"mode":"search","url":"ignored","query":"q","provider":"p","limit":0}),
        json!({"query":"q","mode":null}),
        json!({"url":"https://fixture","method":"POST","body":"body","maxBytes":0}),
        json!({"urls":["one"],"body":"body"}),
    ] {
        for step in [
            json!({"response":{"ok":true,"message":"raw","url":"override"}}),
            json!({"error":"network denied"}),
            json!({"thrown":false}),
        ] {
            cases.push(json!({"kind":"web","input":input,"steps":[step]}));
        }
    }
    for n in [2, 3, 8, 9, 12] {
        let urls = (0..n)
            .map(|i| json!(format!("url-{i}")))
            .collect::<Vec<_>>();
        for scenario in 0..4 {
            let steps = (0..n)
                .map(|i| match scenario {
                    0 => json!({"response":{"ok":true,"message":"yes"},"delay":(n-i)%3}),
                    1 => json!({"response":{"ok":false,"url":"overridden"}}),
                    2 => {
                        if i % 2 == 0 {
                            json!({"error":"fetch failed"})
                        } else {
                            json!({"response":{"ok":true}})
                        }
                    }
                    _ => json!({"thrown":[null,"x",7]}),
                })
                .collect::<Vec<_>>();
            cases.push(json!({"kind":"web","input":{"url":"first","urls":urls,"method":"POST","body":"must be omitted for multi","maxBytes":123},"steps":std::iter::once(json!({"response":{"ok":scenario==0 || scenario==2}})).chain(steps).collect::<Vec<_>>()}));
        }
    }
    cases.push(json!({"kind":"web","input":{"urls":["same","same"]},"steps":[{"thrown":null},{"thrown":{"x":1}}]}));
    compare(cases).await;
}
#[tokio::test]
async fn read_directory_file_limits_fractional_ranges_and_stat_fallback_match() {
    let mut cases = vec![];
    for entries in [
        json!([]),
        json!(["file",{"name":"dir","isDirectory":true},{"name":"plain","isDirectory":false},{"name":""},{},7,false]),
        json!([null]),
        json!((0..12).map(|i| format!("entry-{i}")).collect::<Vec<_>>()),
    ] {
        cases.push(json!({"kind":"read","input":{"path":"dir"},"steps":[{},{"response":{"isDirectory":true}},{"response":entries}]}));
    }
    for content in ["", "a\n", "é中🦀\r\nsecond\nlast", "\\n\n\n"] {
        for (start, end) in [
            (None, None),
            (Some(-2.0), None),
            (Some(0.0), Some(0.0)),
            (Some(1.0), Some(1000.0)),
            (Some(3.0), Some(1.0)),
            (Some(99.0), Some(100.0)),
            (Some(1.25), Some(2.25)),
            (Some(2.5), Some(3.5)),
        ] {
            let mut input = json!({"path":"file"});
            if let Some(v) = start {
                input["startLine"] = json!(v);
            }
            if let Some(v) = end {
                input["endLine"] = json!(v);
            }
            cases.push(json!({"kind":"read","input":input,"steps":[{},{"error":"stat denied"},{"response":content}]}));
        }
    }
    for (unit, count, start, end) in [
        ("x\n", 6002, 1.0, 10000.0),
        ("a", 60_000, 1.0, 10.0),
        ("🦀", 15000, 1.0, 10.0),
        ("🦀\n", 11000, 1.0, 20000.0),
        ("line\n", 2000, 2.0, 1000.0),
    ] {
        cases.push(json!({"kind":"read","input":{"path":"large","startLine":start,"endLine":end},"steps":[{},{"response":{"isDirectory":false}},{"repeatText":{"unit":unit,"count":count}}]}));
    }
    for (unit, count) in [
        ("a".repeat(1024) + "\n", 100),
        ("🦀".repeat(257) + "\n", 100),
        ("a".repeat(51199) + "\n", 2),
        ("a".repeat(51200) + "\n", 2),
    ] {
        cases.push(json!({"kind":"read","input":{"path":"byte-limited","endLine":10000},"steps":[{},{},{"repeatText":{"unit":unit,"count":count}}]}));
    }
    for index in [0, 2] {
        for err in [
            json!({"error":"scope denied"}),
            json!({"thrown":null}),
            json!({"thrown":{"detail":"opaque"}}),
        ] {
            let mut steps = vec![
                json!({}),
                json!({"response":{"isDirectory":false}}),
                json!({}),
            ];
            steps[index] = err;
            cases.push(json!({"kind":"read","input":{"path":"../scope"},"steps":steps}));
        }
    }
    cases.push(json!({"kind":"read","input":{"path":"p","startLine":null,"endLine":null},"steps":[{},{},{"response":"x\ny"}]}));
    // A failed stat must fall back to read, but a failed directory listing is final.
    cases.push(json!({"kind":"read","input":{"path":"p"},"steps":[{},{"response":{"isDirectory":true}},{"error":"listing denied"}]}));
    compare(cases).await;
}
