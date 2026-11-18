#[path = "../src/internal_driver.rs"]
mod internal_driver;
use axum::{Router, middleware};
use jait_gateway::{
    runtime::blocking::BlockingLane,
    services::static_asset_cache::{StaticAssetCache, serve},
};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    fs,
    num::NonZeroU16,
    path::{Path, PathBuf},
};
fn write(root: &Path, spec: &Value) -> std::io::Result<()> {
    let body = spec["content"]
        .as_str()
        .map(|v| v.as_bytes().to_vec())
        .unwrap_or_else(|| {
            vec![
                spec["byte"].as_u64().unwrap_or(120) as u8;
                spec["size"].as_u64().unwrap_or(0) as usize
            ]
        });
    fs::write(
        root.join("assets").join(spec["name"].as_str().unwrap()),
        body,
    )
}
async fn scenario(files: Vec<Value>, steps: Vec<Value>) -> Value {
    let project = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let artifacts = project.join(".jait/artifacts/gateway-rust/native-assets");
    fs::create_dir_all(&artifacts).unwrap();
    let driver = artifacts.join(format!("driver-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&driver).unwrap();
    let root = artifacts.join(format!("rust-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(root.join("assets")).unwrap();
    for spec in &files {
        write(&root, spec).unwrap()
    }
    let cache = StaticAssetCache::with_default_limits(root.clone());
    let router = Router::new()
        .fallback(|| async {
            (
                [(
                    axum::http::header::CONTENT_TYPE,
                    "text/plain; charset=utf-8",
                )],
                "fallback",
            )
        })
        .layer(middleware::from_fn_with_state(cache, serve));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let (shutdown, stop) = tokio::sync::oneshot::channel();
    let server = tokio::spawn(async move {
        axum::serve(listener, router)
            .with_graceful_shutdown(async {
                let _ = stop.await;
            })
            .await
            .unwrap()
    });
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap();
    let mut results = vec![];
    for step in &steps {
        let op = step["op"].as_str().unwrap_or("get");
        let name = step["name"].as_str().unwrap_or("");
        let side_effect = match op {
            "write" => Some(write(&root, step)),
            "remove" => {
                let path = root.join("assets").join(name);
                Some(if path.is_dir() {
                    fs::remove_dir_all(path)
                } else {
                    fs::remove_file(path)
                })
            }
            "directory" => Some(fs::create_dir(root.join("assets").join(name))),
            "symlink" => {
                fs::write(root.join("outside"), "outside secret").unwrap();
                #[cfg(unix)]
                {
                    Some(std::os::unix::fs::symlink(
                        root.join("outside"),
                        root.join("assets").join(name),
                    ))
                }
                #[cfg(not(unix))]
                {
                    Some(Err(std::io::Error::other("symlink test requires Unix")))
                }
            }
            _ => None,
        };
        if let Some(result) = side_effect {
            results.push(if result.is_ok() {
                json!({"ok":true})
            } else {
                json!({"error":true})
            });
            continue;
        }
        let method =
            reqwest::Method::from_bytes(step["method"].as_str().unwrap_or("GET").as_bytes())
                .unwrap();
        let mut request = client
            .request(
                method,
                format!("http://{address}{}", step["path"].as_str().unwrap()),
            )
            .header("connection", "close");
        if let Some(headers) = step["headers"].as_object() {
            for (key, value) in headers {
                request = request.header(key, value.as_str().unwrap());
            }
        }
        let response = request.send().await.unwrap();
        let status = response.status().as_u16();
        let headers = response.headers().clone();
        let body = response.bytes().await.unwrap();
        results.push(json!({"status":status,"size":body.len(),"sha256":hex::encode(Sha256::digest(&body)),"cacheControl":headers.get("cache-control").and_then(|v|v.to_str().ok()),"contentType":headers.get("content-type").and_then(|v|v.to_str().ok())}));
    }
    drop(client);
    let _ = shutdown.send(());
    server.await.unwrap();
    fs::remove_dir_all(root).unwrap();
    let expected = tokio::task::spawn_blocking(move || {
        internal_driver::call(
            &project,
            &driver,
            json!({"version":1,"calls":[{"op":"nativeassets.run","files":files,"steps":steps}]}),
            &|| false,
        )
        .unwrap()[0]
            .clone()
    })
    .await
    .unwrap();
    let actual = json!(results);
    assert_eq!(actual, expected);
    actual
}
#[tokio::test]
async fn exact_asset_names_types_querystrings_and_empty_bodies_match_real_http() {
    let mut files = vec![];
    let mut steps = vec![];
    for ext in ["js", "css", "svg", "png", "woff2"] {
        let name = format!("app-12345678.{ext}");
        files.push(json!({"name":name,"content":"asset 🦀"}));
        steps.push(json!({"path":format!("/assets/{name}?v=1")}));
    }
    files.push(json!({"name":"--12345678.js","content":"leading dash"}));
    steps.push(json!({"path":"/assets/--12345678.js"}));
    files.push(json!({"name":"empty-12345678.js","size":0}));
    steps.push(json!({"path":"/assets/empty-12345678.js"}));
    for name in [
        "x-1234567.js",
        "x-12345678.JS",
        "x-12345678.js.map",
        "bad.name-12345678.js",
        "x-12345678.html",
    ] {
        files.push(json!({"name":name,"content":"not cacheable"}));
        steps.push(json!({"path":format!("/assets/{name}")}));
    }
    steps.extend([
        json!({"path":"/assets/%2E%2E/outside"}),
        json!({"path":"/assets/app-12345678.js/extra"}),
        json!({"path":"/assets/app-12345678%2Ejs"}),
        json!({"path":"/ASSETS/app-12345678.js"}),
    ]);
    scenario(files, steps).await;
}
#[tokio::test]
async fn conditional_requests_ranges_and_non_get_methods_fall_through() {
    let files = vec![json!({"name":"app-12345678.js","content":"asset"})];
    let mut steps = vec![];
    for header in ["range", "if-none-match", "if-modified-since"] {
        for value in ["value", ""] {
            steps.push(json!({"path":"/assets/app-12345678.js","headers":{header:value}}));
        }
    }
    for method in ["HEAD", "POST", "PATCH", "DELETE"] {
        steps.push(json!({"path":"/assets/app-12345678.js","method":method}));
    }
    scenario(files, steps).await;
}
#[tokio::test]
async fn cache_hits_stay_immutable_and_missing_directory_and_symlink_results_are_not_cached() {
    scenario(
        vec![],
        vec![
            json!({"path":"/assets/missing-12345678.js"}),
            json!({"op":"write","name":"missing-12345678.js","content":"created"}),
            json!({"path":"/assets/missing-12345678.js"}),
            json!({"op":"write","name":"missing-12345678.js","content":"changed"}),
            json!({"path":"/assets/missing-12345678.js"}),
            json!({"op":"directory","name":"dir-12345678.js"}),
            json!({"path":"/assets/dir-12345678.js"}),
            json!({"op":"remove","name":"dir-12345678.js"}),
            json!({"op":"write","name":"dir-12345678.js","content":"file"}),
            json!({"path":"/assets/dir-12345678.js"}),
            json!({"op":"symlink","name":"link-12345678.js"}),
            json!({"path":"/assets/link-12345678.js"}),
            json!({"op":"remove","name":"link-12345678.js"}),
            json!({"op":"write","name":"link-12345678.js","content":"real file"}),
            json!({"path":"/assets/link-12345678.js"}),
        ],
    )
    .await;
}
#[tokio::test]
async fn file_size_limit_is_inclusive_and_oversized_negatives_are_cached() {
    scenario(
        vec![
            json!({"name":"exact-12345678.js","size":102400,"byte":255}),
            json!({"name":"large-12345678.js","size":102401}),
        ],
        vec![
            json!({"path":"/assets/exact-12345678.js"}),
            json!({"path":"/assets/large-12345678.js"}),
            json!({"op":"write","name":"large-12345678.js","content":"now small"}),
            json!({"path":"/assets/large-12345678.js"}),
        ],
    )
    .await;
}
#[tokio::test]
async fn least_recently_used_entry_limit_preserves_recent_hits() {
    let files = (0..257)
        .map(|i| json!({"name":format!("item-{i:08}.js"),"size":1}))
        .collect();
    let mut steps = (0..256)
        .map(|i| json!({"path":format!("/assets/item-{i:08}.js")}))
        .collect::<Vec<_>>();
    steps.extend([
        json!({"path":"/assets/item-00000000.js"}),
        json!({"path":"/assets/item-00000256.js"}),
        json!({"op":"write","name":"item-00000000.js","content":"changed zero"}),
        json!({"op":"write","name":"item-00000001.js","content":"changed one"}),
        json!({"path":"/assets/item-00000000.js"}),
        json!({"path":"/assets/item-00000001.js"}),
    ]);
    scenario(files, steps).await;
}
#[tokio::test]
async fn byte_budget_evicts_older_bodies_before_the_entry_limit() {
    let files = (0..170)
        .map(|i| json!({"name":format!("large-{i:08}.js"),"size":102400}))
        .collect();
    let mut steps = (0..170)
        .map(|i| json!({"path":format!("/assets/large-{i:08}.js")}))
        .collect::<Vec<_>>();
    steps.extend([
        json!({"op":"write","name":"large-00000000.js","content":"new"}),
        json!({"op":"write","name":"large-00000169.js","content":"new last"}),
        json!({"path":"/assets/large-00000000.js"}),
        json!({"path":"/assets/large-00000169.js"}),
    ]);
    scenario(files, steps).await;
}
#[tokio::test]
async fn closed_file_lane_falls_through_without_losing_already_cached_bodies() {
    let project = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let root = project
        .join(".jait/artifacts/gateway-rust/native-assets")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(root.join("assets")).unwrap();
    write(&root, &json!({"name":"app-12345678.js","content":"owned"})).unwrap();
    let lane = BlockingLane::new(NonZeroU16::new(1).unwrap());
    let cache = StaticAssetCache::new(root.clone(), lane.clone());
    let headers = axum::http::HeaderMap::new();
    assert!(
        cache
            .lookup("GET", "/assets/app-12345678.js", &headers)
            .await
            .is_some()
    );
    lane.close();
    assert!(
        cache
            .lookup("GET", "/assets/app-12345678.js", &headers)
            .await
            .is_some()
    );
    assert!(
        cache
            .lookup("GET", "/assets/other-12345678.js", &headers)
            .await
            .is_none()
    );
    fs::remove_dir_all(root).unwrap();
}
