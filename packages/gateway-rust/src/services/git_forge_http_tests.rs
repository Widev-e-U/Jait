//! Written protocol and real-loopback checks. Coordinator runs these serially.
use super::*;
use std::sync::{
    Mutex,
    atomic::{AtomicUsize, Ordering},
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
    task::JoinHandle,
};

type GrantEdit = Arc<dyn Fn(&mut ForgeHttpGrant) + Send + Sync>;
struct Reply {
    status: u16,
    body: String,
    headers: Vec<(String, String)>,
    stall: bool,
}
impl Reply {
    fn json(value: Value) -> Self {
        Self {
            status: 200,
            body: value.to_string(),
            headers: vec![],
            stall: false,
        }
    }
    fn text(body: &str) -> Self {
        Self {
            status: 200,
            body: body.into(),
            headers: vec![],
            stall: false,
        }
    }
    fn error(status: u16) -> Self {
        Self {
            status,
            body: "secret-fixture".into(),
            headers: vec![],
            stall: false,
        }
    }
}
#[derive(Debug)]
struct Wire {
    target: String,
    method: String,
    headers: String,
    body: Value,
}
struct Server(Option<JoinHandle<()>>);
impl Server {
    async fn finish(&mut self) {
        tokio::time::timeout(Duration::from_secs(3), self.0.take().unwrap())
            .await
            .expect("fixture server deadline")
            .expect("fixture server task");
    }
}
impl Drop for Server {
    fn drop(&mut self) {
        if let Some(task) = &self.0 {
            task.abort();
        }
    }
}
async fn wait_disconnected(socket: &mut tokio::net::TcpStream) {
    let mut byte = [0; 1];
    let n = tokio::time::timeout(Duration::from_secs(2), socket.read(&mut byte))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(n, 0, "cancelled effect still owns socket");
}
struct Harness {
    forge: HttpForge,
    server: Server,
    wire: Arc<Mutex<Vec<Wire>>>,
    approvals: Arc<Mutex<Vec<ForgeHttpRequest>>>,
}
async fn harness(
    provider: ForgeProvider,
    replies: impl FnOnce(u16) -> Vec<Reply>,
    edit: Option<GrantEdit>,
) -> Harness {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let replies = replies(address.port());
    let wire = Arc::new(Mutex::new(vec![]));
    let captured = wire.clone();
    let server = Server(Some(tokio::spawn(async move {
        for reply in replies {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut bytes = vec![];
            let header_end = loop {
                let mut chunk = [0; 4096];
                let n = socket.read(&mut chunk).await.unwrap();
                assert!(n > 0, "request headers truncated");
                bytes.extend_from_slice(&chunk[..n]);
                assert!(bytes.len() <= MAX_INPUT + 16 * 1024);
                if let Some(offset) = bytes.windows(4).position(|s| s == b"\r\n\r\n") {
                    break offset + 4;
                }
            };
            let headers = String::from_utf8(bytes[..header_end].to_vec()).unwrap();
            let length = headers
                .lines()
                .find_map(|line| {
                    let (name, value) = line.split_once(':')?;
                    name.eq_ignore_ascii_case("content-length")
                        .then(|| value.trim().parse::<usize>().unwrap())
                })
                .unwrap_or(0);
            assert!(length <= MAX_INPUT);
            while bytes.len() - header_end < length {
                let mut chunk = [0; 4096];
                let n = socket.read(&mut chunk).await.unwrap();
                assert!(n > 0, "request body truncated");
                bytes.extend_from_slice(&chunk[..n]);
            }
            let mut parts = headers.lines().next().unwrap().split_whitespace();
            let method = parts.next().unwrap().into();
            let target = parts.next().unwrap().into();
            let body = if length > 0 {
                serde_json::from_slice(&bytes[header_end..header_end + length]).unwrap()
            } else {
                Value::Null
            };
            captured.lock().unwrap().push(Wire {
                target,
                method,
                headers,
                body,
            });
            let stall_body = reply
                .headers
                .iter()
                .any(|(k, _)| k == "X-Fixture-Stall-Body");
            if reply.stall && !stall_body {
                wait_disconnected(&mut socket).await;
                continue;
            }
            let extra: String = reply
                .headers
                .iter()
                .map(|(k, v)| format!("{k}: {v}\r\n"))
                .collect();
            let chunked = reply
                .headers
                .iter()
                .any(|(k, v)| k.eq_ignore_ascii_case("transfer-encoding") && v == "chunked");
            let framing = if chunked {
                String::new()
            } else {
                format!("Content-Length: {}\r\n", reply.body.len())
            };
            let header = format!(
                "HTTP/1.1 {} Fixture\r\n{}Connection: close\r\n{}\r\n",
                reply.status, framing, extra
            );
            socket.write_all(header.as_bytes()).await.unwrap();
            if reply.stall && stall_body {
                wait_disconnected(&mut socket).await;
                continue;
            }
            // A bounded client may reject content-length before reading the body.
            let _ = socket.write_all(reply.body.as_bytes()).await;
        }
    })));
    let approvals = Arc::new(Mutex::new(vec![]));
    let approved = approvals.clone();
    let authority: ForgeHttpAuthority = Arc::new(move |request| {
        approved.lock().unwrap().push(request.clone());
        let edit = edit.clone();
        Box::pin(async move {
            let mut grant = ForgeHttpGrant {
                request,
                addresses: vec![address],
                credential: ForgeHttpCredential::Bearer("secret-fixture".into()),
                expires_at: Instant::now() + Duration::from_secs(5),
                private_authorized: true,
                loopback_http_authorized: true,
            };
            if let Some(edit) = edit {
                edit(&mut grant);
            }
            Ok(grant)
        })
    });
    let (repository, base) = match provider {
        ForgeProvider::Gitlab => (
            ForgeRepository::gitlab("forge.invalid", "group/nested", "repo").unwrap(),
            format!("http://forge.invalid:{}/api/v4", address.port()),
        ),
        ForgeProvider::Gitea => (
            ForgeRepository::new("forge.invalid", "team", "repo").unwrap(),
            format!("http://forge.invalid:{}/api/v1", address.port()),
        ),
        _ => (
            ForgeRepository::new("bitbucket.org", "team", "repo").unwrap(),
            format!("http://api.bitbucket.org:{}/2.0", address.port()),
        ),
    };
    let forge = HttpForge::new(
        provider,
        repository,
        ForgeHttpScope {
            owner_id: "alice".into(),
            session_id: "session-1".into(),
            vantage: "gateway".into(),
        },
        &base,
        authority,
        Arc::new(Semaphore::new(2)),
    )
    .unwrap();
    Harness {
        forge,
        server,
        wire,
        approvals,
    }
}
fn pr(provider: ForgeProvider, port: u16) -> Value {
    let sha = "a".repeat(40);
    match provider {
        ForgeProvider::Gitlab => {
            json!({"iid":7,"web_url":format!("https://forge.invalid:{port}/group/nested/repo/-/merge_requests/7"),"source_branch":"feature","target_branch":"main","title":"Change","state":"opened","sha":sha})
        }
        ForgeProvider::Gitea => {
            json!({"number":7,"html_url":format!("https://forge.invalid:{port}/team/repo/pulls/7"),"head":{"ref":"feature","sha":sha},"base":{"ref":"main"},"title":"Change","state":"open","changed_files":2,"additions":3,"deletions":1})
        }
        _ => {
            json!({"id":7,"links":{"html":{"href":"https://bitbucket.org/team/repo/pull-requests/7"}},"source":{"branch":{"name":"feature"},"commit":{"hash":sha}},"destination":{"branch":{"name":"main"}},"title":"Change","state":"OPEN"})
        }
    }
}
fn listing(provider: ForgeProvider, item: Value) -> Value {
    if provider == ForgeProvider::Bitbucket {
        json!({"values":[item]})
    } else {
        json!([item])
    }
}
fn cancel() -> ProcessCancellation {
    ProcessCancellation::default()
}

