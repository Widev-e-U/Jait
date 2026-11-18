//! Public HTTPS mail images: validate all DNS results and pin TLS connections.
use crate::security::ssrf_guard::SsrfGuard;
use base64::{Engine, engine::general_purpose::STANDARD};
use futures_util::{StreamExt, future::BoxFuture, stream::BoxStream};
use std::{
    net::{IpAddr, SocketAddr},
    sync::Arc,
    time::Duration,
};
use url::Url;

pub const MAX_IMAGE_BYTES: usize = 1024 * 1024;
pub const MAX_URL_UNITS: usize = 4096;
pub const DNS_TIMEOUT_MS: u64 = 8000;
pub const REQUEST_TIMEOUT_MS: u64 = 6000;
pub const IMAGE_ACCEPT: &str = "image/png,image/jpeg,image/gif,image/webp,image/avif";
const IMAGE_TYPES: [&str; 5] = [
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "image/avif",
];

/// One resolution per image; every returned address must pass the outbound guard.
pub type ImageResolver =
    Arc<dyn Fn(String) -> BoxFuture<'static, Result<Vec<String>, String>> + Send + Sync>;
pub type ImageTransport =
    Arc<dyn Fn(ImageRequest) -> BoxFuture<'static, Result<ImageResponse, String>> + Send + Sync>;

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
pub struct ImageRequest {
    pub hostname: String,
    pub servername: String,
    pub port: u16,
    pub path: String,
    pub method: &'static str,
    pub headers: Vec<(String, String)>,
    pub reject_unauthorized: bool,
}

pub struct ImageResponse {
    pub status: u16,
    pub content_type: String,
    pub body: BoxStream<'static, Result<Vec<u8>, String>>,
}

pub fn native_resolver() -> ImageResolver {
    Arc::new(|host| {
        Box::pin(async move {
            tokio::net::lookup_host((host.as_str(), 443))
                .await
                .map(|addresses| addresses.map(|a| a.ip().to_string()).collect())
                .map_err(|error| error.to_string())
        })
    })
}

/// Keep the URL host for SNI/certificate validation; override DNS with the checked IP.
/// A fresh client has no cross-request credential/cookie state and ignores proxy envs.
pub fn native_transport() -> ImageTransport {
    Arc::new(|request| {
        Box::pin(async move {
            let ip: IpAddr = request
                .hostname
                .parse()
                .map_err(|_| "Invalid pinned image address".to_string())?;
            if request.port != 443 || !request.reject_unauthorized || request.method != "GET" {
                return Err("Unsupported image request".into());
            }
            let guard = SsrfGuard::default();
            guard.validate(&guard_url(&request.hostname))?;
            let url = Url::parse(&format!("https://{}{}", request.servername, request.path))
                .map_err(|_| "Invalid image request URL".to_string())?;
            guard.validate(url.as_str())?;
            if url.host_str() != Some(request.servername.as_str())
                || url.port().is_some()
                || !url.username().is_empty()
                || url.password().is_some()
                || !request.path.starts_with('/')
                || request.headers
                    != vec![
                        ("Host".into(), request.servername.clone()),
                        ("Accept".into(), IMAGE_ACCEPT.into()),
                    ]
            {
                return Err("Unsupported image request".into());
            }
            if let Ok(origin_ip) = request
                .servername
                .trim_matches(['[', ']'])
                .parse::<IpAddr>()
                && origin_ip != ip
            {
                return Err("Invalid pinned image address".into());
            }
            let client = reqwest::Client::builder()
                .no_proxy()
                .redirect(reqwest::redirect::Policy::none())
                .gzip(false)
                .brotli(false)
                .deflate(false)
                .zstd(false)
                .resolve(
                    request.servername.trim_matches(['[', ']']),
                    SocketAddr::new(ip, 443),
                )
                .build()
                .map_err(|error| error.to_string())?;
            let mut builder = client
                .get(url)
                .timeout(Duration::from_millis(REQUEST_TIMEOUT_MS));
            for (name, value) in request.headers {
                builder = builder.header(name, value);
            }
            let response = builder.send().await.map_err(|error| error.to_string())?;
            let status = response.status().as_u16();
            let content_type = response
                .headers()
                .get(reqwest::header::CONTENT_TYPE)
                .and_then(|value| value.to_str().ok())
                .unwrap_or("")
                .to_string();
            let body = futures_util::stream::try_unfold(response, |mut response| async move {
                response
                    .chunk()
                    .await
                    .map(|chunk| chunk.map(|chunk| (chunk.to_vec(), response)))
                    .map_err(|error| error.to_string())
            })
            .boxed();
            Ok(ImageResponse {
                status,
                content_type,
                body,
            })
        })
    })
}

