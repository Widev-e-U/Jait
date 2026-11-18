//! Source-export comparisons; every DNS/HTTP action is an owned fixture.
#[path = "../src/internal_driver.rs"]
mod internal_driver;
use futures_util::{StreamExt, stream};
use jait_gateway::services::email::remote_images as images;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn reference(call: Value) -> Value {
    let root = root();
    let mut results = internal_driver::call(
        &root,
        &root.join(".jait/artifacts/gateway-rust/email-images"),
        json!({"version":1,"calls":[call]}),
        &|| false,
    )
    .expect("reference");
    results.as_array_mut().unwrap().remove(0)
}

async fn compare(mut call: Value) {
    call["op"] = json!("nativeemailimages.load");
    let expected = reference(call.clone());
    let dns_seen = Arc::new(Mutex::new(Vec::new()));
    let dns_calls = dns_seen.clone();
    let script = call.clone();
    let resolver: images::ImageResolver = Arc::new(move |host| {
        dns_calls.lock().unwrap().push(host);
        let script = script.clone();
        Box::pin(async move {
            if let Some(error) = script["dnsError"].as_str() {
                return Err(error.into());
            }
            Ok(script["addresses"]
                .as_array()
                .map(|a| a.iter().map(|v| v.as_str().unwrap().into()).collect())
                .unwrap_or_else(|| vec!["1.1.1.1".into()]))
        })
    });
    let request_seen = Arc::new(Mutex::new(Vec::new()));
    let requests = request_seen.clone();
    let script = call.clone();
    let transport: images::ImageTransport = Arc::new(move |request| {
        requests.lock().unwrap().push(request);
        let script = script.clone();
        Box::pin(async move {
            if let Some(error) = script["requestError"].as_str() {
                return Err(error.into());
            }
            let mut chunks: Vec<Result<Vec<u8>, String>> = script["byteChunks"]
                .as_array()
                .map(|a| {
                    a.iter()
                        .map(|v| {
                            Ok(v.as_array()
                                .unwrap()
                                .iter()
                                .map(|v| v.as_u64().unwrap() as u8)
                                .collect())
                        })
                        .collect()
                })
                .unwrap_or_else(|| {
                    vec![Ok(script["body"]
                        .as_str()
                        .unwrap_or("image-bytes")
                        .as_bytes()
                        .to_vec())]
                });
            if let Some(bytes) = script["repeatBytes"].as_u64() {
                chunks.push(Ok(vec![0; bytes as usize]));
            }
            if let Some(error) = script["bodyError"].as_str() {
                chunks = vec![Err(error.into())];
            }
            Ok(images::ImageResponse {
                status: script["status"].as_u64().unwrap_or(200) as u16,
                content_type: script["contentType"].as_str().unwrap_or("image/png").into(),
                body: stream::iter(chunks).boxed(),
            })
        })
    });
    let actual =
        images::load_mail_image_with(call["url"].as_str().unwrap(), &resolver, &transport).await;
    if expected["ok"] == true {
        let value = actual.expect("native image");
        let value = if call["summarize"] == true {
            json!({"length":value.len(),"sha256":hex::encode(Sha256::digest(value.as_bytes()))})
        } else {
            json!(value)
        };
        assert_eq!(value, expected["value"], "{call}");
    } else {
        assert_eq!(
            actual.expect_err("native rejection"),
            expected["error"],
            "{call}"
        );
    }
    let dns = dns_seen.lock().unwrap();
    let expected_dns = expected["resolves"].as_array().unwrap();
    assert_eq!(dns.len(), expected_dns.len());
    for (host, expected) in dns.iter().zip(expected_dns) {
        assert_eq!(host, expected["hostname"].as_str().unwrap());
        assert_eq!(expected["options"], json!({"all":true}));
    }
    let requests = request_seen.lock().unwrap();
    let expected_requests = expected["requests"].as_array().unwrap();
    assert_eq!(requests.len(), expected_requests.len());
    for (actual, expected) in requests.iter().zip(expected_requests) {
        let headers: serde_json::Map<String, Value> = actual
            .headers
            .iter()
            .map(|(k, v)| (k.clone(), json!(v)))
            .collect();
        assert_eq!(
            json!({"hostname":actual.hostname,"servername":actual.servername,"port":actual.port,"path":actual.path,"method":actual.method,"headers":headers,"rejectUnauthorized":actual.reject_unauthorized}),
            *expected
        );
    }
    assert!(!expected.to_string().contains("Cookie"));
    assert!(!expected.to_string().contains("Authorization"));
}

