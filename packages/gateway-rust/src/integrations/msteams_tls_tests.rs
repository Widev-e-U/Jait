//! Loopback-only TLS checks. The fixture key is public and must never be used outside tests.
use super::*;
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio_rustls::rustls::{
    self,
    pki_types::{CertificateDer, PrivateKeyDer, UnixTime, pem::PemObject},
};

// Verify at 2030-01-01, inside both certificates' validity periods. This clock is
// test-local: rustls still performs its standard chain, time and hostname checks.
const VALID_TIME: u64 = 1_893_456_000;

#[derive(Debug)]
struct TestTime(u64);
impl rustls::time_provider::TimeProvider for TestTime {
    fn current_time(&self) -> Option<UnixTime> {
        Some(UnixTime::since_unix_epoch(Duration::from_secs(self.0)))
    }
}

struct Server(tokio::task::JoinHandle<(usize, usize)>);
impl Drop for Server {
    fn drop(&mut self) {
        self.0.abort();
    }
}

#[tokio::test]
async fn pinned_tls_validates_trust_and_hostname() {
    let provider = Arc::new(rustls::crypto::aws_lc_rs::default_provider());
    let ca =
        CertificateDer::from_pem_slice(include_bytes!("msteams_test_fixtures/ca.pem")).unwrap();
    let cert =
        CertificateDer::from_pem_slice(include_bytes!("msteams_test_fixtures/server.pem")).unwrap();
    let key = PrivateKeyDer::from_pem_slice(include_bytes!("msteams_test_fixtures/server-key.pem"))
        .unwrap();
    let config = rustls::ServerConfig::builder_with_provider(provider.clone())
        .with_safe_default_protocol_versions()
        .unwrap()
        .with_no_client_auth()
        .with_single_cert(vec![cert], key)
        .unwrap();
    let acceptor = tokio_rustls::TlsAcceptor::from(Arc::new(config));
    // Bind port zero and move this same listener into the task. Never release
    // and rebind the port; the listening socket is ready before the client runs.
    let listener = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0))
        .await
        .unwrap();
    let address = listener.local_addr().unwrap();
    let mut server = Server(tokio::spawn(async move {
        let mut requests = 0;
        let mut rejected = 0;
        for _ in 0..5 {
            tokio::time::timeout(Duration::from_secs(3), async {
                let (stream, _) = listener.accept().await.unwrap();
                let mut stream = match acceptor.accept(stream).await {
                    Ok(stream) => stream,
                    Err(_) => {
                        rejected += 1;
                        return;
                    }
                };
                let mut request = Vec::new();
                while !request.ends_with(b"\r\n\r\n") {
                    assert!(request.len() < 16_384, "TLS fixture request too large");
                    let byte = stream.read_u8().await.expect("read TLS fixture request");
                    request.push(byte);
                }
                assert!(
                    request.starts_with(b"POST /v3/conversations/test/activities HTTP/1.1\r\n")
                );
                stream.read_exact(&mut [0; 2]).await.unwrap();
                requests += 1;
                stream
                    .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
                    .await
                    .unwrap();
                stream.shutdown().await.unwrap();
            })
            .await
            .expect("TLS fixture connection timed out");
        }
        (requests, rejected)
    }));

    for (host, trust, time, success) in [
        ("teams.invalid", true, VALID_TIME, true),
        ("teams.invalid", false, VALID_TIME, false),
        ("other.invalid", true, VALID_TIME, false),
        // Prove that fixing the test clock does not bypass validity checking.
        ("teams.invalid", true, 1_577_836_800, false), // 2020-01-01: not yet valid
        ("teams.invalid", true, 2_524_608_000, false), // 2050-01-01: expired
    ] {
        let mut roots = rustls::RootCertStore::empty();
        if trust {
            roots.add(ca.clone()).unwrap();
        }
        let config =
            rustls::ClientConfig::builder_with_details(provider.clone(), Arc::new(TestTime(time)))
                .with_safe_default_protocol_versions()
                .unwrap()
                .with_root_certificates(roots)
                .with_no_client_auth();
        let client = outbound_client_builder(host, &[address], Duration::from_secs(3))
            .tls_backend_preconfigured(config)
            .build()
            .unwrap();
        let url = Url::parse(&format!(
            "https://{host}:{}/v3/conversations/test/activities",
            address.port()
        ))
        .unwrap();
        let result = outbound_post(client, url, b"{}".to_vec(), "test-token").await;
        assert_eq!(
            result.is_ok(),
            success,
            "unexpected TLS result for {host}, trust={trust}, time={time}: {result:?}"
        );
    }
    // Every rejection must reach the held listener and fail before HTTP, so an
    // unrelated connection failure cannot satisfy a negative assertion.
    let counts = tokio::time::timeout(Duration::from_secs(3), &mut server.0)
        .await
        .expect("TLS fixture did not finish")
        .expect("TLS fixture task failed");
    assert_eq!(counts, (1, 4));
}
