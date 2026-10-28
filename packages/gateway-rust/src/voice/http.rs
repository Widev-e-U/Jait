//! Scoped STT HTTP effects. Exact endpoints, credentials and pinned addresses
//! are granted by trusted host configuration/consent, never by model arguments.
use super::{ScopedTranscriptionHttp, TranscriptionRequest, VoiceFuture};
use crate::security::ssrf_guard::SsrfGuard;
use reqwest::{
    Client,
    header::{CONTENT_TYPE, HeaderMap, HeaderName, HeaderValue},
};
use serde_json::Value;
use std::{
    collections::HashSet,
    net::{IpAddr, SocketAddr},
    sync::Arc,
    time::{Duration, SystemTime},
};
use tokio::sync::Semaphore;
use url::Url;
const MAX_RESPONSE: usize = 256 * 1024;
const MAX_AUDIO: usize = 16 * 1024 * 1024;
const MAX_BODY: usize = MAX_AUDIO + 128 * 1024;
const SPEECH_CONTENT: &str =
    "language=de, format=wav, codec=pcm, bit_rate=16, sample_rate=16000, channel=1";
pub enum Credential {
    None,
    Bearer(String),
    ElevenLabs(String),
}
/// Exact approved destination and execution authority, supplied by trusted
/// composition. Private addresses require explicit consent/configuration
/// authority; reachability and private address space confer no authority.
pub struct DestinationGrant {
    endpoint: Url,
    addresses: Vec<SocketAddr>,
    credential: Credential,
    expires_at: SystemTime,
    vantage: String,
}
impl DestinationGrant {
    pub fn configured(
        endpoint: &str,
        approved_addresses: Vec<IpAddr>,
        credential: Credential,
        expires_at: SystemTime,
        vantage: String,
        private_authorized: bool,
    ) -> Result<Self, String> {
        if endpoint.len() > 8192
            || approved_addresses.is_empty()
            || approved_addresses.len() > 16
            || vantage.is_empty()
            || vantage.len() > 256
        {
            return Err("Invalid STT destination grant".into());
        }
        let endpoint = SsrfGuard {
            allow_private_hosts: private_authorized,
            allowed_hosts: vec![],
        }
        .validate(endpoint)
        .map_err(|_| "STT endpoint blocked")?;
        if !endpoint.username().is_empty()
            || endpoint.password().is_some()
            || endpoint.fragment().is_some()
            || endpoint.query().is_some()
        {
            return Err("STT endpoint cannot contain credentials, query or fragment".into());
        }
        let hostname = endpoint
            .host_str()
            .ok_or("STT endpoint requires hostname")?
            .trim_matches(['[', ']']);
        if let Ok(literal) = hostname.parse::<IpAddr>()
            && approved_addresses.iter().any(|ip| *ip != literal)
        {
            return Err("STT literal address differs from pin".into());
        }
        if approved_addresses
            .iter()
            .any(|ip| ip.is_unspecified() || ip.is_multicast())
        {
            return Err("STT pin must identify a unicast host".into());
        }
        if !private_authorized {
            for ip in &approved_addresses {
                let origin = match ip {
                    IpAddr::V4(ip) => format!("http://{ip}/"),
                    IpAddr::V6(ip) => format!("http://[{ip}]/"),
                };
                SsrfGuard::default()
                    .validate(&origin)
                    .map_err(|_| "STT resolved address blocked")?;
            }
        }
        if SystemTime::now() >= expires_at {
            return Err("STT destination grant expired".into());
        }
        let port = endpoint
            .port_or_known_default()
            .filter(|port| *port > 0)
            .ok_or("Invalid STT destination port")?;
        let addresses = approved_addresses
            .into_iter()
            .map(|ip| SocketAddr::new(ip, port))
            .collect();
        let grant = Self {
            endpoint,
            addresses,
            credential,
            expires_at,
            vantage,
        };
        grant.credential_header()?;
        Ok(grant)
    }
    fn credential_header(&self) -> Result<Option<(HeaderName, HeaderValue)>, String> {
        let (name, secret) = match &self.credential {
            Credential::None => return Ok(None),
            Credential::Bearer(key) => (reqwest::header::AUTHORIZATION, format!("Bearer {key}")),
            Credential::ElevenLabs(key) => (HeaderName::from_static("xi-api-key"), key.clone()),
        };
        if secret.len() > 64 * 1024 {
            return Err("STT credential too large".into());
        }
        let mut value = HeaderValue::from_str(&secret).map_err(|_| "Invalid STT credential")?;
        value.set_sensitive(true);
        Ok(Some((name, value)))
    }
}
struct Target {
    grant: DestinationGrant,
    client: Client,
}
/// Each adapter owns <= 8 endpoint pools, <= 16 concurrent effects and no waiting
/// admission queue. Dropping post drops the reqwest operation/response stream.
pub struct ConfiguredSttHttp {
    targets: Vec<Target>,
    capacity: Arc<Semaphore>,
}
impl ConfiguredSttHttp {
    pub fn new(grants: Vec<DestinationGrant>, concurrency: usize) -> Result<Self, String> {
        if grants.is_empty() || grants.len() > 8 || !(1..=16).contains(&concurrency) {
            return Err("Invalid STT HTTP capacity".into());
        }
        let mut seen = HashSet::new();
        let mut targets = vec![];
        for grant in grants {
            if !seen.insert(grant.endpoint.as_str().to_owned()) {
                return Err("Duplicate STT endpoint grant".into());
            }
            let hostname = grant
                .endpoint
                .host_str()
                .ok_or("Invalid STT hostname")?
                .trim_matches(['[', ']']);
            let client = Client::builder()
                .no_proxy()
                .redirect(reqwest::redirect::Policy::none())
                .connect_timeout(Duration::from_secs(3))
                .timeout(Duration::from_secs(30))
                .pool_max_idle_per_host(2)
                .no_gzip()
                .no_brotli()
                .no_deflate()
                .no_zstd()
                .resolve_to_addrs(hostname, &grant.addresses)
                .build()
                .map_err(|_| "STT HTTP client initialization failed")?;
            targets.push(Target { grant, client });
        }
        Ok(Self {
            targets,
            capacity: Arc::new(Semaphore::new(concurrency)),
        })
    }
    async fn send(&self, request: TranscriptionRequest) -> Result<Option<Value>, String> {
        let _permit = self
            .capacity
            .try_acquire()
            .map_err(|_| "STT HTTP capacity reached")?;
        let url = Url::parse(&request.url).map_err(|_| "Invalid STT request endpoint")?;
        let target = self
            .targets
            .iter()
            .find(|t| t.grant.endpoint == url)
            .ok_or("STT endpoint has no destination grant")?;
        if SystemTime::now() >= target.grant.expires_at {
            return Err("STT destination grant expired".into());
        }
        let _vantage = &target.grant.vantage;
        let headers = validated_headers(&request, &target.grant)?;
        let (body, content_type) =
            encode_body(&request, &format!("jait-{}", uuid::Uuid::new_v4()))?;
        let remaining = target
            .grant
            .expires_at
            .duration_since(SystemTime::now())
            .map_err(|_| "STT destination grant expired")?;
        tokio::time::timeout(remaining.min(Duration::from_secs(30)), async {
            let mut response = target
                .client
                .post(target.grant.endpoint.clone())
                .headers(headers)
                .header(CONTENT_TYPE, content_type)
                .body(body)
                .send()
                .await
                .map_err(|_| "STT HTTP request failed")?;
            if !response.status().is_success() {
                return Ok(None);
            }
            if response
                .content_length()
                .is_some_and(|n| n > MAX_RESPONSE as u64)
            {
                return Err("STT response too large".into());
            }
            let mut body = Vec::new();
            while let Some(chunk) = response
                .chunk()
                .await
                .map_err(|_| "STT response read failed")?
            {
                if body.len().saturating_add(chunk.len()) > MAX_RESPONSE {
                    return Err("STT response too large".into());
                }
                body.extend_from_slice(&chunk);
            }
            serde_json::from_slice(&body)
                .map(Some)
                .map_err(|_| "Invalid STT JSON response".into())
        })
        .await
        .map_err(|_| "STT destination deadline reached")?
    }
}
impl ScopedTranscriptionHttp for ConfiguredSttHttp {
    fn post(&self, request: TranscriptionRequest) -> VoiceFuture<'_, Option<Value>> {
        Box::pin(async move {
            tokio::time::timeout(Duration::from_secs(30), self.send(request))
                .await
                .map_err(|_| "STT HTTP deadline reached")?
        })
    }
}
fn validated_headers(
    request: &TranscriptionRequest,
    grant: &DestinationGrant,
) -> Result<HeaderMap, String> {
    let credential = grant.credential_header()?;
    let mut seen = HashSet::new();
    let mut headers = HeaderMap::new();
    let mut saw_credential = false;
    for (name, value) in &request.headers {
        let name = HeaderName::from_bytes(name.as_bytes()).map_err(|_| "Invalid STT header")?;
        if !seen.insert(name.clone()) {
            return Err("Duplicate STT header".into());
        }
        match name.as_str() {
            "content-type" if !request.multipart && value == "audio/wav" => {}
            "x-speech-content" if request.wyoming && value == SPEECH_CONTENT => {
                headers.insert(name, HeaderValue::from_static(SPEECH_CONTENT));
            }
            "authorization" | "xi-api-key" => {
                let Some((expected_name, expected_value)) = &credential else {
                    return Err("STT credential has no configured authority".into());
                };
                if name != expected_name || expected_value.as_bytes() != value.as_bytes() {
                    return Err("STT credential differs from configured authority".into());
                }
                headers.insert(expected_name.clone(), expected_value.clone());
                saw_credential = true;
            }
            _ => return Err("STT header not permitted".into()),
        }
    }
    if credential.is_some() && !saw_credential {
        return Err("STT configured credential missing".into());
    }
    Ok(headers)
}
fn encode_body(
    request: &TranscriptionRequest,
    boundary: &str,
) -> Result<(Vec<u8>, String), String> {
    if request.audio.len() > MAX_AUDIO || request.fields.len() > 8 {
        return Err("STT upload too large".into());
    }
    if !request.multipart {
        if !request.fields.is_empty() {
            return Err("Raw STT upload cannot contain form fields".into());
        }
        return Ok((request.audio.clone(), "audio/wav".into()));
    }
    if !["file", "audio"].contains(&request.file_field)
        || boundary.is_empty()
        || boundary.len() > 80
        || !boundary
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-')
    {
        return Err("Invalid STT multipart metadata".into());
    }
    let mut body = vec![];
    body.extend_from_slice(format!("--{boundary}\r\nContent-Disposition: form-data; name=\"{}\"; filename=\"audio.wav\"\r\nContent-Type: audio/wav\r\n\r\n",request.file_field).as_bytes());
    body.extend_from_slice(&request.audio);
    body.extend_from_slice(b"\r\n");
    let mut seen = HashSet::new();
    for (name, value) in &request.fields {
        if !["model", "model_id", "prompt", "language_code"].contains(&name.as_str())
            || value.len() > 8192
            || !seen.insert(name)
        {
            return Err("Invalid STT multipart field".into());
        }
        body.extend_from_slice(
            format!(
                "--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n"
            )
            .as_bytes(),
        );
        if body.len() > MAX_BODY {
            return Err("STT upload too large".into());
        }
    }
    body.extend_from_slice(format!("--{boundary}--\r\n").as_bytes());
    Ok((body, format!("multipart/form-data; boundary={boundary}")))
}
#[cfg(test)]
mod effect_tests {
    use super::*;
    use crate::voice::{SttProvider, transcription_request};
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::{TcpListener, TcpStream},
    };
    async fn read_request(socket: &mut TcpStream) -> Vec<u8> {
        let mut bytes = vec![];
        loop {
            let mut chunk = [0u8; 4096];
            let n = tokio::time::timeout(Duration::from_secs(3), socket.read(&mut chunk))
                .await
                .unwrap()
                .unwrap();
            if n == 0 {
                break;
            }
            bytes.extend_from_slice(&chunk[..n]);
            assert!(bytes.len() < 65536);
            if let Some(index) = bytes.windows(4).position(|w| w == b"\r\n\r\n") {
                let headers = String::from_utf8_lossy(&bytes[..index]).to_lowercase();
                let length = headers
                    .lines()
                    .find_map(|line| {
                        line.strip_prefix("content-length:")
                            .and_then(|s| s.trim().parse::<usize>().ok())
                    })
                    .unwrap_or(0);
                if bytes.len() >= index + 4 + length {
                    break;
                }
            }
        }
        bytes
    }
    fn adapter(port: u16) -> ConfiguredSttHttp {
        let target = DestinationGrant::configured(
            &format!("http://stt.invalid:{port}/transcribe"),
            vec!["127.0.0.1".parse().unwrap()],
            Credential::None,
            SystemTime::now() + Duration::from_secs(60),
            "owned-test-fixture".into(),
            true,
        )
        .unwrap();
        ConfiguredSttHttp::new(vec![target], 1).unwrap()
    }
    #[tokio::test]
    async fn pinned_host_manual_multipart_and_json_response() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let request = read_request(&mut socket).await;
            let body = r#"{"text":"hello"}"#;
            socket
                .write_all(
                    format!(
                        "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                        body.len()
                    )
                    .as_bytes(),
                )
                .await
                .unwrap();
            request
        });
        let http = adapter(port);
        let request = transcription_request(
            SttProvider::Whisper {
                base: &format!("http://stt.invalid:{port}"),
                prompt: Some("Jait"),
            },
            "aGk=",
        )
        .unwrap();
        let response = http.post(request).await.unwrap().unwrap();
        assert_eq!(response["text"], "hello");
        let raw = String::from_utf8(server.await.unwrap()).unwrap();
        assert!(
            raw.to_lowercase()
                .contains(&format!("host: stt.invalid:{port}"))
        );
        assert!(raw.contains("name=\"audio\"; filename=\"audio.wav\""));
        assert!(raw.contains("name=\"prompt\"\r\n\r\nJait\r\n"));
    }
    #[tokio::test]
    async fn redirects_are_returned_without_following_location() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            read_request(&mut socket).await;
            socket.write_all(b"HTTP/1.1 302 Found\r\nLocation: http://ungranted.invalid/steal\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").await.unwrap();
        });
        let http = adapter(port);
        let request = transcription_request(
            SttProvider::Whisper {
                base: &format!("http://stt.invalid:{port}"),
                prompt: None,
            },
            "",
        )
        .unwrap();
        assert!(http.post(request).await.unwrap().is_none());
        server.await.unwrap();
    }
    #[tokio::test]
    async fn oversized_response_is_rejected_before_body_read() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            read_request(&mut socket).await;
            socket
                .write_all(
                    b"HTTP/1.1 200 OK\r\nContent-Length: 300000\r\nConnection: close\r\n\r\n",
                )
                .await
                .unwrap();
        });
        let http = adapter(port);
        let request = transcription_request(
            SttProvider::Whisper {
                base: &format!("http://stt.invalid:{port}"),
                prompt: None,
            },
            "",
        )
        .unwrap();
        assert_eq!(
            http.post(request).await.unwrap_err(),
            "STT response too large"
        );
        server.await.unwrap();
    }
    #[tokio::test]
    async fn grant_expiry_cancels_pending_headers_and_body() {
        for send_headers in [false, true] {
            let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
            let port = listener.local_addr().unwrap().port();
            let (started_tx, started_rx) = tokio::sync::oneshot::channel();
            let server = tokio::spawn(async move {
                let (mut socket, _) = listener.accept().await.unwrap();
                read_request(&mut socket).await;
                if send_headers {
                    socket
                        .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 100\r\n\r\n")
                        .await
                        .unwrap();
                }
                started_tx.send(()).unwrap();
                let mut byte = [0u8; 1];
                tokio::time::timeout(Duration::from_secs(3), socket.read(&mut byte))
                    .await
                    .unwrap()
                    .unwrap()
            });
            let target = DestinationGrant::configured(
                &format!("http://stt.invalid:{port}/transcribe"),
                vec!["127.0.0.1".parse().unwrap()],
                Credential::None,
                SystemTime::now() + Duration::from_millis(300),
                "owned-test-fixture".into(),
                true,
            )
            .unwrap();
            let http = ConfiguredSttHttp::new(vec![target], 1).unwrap();
            let request = transcription_request(
                SttProvider::Whisper {
                    base: &format!("http://stt.invalid:{port}"),
                    prompt: None,
                },
                "",
            )
            .unwrap();
            let call = tokio::spawn(async move { http.post(request).await });
            tokio::time::timeout(Duration::from_secs(2), started_rx)
                .await
                .unwrap()
                .unwrap();
            let error = tokio::time::timeout(Duration::from_secs(2), call)
                .await
                .unwrap()
                .unwrap()
                .unwrap_err();
            assert_eq!(error, "STT destination deadline reached");
            assert_eq!(
                server.await.unwrap(),
                0,
                "expired request must release its socket"
            );
        }
    }

    #[tokio::test]
    async fn abort_drops_pending_request_socket() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let (started_tx, started_rx) = tokio::sync::oneshot::channel();
        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            read_request(&mut socket).await;
            started_tx.send(()).unwrap();
            let mut byte = [0u8; 1];
            tokio::time::timeout(Duration::from_secs(3), socket.read(&mut byte))
                .await
                .unwrap()
                .unwrap()
        });
        let http = adapter(port);
        let request = transcription_request(
            SttProvider::Whisper {
                base: &format!("http://stt.invalid:{port}"),
                prompt: None,
            },
            "",
        )
        .unwrap();
        let call = tokio::spawn(async move { http.post(request).await });
        tokio::time::timeout(Duration::from_secs(3), started_rx)
            .await
            .unwrap()
            .unwrap();
        call.abort();
        assert!(call.await.unwrap_err().is_cancelled());
        assert_eq!(server.await.unwrap(), 0);
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::voice::{SttProvider, transcription_request};
    #[test]
    fn exact_pins_and_explicit_private_grants() {
        let expiry = SystemTime::now() + Duration::from_secs(60);
        assert!(
            DestinationGrant::configured(
                "http://localhost/transcribe",
                vec!["127.0.0.1".parse().unwrap()],
                Credential::None,
                expiry,
                "test".into(),
                false
            )
            .is_err()
        );
        assert!(
            DestinationGrant::configured(
                "https://api.openai.com/audio/transcriptions",
                vec!["127.0.0.1".parse().unwrap()],
                Credential::None,
                expiry,
                "test".into(),
                false
            )
            .is_err()
        );
        assert!(
            DestinationGrant::configured(
                "http://127.0.0.1/transcribe",
                vec!["127.0.0.2".parse().unwrap()],
                Credential::None,
                expiry,
                "test".into(),
                true
            )
            .is_err()
        );
        assert!(
            DestinationGrant::configured(
                "http://localhost/transcribe",
                vec!["127.0.0.1".parse().unwrap()],
                Credential::None,
                expiry,
                "test".into(),
                true
            )
            .is_ok()
        );
    }
    #[test]
    fn multipart_encodes_protocol_file_field_and_rejects_header_smuggling() {
        let mut request = transcription_request(
            SttProvider::Whisper {
                base: "http://localhost",
                prompt: Some("Jait"),
            },
            "aGk=",
        )
        .unwrap();
        let (body, kind) = encode_body(&request, "boundary").unwrap();
        let text = String::from_utf8(body).unwrap();
        assert!(text.contains("name=\"audio\"; filename=\"audio.wav\"\r\n"));
        assert!(text.ends_with("--boundary--\r\n"));
        assert_eq!(kind, "multipart/form-data; boundary=boundary");
        request.fields.push(("a\r\nEvil".into(), "x".into()));
        assert!(encode_body(&request, "boundary").is_err());
    }
    #[test]
    fn configured_credential_and_headers_cannot_be_substituted() {
        let grant = DestinationGrant::configured(
            "https://api.openai.com/v1/audio/transcriptions",
            vec!["8.8.8.8".parse().unwrap()],
            Credential::Bearer("key".into()),
            SystemTime::now() + Duration::from_secs(60),
            "test".into(),
            false,
        )
        .unwrap();
        let mut request = transcription_request(
            SttProvider::Gpt {
                base: "https://api.openai.com/v1",
                key: "key",
                model: "model",
                prompt: None,
            },
            "",
        )
        .unwrap();
        assert!(validated_headers(&request, &grant).is_ok());
        request.headers[0].1 = "Bearer other".into();
        assert!(validated_headers(&request, &grant).is_err());
        request.headers = vec![("Host".into(), "elsewhere".into())];
        assert!(validated_headers(&request, &grant).is_err());
    }
}