#[tokio::test]
async fn valid_images_preserve_url_pinning_headers_types_and_bytes() {
    for url in [
        "https://images.example.com/banner.png?size=2#fragment",
        "https://images.example.com:443/a",
        "https://例え.テスト/画像?q=😀",
        "https://images.example.com/a/../b",
        "https://images.example.com/?",
    ] {
        compare(json!({"url":url,"byteChunks":[[0,1,255],[128,129]]})).await;
    }
    for content_type in [
        "image/png",
        "image/jpeg",
        "image/gif",
        "image/webp",
        "image/avif",
        "IMAGE/PNG;charset=utf-8",
    ] {
        compare(json!({"url":"https://images.example.com", "contentType":content_type,"body":""}))
            .await;
    }
    compare(
        json!({"url":"https://images.example.com", "addresses":["2606:4700:4700::1111","1.1.1.1"]}),
    )
    .await;
}

#[tokio::test]
async fn url_and_dns_scope_escapes_are_rejected_before_transport() {
    for url in [
        "http://images.example.com/a",
        "https://user:secret@images.example.com",
        "https://images.example.com:8443/a",
        "file:///etc/passwd",
        "https://127.0.0.1/a",
        "https://2130706433/a",
        "https://0x7f000001/a",
        "https://localhost/a",
        "https://[::1]/a",
    ] {
        compare(json!({"url":url})).await;
    }
    compare(json!({"url":format!("https://images.example.com/{}", "x".repeat(4097))})).await;
    for addresses in [
        vec![],
        vec!["1.1.1.1", "10.0.0.1"],
        vec!["1.1.1.1", "::ffff:127.0.0.1"],
        vec!["1.1.1.1", "169.254.169.254"],
        vec!["1.1.1.1", "fd00::1"],
        vec!["1.1.1.1", "2001:db8::1"],
    ] {
        compare(json!({"url":"https://images.example.com", "addresses":addresses})).await;
    }
    compare(json!({"url":"https://images.example.com", "dnsError":"fixture DNS error"})).await;
}

#[tokio::test]
async fn statuses_mime_size_and_transport_failures_match_the_reference() {
    for status in [201, 204, 301, 302, 307, 401, 404, 500] {
        compare(json!({"url":"https://images.example.com/a", "status":status})).await;
    }
    for content_type in [
        "image/svg+xml",
        "text/html",
        "",
        "image/png ",
        " image/png",
        "image/jpg",
    ] {
        compare(json!({"url":"https://images.example.com", "contentType":content_type})).await;
    }
    compare(json!({"url":"https://images.example.com", "requestError":"fixture transport error"}))
        .await;
    compare(json!({"url":"https://images.example.com", "bodyError":"fixture body error"})).await;
    // Summarize the exact-cap data URL to stay below the reference bridge output ceiling.
    compare(json!({"url":"https://images.example.com", "body":"", "repeatBytes":1048576,"summarize":true})).await;
    // Empty first chunk then exactly the cap versus one byte beyond it.
    compare(json!({"url":"https://images.example.com", "body":"", "repeatBytes":1048577})).await;
}

#[tokio::test(start_paused = true)]
async fn dns_and_request_deadlines_have_reference_values_and_expire() {
    let expected = reference(
        json!({"op":"nativeemailimages.load", "url":"https://images.example.com", "dnsHang":true}),
    );
    assert_eq!(expected["error"], "Mail server DNS timed out");
    assert_eq!(expected["timers"], json!([8000]));
    let pending: images::ImageResolver = Arc::new(|_| Box::pin(std::future::pending()));
    let unused: images::ImageTransport = Arc::new(|_| panic!("no HTTP before DNS"));
    let start = tokio::time::Instant::now();
    assert_eq!(
        images::load_mail_image_with("https://images.example.com", &pending, &unused)
            .await
            .unwrap_err(),
        expected["error"]
    );
    assert_eq!(
        start.elapsed(),
        std::time::Duration::from_millis(images::DNS_TIMEOUT_MS)
    );
    let expected = reference(
        json!({"op":"nativeemailimages.load", "url":"https://images.example.com", "requestHang":true}),
    );
    assert_eq!(expected["error"], "Image request timed out");
    assert_eq!(expected["timers"], json!([8000, 6000]));
    let dns: images::ImageResolver = Arc::new(|_| Box::pin(async { Ok(vec!["1.1.1.1".into()]) }));
    let pending: images::ImageTransport = Arc::new(|_| Box::pin(std::future::pending()));
    let start = tokio::time::Instant::now();
    assert_eq!(
        images::load_mail_image_with("https://images.example.com", &dns, &pending)
            .await
            .unwrap_err(),
        expected["error"]
    );
    assert_eq!(
        start.elapsed(),
        std::time::Duration::from_millis(images::REQUEST_TIMEOUT_MS)
    );
}

