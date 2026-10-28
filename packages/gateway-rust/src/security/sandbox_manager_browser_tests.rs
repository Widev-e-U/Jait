use super::*;
use serde_json::{Value, json};
use std::{
    collections::VecDeque,
    sync::{
        Mutex,
        atomic::{AtomicBool, AtomicUsize, Ordering},
    },
};
use tokio::{sync::Notify, task::JoinHandle};

#[derive(Default)]
struct HostFixture {
    calls: Mutex<Vec<Value>>,
    events: Mutex<Vec<String>>,
    replies: Mutex<VecDeque<Value>>,
    probes: Mutex<Vec<Value>>,
    probe_replies: Mutex<VecDeque<bool>>,
    tasks: Mutex<Vec<JoinHandle<Result<()>>>>,
    run_delayed: AtomicBool,
    delay_call: AtomicUsize,
    ipv6: AtomicBool,
    published_error: AtomicBool,
    probe_pending: AtomicBool,
    pending_after: AtomicUsize,
    no_cdp: AtomicBool,
    writable_identity: AtomicBool,
    probe_drops: Arc<AtomicUsize>,
    deny_launch: AtomicBool,
    release: Arc<Notify>,
}
impl HostFixture {
    fn event(&self, name: &str) {
        self.events.lock().unwrap().push(name.into());
    }
    fn manager(self: &Arc<Self>) -> SandboxManager {
        SandboxManager::new(self.clone(), ContainerRuntime::Docker)
    }
    async fn drain(&self) {
        loop {
            let tasks = std::mem::take(&mut *self.tasks.lock().unwrap());
            if tasks.is_empty() {
                break;
            }
            for task in tasks {
                task.await.unwrap().unwrap();
            }
        }
    }
}
impl Host for HostFixture {
    fn run(&self, argv: Vec<String>, timeout_ms: u64) -> BoxFuture<'static, Result<RunnerResult>> {
        self.event(&argv[1]);
        self.calls.lock().unwrap().push(json!([argv, timeout_ms]));
        let delay = (argv[1] == "run" && self.run_delayed.load(Ordering::SeqCst))
            || self.delay_call.load(Ordering::SeqCst) == self.calls.lock().unwrap().len();
        let release = self.release.clone();
        let value = self
            .replies
            .lock()
            .unwrap()
            .pop_front()
            .unwrap_or(json!({}));
        Box::pin(async move {
            if delay {
                release.notified().await;
            }
            if let Some(e) = value["error"].as_str() {
                return Err(error(e));
            }
            Ok(RunnerResult {
                output: Utf16Text(
                    value["output"]
                        .as_str()
                        .unwrap_or("")
                        .encode_utf16()
                        .collect(),
                ),
                exit_code: value.get("exitCode").map_or(Some(0.0), Value::as_f64),
                timed_out: value["timedOut"].as_bool().unwrap_or(false),
            })
        })
    }
    fn project_root(&self, root: &str) -> Result<String> {
        self.event("project");
        Ok(root.into())
    }
    fn mkdir_project(&self, _: &str) -> Result<()> {
        self.event("mkdir");
        Ok(())
    }
    fn worktree_mount_args(&self, _: &str) -> Result<Vec<String>> {
        panic!("browser git mount")
    }
    fn unique_suffix(&self) -> String {
        panic!("command-session suffix")
    }
    fn gateway(&self) -> String {
        panic!("command-session gateway")
    }
    fn owner(&self) -> String {
        panic!("command-session owner")
    }
    fn owner_alive(&self, _: &str) -> bool {
        panic!("command-session owner lookup")
    }
    fn host_user_args(&self) -> Vec<String> {
        panic!("unreviewed writable browser mount")
    }
    fn supervise(&self, future: BoxFuture<'static, Result<()>>) {
        self.tasks.lock().unwrap().push(tokio::spawn(future));
    }
}
impl BrowserImageAuthority for HostFixture {
    fn build(&self, _: BrowserImageBuild) -> BoxFuture<'static, Result<RunnerResult>> {
        self.event("build");
        Box::pin(async {
            Ok(RunnerResult {
                output: Utf16Text(vec![]),
                exit_code: Some(0.0),
                timed_out: false,
            })
        })
    }
}
impl BrowserStartupAuthority for HostFixture {
    fn writable_mount_identity(&self) -> Result<Option<WritableMountIdentity>> {
        Ok(self
            .writable_identity
            .load(Ordering::SeqCst)
            .then_some(WritableMountIdentity {
                uid: std::num::NonZeroU32::new(1000).unwrap(),
                gid: 1001,
            }))
    }
    fn capture_launch_inputs(&self) -> BoxFuture<'static, Result<BrowserLaunchInputs>> {
        self.event("capture");
        let no_cdp = self.no_cdp.load(Ordering::SeqCst);
        Box::pin(async move {
            Ok(BrowserLaunchInputs {
                novnc_port: std::num::NonZeroU16::new(6081).unwrap(),
                vnc_port: std::num::NonZeroU16::new(5901).unwrap(),
                cdp_port: if no_cdp {
                    None
                } else {
                    std::num::NonZeroU16::new(9224)
                },
                host_gateway: None,
                name_time_ms: 36,
                created_at_ms: 37,
            })
        })
    }
    fn authorize_launch(&self, _: &Invocation) -> Result<()> {
        self.event("authorize");
        if self.deny_launch.load(Ordering::SeqCst) {
            return Err(error("launch denied"));
        }
        Ok(())
    }
    fn may_remove_conflict(&self, name: &str) -> bool {
        name == "jait-browser-sb-approved"
    }
    fn published_port_host(&self) -> BoxFuture<'static, Result<std::net::IpAddr>> {
        self.event("published");
        let failed = self.published_error.load(Ordering::SeqCst);
        let ip = if self.ipv6.load(Ordering::SeqCst) {
            "::1"
        } else {
            "127.0.0.1"
        };
        Box::pin(async move {
            if failed {
                Err(error("host lookup failed"))
            } else {
                Ok(ip.parse().unwrap())
            }
        })
    }
    fn probe(&self, target: BrowserProbe, timeout_ms: u64) -> BoxFuture<'static, Result<bool>> {
        self.event("probe");
        self.probes.lock().unwrap().push(json!([
            match target {
                BrowserProbe::Http(url) => json!({"http":url}),
                BrowserProbe::Tcp(addr) => json!({"tcp":addr.to_string()}),
            },
            timeout_ms
        ]));
        let ready = self
            .probe_replies
            .lock()
            .unwrap()
            .pop_front()
            .unwrap_or(true);
        let after = self.pending_after.load(Ordering::SeqCst);
        let pending = self.probe_pending.load(Ordering::SeqCst)
            || (after > 0 && self.probes.lock().unwrap().len() >= after);
        struct ProbeDrop(Arc<AtomicUsize>);
        impl Drop for ProbeDrop {
            fn drop(&mut self) {
                self.0.fetch_add(1, Ordering::SeqCst);
            }
        }
        let guard = ProbeDrop(self.probe_drops.clone());
        Box::pin(async move {
            let _guard = guard;
            if pending {
                std::future::pending::<()>().await;
            }
            Ok(ready)
        })
    }
}
fn options() -> BrowserOptions {
    BrowserOptions::new("/fixture/project".into())
}

