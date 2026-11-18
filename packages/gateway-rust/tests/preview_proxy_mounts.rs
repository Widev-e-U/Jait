//! Black-box checks for `/api/dev-proxy/*`, `/preview/{token}/proxy/*` and `POST /api/preview/access`.
use jait_gateway::config::GatewayConfig;
use jait_gateway::runtime::application::{Application, ApplicationConfig};
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

const SECRET: &str = "preview-proxy-secret";

/// Minimal upstream dev server: answers per path and echoes request heads on `/echo`.
async fn upstream() -> u16 {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    tokio::spawn(async move {
        loop {
            let Ok((mut socket, _)) = listener.accept().await else {
                return;
            };
            tokio::spawn(async move {
                let mut buf = vec![0u8; 8192];
                let n = socket.read(&mut buf).await.unwrap_or(0);
                let head = String::from_utf8_lossy(&buf[..n]).to_string();
                let target = head.split_whitespace().nth(1).unwrap_or("/");
                let path = target.split('?').next().unwrap_or("/").to_owned();
                let (status, extra, ctype, body) = match path.as_str() {
                    "/" => (
                        "200 OK",
                        "",
                        "text/html; charset=utf-8",
                        r#"<html><head></head><body><img src="/x.png"></body></html>"#.to_owned(),
                    ),
                    "/echo" => ("200 OK", "Set-Cookie: leak=1\r\n", "text/plain", head),
                    "/redir" => (
                        "302 Found",
                        "Location: /dest?a=1\r\n",
                        "text/plain",
                        String::new(),
                    ),
                    "/app.js" => ("200 OK", "", "text/html", "<html></html>".to_owned()),
                    _ => ("404 Not Found", "", "text/plain", "nope".to_owned()),
                };
                let response = format!(
                    "HTTP/1.1 {status}\r\n{extra}Content-Type: {ctype}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                );
                let _ = socket.write_all(response.as_bytes()).await;
            });
        }
    });
    port
}

#[tokio::test]
async fn dev_proxy_only_reaches_ports_registered_to_the_caller() {
    let dir = std::env::temp_dir().join(format!("jait-proxy-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
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
    let ports = app.preview_ports();
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
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap();
    let registered: serde_json::Value = client
        .post(format!("{base}/api/auth/register"))
        .json(&serde_json::json!({"username":"proxyer","password":"correct-horse-1"}))
        .timeout(Duration::from_secs(60))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let token = registered["access_token"].as_str().unwrap().to_owned();
    let user_id = registered["user"]["id"].as_str().unwrap().to_owned();
    let port = upstream().await;

    assert_eq!(
        client
            .get(format!("{base}/api/dev-proxy/{port}/"))
            .send()
            .await
            .unwrap()
            .status(),
        401,
        "anonymous"
    );
    assert_eq!(
        client
            .get(format!("{base}/api/dev-proxy/0"))
            .send()
            .await
            .unwrap()
            .status(),
        400,
        "invalid port"
    );
    let r = client
        .get(format!("{base}/api/dev-proxy/{port}/"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 403, "unregistered port");
    assert_eq!(
        r.json::<serde_json::Value>().await.unwrap()["error"],
        "PREVIEW_NOT_REGISTERED"
    );
    // A port registered to somebody else is not reachable either.
    ports.register("someone-else", port);
    assert_eq!(
        client
            .get(format!("{base}/api/dev-proxy/{port}/"))
            .bearer_auth(&token)
            .send()
            .await
            .unwrap()
            .status(),
        403
    );

    ports.register(&user_id, port);
    let page = client
        .get(format!("{base}/api/dev-proxy/{port}"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(page.status(), 200);
    assert_eq!(page.headers()["cache-control"], "no-store");
    assert!(page.headers().get("content-security-policy").is_none());
    let body = page.text().await.unwrap();
    assert!(
        body.contains(&format!(r#"src="/api/dev-proxy/{port}/x.png""#)),
        "{body}"
    );

    let echo = client
        .get(format!("{base}/api/dev-proxy/{port}/echo?q=1"))
        .bearer_auth(&token)
        .header("cookie", "session=top-secret")
        .header("x-keep", "yes")
        .send()
        .await
        .unwrap();
    assert!(
        echo.headers().get("set-cookie").is_none(),
        "upstream cookies are dropped"
    );
    let seen = echo.text().await.unwrap().to_lowercase();
    assert!(seen.contains("get /echo?q=1"), "{seen}");
    assert!(seen.contains("x-keep: yes"), "{seen}");
    assert!(
        !seen.contains("top-secret") && !seen.contains(&token.to_lowercase()),
        "{seen}"
    );

    let redirect = client
        .get(format!("{base}/api/dev-proxy/{port}/redir"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(redirect.status(), 302);
    assert_eq!(
        redirect.headers()["location"],
        format!("/api/dev-proxy/{port}/dest?a=1")
    );
    let module = client
        .get(format!("{base}/api/dev-proxy/{port}/app.js"))
        .bearer_auth(&token)
        .send()
        .await
        .unwrap();
    assert_eq!(module.status(), 502);
    assert_eq!(
        module.json::<serde_json::Value>().await.unwrap()["error"],
        "DEV_PROXY_MODULE_FALLBACK"
    );

    // Token exchange.
    let access = |source: &str| {
        client
            .post(format!("{base}/api/preview/access"))
            .bearer_auth(&token)
            .json(&serde_json::json!({ "source": source }))
            .send()
    };
    let granted: serde_json::Value = access(&format!("/api/dev-proxy/{port}/?x=1"))
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let url = granted["url"].as_str().unwrap().to_owned();
    assert!(url.starts_with(&format!("{base}/preview/")), "{url}");
    assert!(url.ends_with(&format!("/proxy/{port}/?x=1")), "{url}");
    let shared = client.get(&url).send().await.unwrap();
    assert_eq!(shared.status(), 200, "token form needs no bearer");
    assert!(
        shared.headers()["content-security-policy"]
            .to_str()
            .unwrap()
            .starts_with("sandbox")
    );
    let shared_body = shared.text().await.unwrap();
    assert!(
        shared_body.contains("/proxy/") && shared_body.contains("/x.png"),
        "{shared_body}"
    );
    assert_eq!(
        access("http://evil.example/api/dev-proxy/1/")
            .await
            .unwrap()
            .status(),
        400
    );
    assert_eq!(access("/api/other").await.unwrap().status(), 400);
    assert_eq!(
        access("/api/dev-proxy/65000/").await.unwrap().status(),
        404,
        "unregistered"
    );
    let missing = client
        .post(format!("{base}/api/preview/access"))
        .bearer_auth(&token)
        .json(&serde_json::json!({}))
        .send()
        .await
        .unwrap();
    assert_eq!(missing.status(), 400);
    // A token for another port, or garbage, is rejected.
    let wrong =
        jait_gateway::security::preview_token::sign_preview_token(&user_id, "proxy:1", SECRET)
            .unwrap();
    assert_eq!(
        client
            .get(format!("{base}/preview/{wrong}/proxy/{port}/"))
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
    assert_eq!(
        client
            .get(format!("{base}/preview/garbage/proxy/{port}/"))
            .send()
            .await
            .unwrap()
            .status(),
        401
    );

    ports.unregister(&user_id, port);
    assert_eq!(
        client.get(&url).send().await.unwrap().status(),
        403,
        "stopped preview"
    );

    stop.send(()).unwrap();
    tokio::time::timeout(Duration::from_secs(10), task)
        .await
        .unwrap()
        .unwrap();
    let _ = std::fs::remove_dir_all(dir);
}
