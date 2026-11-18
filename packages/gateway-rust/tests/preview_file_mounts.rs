//! Black-box checks for `/api/dev-file/*` and `/preview/{token}/file/*` through the composed application.
use base64::Engine;
use jait_gateway::config::GatewayConfig;
use jait_gateway::runtime::application::{Application, ApplicationConfig};
use std::time::Duration;

const SECRET: &str = "preview-mount-secret";

fn enc(path: &std::path::Path) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(path.to_str().unwrap())
}

#[tokio::test]
async fn dev_file_and_preview_file_are_scoped_to_owned_projects() {
    let dir = std::env::temp_dir().join(format!("jait-preview-{}", uuid::Uuid::new_v4()));
    let site = dir.join("site");
    std::fs::create_dir_all(site.join("sub")).unwrap();
    std::fs::write(
        site.join("index.html"),
        r#"<html><head></head><body><img src="/logo.png"></body></html>"#,
    )
    .unwrap();
    std::fs::write(site.join("app.js"), "console.log(1)").unwrap();
    std::fs::write(site.join(".env"), "SECRET=1").unwrap();
    std::fs::write(site.join("notes.exe"), "x").unwrap();
    std::fs::write(dir.join("outside.html"), "<html></html>").unwrap();
    let mut app = Application::bind_with_settings_chat(
        GatewayConfig {
            address: "127.0.0.1:0".parse().unwrap(),
            allow_non_loopback: false,
        },
        ApplicationConfig {
            database_path: dir.join("gateway.sqlite"),
            project_root: dir.clone(),
            jwt_secret: SECRET.into(),
            cors_origin: String::new(),
            web_root: None,
            health: None,
        },
    )
    .await
    .unwrap();
    app.mount_websocket(
        jait_gateway::ws::WsHubConfig::default(),
        std::num::NonZeroUsize::new(8).unwrap(),
        Duration::from_secs(5),
    )
    .unwrap();
    let base = format!("http://{}", app.local_addr().unwrap());
    let (stop, stopped) = tokio::sync::oneshot::channel::<()>();
    let task = tokio::spawn(async move {
        app.serve(async move {
            let _ = stopped.await;
        })
        .await
        .unwrap();
    });
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap();
    let registered: serde_json::Value = client
        .post(format!("{base}/api/auth/register"))
        .json(&serde_json::json!({"username":"previewer","password":"correct-horse-1"}))
        .timeout(Duration::from_secs(60))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let token = registered["access_token"].as_str().unwrap().to_owned();
    let user_id = registered["user"]["id"].as_str().unwrap().to_owned();
    let encoded = enc(&site.join("index.html"));

    let anon = client
        .get(format!("{base}/api/dev-file/{encoded}"))
        .send()
        .await
        .unwrap();
    assert_eq!(anon.status(), 401, "dev-file needs auth");

    // No project owns the directory yet.
    let denied = client
        .get(format!("{base}/api/dev-file/{encoded}"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(denied.status(), 403);

    let created = client
        .post(format!("{base}/api/projects"))
        .bearer_auth(&token)
        .json(&serde_json::json!({"title":"site","rootPath": site.to_str().unwrap()}))
        .send()
        .await
        .unwrap();
    assert!(created.status().is_success(), "{}", created.status());

    let page = client
        .get(format!("{base}/api/dev-file/{encoded}"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(page.status(), 200);
    assert_eq!(page.headers()["cache-control"], "no-store");
    assert!(page.headers().get("content-security-policy").is_none());
    let body = page.text().await.unwrap();
    assert!(
        body.contains(&format!(r#"src="/api/dev-file/{encoded}/logo.png""#)),
        "{body}"
    );
    assert!(
        body.contains(&format!(r#"<base href="/api/dev-file/{encoded}/">"#)),
        "{body}"
    );

    let js = client
        .get(format!("{base}/api/dev-file/{encoded}/app.js"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(js.status(), 200);
    assert!(
        js.headers()["content-type"]
            .to_str()
            .unwrap()
            .starts_with("text/javascript")
    );
    for blocked in [".env", "notes.exe"] {
        let r = client
            .get(format!("{base}/api/dev-file/{encoded}/{blocked}"))
            .bearer_auth(&token)
            .send()
            .await
            .unwrap();
        assert_eq!(r.status(), 403, "{blocked}");
    }
    let traversal = client
        .get(format!("{base}/api/dev-file/{encoded}/%2e%2e/outside.html"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert!(
        matches!(traversal.status().as_u16(), 400 | 403 | 404),
        "{}",
        traversal.status()
    );
    let outside = enc(&dir.join("outside.html"));
    let r = client
        .get(format!("{base}/api/dev-file/{outside}"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 403, "outside the project");
    let not_html = enc(&site.join("app.js"));
    let r = client
        .get(format!("{base}/api/dev-file/{not_html}"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 400);
    let r = client
        .get(format!("{base}/api/dev-file/!!!"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 400);

    // Token form: no bearer, resource-scoped, sandboxed.
    let preview = jait_gateway::security::preview_token::sign_preview_token(
        &user_id,
        &format!("file:{encoded}"),
        SECRET,
    )
    .unwrap();
    let r = client
        .get(format!("{base}/preview/{preview}/file/{encoded}"))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 200);
    assert!(
        r.headers()["content-security-policy"]
            .to_str()
            .unwrap()
            .starts_with("sandbox")
    );
    let body = r.text().await.unwrap();
    assert!(
        body.contains(&format!("/preview/{preview}/file/{encoded}/logo.png")),
        "{body}"
    );
    let r = client
        .get(format!("{base}/preview/{preview}/file/{encoded}/app.js"))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 200);
    // A token for another resource, or garbage, is rejected.
    let other =
        jait_gateway::security::preview_token::sign_preview_token(&user_id, "file:other", SECRET)
            .unwrap();
    let r = client
        .get(format!("{base}/preview/{other}/file/{encoded}"))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 401);
    let r = client
        .get(format!("{base}/preview/garbage/file/{encoded}"))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 401);

    stop.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(10), task)
        .await
        .unwrap()
        .unwrap();
    let _ = std::fs::remove_dir_all(dir);
}