#[tokio::test]
async fn browser_start_orders_prerequisites_and_transfers_lease() {
    let host = Arc::new(HostFixture::default());
    *host.replies.lock().unwrap() = VecDeque::from([json!({}), json!({}), json!({"exitCode":1})]);
    let browser = host
        .manager()
        .start_browser_sandbox(options(), None, true, host.clone())
        .await
        .unwrap();
    assert_eq!(browser.container_name(), "jait-browser-sb-10");
    assert_eq!(browser.novnc_url, "http://127.0.0.1:6081/vnc_lite.html");
    assert_eq!(browser.cdp_url.as_deref(), Some("http://127.0.0.1:9224"));
    assert_eq!(browser.vnc_port.get(), 5901);
    assert_eq!(
        *host.events.lock().unwrap(),
        [
            "info",
            "ps",
            "image",
            "build",
            "capture",
            "project",
            "mkdir",
            "authorize",
            "run",
            "published",
            "probe",
            "probe",
            "probe"
        ]
    );
    assert_eq!(
        *host.probes.lock().unwrap(),
        [
            json!([{"http":"http://127.0.0.1:6081/vnc_lite.html"},5000]),
            json!([{"tcp":"127.0.0.1:9224"},5000]),
            json!([{"http":"http://127.0.0.1:9224/json/version"},5000]),
        ]
    );
    assert_eq!(host.calls.lock().unwrap().last().unwrap()[1], 30000);
    drop(browser);
    host.drain().await;
    assert_eq!(
        host.calls.lock().unwrap().last().unwrap(),
        &json!([["docker", "rm", "-f", "jait-browser-sb-10"], 15000])
    );
}
#[tokio::test]
async fn browser_start_skip_cdp_wait_preserves_cdp_url() {
    let host = Arc::new(HostFixture::default());
    let browser = host
        .manager()
        .start_browser_sandbox(options(), None, false, host.clone())
        .await
        .unwrap();
    assert_eq!(host.probes.lock().unwrap().len(), 1);
    assert!(browser.cdp_url.is_some());
    browser.stop().await.unwrap();
    host.drain().await;
    assert_eq!(
        host.calls
            .lock()
            .unwrap()
            .iter()
            .filter(|c| c[0][1] == "rm")
            .count(),
        1
    );
}
#[tokio::test]
async fn browser_start_denied_and_writable_have_no_engine_start() {
    let host = Arc::new(HostFixture::default());
    host.deny_launch.store(true, Ordering::SeqCst);
    assert!(
        host.manager()
            .start_browser_sandbox(options(), None, true, host.clone())
            .await
            .is_err()
    );
    assert!(
        !host
            .calls
            .lock()
            .unwrap()
            .iter()
            .any(|c| c[0][1] == "run" || c[0][1] == "rm")
    );
    let before = host.events.lock().unwrap().len();
    let mut writable = options();
    writable.mount_mode = MountMode::ReadWrite;
    assert!(
        host.manager()
            .start_browser_sandbox(writable, None, true, host.clone())
            .await
            .is_err()
    );
    assert_eq!(host.events.lock().unwrap().len(), before);
}
#[tokio::test]
async fn browser_start_bind_retry_is_scoped_and_identical() {
    let host = Arc::new(HostFixture::default());
    *host.replies.lock().unwrap() = VecDeque::from([
        json!({}),
        json!({}),
        json!({}),
        json!({"exitCode":1,"output":"Bind for 0.0.0.0:6081 failed"}),
        json!({"output":"jait-browser-sb-approved\t0.0.0.0:6081->6080/tcp\njait-browser-sb-unapproved\t:5901->5900/tcp\njait-browser-sb-approved\t:16081->6080/tcp\njait-browser-sb-approved;injected\t:6081->6080/tcp\nother\t:6081->6080/tcp"}),
        json!({"error":"remove failure"}),
        json!({}),
    ]);
    let browser = host
        .manager()
        .start_browser_sandbox(options(), None, true, host.clone())
        .await
        .unwrap();
    let calls = host.calls.lock().unwrap().clone();
    let runs: Vec<_> = calls.iter().filter(|c| c[0][1] == "run").collect();
    assert_eq!(runs.len(), 2);
    assert_eq!(runs[0], runs[1]);
    let removes: Vec<_> = calls.iter().filter(|c| c[0][1] == "rm").collect();
    assert_eq!(
        removes,
        [&json!([
            ["docker", "rm", "-f", "jait-browser-sb-approved"],
            15000
        ])]
    );
    drop(browser);
    host.drain().await;
}
#[tokio::test]
async fn browser_start_failure_cleanup_and_at_most_one_retry() {
    for (first, second, runs) in [
        (json!({"exitCode":1,"output":"bad image"}), json!({}), 1),
        (json!({"error":"runner failed"}), json!({}), 1),
        (json!({"exitCode":0,"timedOut":true}), json!({}), 1),
        (
            json!({"exitCode":1,"output":"ADDRESS ALREADY IN USE"}),
            json!({"exitCode":1,"output":"port is already allocated"}),
            2,
        ),
    ] {
        let host = Arc::new(HostFixture::default());
        *host.replies.lock().unwrap() =
            VecDeque::from([json!({}), json!({}), json!({}), first, json!({}), second]);
        assert!(
            host.manager()
                .start_browser_sandbox(options(), None, true, host.clone())
                .await
                .is_err()
        );
        host.drain().await;
        let calls = host.calls.lock().unwrap();
        assert_eq!(calls.iter().filter(|c| c[0][1] == "run").count(), runs);
        assert_eq!(
            calls
                .iter()
                .filter(|c| c[0][1] == "rm" && c[0][3] == "jait-browser-sb-10")
                .count(),
            1
        );
        assert!(host.probes.lock().unwrap().is_empty());
    }
}
#[tokio::test(start_paused = true)]
async fn browser_start_readiness_retries_and_has_absolute_deadline() {
    let host = Arc::new(HostFixture::default());
    host.probe_pending.store(true, Ordering::SeqCst);
    let before = tokio::time::Instant::now();
    let result = host
        .manager()
        .start_browser_sandbox(options(), None, true, host.clone())
        .await;
    assert!(
        matches!(result, Err(HostError::Error(ref e)) if e=="HTTP endpoint http://127.0.0.1:6081/vnc_lite.html did not become ready within 15000ms")
    );
    assert_eq!(before.elapsed(), std::time::Duration::from_millis(15000));
    host.drain().await;
    assert_eq!(
        *host.probes.lock().unwrap(),
        [
            json!([{"http":"http://127.0.0.1:6081/vnc_lite.html"},5000]),
            json!([{"http":"http://127.0.0.1:6081/vnc_lite.html"},5000]),
            json!([{"http":"http://127.0.0.1:6081/vnc_lite.html"},4600]),
        ]
    );
    assert_eq!(host.probe_drops.load(Ordering::SeqCst), 3);
    assert_eq!(host.calls.lock().unwrap().last().unwrap()[0][1], "rm");
}
#[tokio::test(start_paused = true)]
async fn browser_start_retry_delay_and_ipv6_target_encoding() {
    let host = Arc::new(HostFixture::default());
    *host.probe_replies.lock().unwrap() = VecDeque::from([false, false, true]);
    let before = tokio::time::Instant::now();
    SandboxManager::wait_browser_ready(
        host.as_ref(),
        BrowserProbe::Http("http://[::1]:6081/vnc_lite.html".into()),
    )
    .await
    .unwrap();
    assert_eq!(before.elapsed(), std::time::Duration::from_millis(400));
    assert_eq!(host.probes.lock().unwrap().len(), 3);
}
#[tokio::test]
async fn browser_start_cancelled_late_run_and_probe_are_cleaned() {
    for late_run in [true, false] {
        let host = Arc::new(HostFixture::default());
        host.run_delayed.store(late_run, Ordering::SeqCst);
        host.probe_pending.store(!late_run, Ordering::SeqCst);
        let waiter_host = host.clone();
        let waiter = tokio::spawn(async move {
            waiter_host
                .manager()
                .start_browser_sandbox(options(), None, true, waiter_host)
                .await
        });
        loop {
            let ready = if late_run {
                host.calls.lock().unwrap().iter().any(|c| c[0][1] == "run")
            } else {
                !host.probes.lock().unwrap().is_empty()
            };
            if ready {
                break;
            }
            tokio::task::yield_now().await;
        }
        waiter.abort();
        let _ = waiter.await;
        if late_run {
            host.release.notify_one();
        }
        host.drain().await;
        assert_eq!(
            host.calls
                .lock()
                .unwrap()
                .iter()
                .filter(|c| c[0][1] == "rm")
                .count(),
            1
        );
        if late_run {
            assert!(host.probes.lock().unwrap().is_empty());
        } else {
            assert_eq!(host.probe_drops.load(Ordering::SeqCst), 1);
        }
    }
}