#[tokio::test]
async fn identity_uses_pinned_authenticated_wire_and_raw_evidence_hash() {
    for provider in [
        ForgeProvider::Gitlab,
        ForgeProvider::Gitea,
        ForgeProvider::Bitbucket,
    ] {
        let data = match provider {
            ForgeProvider::Gitlab => json!({"username":"alice","id":3}),
            ForgeProvider::Gitea => json!({"login":"alice","id":3}),
            _ => json!({"display_name":"alice","uuid":"{id}"}),
        };
        let expected_hash = hex::encode(Sha256::digest(data.to_string().as_bytes()));
        let mut h = harness(provider, |_| vec![Reply::json(data)], None).await;
        let result = h.forge.identity(cancel()).await.unwrap();
        assert_eq!(result.value.username, "alice");
        assert_eq!(result.evidence[0].response_sha256, expected_hash);
        assert_eq!(result.evidence[0].owner_id, "alice");
        assert_eq!(result.evidence[0].session_id, "session-1");
        assert_eq!(result.evidence[0].vantage, "gateway");
        h.server.finish().await;
        let wire = h.wire.lock().unwrap();
        assert!(wire[0].target.ends_with("/user"));
        assert!(
            wire[0]
                .headers
                .to_ascii_lowercase()
                .contains("authorization: bearer secret-fixture\r\n")
        );
        assert!(
            !serde_json::to_string(&result)
                .unwrap()
                .contains("secret-fixture")
        );
    }
}
#[tokio::test]
async fn default_branch_is_native_and_missing_is_not_invented_main() {
    for provider in [
        ForgeProvider::Gitlab,
        ForgeProvider::Gitea,
        ForgeProvider::Bitbucket,
    ] {
        let data = if provider == ForgeProvider::Bitbucket {
            json!({"mainbranch":{"name":"trunk"}})
        } else {
            json!({"default_branch":"trunk"})
        };
        let mut h = harness(
            provider,
            |_| vec![Reply::json(data), Reply::json(json!({}))],
            None,
        )
        .await;
        assert_eq!(
            h.forge
                .default_branch(cancel())
                .await
                .unwrap()
                .value
                .as_deref(),
            Some("trunk")
        );
        assert_eq!(h.forge.default_branch(cancel()).await.unwrap().value, None);
        h.server.finish().await;
        if provider == ForgeProvider::Gitlab {
            assert_eq!(
                h.wire.lock().unwrap()[0].target,
                "/api/v4/projects/group%2Fnested%2Frepo"
            );
        }
    }
}
#[tokio::test]
async fn finds_exact_open_head_and_posts_provider_specific_json_once() {
    for provider in [
        ForgeProvider::Gitlab,
        ForgeProvider::Gitea,
        ForgeProvider::Bitbucket,
    ] {
        let mut h = harness(
            provider,
            |port| {
                vec![
                    Reply::json(listing(provider, pr(provider, port))),
                    Reply::json(pr(provider, port)),
                ]
            },
            None,
        )
        .await;
        let found = h
            .forge
            .find_existing_pr("feature", cancel())
            .await
            .unwrap()
            .value
            .unwrap();
        assert_eq!(found.number, 7);
        assert_eq!(found.status, "opened_existing");
        let input = ForgePrInput {
            title: "Change".into(),
            base_branch: "main".into(),
            head_branch: "feature".into(),
            body: "Description".into(),
        };
        let created = h.forge.create_pr(&input, cancel()).await.unwrap();
        assert_eq!(created.value.status, "created");
        assert_eq!(created.value.base_branch, "main");
        h.server.finish().await;
        let requests = h.wire.lock().unwrap();
        assert_eq!(requests.len(), 2);
        assert_eq!(requests[1].method, "POST");
        let expected = match provider {
            ForgeProvider::Gitlab => {
                json!({"title":"Change","source_branch":"feature","target_branch":"main","description":"Description"})
            }
            ForgeProvider::Gitea => {
                json!({"title":"Change","head":"feature","base":"main","body":"Description"})
            }
            _ => {
                json!({"title":"Change","source":{"branch":{"name":"feature"}},"destination":{"branch":{"name":"main"}},"description":"Description"})
            }
        };
        assert_eq!(requests[1].body, expected);
        let query = Url::parse(&format!("http://unused{}", requests[0].target)).unwrap();
        let pairs: std::collections::HashMap<_, _> = query.query_pairs().collect();
        if provider == ForgeProvider::Bitbucket {
            assert_eq!(pairs.get("q").unwrap(), "source.branch.name=\"feature\"");
        }
        if provider == ForgeProvider::Gitea {
            assert_eq!(pairs.get("head").unwrap(), "team:feature");
        }
    }
}
#[tokio::test]
async fn bitbucket_filter_quotes_are_escaped_before_query_encoding() {
    let branch = "topic\" OR state=\"MERGED"; // Space is not a legal Git ref.
    let mut h = harness(
        ForgeProvider::Bitbucket,
        |_| vec![Reply::json(json!({"values":[]}))],
        None,
    )
    .await;
    assert_eq!(
        h.forge
            .find_existing_pr(branch, cancel())
            .await
            .unwrap_err(),
        HttpForgeError::InvalidInput
    );
    let head = "topic\"x";
    assert!(
        h.forge
            .find_existing_pr(head, cancel())
            .await
            .unwrap()
            .value
            .is_none()
    );
    h.server.finish().await;
    let approved = h.approvals.lock().unwrap();
    assert_eq!(approved.len(), 1);
    assert_eq!(
        approved[0]
            .url
            .query_pairs()
            .find(|(k, _)| k == "q")
            .unwrap()
            .1,
        "source.branch.name=\"topic\\\"x\""
    );
}
#[tokio::test]
async fn gitlab_patches_preserve_rename_and_count_hunk_content_prefixes() {
    let patch = "--- a/a\n+++ b/b\n@@ -1,2 +1,3 @@\n-old\n+new\n+++actual-content\n same\n";
    let changes = json!({"overflow":false,"changes":[{"old_path":"old.rs","new_path":"new.rs","renamed_file":true,"diff":patch}]});
    let mut h = harness(
        ForgeProvider::Gitlab,
        |port| {
            vec![
                Reply::json(json!([pr(ForgeProvider::Gitlab, port)])),
                Reply::json(changes.clone()),
                Reply::json(json!([pr(ForgeProvider::Gitlab, port)])),
                Reply::json(changes),
            ]
        },
        None,
    )
    .await;
    let stats = h.forge.diff_stats("feature", cancel()).await.unwrap();
    assert_eq!(
        stats.value.unwrap(),
        HttpDiffStats {
            files: 1,
            insertions: 2,
            deletions: 1,
            has_changes: true
        }
    );
    let result = h.forge.file_patches("feature", cancel()).await.unwrap();
    let files = result.value.unwrap().files;
    assert_eq!(files[0].status, "R");
    assert_eq!(files[0].previous_path.as_deref(), Some("old.rs"));
    assert_eq!(files[0].patch.as_deref(), Some(patch));
    assert!(!result.coverage_gaps.is_empty());
    h.server.finish().await;
}
#[tokio::test]
async fn gitea_stats_and_short_server_pages_are_not_silently_truncated() {
    let mut h = harness(
        ForgeProvider::Gitea,
        |port| {
            vec![
                Reply::json(json!([pr(ForgeProvider::Gitea, port)])),
                Reply::json(json!([pr(ForgeProvider::Gitea, port)])),
                Reply::json(
                    json!([{"filename":"a.rs","status":"added","patch":"@@ -0,0 +1 @@\n+a"}]),
                ),
                Reply::json(json!([{"filename":"b.rs","status":"removed"}])),
                Reply::json(json!([])),
            ]
        },
        None,
    )
    .await;
    let stats = h
        .forge
        .diff_stats("feature", cancel())
        .await
        .unwrap()
        .value
        .unwrap();
    assert_eq!(
        stats,
        HttpDiffStats {
            files: 2,
            insertions: 3,
            deletions: 1,
            has_changes: true
        }
    );
    let result = h.forge.file_patches("feature", cancel()).await.unwrap();
    let files = result.value.unwrap().files;
    assert_eq!(files.len(), 2);
    assert_eq!(files[0].status, "A");
    assert_eq!(files[1].status, "D");
    assert_eq!(files[1].patch, None);
    assert!(result.coverage_gaps.iter().any(|s| s.contains("b.rs")));
    h.server.finish().await;
    assert!(h.wire.lock().unwrap()[3].target.contains("page=2"));
}
#[tokio::test]
async fn bitbucket_stats_follow_only_exact_next_page_and_return_real_unified_patch() {
    let patch = "diff --git a/a b/a\n--- a/a\n+++ b/a\n@@ -1 +1 @@\n-old\n+new\n";
    let mut h = harness(ForgeProvider::Bitbucket, |port| {
        let first = json!({"values":[{"old":{"path":"a"},"new":{"path":"a"},"status":"modified","lines_added":1,"lines_removed":1}],"next":format!("http://api.bitbucket.org:{port}/2.0/repositories/team/repo/pullrequests/7/diffstat?page=2&pagelen=100")});
        let last = json!({"values":[{"old":null,"new":{"path":"b"},"status":"added","lines_added":2,"lines_removed":0}]});
        vec![Reply::json(listing(ForgeProvider::Bitbucket,pr(ForgeProvider::Bitbucket,port))), Reply::json(first.clone()), Reply::json(last.clone()), Reply::json(listing(ForgeProvider::Bitbucket,pr(ForgeProvider::Bitbucket,port))), Reply::json(first), Reply::json(last), Reply::text(patch)]
    }, None).await;
    let stats = h
        .forge
        .diff_stats("feature", cancel())
        .await
        .unwrap()
        .value
        .unwrap();
    assert_eq!(
        stats,
        HttpDiffStats {
            files: 2,
            insertions: 3,
            deletions: 1,
            has_changes: true
        }
    );
    let result = h
        .forge
        .file_patches("feature", cancel())
        .await
        .unwrap()
        .value
        .unwrap();
    assert_eq!(result.unified_patch.as_deref(), Some(patch));
    assert_eq!(result.files[1].status, "A");
    assert!(result.files.iter().all(|f| f.patch.is_none()));
    h.server.finish().await;
}
#[tokio::test]
async fn structured_statuses_use_exact_pr_commit_for_all_providers() {
    for provider in [
        ForgeProvider::Gitlab,
        ForgeProvider::Gitea,
        ForgeProvider::Bitbucket,
    ] {
        let data = match provider {
            ForgeProvider::Gitlab => {
                json!([{"name":"CI","status":"success","started_at":"start","finished_at":"end","target_url":"https://ci.invalid/job"}])
            }
            ForgeProvider::Gitea => {
                json!([{"context":"CI","status":"success","created_at":"start","updated_at":"end","target_url":"https://ci.invalid/job"}])
            }
            _ => {
                json!({"values":[{"name":"CI","state":"SUCCESSFUL","created_on":"start","updated_on":"end","url":"https://ci.invalid/job"}]})
            }
        };
        let mut h = harness(
            provider,
            |port| {
                let mut replies = vec![
                    Reply::json(listing(provider, pr(provider, port))),
                    Reply::json(data),
                ];
                if provider != ForgeProvider::Bitbucket {
                    replies.push(Reply::json(json!([])));
                }
                replies
            },
            None,
        )
        .await;
        let result = h.forge.checks("feature", cancel()).await.unwrap();
        let checks = result.value.unwrap();
        assert_eq!(checks[0].name, "CI");
        assert_eq!(checks[0].conclusion, "success");
        assert_eq!(checks[0].started_at, "start");
        assert_eq!(checks[0].completed_at, "end");
        assert!(!result.coverage_gaps.is_empty());
        h.server.finish().await;
        assert!(h.wire.lock().unwrap()[1].target.contains(&"a".repeat(40)));
    }
}
#[tokio::test]
async fn pagination_rejects_cross_origin_repo_query_and_page_replay() {
    for suffix in [
        "https://evil.invalid/steal",
        "http://api.bitbucket.org:PORT/2.0/repositories/other/repo/pullrequests?page=2&pagelen=100",
        "http://api.bitbucket.org:PORT/2.0/repositories/team/repo/pullrequests?page=1&pagelen=100",
        "http://api.bitbucket.org:PORT/2.0/repositories/team/repo/pullrequests?page=2&pagelen=100&callback=https://evil.invalid",
    ] {
        let mut h = harness(
            ForgeProvider::Bitbucket,
            |port| {
                vec![Reply::json(
                    json!({"values":[],"next":suffix.replace("PORT", &port.to_string())}),
                )]
            },
            None,
        )
        .await;
        assert_eq!(
            h.forge
                .find_existing_pr("feature", cancel())
                .await
                .unwrap_err(),
            HttpForgeError::Denied
        );
        h.server.finish().await;
        assert_eq!(h.approvals.lock().unwrap().len(), 1);
    }
}
#[tokio::test]
async fn grant_tampering_expiry_private_address_and_port_fail_before_connect() {
    let edits: Vec<GrantEdit> = vec![
        Arc::new(|g| g.request.scope.owner_id = "mallory".into()),
        Arc::new(|g| g.request.scope.session_id = "other".into()),
        Arc::new(|g| g.request.scope.vantage = "node-other".into()),
        Arc::new(|g| g.request.url.set_path("/steal")),
        Arc::new(|g| g.expires_at = Instant::now()),
        Arc::new(|g| g.addresses.clear()),
        Arc::new(|g| g.addresses[0].set_port(1)),
        Arc::new(|g| g.private_authorized = false),
        Arc::new(|g| g.loopback_http_authorized = false),
        Arc::new(|g| g.addresses[0].set_ip("0.0.0.0".parse().unwrap())),
        Arc::new(|g| g.addresses[0].set_ip("224.0.0.1".parse().unwrap())),
        Arc::new(|g| g.credential = ForgeHttpCredential::Bearer("x\r\nInjected: yes".into())),
    ];
    for edit in edits {
        let h = harness(ForgeProvider::Gitlab, |_| vec![], Some(edit)).await;
        assert_eq!(
            h.forge.identity(cancel()).await.unwrap_err(),
            HttpForgeError::Denied
        );
        assert!(h.wire.lock().unwrap().is_empty());
    }
}
#[tokio::test]
async fn denied_authority_has_no_http_effect_and_no_retry() {
    let mut h = harness(ForgeProvider::Gitlab, |_| vec![], None).await;
    let calls = Arc::new(AtomicUsize::new(0));
    let seen = calls.clone();
    h.forge.authority = Arc::new(move |_| {
        seen.fetch_add(1, Ordering::SeqCst);
        Box::pin(async { Err(HttpForgeError::Denied) })
    });
    assert_eq!(
        h.forge.identity(cancel()).await.unwrap_err(),
        HttpForgeError::Denied
    );
    assert_eq!(calls.load(Ordering::SeqCst), 1);
    assert!(h.wire.lock().unwrap().is_empty());
    h.server.finish().await;
}
#[tokio::test]
async fn cancellation_expiry_and_flow_deadline_drop_pending_response_socket() {
    for mode in 0..3 {
        let edit: Option<GrantEdit> = if mode == 1 {
            Some(Arc::new(|g| {
                g.expires_at = Instant::now() + Duration::from_millis(120)
            }))
        } else {
            None
        };
        let mut h = harness(
            ForgeProvider::Gitlab,
            |_| {
                vec![Reply {
                    stall: true,
                    ..Reply::json(json!({}))
                }]
            },
            edit,
        )
        .await;
        let token = cancel();
        if mode == 0 {
            let signal = token.clone();
            let wire = h.wire.clone();
            let cancel_after_dispatch = async {
                tokio::time::timeout(Duration::from_secs(2), async {
                    loop {
                        if !wire.lock().unwrap().is_empty() {
                            break;
                        }
                        tokio::task::yield_now().await;
                    }
                })
                .await
                .unwrap();
                signal.cancel();
            };
            let (result, ()) = tokio::join!(h.forge.identity(token), cancel_after_dispatch);
            assert_eq!(result.unwrap_err(), HttpForgeError::Cancelled);
        } else {
            let mut flow = h.forge.begin(token).unwrap();
            if mode == 2 {
                flow.deadline = Instant::now() + Duration::from_millis(120);
            }
            assert_eq!(
                h.forge
                    .json(&mut flow, "identity", h.forge.root_url("user"))
                    .await
                    .unwrap_err(),
                HttpForgeError::TimedOut
            );
        }
        h.server.finish().await;
    }
}
#[tokio::test]
async fn pre_cancel_busy_and_expired_flow_never_authorize() {
    let h = harness(ForgeProvider::Gitlab, |_| vec![], None).await;
    let token = cancel();
    token.cancel();
    assert_eq!(
        h.forge.identity(token).await.unwrap_err(),
        HttpForgeError::Cancelled
    );
    let _first = h.forge.admission.clone().try_acquire_owned().unwrap();
    let _second = h.forge.admission.clone().try_acquire_owned().unwrap();
    assert_eq!(
        h.forge.identity(cancel()).await.unwrap_err(),
        HttpForgeError::Busy
    );
    drop(_first);
    drop(_second);
    let mut flow = h.forge.begin(cancel()).unwrap();
    flow.deadline = Instant::now();
    assert_eq!(
        h.forge
            .json(&mut flow, "identity", h.forge.root_url("user"))
            .await
            .unwrap_err(),
        HttpForgeError::TimedOut
    );
    assert!(h.approvals.lock().unwrap().is_empty());
}
#[tokio::test]
async fn malformed_oversize_and_http_errors_never_become_empty_success() {
    for (reply, error) in [
        (Reply::text("{invalid"), HttpForgeError::MalformedResponse),
        (
            Reply::json(json!({"username":4})),
            HttpForgeError::MalformedResponse,
        ),
        (Reply::error(401), HttpForgeError::HttpStatus(401)),
        (
            Reply::text(&"x".repeat(MAX_RESPONSE + 1)),
            HttpForgeError::OutputLimit,
        ),
    ] {
        let mut h = harness(ForgeProvider::Gitlab, |_| vec![reply], None).await;
        assert_eq!(h.forge.identity(cancel()).await.unwrap_err(), error);
        h.server.finish().await;
        assert_eq!(h.approvals.lock().unwrap().len(), 1);
    }
}
#[tokio::test]
async fn redirects_are_rejected_and_create_failure_is_uncertain_without_replay() {
    for write in [false, true] {
        let mut reply = Reply::error(302);
        reply
            .headers
            .push(("Location".into(), "http://evil.invalid/steal".into()));
        let mut h = harness(ForgeProvider::Gitea, |_| vec![reply], None).await;
        let error = if write {
            h.forge
                .create_pr(
                    &ForgePrInput {
                        title: "Change".into(),
                        head_branch: "feature".into(),
                        base_branch: "main".into(),
                        body: "body".into(),
                    },
                    cancel(),
                )
                .await
                .unwrap_err()
        } else {
            h.forge.identity(cancel()).await.unwrap_err()
        };
        assert_eq!(
            error,
            if write {
                HttpForgeError::WriteUncertain
            } else {
                HttpForgeError::HttpStatus(302)
            }
        );
        h.server.finish().await;
        assert_eq!(h.approvals.lock().unwrap().len(), 1);
    }
}
#[tokio::test]
async fn create_malformed_mismatched_or_5xx_response_is_uncertain() {
    for mode in 0..3 {
        let mut h = harness(
            ForgeProvider::Gitlab,
            |port| {
                vec![match mode {
                    0 => Reply::text("not json"),
                    1 => {
                        let mut value = pr(ForgeProvider::Gitlab, port);
                        value["source_branch"] = json!("other");
                        Reply::json(value)
                    }
                    _ => Reply::error(500),
                }]
            },
            None,
        )
        .await;
        assert_eq!(
            h.forge
                .create_pr(
                    &ForgePrInput {
                        title: "Change".into(),
                        head_branch: "feature".into(),
                        base_branch: "main".into(),
                        body: "body".into()
                    },
                    cancel()
                )
                .await
                .unwrap_err(),
            HttpForgeError::WriteUncertain
        );
        h.server.finish().await;
        assert_eq!(h.wire.lock().unwrap().len(), 1);
    }
}
#[tokio::test]
async fn response_secrets_are_redacted_before_model_serialization() {
    let mut h = harness(
        ForgeProvider::Gitlab,
        |_| vec![Reply::json(json!({"username":"alice-secret-fixture"}))],
        None,
    )
    .await;
    let result = h.forge.identity(cancel()).await.unwrap();
    assert_eq!(result.value.username, "alice-[REDACTED]");
    assert!(
        !serde_json::to_string(&result)
            .unwrap()
            .contains("secret-fixture")
    );
    h.server.finish().await;
}
#[tokio::test]
async fn gitlab_overflow_and_unsafe_patch_paths_fail_closed() {
    for changes in [
        json!({"overflow":true,"changes":[]}),
        json!({"changes":[{"new_path":"../escape","old_path":"old","diff":""}]}),
        json!({"changes":[{"new_path":"ok","diff":"","too_large":true}]}),
    ] {
        let mut h = harness(
            ForgeProvider::Gitlab,
            |port| {
                vec![
                    Reply::json(json!([pr(ForgeProvider::Gitlab, port)])),
                    Reply::json(changes),
                ]
            },
            None,
        )
        .await;
        assert!(matches!(
            h.forge.file_patches("feature", cancel()).await,
            Err(HttpForgeError::OutputLimit | HttpForgeError::MalformedResponse)
        ));
        h.server.finish().await;
    }
}
#[tokio::test]
async fn page_and_aggregate_byte_budgets_fail_instead_of_partial_success() {
    let mut h = harness(
        ForgeProvider::Gitea,
        |_| {
            (0..MAX_PAGES)
                .map(|_| Reply::json(json!([{"filename":"a","status":"added"}])))
                .collect()
        },
        None,
    )
    .await;
    let mut flow = h.forge.begin(cancel()).unwrap();
    assert_eq!(
        h.forge
            .pages(&mut flow, "changes", h.forge.url(&["pulls", "7", "files"]))
            .await
            .unwrap_err(),
        HttpForgeError::PageLimit
    );
    h.server.finish().await;
    assert_eq!(h.approvals.lock().unwrap().len(), MAX_PAGES);
    let mut h = harness(ForgeProvider::Gitlab, |_| vec![Reply::text("12345")], None).await;
    let mut flow = h.forge.begin(cancel()).unwrap();
    flow.bytes = MAX_TOTAL - 4;
    assert_eq!(
        h.forge
            .request(&mut flow, "identity", h.forge.root_url("user"), None)
            .await
            .err(),
        Some(HttpForgeError::OutputLimit)
    );
    h.server.finish().await;
}
#[test]
fn repository_links_and_literal_dns_pins_cannot_alias_other_authority() {
    let repo = ForgeRepository::new("127.0.0.1", "team", "repo").unwrap();
    let request = ForgeHttpRequest {
        effect_id: "fixture-effect".into(),
        scope: ForgeHttpScope {
            owner_id: "alice".into(),
            session_id: "s".into(),
            vantage: "gateway".into(),
        },
        provider: ForgeProvider::Gitea,
        repository: repo,
        operation: "identity",
        url: Url::parse("https://127.0.0.1/api/v1/user").unwrap(),
        method: "GET",
        body: None,
    };
    let grant = ForgeHttpGrant {
        request: request.clone(),
        addresses: vec!["127.0.0.2:443".parse().unwrap()],
        credential: ForgeHttpCredential::Bearer("secret".into()),
        expires_at: Instant::now() + Duration::from_secs(1),
        private_authorized: true,
        loopback_http_authorized: false,
    };
    assert_eq!(
        validate_grant(&request, &grant),
        Err(HttpForgeError::Denied)
    );
    assert!(!same_page_url(
        &Url::parse("https://u:p@host/a?page=2").unwrap(),
        &Url::parse("https://host/a?page=2").unwrap()
    ));
    assert!(!same_page_url(
        &Url::parse("https://host/a?page=2&page=2").unwrap(),
        &Url::parse("https://host/a?page=2").unwrap()
    ));
    assert!(!same_page_url(
        &Url::parse("https://host/a?page=2#callback").unwrap(),
        &Url::parse("https://host/a?page=2").unwrap()
    ));
}
#[tokio::test]
async fn foreign_pr_link_and_closed_head_are_not_claimed_existing() {
    let mut h = harness(
        ForgeProvider::Gitlab,
        |port| {
            let mut closed = pr(ForgeProvider::Gitlab, port);
            closed["state"] = json!("closed");
            let mut foreign = pr(ForgeProvider::Gitlab, port);
            foreign["web_url"] = json!(format!(
                "https://forge.invalid:{port}/other/repo/-/merge_requests/7"
            ));
            vec![
                Reply::json(json!([closed])),
                Reply::json(json!([])),
                Reply::json(json!([foreign])),
            ]
        },
        None,
    )
    .await;
    assert!(
        h.forge
            .find_existing_pr("feature", cancel())
            .await
            .unwrap()
            .value
            .is_none()
    );
    assert_eq!(
        h.forge
            .find_existing_pr("feature", cancel())
            .await
            .unwrap_err(),
        HttpForgeError::MalformedResponse
    );
    h.server.finish().await;
}
#[test]
fn basic_and_token_auth_are_explicit_and_sensitive() {
    let basic = ForgeHttpCredential::Basic {
        username: "alice".into(),
        password: "pass".into(),
    };
    let header = basic.header().unwrap();
    assert_eq!(header.to_str().unwrap(), "Basic YWxpY2U6cGFzcw==");
    assert!(header.is_sensitive());
    assert!(!basic.redact("pass YWxpY2U6cGFzcw==").contains("pass"));
    let header = ForgeHttpCredential::Token("api-token".into())
        .header()
        .unwrap();
    assert_eq!(header.to_str().unwrap(), "token api-token");
    assert!(header.is_sensitive());
}

