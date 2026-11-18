//! Static web UI serving on the gateway port, matching the Node gateway: files are served
//! from the built directory and any other non-API GET falls back to `index.html`.
use axum::{
    Router,
    body::Body,
    http::{Method, Request, StatusCode, header},
    response::{IntoResponse, Response},
};
use std::{convert::Infallible, path::Path};
use tower::service_fn;
use tower_http::services::{ServeDir, ServeFile};

fn is_api_path(path: &str) -> bool {
    ["/api", "/health", "/ws"]
        .iter()
        .any(|p| path == *p || path.strip_prefix(p).is_some_and(|r| r.starts_with('/')))
}

/// A fallback service for the composed router. API, health and WebSocket paths that no
/// route claimed stay JSON 404s instead of receiving the SPA shell.
pub fn service(root: &Path) -> Router {
    let index = root.join("index.html");
    let files = ServeDir::new(root).append_index_html_on_directories(true);
    let spa = ServeFile::new(index);
    let handler = service_fn(move |request: Request<Body>| {
        let mut files = files.clone();
        let mut spa = spa.clone();
        async move {
            let path = request.uri().path().to_owned();
            let method = request.method().clone();
            if is_api_path(&path) || !matches!(method, Method::GET | Method::HEAD) {
                return Ok::<Response, Infallible>(not_found());
            }
            use tower::Service;
            let response = files.call(request).await.unwrap().into_response();
            if response.status() != StatusCode::NOT_FOUND {
                return Ok(response);
            }
            let fallback = Request::builder()
                .method(method)
                .uri("/")
                .body(Body::empty())
                .unwrap();
            Ok(spa.call(fallback).await.unwrap().into_response())
        }
    });
    Router::new().fallback_service(handler)
}

fn not_found() -> Response {
    (
        StatusCode::NOT_FOUND,
        [(header::CONTENT_TYPE, "application/json")],
        r#"{"error":"Not Found"}"#,
    )
        .into_response()
}
