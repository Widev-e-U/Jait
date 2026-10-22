//! Focused sandbox-runner parity plus bounded cancellation/ownership extensions.
#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::execution::process_runner::{ProcessCancellation, ProcessPool, ProcessRequest};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    fs,
    num::NonZeroU16,
    path::{Path, PathBuf},
    time::Duration,
};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn work() -> PathBuf {
    let p = root()
        .join(".jait/artifacts/gateway-rust/process-runner")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&p).unwrap();
    p
}
fn request(directory: &Path, argv: Vec<String>) -> ProcessRequest {
    ProcessRequest {
        argv,
        cwd: directory.into(),
        environment: HashMap::new(),
        input: None,
        timeout: Duration::from_secs(5),
        output_limit: 65536,
    }
}
fn pool() -> ProcessPool {
    ProcessPool::new(NonZeroU16::new(2).unwrap())
}
fn argv(script: &str) -> Vec<String> {
    vec!["/bin/sh".into(), "-c".into(), script.into()]
}
fn comparison(result: &jait_gateway::execution::process_runner::ProcessResult) -> Value {
    json!({"output":result.output,"exitCode":result.exit_code,"timedOut":result.timed_out})
}
#[cfg(unix)]
#[tokio::test]
async fn sandbox_reference_matches_success_failure_empty_stdin_unicode_and_literal_argv() {
    let work = work();
    let marker = work.join("MUST_NOT_EXIST");
    let literal = format!(
        "; touch {}; $(touch {}); `touch {}`; space and 🦀",
        marker.display(),
        marker.display(),
        marker.display()
    );
    let mut literal_argv = argv("printf '%s' \"$1\"");
    literal_argv.extend(["peer".into(), literal]);
    let cases = [
        (argv("printf '  hello\\n'"), None),
        (argv("printf '失败 🦀' >&2; exit 7"), None),
        (argv("exit 0"), None),
        (argv("/bin/cat"), Some("stdin\n🦀\n")),
        (literal_argv, None),
        (argv("printf '\\357\\273\\277trim\\357\\273\\277'"), None),
    ];
    let calls = cases
        .iter()
        .map(|(a, input)| {
            let mut call = json!({"op":"nativeprocessrunner.run","argv":a,"timeoutMs":5000});
            if let Some(input) = input {
                call["input"] = json!(input);
            }
            call
        })
        .collect::<Vec<_>>();
    let reference_root = root();
    let reference_work = work.clone();
    let reference = tokio::task::spawn_blocking(move || {
        internal_driver::call(
            &reference_root,
            &reference_work,
            json!({"version":1,"calls":calls}),
            &|| false,
        )
        .unwrap()
    })
    .await
    .unwrap();
    for (i, (a, input)) in cases.into_iter().enumerate() {
        let mut spec = request(&work, a);
        spec.input = input.map(|s| s.as_bytes().to_vec());
        let native = pool()
            .run(spec, ProcessCancellation::default())
            .await
            .unwrap();
        assert_eq!(comparison(&native), reference[i], "case {i}");
        assert!(!native.cancelled && !native.truncated);
    }
    assert!(
        !marker.exists(),
        "literal argv must never be evaluated by a shell"
    );
}
#[cfg(unix)]
#[tokio::test]
async fn deadline_preserves_partial_output_and_matches_reference() {
    let work = work();
    let a = vec![
        "/bin/sh".into(),
        "-c".into(),
        "printf partial; exec /bin/sleep 10".into(),
    ];
    let reference_root = root();
    let reference_work = work.clone();
    let reference_a = a.clone();
    let reference = tokio::task::spawn_blocking(move || internal_driver::call(&reference_root,&reference_work,json!({"version":1,"calls":[{"op":"nativeprocessrunner.run","argv":reference_a,"timeoutMs":150}]}),&||false).unwrap()).await.unwrap();
    let mut spec = request(&work, a);
    spec.timeout = Duration::from_millis(150);
    let native = pool()
        .run(spec, ProcessCancellation::default())
        .await
        .unwrap();
    assert_eq!(comparison(&native), reference[0]);
    assert!(native.timed_out && !native.cancelled);
}
#[cfg(unix)]
#[tokio::test]
async fn bounded_output_drains_and_explicit_environment_isolation() {
    let work = work();
    let mut spec = request(
        &work,
        argv("i=0; while [ $i -lt 5000 ]; do printf 0123456789; i=$((i+1)); done; printf TAIL"),
    );
    spec.output_limit = 127;
    let native = pool()
        .run(spec, ProcessCancellation::default())
        .await
        .unwrap();
    assert_eq!(native.exit_code, Some(0));
    assert!(native.truncated);
    assert_eq!(native.output.len(), 127);
    assert!(native.output.ends_with("TAIL"));
    let native = pool()
        .run(
            request(
                &work,
                argv("printf '%s|%s' \"${JAIT_STATE_DIR-unset}\" \"${OPENAI_API_KEY-unset}\""),
            ),
            ProcessCancellation::default(),
        )
        .await
        .unwrap();
    assert_eq!(native.output, "unset|unset");
    for (script, cap, expected) in [
        ("printf '🦀🦀🦀TAIL'", 8, "🦀TAIL"),
        ("printf '\\377\\377\\377\\377TAIL'", 7, "�TAIL"),
    ] {
        let mut spec = request(&work, argv(script));
        spec.output_limit = cap;
        let native = pool()
            .run(spec, ProcessCancellation::default())
            .await
            .unwrap();
        assert!(native.truncated);
        assert_eq!(native.output, expected);
        assert!(
            native.output.len() <= cap,
            "decoded UTF-8 must obey the output cap"
        );
    }
}
#[cfg(unix)]
#[tokio::test]
async fn pre_cancel_invalid_requests_and_spawn_failure_have_no_side_effects() {
    let work = work();
    let marker = work.join("marker");
    let cancel = ProcessCancellation::default();
    cancel.cancel();
    let result = pool()
        .run(
            request(
                &work,
                vec!["/usr/bin/touch".into(), marker.to_string_lossy().into()],
            ),
            cancel,
        )
        .await
        .unwrap();
    assert!(result.cancelled);
    assert!(!marker.exists());
    let mut invalid = request(&work, vec![]);
    assert!(
        pool()
            .run(invalid.clone(), ProcessCancellation::default())
            .await
            .is_err()
    );
    invalid.argv = vec!["/bin/sh".into(), "nul\0injection".into()];
    assert!(
        pool()
            .run(invalid.clone(), ProcessCancellation::default())
            .await
            .is_err()
    );
    invalid.argv = vec!["/missing-jait-process-runner-fixture".into()];
    assert!(
        pool()
            .run(invalid, ProcessCancellation::default())
            .await
            .is_err()
    );
}
#[cfg(target_os = "linux")]
async fn pid(path: &Path) -> u32 {
    tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            if let Ok(s) = fs::read_to_string(path)
                && let Ok(pid) = s.trim().parse()
            {
                break pid;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap()
}
#[cfg(target_os = "linux")]
async fn stopped(pid: u32) {
    tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            let stat = fs::read_to_string(format!("/proc/{pid}/stat"));
            if match stat {
                Err(_) => true,
                Ok(s) => s
                    .rsplit_once(')')
                    .is_some_and(|(_, v)| v.trim_start().starts_with('Z')),
            } {
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap()
}
#[cfg(target_os = "linux")]
#[tokio::test]
async fn cancellation_abort_capacity_and_descendants_are_owned() {
    let work = work();
    let ids = work.join("pid");
    let grandchild = work.join("grandchild");
    let mut spec = request(
        &work,
        argv(
            "printf '%s' $$ > \"$PIDFILE\"; /bin/sleep 30 & printf '%s' $! > \"$CHILDFILE\"; wait",
        ),
    );
    spec.environment
        .insert("PIDFILE".into(), ids.to_string_lossy().into());
    spec.environment
        .insert("CHILDFILE".into(), grandchild.to_string_lossy().into());
    let p = ProcessPool::new(NonZeroU16::new(1).unwrap());
    let cancel = ProcessCancellation::default();
    let task_pool = p.clone();
    let task_cancel = cancel.clone();
    let task_spec = spec.clone();
    let task = tokio::spawn(async move { task_pool.run(task_spec, task_cancel).await });
    let direct = pid(&ids).await;
    let descendant = pid(&grandchild).await;
    let err = p
        .run(
            request(&work, argv("exit 0")),
            ProcessCancellation::default(),
        )
        .await
        .unwrap_err();
    assert_eq!(err.kind(), std::io::ErrorKind::WouldBlock);
    cancel.cancel();
    let result = task.await.unwrap().unwrap();
    assert!(result.cancelled && !result.timed_out);
    stopped(direct).await;
    stopped(descendant).await;
    fs::remove_file(&ids).unwrap();
    fs::remove_file(&grandchild).unwrap();
    let task_pool = p.clone();
    let task =
        tokio::spawn(async move { task_pool.run(spec, ProcessCancellation::default()).await });
    let direct = pid(&ids).await;
    let descendant = pid(&grandchild).await;
    task.abort();
    let _ = task.await;
    stopped(direct).await;
    stopped(descendant).await;
    assert_eq!(
        p.run(
            request(&work, argv("printf recovered")),
            ProcessCancellation::default()
        )
        .await
        .unwrap()
        .output,
        "recovered"
    );
    p.close();
    assert!(
        p.run(
            request(&work, argv("exit 0")),
            ProcessCancellation::default()
        )
        .await
        .is_err()
    );
}

#[cfg(unix)]
#[tokio::test]
async fn missing_executable_preserves_typed_error_without_reference_error_text_leakage() {
    let work = work();
    let absent = work
        .join("absent-executable")
        .to_string_lossy()
        .into_owned();
    let reference_root = root();
    let reference_work = work.clone();
    let reference_absent = absent.clone();
    let reference = tokio::task::spawn_blocking(move || {
        internal_driver::call(&reference_root, &reference_work, json!({"version":1,"calls":[{"op":"nativeprocessrunner.run","argv":[reference_absent],"timeoutMs":5000}]}), &||false).unwrap()
    }).await.unwrap();
    assert_eq!(reference[0]["exitCode"], Value::Null);
    assert_eq!(reference[0]["timedOut"], false);
    assert!(reference[0]["output"].as_str().unwrap().contains("ENOENT"));
    let error = pool()
        .run(
            request(&work, vec![absent.clone()]),
            ProcessCancellation::default(),
        )
        .await
        .unwrap_err();
    assert_eq!(error.kind(), std::io::ErrorKind::NotFound);
    assert!(!error.to_string().contains(&absent));
}

#[cfg(target_os = "linux")]
#[tokio::test]
async fn descendant_cannot_keep_output_pipes_open_beyond_deadline() {
    let work = work();
    let child_file = work.join("descendant");
    let mut spec = request(
        &work,
        argv("/bin/sleep 30 & printf '%s' $! > \"$CHILDFILE\"; printf partial; exit 0"),
    );
    spec.environment.insert(
        "CHILDFILE".into(),
        child_file.to_string_lossy().into_owned(),
    );
    spec.timeout = Duration::from_millis(150);
    let result = tokio::time::timeout(
        Duration::from_secs(5),
        pool().run(spec, ProcessCancellation::default()),
    )
    .await
    .unwrap()
    .unwrap();
    assert!(result.timed_out);
    assert_eq!(result.output, "partial");
    stopped(pid(&child_file).await).await;
}
