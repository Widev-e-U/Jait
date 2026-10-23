#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::{
    execution::process_runner::ProcessCancellation,
    services::code_graph::{
        engine::{ErrorKind, ExecOutput, Executor, GraphError, path_join},
        runner::{EnsureRuntime, GraphifyRunner, RunnerOptions},
        runtime::{GraphifyRuntime, runtime_paths},
    },
};
use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::Duration,
};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn error(response: &Value) -> Option<GraphError> {
    if let Some(value) = response.get("thrown") {
        return Some(GraphError::thrown(value.clone()));
    }
    if response["unavailable"] == true {
        let mut error = GraphError::unavailable();
        if let Some(message) = response["message"].as_str() {
            error.message = message.into();
        }
        return Some(error);
    }
    if let Some(message) = response["runtimeError"].as_str() {
        return Some(GraphError::runtime(message));
    }
    if let Some(value) = response.get("error") {
        let mut error = GraphError::error(
            value["message"]
                .as_str()
                .or_else(|| value.as_str())
                .unwrap_or(""),
        );
        if let Some(name) = value["name"].as_str() {
            error.name = name.into();
        }
        error.code = value.get("code").cloned().map(Box::new);
        return Some(error);
    }
    None
}
fn normalize(value: Value, work: &Path) -> Value {
    let work = work.to_str().unwrap();
    match value {
        Value::String(value) => json!(value.replace(work, "$WORK")),
        Value::Array(values) => json!(
            values
                .into_iter()
                .map(|value| normalize(value, Path::new(work)))
                .collect::<Vec<_>>()
        ),
        Value::Object(values) => Value::Object(
            values
                .into_iter()
                .map(|(key, value)| (key, normalize(value, Path::new(work))))
                .collect(),
        ),
        value => value,
    }
}
async fn native(test: &Value, work: &Path) -> Value {
    std::fs::create_dir_all(work).unwrap();
    let events = Arc::new(Mutex::new(vec![]));
    let log = events.clone();
    let consumed = Arc::new(Mutex::new(0usize));
    let counter = consumed.clone();
    let responses = test["responses"].as_array().cloned().unwrap_or_default();
    let execute: Executor = Arc::new(move |request| {
        let mut options = json!({"env":request.env});
        if let Some(cwd) = &request.cwd {
            options["cwd"] = json!(cwd);
        }
        if let Some(signal) = &request.signal {
            options["signal"] = json!({"aborted":signal.is_cancelled()});
        }
        log.lock()
            .unwrap()
            .push(json!({"command":request.command,"args":request.args,"options":options}));
        let response = {
            let mut index = counter.lock().unwrap();
            let response = responses.get(*index).cloned().unwrap_or(json!({}));
            *index += 1;
            response
        };
        Box::pin(async move {
            if let Some(delay) = response["delay"].as_u64() {
                tokio::time::sleep(Duration::from_millis(delay)).await;
            }
            if response["cancel"] == true
                && let Some(signal) = request.signal
            {
                signal.cancel();
            }
            if let Some(error) = error(&response) {
                return Err(error);
            }
            Ok(ExecOutput {
                stdout: response["stdout"].as_str().unwrap_or("").into(),
                stderr: response["stderr"].as_str().unwrap_or("").into(),
            })
        })
    });
    let state = work.join("state").to_str().unwrap().to_owned();
    let mut env = BTreeMap::from([("JAIT_STATE_DIR".into(), state.clone())]);
    if let Some(values) = test["env"].as_object() {
        for (key, value) in values {
            env.insert(key.clone(), value.as_str().unwrap().into());
        }
    }
    let mut runtime = GraphifyRuntime::new(state, env, execute.clone());
    let clock = test["clock"].as_i64().unwrap_or(1790000000123);
    runtime.clock = Arc::new(move || clock);
    let progress = events.clone();
    runtime.progress = Some(Arc::new(move |message| {
        progress.lock().unwrap().push(json!({"progress":message}));
    }));
    for file in test["files"].as_array().into_iter().flatten() {
        let path = work.join(file.as_str().unwrap());
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, "fixture").unwrap();
    }
    let signal = ProcessCancellation::default();
    if test["aborted"] == true {
        signal.cancel();
    }
    let result: Result<Value, GraphError> = async {
        match test["op"].as_str().unwrap() {
            "nativegraphify.paths" => {
                let mut runtime = runtime.clone();
                runtime.state_dir = test["jaitDir"]
                    .as_str()
                    .unwrap_or(&runtime.state_dir)
                    .into();
                Ok(json!({"paths":runtime.paths(),"command":runtime.command()}))
            }
            "nativegraphify.runtime" => {
                let mut out = vec![];
                for action in test["actions"]
                    .as_array()
                    .cloned()
                    .unwrap_or(vec![json!("ensure")])
                {
                    out.push(match action.as_str().unwrap() {
                        "inspect" => json!(runtime.inspect().await),
                        "files" => json!(runtime.files_exist().await),
                        "parallel" => {
                            let (a, b) = tokio::join!(runtime.ensure(), runtime.ensure());
                            json!([a?, b?])
                        }
                        _ => json!(runtime.ensure().await?),
                    });
                }
                Ok(json!(out))
            }
            _ => {
                let ensure_runtime: Option<EnsureRuntime> = test.get("ensure").map(|value| {
                    let value = value.clone();
                    let log = events.clone();
                    Arc::new(move || {
                        log.lock().unwrap().push(json!({"ensure":true}));
                        let result = error(&value).map_or(Ok(()), Err);
                        Box::pin(async move { result })
                            as futures_util::future::BoxFuture<'static, Result<(), GraphError>>
                    }) as EnsureRuntime
                });
                let runner = GraphifyRunner::new(
                    runtime.clone(),
                    RunnerOptions {
                        command: test
                            .get("command")
                            .and_then(Value::as_str)
                            .map(str::to_owned),
                        execute: Some(execute),
                        ensure_runtime,
                    },
                );
                if test["versionOnly"] == true {
                    Ok(json!(
                        runner
                            .version(work.join("project").to_str().unwrap())
                            .await?
                    ))
                } else {
                    Ok(json!(
                        runner
                            .build(
                                work.join("project").to_str().unwrap(),
                                work.join("output").to_str().unwrap(),
                                if test["noSignal"] == true {
                                    None
                                } else {
                                    Some(signal.clone())
                                }
                            )
                            .await?
                    ))
                }
            }
        }
    }
    .await;
    let mut out = match result {
        Ok(result) => json!({"result":result}),
        Err(error) => json!({"error":error.value()}),
    };
    let paths = runtime.paths();
    let metadata_text = std::fs::read_to_string(paths.metadata_path).ok();
    let metadata = metadata_text
        .as_ref()
        .and_then(|text| serde_json::from_str::<Value>(text).ok());
    out["events"] = json!(*events.lock().unwrap());
    out["consumed"] = json!(*consumed.lock().unwrap());
    out["metadata"] = json!(metadata);
    out["metadataText"] = json!(metadata_text);
    out["runtimeExists"] = json!(Path::new(&paths.runtime_dir).exists());
    out["outputExists"] = json!(work.join("output").exists());
    out["aborted"] = json!(signal.is_cancelled());
    normalize(out, work)
}
#[tokio::test]
async fn managed_runtime_installation_version_python_errors_and_runner_match_typescript() {
    let fixture: Value =
        serde_json::from_str(include_str!("../fixtures/graphify-cases.json")).unwrap();
    for (index, test) in fixture["cases"].as_array().unwrap().iter().enumerate() {
        let base = root()
            .join(".jait/artifacts/gateway-rust/code-graph/contracts")
            .join(uuid::Uuid::new_v4().to_string());
        let expected=internal_driver::call(&root(),&base.join("driver"),json!({"version":1,"calls":[{"op":test["op"],"test":test,"workspace":base.join("reference")}]}),&||false).unwrap()[0].clone();
        let result = native(test, &base.join("native")).await;
        assert_eq!(result, expected, "Graphify case {index}: {}", test["name"]);
    }
}
#[test]
fn public_runtime_constants_and_path_layout_are_explicit() {
    use jait_gateway::services::code_graph::runtime::{
        MIN_PYTHON_VERSION, PACKAGE_NAME, PACKAGE_VERSION,
    };
    assert_eq!(
        (PACKAGE_NAME, PACKAGE_VERSION, MIN_PYTHON_VERSION),
        ("graphifyy", "0.9.30", "3.10")
    );
    assert_eq!(
        runtime_paths("/state", false).command_path,
        path_join(&["/state", "runtime", "graphify", "venv", "bin", "graphify"])
    );
    assert_eq!(
        runtime_paths("/state", true).command_path,
        path_join(&[
            "/state",
            "runtime",
            "graphify",
            "venv",
            "Scripts",
            "graphify.exe"
        ])
    );
    assert_ne!(ErrorKind::Runtime, ErrorKind::Unavailable);
}