#[tokio::test(start_paused = true)]
async fn the_absolute_request_deadline_also_bounds_a_stalled_body() {
    let dns: images::ImageResolver = Arc::new(|_| Box::pin(async { Ok(vec!["1.1.1.1".into()]) }));
    let body: images::ImageTransport = Arc::new(|_| {
        Box::pin(async {
            Ok(images::ImageResponse {
                status: 200,
                content_type: "image/png".into(),
                body: stream::pending().boxed(),
            })
        })
    });
    let start = tokio::time::Instant::now();
    assert_eq!(
        images::load_mail_image_with("https://images.example.com", &dns, &body)
            .await
            .unwrap_err(),
        "Image request timed out"
    );
    assert_eq!(start.elapsed(), std::time::Duration::from_millis(6000));
}

#[tokio::test]
async fn abandoning_the_caller_drops_the_upstream_body() {
    use std::{
        pin::Pin,
        sync::atomic::{AtomicBool, Ordering},
        task::{Context, Poll},
    };
    struct PendingBody(Arc<AtomicBool>);
    impl futures_util::Stream for PendingBody {
        type Item = Result<Vec<u8>, String>;
        fn poll_next(self: Pin<&mut Self>, _cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
            Poll::Pending
        }
    }
    impl Drop for PendingBody {
        fn drop(&mut self) {
            self.0.store(true, Ordering::SeqCst);
        }
    }
    let dropped = Arc::new(AtomicBool::new(false));
    let started = Arc::new(tokio::sync::Notify::new());
    let dns: images::ImageResolver = Arc::new(|_| Box::pin(async { Ok(vec!["1.1.1.1".into()]) }));
    let flag = dropped.clone();
    let notice = started.clone();
    let transport: images::ImageTransport = Arc::new(move |_| {
        let flag = flag.clone();
        let notice = notice.clone();
        Box::pin(async move {
            notice.notify_one();
            Ok(images::ImageResponse {
                status: 200,
                content_type: "image/png".into(),
                body: PendingBody(flag).boxed(),
            })
        })
    });
    let task = tokio::spawn(async move {
        images::load_mail_image_with("https://images.example.com", &dns, &transport).await
    });
    tokio::time::timeout(std::time::Duration::from_secs(1), started.notified())
        .await
        .expect("body started");
    task.abort();
    assert!(task.await.unwrap_err().is_cancelled());
    assert!(dropped.load(Ordering::SeqCst));
}

#[tokio::test]
async fn the_native_transport_rejects_unsafe_typed_requests_before_io() {
    let base = images::ImageRequest {
        hostname: "1.1.1.1".into(),
        servername: "images.example.com".into(),
        port: 443,
        path: "/asset".into(),
        method: "GET",
        reject_unauthorized: true,
        headers: vec![
            ("Host".into(), "images.example.com".into()),
            ("Accept".into(), images::IMAGE_ACCEPT.into()),
        ],
    };
    let transport = images::native_transport();
    for case in 0..8 {
        let mut request = base.clone();
        match case {
            0 => request.hostname = "127.0.0.1".into(),
            1 => request.hostname = "mail.example.com".into(),
            2 => request.reject_unauthorized = false,
            3 => request.port = 8443,
            4 => request.method = "POST",
            5 => request.servername = "user:password@images.example.com".into(),
            6 => request.path = "https://other.example.com/".into(),
            7 => request
                .headers
                .push(("Authorization".into(), "Bearer synthetic".into())),
            _ => unreachable!(),
        }
        assert!(
            transport(request).await.is_err(),
            "case {case} must fail before any network I/O"
        );
    }
}

#[tokio::test]
async fn rejected_responses_are_dropped_without_reading_their_body() {
    use std::sync::atomic::{AtomicUsize, Ordering};
    let dns: images::ImageResolver = Arc::new(|_| Box::pin(async { Ok(vec!["1.1.1.1".into()]) }));
    for (status, content_type) in [(302, "image/png"), (200, "image/svg+xml")] {
        let polled = Arc::new(AtomicUsize::new(0));
        let polls = polled.clone();
        let transport: images::ImageTransport = Arc::new(move |_| {
            let polls = polls.clone();
            Box::pin(async move {
                Ok(images::ImageResponse {
                    status,
                    content_type: content_type.into(),
                    body: stream::poll_fn(move |_| {
                        polls.fetch_add(1, Ordering::SeqCst);
                        std::task::Poll::Ready(None)
                    })
                    .boxed(),
                })
            })
        });
        assert_eq!(
            images::load_mail_image_with("https://images.example.com", &dns, &transport)
                .await
                .unwrap_err(),
            "Image unavailable"
        );
        assert_eq!(polled.load(Ordering::SeqCst), 0);
    }
}
