#[cfg(unix)]
mod unix {
    use super::super::engine::*;
    use crate::execution::process_runner::ProcessCancellation;
    use std::{collections::BTreeMap, path::PathBuf, time::Duration};
    fn work() -> PathBuf {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../.jait/artifacts/gateway-rust/code-graph/executor")
            .join(uuid::Uuid::new_v4().to_string());
        std::fs::create_dir_all(&path).unwrap();
        path.canonicalize().unwrap()
    }
    fn request(script: &str) -> ExecRequest {
        ExecRequest {
            command: "/usr/bin/python3".into(),
            args: vec!["-c".into(), script.into()],
            cwd: None,
            env: BTreeMap::new(),
            signal: None,
        }
    }
    #[tokio::test]
    async fn argv_environment_separate_channels_and_nonzero_status_are_preserved() {
        let dir = work();
        let execute = native_executor(dir.clone(), Duration::from_secs(5), 1).unwrap();
        let mut p = request(
            "import sys,os; sys.stdout.buffer.write(sys.argv[1].encode()+b'\\xff'); sys.stderr.write('stderr'); assert os.getenv('ONLY_ALLOWED')=='yes'; assert os.getcwd()==sys.argv[2]",
        );
        let literal = "$(touch nope); | > *.txt";
        p.args
            .extend([literal.into(), dir.to_str().unwrap().into()]);
        p.env.insert("ONLY_ALLOWED".into(), "yes".into());
        let result = execute(p).await.unwrap();
        assert_eq!(result.stdout, format!("{literal}�"));
        assert_eq!(result.stderr, "stderr");
        assert!(!dir.join("nope").exists());
        let error = execute(request(
            "import sys; sys.stderr.write('refused'); sys.exit(7)",
        ))
        .await
        .unwrap_err();
        assert_eq!(error.code.as_deref(), Some(&serde_json::json!(7)));
        assert!(error.message.contains("refused"));
    }
    #[tokio::test]
    async fn execution_deadline_and_abort_are_bounded_and_reap_the_process() {
        let execute = native_executor(work(), Duration::from_millis(60), 1).unwrap();
        let started = std::time::Instant::now();
        let error = execute(request("import time;time.sleep(60)"))
            .await
            .unwrap_err();
        assert_eq!(error.code.as_deref(), Some(&serde_json::json!("ETIMEDOUT")));
        assert!(started.elapsed() < Duration::from_secs(5));
        let execute = native_executor(work(), Duration::from_secs(5), 1).unwrap();
        let signal = ProcessCancellation::default();
        let mut p = request("import time;time.sleep(60)");
        p.signal = Some(signal.clone());
        let task = tokio::spawn(execute(p));
        tokio::time::sleep(Duration::from_millis(40)).await;
        assert_eq!(
            execute(request("pass")).await.unwrap_err().message,
            "Code-graph process capacity unavailable"
        );
        signal.cancel();
        let error = task.await.unwrap().unwrap_err();
        assert_eq!(error.code.as_deref(), Some(&serde_json::json!("ABORT_ERR")));
        let mut p = request("raise Exception('must not spawn')");
        p.signal = Some(signal);
        assert_eq!(execute(p).await.unwrap_err().name, "AbortError");
        // Capacity is released on both error paths.
        assert!(execute(request("pass")).await.is_ok());
    }
    #[tokio::test]
    async fn output_capacity_and_invalid_arguments_fail_before_unbounded_capture() {
        let execute = native_executor(work(), Duration::from_secs(5), 1).unwrap();
        let error = execute(request(
            "import sys;sys.stdout.buffer.write(b'x'*(16*1024*1024+1))",
        ))
        .await
        .unwrap_err();
        assert_eq!(
            error.code.as_deref(),
            Some(&serde_json::json!("ERR_CHILD_PROCESS_STDIO_MAXBUFFER"))
        );
        let mut p = request("pass");
        p.args.push("nul\0argument".into());
        assert_eq!(
            execute(p).await.unwrap_err().message,
            "Invalid code-graph command argument"
        );
        assert!(native_executor(work(), Duration::ZERO, 1).is_err());
        assert!(native_executor(work(), Duration::from_secs(1), 0).is_err());
    }
}