#[tokio::test(start_paused = true)]
async fn browser_start_reference_vectors() {
    let mut vectors = vec![];
    for case in [
        "ready",
        "skip-cdp",
        "no-cdp",
        "retry-success",
        "retry-list-failure",
        "http-timeout",
        "cdp-tcp-timeout",
        "cdp-http-timeout",
    ] {
        let host = Arc::new(HostFixture::default());
        host.no_cdp.store(case == "no-cdp", Ordering::SeqCst);
        let wait_cdp = case != "skip-cdp";
        let mut replies = vec![json!({}), json!({}), json!({})];
        if case.starts_with("retry") {
            replies.push(json!({"exitCode":1,"output":"port is already allocated"}));
            if case == "retry-list-failure" {
                replies.push(json!({"exitCode":1}));
            } else {
                replies.push(json!({"output":"jait-browser-sb-approved\t0.0.0.0:6081->6080/tcp\nother\t:5901->5900/tcp"}));
                replies.push(json!({}));
            }
        }
        replies.push(json!({}));
        let reference_replies = replies.clone();
        *host.replies.lock().unwrap() = VecDeque::from(replies);
        let pending_after = match case {
            "http-timeout" => 1,
            "cdp-tcp-timeout" => 2,
            "cdp-http-timeout" => 3,
            _ => 0,
        };
        host.pending_after.store(pending_after, Ordering::SeqCst);
        let result = host
            .manager()
            .start_browser_sandbox(options(), None, wait_cdp, host.clone())
            .await;
        let summary = match result.as_ref() {
            Ok(b) => {
                json!({"containerName":b.container_name(),"novncUrl":b.novnc_url,"vncPort":b.vnc_port.get(),"novncPort":b.novnc_port.get(),"cdpUrl":b.cdp_url})
            }
            Err(HostError::Error(message)) => json!({"error":message}),
            Err(e) => panic!("unexpected failure: {e:?}"),
        };
        host.drain().await;
        vectors.push(json!({"case":case,"replies":reference_replies,"waitCdp":wait_cdp,"noCdp":case=="no-cdp","pendingAfter":pending_after,"result":summary,"calls":host.calls.lock().unwrap().clone(),"probes":host.probes.lock().unwrap().clone()}));
        drop(result);
        host.drain().await;
    }
    let out = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../.jait/artifacts/gateway-rust/sandbox-manager-20261026/native-browser-start-vectors.json");
    if let Some(parent) = out.parent() {
        std::fs::create_dir_all(parent).unwrap();
    }
    std::fs::write(out, serde_json::to_vec_pretty(&vectors).unwrap()).unwrap();
}

