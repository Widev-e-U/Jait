#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::providers::provider_auth::*;
use serde_json::{Value, json};
use std::{num::NonZeroU16, path::PathBuf, time::Duration};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn directory() -> PathBuf {
    let p = root()
        .join(".jait/artifacts/gateway-rust/provider-auth")
        .join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(&p).unwrap();
    p
}
fn reference(calls: Vec<Value>) -> Value {
    internal_driver::call(
        &root(),
        &directory(),
        json!({"version":1,"calls":calls}),
        &|| false,
    )
    .unwrap()
}
fn environment(v: &Value) -> AuthEnvironment {
    v.as_object()
        .map(|o| {
            o.iter()
                .map(|(k, v)| (k.clone(), v.as_str().map(String::from)))
                .collect()
        })
        .unwrap_or_default()
}
fn env_json(v: AuthEnvironment) -> Value {
    Value::Object(
        v.into_iter()
            .filter_map(|(k, v)| v.map(|v| (k, json!(v))))
            .collect(),
    )
}
fn pool(n: u16) -> AuthCommandPool {
    AuthCommandPool::new(
        NonZeroU16::new(n).unwrap(),
        std::env::vars().map(|(k, v)| (k, Some(v))).collect(),
        PathBuf::from(std::env::var("HOME").unwrap()),
    )
}
fn normalize(r: AuthResult, failed: bool) -> Value {
    let mut out = json!({"ok":r.ok,"status":r.status,"providerId":r.provider_id,"message":if failed{"<spawn-error>".into()}else{r.message}});
    for (k, v) in serde_json::to_value(r.details)
        .unwrap()
        .as_object()
        .unwrap()
    {
        out[k] = v.clone()
    }
    if let Some(raw) = r.raw_output {
        out["rawOutput"] = json!(raw.0)
    }
    out
}
async fn compare_process(mut c: Value, login: bool) {
    c["op"] = json!(if login {
        "nativeproviderauth.login"
    } else {
        "nativeproviderauth.run"
    });
    let expected = reference(vec![c.clone()])[0].clone();
    let mut opts = AuthCommandOptions::new("fixture", c["commandLine"].as_str().unwrap_or("node"));
    opts.args = c["args"]
        .as_array()
        .map(|a| a.iter().map(|s| s.as_str().unwrap().to_string()).collect())
        .unwrap_or_else(|| vec!["-e".into(), c["script"].as_str().unwrap_or("").into()]);
    opts.env = environment(&c["env"]);
    opts.unset_env = c["unset"]
        .as_array()
        .map(|a| a.iter().map(|s| s.as_str().unwrap().to_string()).collect())
        .unwrap_or_default();
    opts.timeout = Some(Duration::from_millis(c["timeout"].as_u64().unwrap_or(3000)));
    let p = pool(1);
    let failed = c["spawnFailure"] == true;
    let actual = if login {
        let login = p.start_device_login_command(opts, "Fixture").await;
        let exists = login.child.is_some();
        let value = json!({"result":normalize(login.result,failed),"child":exists});
        if let Some(child) = login.child {
            if let Some(input) = c["input"].as_str() {
                let _ = child.write_input(input.as_bytes()).await;
            }
            child.kill();
            tokio::time::timeout(Duration::from_secs(3), child.wait_for_exit())
                .await
                .unwrap();
        }
        value
    } else {
        normalize(p.run_auth_command(opts).await, failed)
    };
    assert_eq!(actual, expected, "auth process {c}");
}
#[test]
fn command_parser_preserves_escapes_unicode_and_literal_arguments() {
    let mut lines = vec![
        "".to_string(),
        "   \t".into(),
        r#""/Applications/Codex CLI/codex" login --profile "QA Team""#.into(),
        r#"codex login --message "Use \"staging\" profile""#.into(),
        r#""C:\Program Files\Codex\codex.exe" login"#.into(),
        r#"codex --config C:\Users\Alice\.codex\auth.json"#.into(),
        r#"x '' "" a""b 'unclosed"#.into(),
        r#"x path\ with\ spaces \q \$HOME $(literal) ; &"#.into(),
        r#"x 'a\b' "a\qb" tail\"#.into(),
        "x\u{85}y\u{feff}z".into(),
        "🦀 '中文 😀' a\\\tb".into(),
    ];
    for ws in [
        '\t', '\n', '\r', '\u{a0}', '\u{1680}', '\u{2007}', '\u{2028}', '\u{feff}',
    ] {
        lines.push(format!("{ws}node{ws}'arg{ws}arg'{ws}end"))
    }
    let calls = lines
        .iter()
        .map(|s| json!({"op":"nativeproviderauth.parse","line":s}))
        .collect();
    let expected = reference(calls);
    for (i, line) in lines.iter().enumerate() {
        assert_eq!(
            serde_json::to_value(parse_command_line(line)).unwrap(),
            expected[i],
            "{line:?}"
        )
    }
}
#[test]
fn auth_details_match_shared_url_code_input_prompt_and_blocked_label_rules() {
    let mut texts=vec![
 "", "Open https://auth.openai.com/activate\nYour code is ABCD-EFGH", "\u{1b}[32mCode: WXYZ-1234\u{1b}[0m\nVisit https://github.com/login/device",
 "DEVICE AUTHORIZATION\nCode: AUTHORIZATION\nUse code AB12-CD34 to continue","Enter THIS-ONE-TIME-CODE\nUse code XY12-ZZ90 to continue",
 "1. Open https://auth.openai.com/codex/device\n2. Enter this one-time code (expires soon)\n 1URT-UU74B",
 "Opening https://claude.ai/oauth/authorize\nEnter the authorization code from your browser:", "Visit https://example.com/login\nAuthorization code:", "Paste the auth code here:",
 "Open https://auth.openai.com/activate\nYour code is AB12-CD34\nEnter the authorization code from your browser:",
 "Visit https://github.com/login/device. to continue","Open (HTTPS://AUTH.EXAMPLE.COM/path) in browser",
 "Code: COMMAND-LINE", "Code: abcd-efg", "Code: ABCD EFGH", "Copy the code 1234-5678", "qABCD-EFGHq", "Open https://a.example/path<>oops",
 "\u{1b}]0;user@host: title\u{7}code: FOO1-BAR2", "enter\u{a0}this one-time code\nABCD-1234", "code\u{85}ABCD-1234", "code\u{feff}ABCD-1234",
 "authorization code :   ", "Enter code displayed on screen", "Code from your browser: ", "abcd-efgh", "ABC1-DEF2-GHI3-JKL4-MNO5",
 ].into_iter().map(String::from).collect::<Vec<_>>();
    for end in ["\u{7}", "\u{1b}\\"] {
        texts.push(format!(
            "\u{1b}]0;https://wrong.invalid{end}Open https://right.example/next; Code: ABCD-1234"
        ))
    }
    let calls = texts
        .iter()
        .map(|s| json!({"op":"nativeproviderauth.details","text":s}))
        .collect();
    let expected = reference(calls);
    for (i, text) in texts.iter().enumerate() {
        let d = extract_device_auth_details(text);
        assert_eq!(
            json!({"complete":d.complete(),"details":d}),
            expected[i],
            "{text:?}"
        )
    }
}
#[test]
fn ansi_environment_precedence_case_and_unsupported_results() {
    let texts = [
        "plain",
        "\u{1b}[31mred\u{1b}[0m",
        "\u{1b}]0;title\u{7}body",
        "\u{1b}]0;title\u{1b}\\body",
        "\u{1b}]unterminated",
        "🦀\r\n\u{7}",
        "\u{1b}Mabc",
    ];
    let expected = reference(
        texts
            .iter()
            .map(|s| json!({"op":"nativeproviderauth.ansi","text":s}))
            .collect(),
    );
    for (i, t) in texts.iter().enumerate() {
        assert_eq!(json!(strip_ansi(t)), expected[i])
    }
    let home = directory();
    for (inherited, overrides, unset, undefined) in [
        (
            json!({"PATH":"/usr/bin::/bin","HOME":home,"GH_TOKEN":"inherited"}),
            json!({"NPM_CONFIG_PREFIX":"/opt/npm","GH_TOKEN":"explicit"}),
            vec!["GH_TOKEN"],
            vec![],
        ),
        (
            json!({"Path":"/bin","PATH":"/ignored","HOME":home,"npm_config_prefix":"/opt/npm"}),
            json!({}),
            vec![],
            vec![],
        ),
        (
            json!({"HOME":home}),
            json!({"PATH":"/bin","NPM_CONFIG_PREFIX":"","npm_config_prefix":"/ignored"}),
            vec![],
            vec![],
        ),
        (
            json!({"HOME":home,"PATH":format!("/bin:{}/.npm-global/bin",home.display()),"DROP":"x"}),
            json!({}),
            vec!["DROP"],
            vec!["PATH"],
        ),
    ] {
        let call = json!({"op":"nativeproviderauth.env","inherited":inherited,"overrides":overrides,"unset":unset,"undefined":undefined});
        let expected = reference(vec![call])[0].clone();
        let mut overrides = environment(&overrides);
        overrides.extend(undefined.into_iter().map(|k| (k.to_string(), None)));
        let actual = build_provider_auth_env(
            &environment(&inherited),
            &overrides,
            &unset.into_iter().map(String::from).collect::<Vec<_>>(),
            &PathBuf::from(expected["home"].as_str().unwrap()),
        );
        assert_eq!(env_json(actual), expected["env"])
    }
    let c = json!({"op":"nativeproviderauth.unsupported","provider":"fixture","message":"unavailable 😀"});
    let e = reference(vec![c]);
    assert_eq!(
        json!([
            NO_PROVIDER_AUTH,
            DEVICE_PROVIDER_AUTH,
            SHADOWED_GITHUB_COPILOT_TOKEN_ENV_VARS,
            unsupported_login("fixture", "unavailable 😀"),
            unsupported_logout("fixture", "unavailable 😀")
        ]),
        e[0]
    );
    let mut env = environment(&json!({"KEEP":"1","DROP":"2"}));
    strip_env_vars(&mut env, &["DROP".into()]);
    assert_eq!(env_json(env), json!({"KEEP":"1"}));
}
#[tokio::test]
async fn logout_captures_exit_signal_ansi_tail_environment_and_literal_args() {
    compare_process(json!({"script":"console.log('logout success');"}), false).await;
    compare_process(json!({"script":"process.stderr.write('\\u001b[31mfailed\\u001b[0m\\n');process.exitCode=7;"}),false).await;
    compare_process(
        json!({"script":"process.kill(process.pid,'SIGTERM');"}),
        false,
    )
    .await;
    compare_process(
        json!({"script":"process.stdout.write('x'.repeat(8200));"}),
        false,
    )
    .await;
    compare_process(
        json!({"script":"process.stdout.write('😀'+'x'.repeat(7999));"}),
        false,
    )
    .await;
    compare_process(json!({"args":["-e","console.log(JSON.stringify({value:process.env.JAIT_AUTH_VALUE,arg:process.argv[1]}))","literal ; $(no-shell) &"],"env":{"JAIT_AUTH_VALUE":"value 😀"}}),false).await;
    compare_process(json!({"commandLine":"  ","args":[]}), false).await;
    compare_process(
        json!({"commandLine":"jait-auth-missing-fixture-79d03","args":[],"spawnFailure":true}),
        false,
    )
    .await;
    compare_process(
        json!({"script":"console.log('started');setInterval(()=>{},1000);","timeout":1500}),
        false,
    )
    .await;
}
#[tokio::test]
async fn device_login_complete_partial_input_completed_error_and_timeout() {
    for c in [
        json!({"script":"console.log('Open https://example.test/device\\nCode: AB12-CD34');setInterval(()=>{},1000);"}),
        json!({"script":"console.log('Open https://example.test/device\\nEnter the authorization code from your browser:');setInterval(()=>{},1000);"}),
        json!({"script":"console.log('Open https://example.test/device');setInterval(()=>{},1000);","timeout":3000}),
        json!({"script":"console.log('Code: AB12-CD34');setInterval(()=>{},1000);","timeout":1500}),
        json!({"script":"console.log('logged out');"}),
        json!({"script":"console.log('failed');process.exitCode=2;"}),
        json!({"script":"process.kill(process.pid,'SIGTERM');"}),
        json!({"script":"console.log('waiting');setInterval(()=>{},1000);","timeout":1500}),
        json!({"commandLine":"","args":[]}),
        json!({"commandLine":"jait-auth-missing-fixture-79d03","args":[],"spawnFailure":true}),
    ] {
        compare_process(c, true).await
    }
}
#[tokio::test]
async fn started_login_accepts_input_and_releases_admission_after_exit_and_owner_drop() {
    let p = pool(1);
    let mut opts = AuthCommandOptions::new("fixture", "node");
    opts.args=vec!["-e".into(),"console.log('Enter the authorization code from your browser:');process.stdin.once('data',data=>process.exit(data.toString().trim()==='fixture-code'?0:7));".into()];
    let login = p.start_device_login_command(opts.clone(), "Fixture").await;
    assert_eq!(login.result.status, "started");
    let child = login.child.unwrap();
    let rejected = p.run_auth_command(opts.clone()).await;
    assert!(!rejected.ok && rejected.message.contains("capacity"));
    assert_eq!(
        child
            .write_input(&vec![0; 65_537])
            .await
            .unwrap_err()
            .kind(),
        std::io::ErrorKind::InvalidInput
    );
    child.write_input(b"fixture-code\n").await.unwrap();
    assert_eq!(
        tokio::time::timeout(Duration::from_secs(3), child.wait_for_exit())
            .await
            .unwrap(),
        Some(0)
    );
    let mut ignored = opts.clone();
    ignored.args=vec!["-e".into(),"process.on('SIGTERM',()=>{});console.log('Enter the authorization code from your browser:');setInterval(()=>{},1000);".into()];
    let login = p.start_device_login_command(ignored, "Fixture").await;
    let child = login.child.unwrap();
    assert!(child.is_running());
    drop(child);
    tokio::time::timeout(Duration::from_secs(4), async {
        loop {
            let mut opts = AuthCommandOptions::new("fixture", "node");
            opts.args = vec!["-e".into(), "process.exit(0)".into()];
            let r = p.run_auth_command(opts).await;
            if r.ok {
                break;
            }
            assert!(r.message.contains("capacity"));
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    })
    .await
    .unwrap();
    p.close();
    assert!(!p.run_auth_command(opts).await.ok);
}
