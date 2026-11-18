//! Immutable Vite asset cache. Explicit roots only; dynamic responses fall through.
use crate::runtime::blocking::BlockingLane;
use axum::{
    body::{Body, Bytes},
    extract::{Request, State},
    http::{HeaderMap, header},
    middleware::Next,
    response::Response,
};
use std::{
    collections::VecDeque,
    fs,
    io::Read,
    num::NonZeroU16,
    path::PathBuf,
    sync::{Arc, Mutex},
};
const MAX_FILE_BYTES: usize = 100 * 1024;
const MAX_CACHE_BYTES: usize = 16 * 1024 * 1024;
const MAX_ENTRIES: usize = 256;
#[derive(Default)]
struct Cache {
    entries: VecDeque<(String, Option<Bytes>)>,
    bytes: usize,
}
impl Cache {
    fn take(&mut self, name: &str) -> Option<Option<Bytes>> {
        let at = self.entries.iter().position(|(key, _)| key == name)?;
        let entry = self.entries.remove(at)?;
        if let Some(body) = &entry.1 {
            self.bytes -= body.len()
        }
        Some(entry.1)
    }
    fn remember(&mut self, name: String, body: Option<Bytes>) {
        self.take(&name);
        if let Some(body) = &body {
            self.bytes += body.len()
        }
        self.entries.push_back((name, body));
        while self.entries.len() > MAX_ENTRIES || self.bytes > MAX_CACHE_BYTES {
            if let Some((_, Some(body))) = self.entries.pop_front() {
                self.bytes -= body.len()
            }
        }
    }
    fn get(&mut self, name: &str) -> Option<Option<Bytes>> {
        let hit = self.take(name)?;
        self.remember(name.into(), hit.clone());
        Some(hit)
    }
}
#[derive(Clone)]
pub struct StaticAssetCache {
    root: Arc<PathBuf>,
    cache: Arc<Mutex<Cache>>,
    reads: BlockingLane,
}
pub struct CachedAsset {
    pub body: Bytes,
    pub content_type: &'static str,
}
fn asset(path: &str) -> Option<(&str, &'static str)> {
    let name = path.split('?').next()?.strip_prefix("/assets/")?;
    let (stem, extension) = name.rsplit_once('.')?;
    if !stem
        .bytes()
        .all(|c| c.is_ascii_alphanumeric() || b"_-".contains(&c))
        || !stem
            .bytes()
            .enumerate()
            .any(|(i, c)| c == b'-' && i > 0 && stem.len() - i > 8)
    {
        return None;
    }
    let content_type = match extension {
        "js" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "woff2" => "font/woff2",
        _ => return None,
    };
    Some((name, content_type))
}
fn read_asset(path: PathBuf) -> Option<Option<Bytes>> {
    let info = fs::symlink_metadata(&path).ok()?;
    if !info.is_file() {
        return None;
    }
    if info.len() > MAX_FILE_BYTES as u64 {
        return Some(None);
    }
    let file = fs::File::open(&path).ok()?;
    let opened = file.metadata().ok()?;
    if !opened.is_file() {
        return None;
    }
    // Reject a replacement between lstat and open before reading any bytes.
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if info.dev() != opened.dev() || info.ino() != opened.ino() {
            return None;
        }
    }
    // A growing file cannot cause an unbounded allocation after the size check.
    let mut body = Vec::with_capacity(MAX_FILE_BYTES.min(opened.len() as usize));
    file.take(MAX_FILE_BYTES as u64 + 1)
        .read_to_end(&mut body)
        .ok()?;
    if body.len() > MAX_FILE_BYTES {
        return None;
    }
    Some(Some(Bytes::from(body)))
}
impl StaticAssetCache {
    /// File I/O has independent bounded admission and never occupies an async worker.
    pub fn new(web_directory: PathBuf, reads: BlockingLane) -> Self {
        Self {
            root: Arc::new(web_directory),
            cache: Arc::new(Mutex::new(Cache::default())),
            reads,
        }
    }
    pub fn with_default_limits(web_directory: PathBuf) -> Self {
        Self::new(
            web_directory,
            BlockingLane::new(NonZeroU16::new(8).expect("fixed file parallelism")),
        )
    }
    pub async fn lookup(
        &self,
        method: &str,
        path: &str,
        headers: &HeaderMap,
    ) -> Option<CachedAsset> {
        if method != "GET"
            || [
                header::RANGE,
                header::IF_NONE_MATCH,
                header::IF_MODIFIED_SINCE,
            ]
            .iter()
            .any(|key| headers.get_all(key).iter().any(|v| !v.is_empty()))
        {
            return None;
        }
        let (name, content_type) = asset(path)?;
        let hit = { self.cache.lock().ok()?.get(name) };
        let body = match hit {
            Some(body) => body,
            None => {
                let path = self.root.join("assets").join(name);
                let read = self.reads.run(move || read_asset(path)).await.ok()??;
                self.cache.lock().ok()?.remember(name.into(), read.clone());
                read
            }
        }?;
        Some(CachedAsset { body, content_type })
    }
}
pub async fn serve(
    State(cache): State<StaticAssetCache>,
    request: Request,
    next: Next,
) -> Response {
    if let Some(asset) = cache
        .lookup(
            request.method().as_str(),
            &request.uri().to_string(),
            request.headers(),
        )
        .await
    {
        let mut response = Response::new(Body::from(asset.body));
        response.headers_mut().insert(
            header::CONTENT_TYPE,
            asset.content_type.parse().expect("static content type"),
        );
        response.headers_mut().insert(
            header::CACHE_CONTROL,
            "public, max-age=31536000, immutable"
                .parse()
                .expect("static cache policy"),
        );
        response
    } else {
        next.run(request).await
    }
}