#[tokio::test]
async fn browser_start_early_cancel_does_not_begin_admission() {
    let host = Arc::new(HostFixture::default());
    let manager = host.manager();
    let mut waiter = Box::pin(manager.start_browser_sandbox(options(), None, true, host.clone()));
    assert!(futures_util::poll!(&mut waiter).is_pending());
    drop(waiter);
    host.drain().await;
    assert!(host.events.lock().unwrap().is_empty());
}
#[tokio::test]
async fn browser_start_cancel_during_inspection_or_discovery_stops_new_effects() {
    for call in [3, 5] {
        let host = Arc::new(HostFixture::default());
        host.delay_call.store(call, Ordering::SeqCst);
        let replies = if call == 3 {
            vec![json!({}), json!({}), json!({"exitCode":1})]
        } else {
            vec![
                json!({}),
                json!({}),
                json!({}),
                json!({"exitCode":1,"output":"address already in use"}),
                json!({"output":"jait-browser-sb-approved\t:6081->6080/tcp"}),
            ]
        };
        *host.replies.lock().unwrap() = VecDeque::from(replies);
        let waiter_host = host.clone();
        let waiter = tokio::spawn(async move {
            waiter_host
                .manager()
                .start_browser_sandbox(options(), None, true, waiter_host)
                .await
        });
        while host.calls.lock().unwrap().len() < call {
            tokio::task::yield_now().await;
        }
        waiter.abort();
        let _ = waiter.await;
        host.release.notify_one();
        host.drain().await;
        let calls = host.calls.lock().unwrap();
        assert!(!host.events.lock().unwrap().iter().any(|e| e == "build"));
        if call == 3 {
            assert!(!calls.iter().any(|c| c[0][1] == "run" || c[0][1] == "rm"));
        } else {
            assert_eq!(calls.iter().filter(|c| c[0][1] == "run").count(), 1);
            let removes: Vec<_> = calls.iter().filter(|c| c[0][1] == "rm").collect();
            assert_eq!(
                removes,
                [&json!([
                    ["docker", "rm", "-f", "jait-browser-sb-10"],
                    15000
                ])]
            );
        }
    }
}
#[tokio::test]
async fn browser_start_published_host_failure_and_ipv6_urls() {
    let host = Arc::new(HostFixture::default());
    host.published_error.store(true, Ordering::SeqCst);
    let result = host
        .manager()
        .start_browser_sandbox(options(), None, true, host.clone())
        .await;
    assert!(matches!(result,Err(HostError::Error(ref e)) if e=="host lookup failed"));
    host.drain().await;
    assert_eq!(host.calls.lock().unwrap().last().unwrap()[0][1], "rm");
    let host = Arc::new(HostFixture::default());
    host.ipv6.store(true, Ordering::SeqCst);
    let browser = host
        .manager()
        .start_browser_sandbox(options(), None, true, host.clone())
        .await
        .unwrap();
    assert_eq!(browser.novnc_url, "http://[::1]:6081/vnc_lite.html");
    assert_eq!(browser.cdp_url.as_deref(), Some("http://[::1]:9224"));
    assert_eq!(
        host.probes.lock().unwrap()[1],
        json!([{"tcp":"[::1]:9224"},5000])
    );
    drop(browser);
    host.drain().await;
}