#[tokio::test]
async fn owner_lane_rejects_overlapping_operations_and_releases_on_drop() {
    let h = harness(ForgeProvider::Gitlab, |_| vec![], None).await;
    let flow = h.forge.begin(cancel()).unwrap();
    assert_eq!(
        h.forge.identity(cancel()).await.unwrap_err(),
        HttpForgeError::Busy
    );
    assert!(h.approvals.lock().unwrap().is_empty());
    drop(flow);
    assert!(h.forge.begin(cancel()).is_ok());
}
#[tokio::test]
async fn authority_deadline_cancels_pending_grant_without_dispatch() {
    let mut h = harness(ForgeProvider::Gitlab, |_| vec![], None).await;
    h.forge.authority = Arc::new(|_| Box::pin(std::future::pending()));
    let mut flow = h.forge.begin(cancel()).unwrap();
    flow.deadline = Instant::now() + Duration::from_millis(20);
    assert_eq!(
        h.forge
            .json(&mut flow, "identity", h.forge.root_url("user"))
            .await
            .unwrap_err(),
        HttpForgeError::TimedOut
    );
    assert!(h.wire.lock().unwrap().is_empty());
    h.server.finish().await;
}
#[tokio::test]
async fn create_cancellation_after_dispatch_is_uncertain_and_socket_is_closed() {
    let mut h = harness(
        ForgeProvider::Gitlab,
        |_| {
            vec![Reply {
                stall: true,
                ..Reply::text("")
            }]
        },
        None,
    )
    .await;
    let token = cancel();
    let signal = token.clone();
    let wire = h.wire.clone();
    let cancel_after_dispatch = async {
        tokio::time::timeout(Duration::from_secs(2), async {
            loop {
                if !wire.lock().unwrap().is_empty() {
                    break;
                }
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        signal.cancel();
    };
    let input = ForgePrInput {
        title: "Change".into(),
        head_branch: "feature".into(),
        base_branch: "main".into(),
        body: "body".into(),
    };
    let (result, ()) = tokio::join!(h.forge.create_pr(&input, token), cancel_after_dispatch);
    assert_eq!(result.unwrap_err(), HttpForgeError::WriteUncertain);
    h.server.finish().await;
    assert_eq!(h.approvals.lock().unwrap().len(), 1);
}
#[tokio::test]
async fn bitbucket_patch_redirect_requires_snapshot_pair_and_fresh_grant() {
    for malicious in [false, true] {
        let mut h = harness(ForgeProvider::Bitbucket, |port| {
            let mut snapshot = pr(ForgeProvider::Bitbucket,port);
            snapshot["destination"]["commit"] = json!({"hash":"b".repeat(40)});
            let spec = if malicious { format!("{}..{}","a".repeat(40),"c".repeat(40)) } else { format!("{}..{}","a".repeat(40),"b".repeat(40)) };
            let redirect = Reply { status:302,body:"".into(),headers:vec![("Location".into(),format!("http://api.bitbucket.org:{port}/2.0/repositories/team/repo/diff/{spec}?from_pullrequest_id=7&topic=true"))],stall:false };
            let mut replies = vec![Reply::json(listing(ForgeProvider::Bitbucket,snapshot)),Reply::json(json!({"values":[]})),redirect];
            if !malicious { replies.push(Reply::text("diff --git a/a b/a\n")); }
            replies
        },None).await;
        let result = h.forge.file_patches("feature", cancel()).await;
        if malicious {
            assert_eq!(result.unwrap_err(), HttpForgeError::Denied);
        } else {
            let observed = result.unwrap();
            assert_eq!(
                observed.value.unwrap().unified_patch.as_deref(),
                Some("diff --git a/a b/a\n")
            );
            assert_eq!(
                observed
                    .evidence
                    .iter()
                    .map(|e| e.status)
                    .collect::<Vec<_>>(),
                vec![200, 200, 302, 200]
            );
        }
        h.server.finish().await;
        let approvals = h.approvals.lock().unwrap();
        assert_eq!(approvals.len(), if malicious { 3 } else { 4 });
        if !malicious {
            assert_ne!(approvals[2].effect_id, approvals[3].effect_id);
            assert_ne!(approvals[2].url, approvals[3].url);
        }
    }
}
#[tokio::test]
async fn constructor_rejects_unsupported_base_prefix_credentials_and_host_aliases() {
    let h = harness(ForgeProvider::Gitlab, |_| vec![], None).await;
    for endpoint in [
        "https://evil.invalid/api/v4",
        "https://u:p@forge.invalid/api/v4",
        "https://forge.invalid/api/v4?token=x",
        "https://forge.invalid/api/v4#fragment",
        "https://forge.invalid/other",
        "https://forge.invalid:0/api/v4",
    ] {
        assert!(matches!(
            HttpForge::new(
                ForgeProvider::Gitlab,
                h.forge.repository.clone(),
                h.forge.scope.clone(),
                endpoint,
                h.forge.authority.clone(),
                h.forge.admission.clone()
            ),
            Err(HttpForgeError::InvalidInput)
        ));
    }
    assert!(matches!(
        HttpForge::new(
            ForgeProvider::Github,
            h.forge.repository.clone(),
            h.forge.scope.clone(),
            "https://forge.invalid/api/v4",
            h.forge.authority.clone(),
            h.forge.admission.clone()
        ),
        Err(HttpForgeError::UnsupportedProvider)
    ));
}

#[tokio::test]
async fn chunked_body_budget_partial_stream_and_expiry_are_enforced() {
    for malformed in [false, true] {
        let body = if malformed {
            "5\r\n12"
        } else {
            "5\r\n12345\r\n0\r\n\r\n"
        };
        let mut h = harness(
            ForgeProvider::Gitlab,
            |_| {
                vec![Reply {
                    status: 200,
                    body: body.into(),
                    headers: vec![("Transfer-Encoding".into(), "chunked".into())],
                    stall: false,
                }]
            },
            None,
        )
        .await;
        let mut flow = h.forge.begin(cancel()).unwrap();
        if !malformed {
            flow.bytes = MAX_TOTAL - 4;
        }
        let error = h
            .forge
            .request(&mut flow, "identity", h.forge.root_url("user"), None)
            .await
            .err();
        assert_eq!(
            error,
            Some(if malformed {
                HttpForgeError::Transport
            } else {
                HttpForgeError::OutputLimit
            })
        );
        h.server.finish().await;
    }
    let edit: GrantEdit = Arc::new(|g| g.expires_at = Instant::now() + Duration::from_millis(120));
    let mut h = harness(
        ForgeProvider::Gitlab,
        |_| {
            vec![Reply {
                status: 200,
                body: "not-sent".into(),
                headers: vec![("X-Fixture-Stall-Body".into(), "true".into())],
                stall: true,
            }]
        },
        Some(edit),
    )
    .await;
    assert_eq!(
        h.forge.identity(cancel()).await.unwrap_err(),
        HttpForgeError::TimedOut
    );
    h.server.finish().await;
}