fn guard_url(host: &str) -> String {
    if host.parse::<std::net::Ipv6Addr>().is_ok() {
        format!("https://[{host}]/")
    } else {
        format!("https://{host}/")
    }
}

pub async fn load_mail_image(raw: &str) -> Result<String, String> {
    load_mail_image_with(raw, &native_resolver(), &native_transport()).await
}

/// Typed injection is for fixture-owned resolvers/transports, never untrusted arguments.
pub async fn load_mail_image_with(
    raw: &str,
    resolver: &ImageResolver,
    transport: &ImageTransport,
) -> Result<String, String> {
    let url = Url::parse(raw).map_err(|_| "Invalid URL".to_string())?;
    if url.scheme() != "https"
        || url.port().is_some_and(|p| p != 443)
        || !url.username().is_empty()
        || url.password().is_some()
        || raw.encode_utf16().count() > MAX_URL_UNITS
    {
        return Err("Unsupported image URL".into());
    }
    let host = url.host_str().ok_or("Invalid URL")?.to_string();
    let guard = SsrfGuard::default();
    guard.validate(&guard_url(&host))?;
    let addresses = tokio::time::timeout(
        Duration::from_millis(DNS_TIMEOUT_MS),
        resolver(host.clone()),
    )
    .await
    .map_err(|_| "Mail server DNS timed out".to_string())??;
    if addresses.is_empty() {
        return Err("Mail server did not resolve".into());
    }
    for address in &addresses {
        guard.validate(&guard_url(address))?;
        // DNS engines return literal addresses; reject malformed injected resolver results.
        if address.parse::<IpAddr>().is_err() {
            return Err("Invalid pinned image address".into());
        }
    }
    let path = match url.query() {
        Some(query) if !query.is_empty() => format!("{}?{query}", url.path()),
        _ => url.path().into(),
    };
    let host_header = match url.port() {
        Some(port) => format!("{host}:{port}"),
        None => host.clone(),
    };
    let request = ImageRequest {
        hostname: addresses[0].clone(),
        servername: host,
        port: 443,
        path,
        method: "GET",
        headers: vec![
            ("Host".into(), host_header),
            ("Accept".into(), IMAGE_ACCEPT.into()),
        ],
        reject_unauthorized: true,
    };
    tokio::time::timeout(Duration::from_millis(REQUEST_TIMEOUT_MS), async move {
        let mut response = transport(request).await?;
        let content_type = response
            .content_type
            .split(';')
            .next()
            .unwrap_or("")
            .to_ascii_lowercase();
        if response.status != 200 || !IMAGE_TYPES.contains(&content_type.as_str()) {
            return Err("Image unavailable".into());
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response.body.next().await {
            let chunk = chunk?;
            if chunk.len() > MAX_IMAGE_BYTES.saturating_sub(bytes.len()) {
                return Err("Image too large".into());
            }
            bytes.extend_from_slice(&chunk);
        }
        Ok(format!(
            "data:{content_type};base64,{}",
            STANDARD.encode(bytes)
        ))
    })
    .await
    .map_err(|_| "Image request timed out".to_string())?
}