struct CleanupFixture;
impl SandboxCleanupAuthority for CleanupFixture {
    fn now_ms(&self) -> f64 {
        10_000.0
    }
    fn authorize_remove(&self, _: SandboxKind, name: &str) -> Result<()> {
        if name.ends_with("denied") {
            Err(error("not owned"))
        } else {
            Ok(())
        }
    }
}
#[tokio::test]
async fn lifecycle_cleanup_filters_age_exclusions_and_authority_and_reports_failure() {
    let host = Arc::new(HostFixture::default());
    host.replies.lock().unwrap().extend([
        json!({"output": concat!(
            "jait-browser-sb-old\t\tjait.createdAt=1\n",
            "jait-browser-sb-young\t\tjait.createdAt=9999\n",
            "jait-browser-sb-excluded\t\tjait.createdAt=1\n",
            "jait-browser-sb-denied\t\tjait.createdAt=1\n",
            "jait-browser-sb-failed\t\tjait.createdAt=1\n",
            "foreign\t\tjait.createdAt=1\n",
            "jait-browser-sb-old\t\tjait.createdAt=1\n")}),
        json!({}),
        json!({"exitCode":1,"output":"engine failed"}),
    ]);
    let report = host
        .manager()
        .cleanup_sandboxes(
            SandboxKind::Browser,
            SandboxCleanupOptions {
                exclude_names: vec![" jait-browser-sb-excluded ".into()],
                max_age_ms: Some(1000.0),
            },
            Arc::new(CleanupFixture),
        )
        .await
        .unwrap();
    assert_eq!(report.removed, ["jait-browser-sb-old"]);
    assert_eq!(report.denied, ["jait-browser-sb-denied"]);
    assert_eq!(report.failed, ["jait-browser-sb-failed"]);
    let calls = host.calls.lock().unwrap();
    assert_eq!(calls.len(), 3);
    assert_eq!(
        calls[1][0],
        json!(["docker", "rm", "-f", "jait-browser-sb-old"])
    );
    assert_eq!(
        calls[2][0],
        json!(["docker", "rm", "-f", "jait-browser-sb-failed"])
    );
}
#[tokio::test]
async fn lifecycle_discovery_reads_host_ports_and_surfaces_engine_failure() {
    let host = Arc::new(HostFixture::default());
    host.replies.lock().unwrap().extend([
        json!({"output":concat!("jait-linux-desktop-sb-a\timage\t0.0.0.0:1111->5900/tcp, [::]:2222->6080/tcp\n",
            "jait-windows-sb-b\timage\t0.0.0.0:3333->3389/tcp, 4444->8006/tcp, 5555->22/tcp\n",
            "jait-browser-sb-c\timage\t6666->6080/tcp\n")}),
        json!({"exitCode":1,"output":"denied"}),
    ]);
    let found = host.manager().list_running_os_sandboxes().await.unwrap();
    assert_eq!(found.len(), 2);
    assert_eq!(found[0].vnc_port, Some(1111));
    assert_eq!(found[0].novnc_port, Some(2222));
    assert_eq!(found[1].ssh_port, Some(5555));
    assert_eq!(found[1].rdp_port, Some(3333));
    assert!(host.manager().list_running_os_sandboxes().await.is_err());
}
#[tokio::test]
async fn lifecycle_cleanup_cancellation_finishes_current_removal_and_prevents_next() {
    let host = Arc::new(HostFixture::default());
    host.delay_call.store(2, Ordering::SeqCst);
    host.replies.lock().unwrap().push_back(json!({"output":
        "jait-browser-sb-first\t\tjait.createdAt=1\njait-browser-sb-second\t\tjait.createdAt=1"}));
    let manager = host.manager();
    let caller = tokio::spawn(async move {
        manager
            .cleanup_sandboxes(
                SandboxKind::Browser,
                SandboxCleanupOptions::default(),
                Arc::new(CleanupFixture),
            )
            .await
    });
    tokio::time::timeout(std::time::Duration::from_secs(5), async {
        while host.calls.lock().unwrap().len() < 2 {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    caller.abort();
    let _ = caller.await;
    host.release.notify_waiters();
    host.drain().await;
    assert_eq!(host.calls.lock().unwrap().len(), 2);
}
#[tokio::test]
async fn lifecycle_cleanup_oversize_batch_is_rejected_before_removal() {
    let host = Arc::new(HostFixture::default());
    let listing = (0..257)
        .map(|i| format!("jait-browser-sb-{i}\t\tjait.createdAt=1"))
        .collect::<Vec<_>>()
        .join("\n");
    host.replies
        .lock()
        .unwrap()
        .push_back(json!({"output":listing}));
    assert!(
        host.manager()
            .cleanup_sandboxes(
                SandboxKind::Browser,
                SandboxCleanupOptions::default(),
                Arc::new(CleanupFixture)
            )
            .await
            .is_err()
    );
    assert_eq!(host.calls.lock().unwrap().len(), 1);
}

#[tokio::test]
async fn lifecycle_desktop_uses_shared_startup_with_nonroot_writable_home() {
    let host = Arc::new(HostFixture::default());
    host.writable_identity.store(true, Ordering::SeqCst);
    let mut args = options();
    args.mount_mode = MountMode::ReadWrite;
    let desktop = host
        .manager()
        .start_linux_desktop_sandbox(args, Some("1920x1080x24".into()), None, true, host.clone())
        .await
        .unwrap();
    assert_eq!(desktop.container_name(), "jait-linux-desktop-sb-10");
    let run = host
        .calls
        .lock()
        .unwrap()
        .iter()
        .find(|v| v[0][1] == "run")
        .unwrap()[0]
        .clone();
    let argv: Vec<_> = run
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v.as_str().unwrap())
        .collect();
    assert_eq!(argv.last(), Some(&"jait/sandbox-linux-desktop:latest"));
    assert!(argv.windows(2).any(|a| a == ["--user", "1000:1001"]));
    assert!(argv.windows(2).any(|a| a == ["--env", "HOME=/home/jait"]));
    assert!(argv.windows(2).any(|a| a
        == [
            "--tmpfs",
            "/home/jait:rw,nosuid,nodev,uid=1000,gid=1001,mode=0700"
        ]));
    assert!(argv.windows(2).any(|a| a
        == [
            "--tmpfs",
            "/run/dbus:rw,nosuid,nodev,uid=1000,gid=1001,mode=0755"
        ]));
    assert!(argv.windows(2).any(|a| a == ["--shm-size", "1gb"]));
    assert!(
        argv.windows(2)
            .any(|a| a == ["-e", "SCREEN_RES=1920x1080x24"])
    );
    assert_eq!(host.probes.lock().unwrap().len(), 3);
    desktop.stop().await.unwrap();
    host.drain().await;
}
#[tokio::test(start_paused = true)]
async fn lifecycle_cleanup_does_not_admit_removals_after_duration_budget() {
    let host = Arc::new(HostFixture::default());
    host.delay_call.store(2, Ordering::SeqCst);
    host.replies.lock().unwrap().push_back(json!({"output":
        "jait-browser-sb-first\t\tjait.createdAt=1\njait-browser-sb-second\t\tjait.createdAt=1"}));
    let manager = host.manager();
    let caller = tokio::spawn(async move {
        manager
            .cleanup_sandboxes(
                SandboxKind::Browser,
                SandboxCleanupOptions::default(),
                Arc::new(CleanupFixture),
            )
            .await
            .unwrap()
    });
    while host.calls.lock().unwrap().len() < 2 {
        tokio::task::yield_now().await;
    }
    tokio::time::advance(std::time::Duration::from_secs(61)).await;
    host.release.notify_waiters();
    let report = caller.await.unwrap();
    assert_eq!(report.removed, ["jait-browser-sb-first"]);
    assert_eq!(report.deferred, ["jait-browser-sb-second"]);
    assert_eq!(host.calls.lock().unwrap().len(), 2);
}
