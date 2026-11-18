//! Deterministic socket/MIME tests; no provider accounts, public DNS or live mail.
use super::super::contracts::MailServerConfig;
use super::*;
use tokio::io::{AsyncReadExt, AsyncWriteExt, DuplexStream};

fn allow() -> MailAuthorization {
    Arc::new(|_| Box::pin(async { Ok(()) }))
}
fn effect() -> MailEffect {
    MailEffect {
        owner: "owner-a".into(),
        protocol: "imap",
        operation: "read",
        servername: "mail.example.com".into(),
        address: "93.184.216.34".parse().unwrap(),
        port: 993,
        user: "fixture-user".into(),
        sender: None,
        recipients: vec![],
    }
}
fn pair() -> (Wire, DuplexStream, watch::Sender<bool>) {
    let (client, server) = tokio::io::duplex(4096);
    let (cancel, receiver) = watch::channel(false);
    (
        Wire {
            io: BufReader::new(Box::new(client)),
            cancel: receiver,
            end: Instant::now() + Duration::from_secs(2),
            limits: limits(ProtocolLimits::default()),
            _permit: None,
            bytes: 0,
        },
        server,
        cancel,
    )
}
async fn read_line<S: tokio::io::AsyncRead + Unpin>(socket: &mut S) -> String {
    let mut data = Vec::new();
    loop {
        let b = socket.read_u8().await.unwrap();
        data.push(b);
        if b == b'\n' {
            break;
        }
    }
    String::from_utf8(data).unwrap()
}
fn session(wire: Wire) -> NativeImap {
    NativeImap {
        wire: Some(wire),
        effect: effect(),
        authorize: allow(),
        selected: None,
    }
}
fn message() -> SmtpMessage {
    SmtpMessage {
        from_name: "Fixture".into(),
        from_address: "sender@example.com".into(),
        to: "\"Last, First\" <to@example.com>".into(),
        cc: Some("cc@example.com".into()),
        bcc: Some("secret@example.com".into()),
        subject: "Hello ✓".into(),
        body: "first\n.\nlast".into(),
        html: false,
        in_reply_to: None,
        references: vec![],
    }
}
#[test]
fn literal_parser_preserves_nested_lists_and_rejects_malformed_frames() {
    let got = tokens(
        b"* 2 FETCH (UID 9 FLAGS (\\Seen) BODY[] {3} )",
        &mut VecDeque::from([b"abc".to_vec()]),
    )
    .unwrap();
    assert_eq!(got[3].list().unwrap()[5], Token::Literal(b"abc".to_vec()));
    assert!(tokens(b"* 1 FETCH (UID 9", &mut VecDeque::new()).is_err());
    assert!(tokens(b"* LIST () \"/\" \"unterminated", &mut VecDeque::new()).is_err());
    assert!(tokens(&[b'('; 34], &mut VecDeque::new()).is_err());
}
#[tokio::test]
async fn imap_select_uidvalidity_and_fetch_literal_are_real_protocol() {
    let (wire, mut server, _cancel) = pair();
    let mut client = session(wire);
    let fixture = tokio::spawn(async move {
        assert_eq!(read_line(&mut server).await, "J1 EXAMINE \"INBOX\"\r\n");
        server
            .write_all(b"* 2 EXISTS\r\n* OK [UIDVALIDITY 123] stable\r\nJ1 OK selected\r\n")
            .await
            .unwrap();
        let cmd = read_line(&mut server).await;
        assert!(cmd.starts_with("J1 UID FETCH 9 "));
        assert!(cmd.contains("BODY.PEEK[HEADER.FIELDS"));
        let header = b"From: from@example.com\r\nTo: to@example.com\r\nSubject: =?UTF-8?B?SGVsbG8=?=\r\nDate: fixture\r\n\r\n";
        server.write_all(format!("* 2 FETCH (UID 9 FLAGS (\\Seen) RFC822.SIZE 200 BODYSTRUCTURE (\"TEXT\" \"PLAIN\") BODY[HEADER.FIELDS (FROM TO SUBJECT DATE CONTENT-TYPE)] {{{}}}\r\n", header.len()).as_bytes()).await.unwrap();
        server.write_all(header).await.unwrap();
        server.write_all(b")\r\nJ1 OK fetched\r\n").await.unwrap();
    });
    let state = client.select("INBOX", true).await.unwrap();
    assert_eq!(state.uid_validity, "123");
    assert_eq!(state.exists, 2);
    let result = client
        .fetch(FetchRange::Uids(vec![9]), false, 1, 4096)
        .await
        .unwrap();
    assert_eq!(result[0].uid, 9);
    assert_eq!(result[0].envelope.subject, "Hello");
    assert_eq!(result[0].flags, vec!["\\Seen"]);
    assert!(result[0].source.is_none());
    assert!(client.flag(9, "\\Seen", true).await.is_err());
    fixture.await.unwrap();
}
#[tokio::test]
async fn search_streams_large_uid_line_and_retains_only_tail() {
    let (wire, mut server, _cancel) = pair();
    let mut client = session(wire);
    client.selected = Some(("INBOX".into(), true));
    let fixture = tokio::spawn(async move {
        assert_eq!(
            read_line(&mut server).await,
            "J1 UID SEARCH CHARSET UTF-8 TEXT \"two \\\"words\\\"\"\r\n"
        );
        server.write_all(b"* SEARCH").await.unwrap();
        for n in 1..=25_000 {
            server.write_all(format!(" {n}").as_bytes()).await.unwrap();
        }
        server
            .write_all(b"\r\nJ1 OK search done\r\n")
            .await
            .unwrap();
    });
    assert_eq!(
        client.search_tail("two \"words\"", 3).await.unwrap(),
        vec![24_998, 24_999, 25_000]
    );
    fixture.await.unwrap();
}
#[tokio::test]
async fn folder_literals_and_modified_utf7_and_special_use() {
    let (wire, mut server, _cancel) = pair();
    let mut client = session(wire);
    let path = "旅行/&";
    let encoded = folder_encode(path).unwrap();
    assert_eq!(folder_decode(&encoded).unwrap(), path);
    let fixture = tokio::spawn(async move {
        assert_eq!(read_line(&mut server).await, "J1 LIST \"\" \"*\"\r\n");
        server
            .write_all(
                format!(
                    "* LIST (\\Trash) \"/\" {{{}}}\r\n{}\r\nJ1 OK listed\r\n",
                    encoded.len(),
                    encoded
                )
                .as_bytes(),
            )
            .await
            .unwrap();
    });
    let folders = client.folders(3).await.unwrap();
    assert_eq!(folders[0].path, path);
    assert_eq!(folders[0].name, "&");
    assert_eq!(folders[0].special_use.as_deref(), Some("\\Trash"));
    fixture.await.unwrap();
}
#[tokio::test]
async fn cancellation_closes_interrupted_session_and_releases_socket_permit() {
    let (mut wire, mut server, cancel) = pair();
    let admission = Arc::new(Semaphore::new(1));
    wire._permit = Some(admission.clone().try_acquire_owned().unwrap());
    let mut client = session(wire);
    let fixture = tokio::spawn(async move {
        assert!(read_line(&mut server).await.starts_with("J1 EXAMINE"));
        cancel.send(true).unwrap();
        let mut b = [0; 1];
        assert_eq!(server.read(&mut b).await.unwrap(), 0);
    });
    assert_eq!(
        client.select("INBOX", true).await.unwrap_err(),
        "Mail operation cancelled"
    );
    assert!(client.wire.is_none());
    assert_eq!(admission.available_permits(), 1);
    fixture.await.unwrap();
}
#[tokio::test]
async fn dropped_operation_poisoning_prevents_response_reuse() {
    let (wire, mut server, _cancel) = pair();
    let mut client = session(wire);
    let fixture = tokio::spawn(async move {
        assert!(read_line(&mut server).await.starts_with("J1 EXAMINE"));
        let mut b = [0; 1];
        assert_eq!(server.read(&mut b).await.unwrap(), 0);
    });
    assert!(
        tokio::time::timeout(Duration::from_millis(30), client.select("INBOX", true))
            .await
            .is_err()
    );
    assert!(client.wire.is_none());
    fixture.await.unwrap();
}
#[tokio::test]
async fn denied_write_has_no_protocol_effect_and_redacts_policy_error() {
    let (wire, mut server, _cancel) = pair();
    let mut client = session(wire);
    client.selected = Some(("INBOX".into(), false));
    client.authorize = Arc::new(|e| {
        Box::pin(async move {
            assert_eq!(e.owner, "owner-a");
            assert_eq!(e.operation, "write");
            Err("sensitive policy context".into())
        })
    });
    assert_eq!(
        client.flag(9, "\\Seen", true).await.unwrap_err(),
        "Email operation is not authorized"
    );
    let mut b = [0; 1];
    assert_eq!(server.read(&mut b).await.unwrap(), 0);
}
#[tokio::test]
async fn advertised_literal_limit_is_rejected_before_payload_allocation() {
    let (mut wire, mut server, _cancel) = pair();
    server
        .write_all(b"* 1 FETCH (BODY[] {999999999}\r\n")
        .await
        .unwrap();
    assert_eq!(
        frame(&mut wire, 100).await.unwrap_err(),
        "Mail literal exceeds byte limit"
    );
}
#[tokio::test]
async fn malformed_eof_and_provider_errors_are_redacted() {
    let (mut wire, mut server, _cancel) = pair();
    let fixture = tokio::spawn(async move {
        read_line(&mut server).await;
        server
            .write_all(b"J1 NO password=do-not-expose\r\n")
            .await
            .unwrap();
    });
    assert_eq!(
        command(&mut wire, "NOOP", 0, 8).await.unwrap_err(),
        "IMAP command rejected"
    );
    fixture.await.unwrap();
    let (mut wire, mut server, _cancel) = pair();
    server
        .write_all(b"* 1 FETCH (BODY[] {6}\r\nabc")
        .await
        .unwrap();
    drop(server);
    assert_eq!(
        frame(&mut wire, 10).await.unwrap_err(),
        "Truncated mail literal"
    );
}
#[tokio::test]
async fn smtp_multiline_reply_and_send_acceptance_and_bcc_privacy() {
    let (mut wire, mut server, _cancel) = pair();
    let message = message();
    let (data, recipients, id) = mime::compose(&message).unwrap();
    assert_eq!(
        recipients,
        vec!["to@example.com", "cc@example.com", "secret@example.com"]
    );
    let text = String::from_utf8(data.clone()).unwrap();
    assert!(!text.contains("Bcc:"));
    assert!(!text.contains("secret@example.com"));
    assert!(!text.contains("\r\n.\r\n"));
    let fixture = tokio::spawn(async move {
        assert_eq!(
            read_line(&mut server).await,
            "MAIL FROM:<sender@example.com>\r\n"
        );
        server.write_all(b"250 accepted\r\n").await.unwrap();
        for address in ["to@example.com", "cc@example.com", "secret@example.com"] {
            assert_eq!(
                read_line(&mut server).await,
                format!("RCPT TO:<{address}>\r\n")
            );
            server
                .write_all(b"250-first\r\n250 accepted\r\n")
                .await
                .unwrap();
        }
        assert_eq!(read_line(&mut server).await, "DATA\r\n");
        server.write_all(b"354 continue\r\n").await.unwrap();
        let mut body = Vec::new();
        loop {
            let line = read_line(&mut server).await;
            if line == ".\r\n" {
                break;
            }
            body.extend(line.as_bytes());
        }
        assert!(body.starts_with(b"From: "));
        server.write_all(b"250 queued\r\n").await.unwrap();
    });
    assert_eq!(
        smtp_send(
            &mut wire,
            &message,
            &data,
            &recipients,
            id.clone(),
            &SendJournal::default()
        )
        .await
        .unwrap(),
        Some(id)
    );
    fixture.await.unwrap();
}
#[tokio::test]
async fn smtp_disconnect_after_data_is_uncertain_and_never_retried() {
    let (mut wire, mut server, _cancel) = pair();
    let message = message();
    let (data, _, id) = mime::compose(&message).unwrap();
    let fixture = tokio::spawn(async move {
        read_line(&mut server).await;
        server.write_all(b"250 accepted\r\n").await.unwrap();
        assert_eq!(read_line(&mut server).await, "DATA\r\n");
        server.write_all(b"354 continue\r\n").await.unwrap();
        loop {
            if read_line(&mut server).await == ".\r\n" {
                break;
            }
        }
        // Server may have committed delivery before losing the acknowledgement.
    });
    let error = smtp_send(&mut wire, &message, &data, &[], id, &SendJournal::default())
        .await
        .unwrap_err();
    assert!(error.contains("outcome is uncertain"));
    assert!(error.contains("do not retry"));
    fixture.await.unwrap();
}
#[tokio::test]
async fn smtp_recipient_rejection_stops_before_data_without_partial_send() {
    let (mut wire, mut server, _cancel) = pair();
    let message = message();
    let (data, recipients, id) = mime::compose(&message).unwrap();
    let fixture = tokio::spawn(async move {
        read_line(&mut server).await;
        server.write_all(b"250 ok\r\n").await.unwrap();
        read_line(&mut server).await;
        server
            .write_all(b"550 private-provider-text\r\n")
            .await
            .unwrap();
        assert!(
            tokio::time::timeout(Duration::from_millis(30), read_line(&mut server))
                .await
                .is_err()
        );
    });
    assert_eq!(
        smtp_send(
            &mut wire,
            &message,
            &data,
            &recipients,
            id,
            &SendJournal::default()
        )
        .await
        .unwrap_err(),
        "SMTP command rejected (550)"
    );
    fixture.await.unwrap();
}
#[tokio::test(start_paused = true)]
async fn socket_deadline_and_closed_cancellation_authority_fail_closed() {
    let (mut wire, _server, cancel) = pair();
    wire.limits.socket_ms = 10;
    assert_eq!(
        wire.line(100).await.unwrap_err(),
        "Mail operation timed out"
    );
    drop(cancel);
    assert_eq!(
        wire.line(100).await.unwrap_err(),
        "Mail operation cancelled"
    );
}
#[test]
fn command_injection_and_invalid_identifiers_are_rejected() {
    assert!(quote("INBOX\r\nJ2 DELETE INBOX").is_err());
    assert!(quote("password\0").is_err());
    assert!(uid(0).is_err());
    assert!(uid(u64::MAX).is_err());
    let mut m = message();
    m.to = "to@example.com\r\nBcc: other@example.com".into();
    assert!(mime::compose(&m).is_err());
    m = message();
    m.references = vec!["<x>\r\nBcc: other@example.com".into()];
    assert!(mime::compose(&m).is_err());
}
#[test]
fn multipart_mime_decodes_text_html_headers_and_counts_attachments() {
    let source = b"Cc: =?UTF-8?Q?Hello_=E2=9C=93?= <cc@example.com>\r\nReply-To: reply@example.com\r\nMessage-ID: <fixture@example.com>\r\nReferences: <parent@example.com>\r\nContent-Type: multipart/mixed; boundary=\"test;boundary\"\r\n\r\n--test;boundary\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nHello=20world\r\n--test;boundary\r\nContent-Type: text/html\r\nContent-Transfer-Encoding: base64\r\n\r\nPGI+SGVsbG88L2I+\r\n--test;boundary\r\nContent-Type: image/png\r\nContent-Disposition: attachment; filename=\"safe.png\"\r\n\r\nfixture\r\n--test;boundary--\r\n";
    let parsed = mime::parse(source, 100, &AtomicBool::new(false)).unwrap();
    assert_eq!(parsed.text, "Hello world");
    assert_eq!(parsed.html, "<b>Hello</b>");
    assert_eq!(parsed.attachment_count, 1);
    assert_eq!(parsed.cc, "Hello ✓ <cc@example.com>");
    assert_eq!(parsed.reply_to.as_deref(), Some("reply@example.com"));
    assert_eq!(parsed.references, vec!["<parent@example.com>"]);
    assert!(mime::parse(source, 3, &AtomicBool::new(false)).is_err());
    assert!(
        mime::parse(source, 100, &AtomicBool::new(true))
            .unwrap_err()
            .contains("cancelled")
    );
}
#[test]
fn malformed_mime_limits_and_unsupported_encoding_are_explicit() {
    assert!(
        mime::parse(
            b"Content-Type: text/plain; charset=unsupported\r\n\r\nhello",
            100,
            &AtomicBool::new(false)
        )
        .is_err()
    );
    assert!(
        mime::parse(
            b"Content-Type: multipart/mixed; boundary=x\r\n\r\n--x\r\n\r\nno closing",
            100,
            &AtomicBool::new(false)
        )
        .is_err()
    );
    assert!(
        mime::parse(
            b"Content-Transfer-Encoding: base64\r\n\r\n!!!",
            100,
            &AtomicBool::new(false)
        )
        .is_err()
    );
    let mut source = b"X: ".to_vec();
    source.extend(vec![b'a'; 65_536]);
    source.extend(b"\r\n\r\nbody");
    assert!(mime::parse(&source, 100, &AtomicBool::new(false)).is_err());
}
#[test]
fn smtp_mime_roundtrip_retains_body_and_references() {
    let mut m = message();
    m.references = vec!["<parent@example.com>".into()];
    m.in_reply_to = Some("<parent@example.com>".into());
    let (data, _, id) = mime::compose(&m).unwrap();
    let parsed = mime::parse(&data, 4096, &AtomicBool::new(false)).unwrap();
    assert_eq!(parsed.text, m.body);
    assert_eq!(parsed.message_id, Some(id));
    assert_eq!(parsed.references, m.references);
}

// Public, generated localhost-only test fixture; never a production identity.
const TEST_CERT: &str = "MIIDQzCCAiugAwIBAgIUaTLGgyiFw5bJGT+VByqvgtOVNGcwDQYJKoZIhvcNAQELBQAwFDESMBAGA1UEAwwJbG9jYWxob3N0MB4XDTI2MTAyNzE1MDcwMVoXDTM2MTAyNDE1MDcwMVowFDESMBAGA1UEAwwJbG9jYWxob3N0MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAxYrJpmJtGRM5LVN/4ELQ771+GV8eEAuBYOxdqEfBF/dsTPxldnOIJqT+wqnqlymKvK7twah6YtgDvsPr4UbK2OwsqmitR6tRxjO9erCkxJ02MDpetw/BNpqgH9OtW4fcdz96zwBKdVk5z3cZnyA7GYn4qDYQ2UPMDbTDVHx0pbYUyNBGHpUbnV2kA3pC82SHEHQEA+jyfQqIUJX5BIBhZqIoiWN4bbdLeD2i44XQTey41+4aN6cEFjmvwa3sFv38tf67aZ/gr6LXCivgxEP24XzcU+AZigtqLxqbjldGki4gPLuWB+Qz5idxdXoycT6Xx/mcQVvzo6v4U2A01XOPmQIDAQABo4GMMIGJMB0GA1UdDgQWBBTzKB30Qz1bbSxJ4cSAML6of+FvRjAfBgNVHSMEGDAWgBTzKB30Qz1bbSxJ4cSAML6of+FvRjAUBgNVHREEDTALgglsb2NhbGhvc3QwDAYDVR0TAQH/BAIwADAOBgNVHQ8BAf8EBAMCBaAwEwYDVR0lBAwwCgYIKwYBBQUHAwEwDQYJKoZIhvcNAQELBQADggEBAFVpHiMOCX5WdS/F+q31tH69YwT7m9CKF2mbhXzYgDM0wwFaMHJksRinpucWUHAxLA96NoxRzq1Lx9THe3teFQGJQv4bAKB6CuNM6GMeTWgdXBefDD0zqMZ+EL68JoRW0WHDcj1yuPvTvdcoHNzqyY7RbP/LFWJpWo77+b0B0gmBCiFS1J6RYOrK9FIlkEAanhrNLmgmxtGNL9hMd8NUPkzcBv683dPQ3+naZR7a9SZto3bybEubrohgs3Twy1p1IY9X3Dbob5ZsB+9vfWf0z0EV3Ib4EVpE63PwOlEBupJIaf71Vv3q3VsMaiQFDJHGjBTfT3QXfBVyxmLoCvlNnZA=";

// Public, generated localhost-only test fixture; never a production identity.
const TEST_KEY: &str = "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDFismmYm0ZEzktU3/gQtDvvX4ZXx4QC4Fg7F2oR8EX92xM/GV2c4gmpP7CqeqXKYq8ru3BqHpi2AO+w+vhRsrY7CyqaK1Hq1HGM716sKTEnTYwOl63D8E2mqAf061bh9x3P3rPAEp1WTnPdxmfIDsZifioNhDZQ8wNtMNUfHSlthTI0EYelRudXaQDekLzZIcQdAQD6PJ9CohQlfkEgGFmoiiJY3htt0t4PaLjhdBN7LjX7ho3pwQWOa/BrewW/fy1/rtpn+CvotcKK+DEQ/bhfNxT4BmKC2ovGpuOV0aSLiA8u5YH5DPmJ3F1ejJxPpfH+ZxBW/Ojq/hTYDTVc4+ZAgMBAAECggEAC6szVqn9PkwxpjEGvnlL7MFxg6+n77QySAamUKSubgs+QTzuhGT2L6wy5U5Srmu0h4lAv54DXrfaXsgldJjxLgejasyEodVnnvDa+jaZgQi1VPt5sVATrnVLTJ39IUlA92VPTI98lnp3DP+AyrLFcvCAuPT6oU7dLJkXKbQxUsF4XPBV/OPt7jo1Qkzd3B3AmFp3tALjV7pdzoRuOKmN5+kBrhMN4j7z6yIyaIo5gel3cfip5OIM4nkEwlZyIVFcj1sJjZJWkDKapheuFueeeUmerxvPuSe5m7zo1Z0N4nw1EOBKr8BD02fIPbHRiIzAOC9Lozb2T/ERlkPNQw3eoQKBgQDmjEGhRWDOM7WUOTdefV3b+aEvIyQaqbnV4vJ4980hT1MYxcI9hSuirJtvdLvEOpNbTyS1bZ/1vIeUvjlY3JsHhp1n2U1AHKztgGkv3LCINSm9VML/RopALlJp7WRCiz4+8Si2ftXoSeWUzu9mGgzQiGZr+81endvZ1NbgkKMQkQKBgQDbWbknI8UJVu7WLNFKIn+SAL+/7uXZ0XMlzBIu/IezQZZXl0ZwPNqKMFK6ayB5WAqyy2umHv1mbplGhN8xY9mEiY53FYeBLVwO0lTSsM7GLxIzh+abdugGrSURCthMyEpsUyvftuLYBePzIsK6VEyPIEMaJqsZJ2GM4+s20W2SiQKBgGIqPFOv181VBS7Mwf+wv8NHYlNQ0jGsLR2eWYIaeTSCsy4sHk3Vo0PL3Q8zFDQ0gMPzSf0aZW7bzJsP+BkXLcehkOpEA3mV/CfQcnlXra8Be/lK2xCY94rmbl7+Hp+a7HEefChgjzIuLNwU1KiT1PsB6SJ3f/WWn6L71laeH2CRAoGABclzMg4mh52MhYf/KYaJeQ+d/3FNDRcSg5/DpwuwhNEpJzxtdk6UsWqe9B4ZaDojZh4pw+Mzaj1mu86LmOD6fx2l7Yxa29SXhiiUZk6V1fKt90ARnG5hprNws+dmV3g9RmhXUvqfN3XIUsTLAGFy95+xRYJZpzs7vpzQusyBqIkCgYEA1l6VEj+vk+nFgZ45d5RGU+356gSC1anR5xHgTSxXFl9tiE+4Dt91DmFptiasvAxC5sPrduCF58JaHjZocVlrCqjKJMbmJ2M1lGznRCg3r+Z/8yDTdc5+f5tomkDfpDjXacPYEa6yhMwjEWXAHRqD2NIcz1qF20HunmGHhj2/jq0=";

fn test_host(authorize: MailAuthorization, cancel: watch::Receiver<bool>) -> NativeProtocolHost {
    NativeProtocolHost {
        owner: "owner-a".into(),
        authorize,
        cancel,
        tls: TlsConnector::from(Arc::new(
            ClientConfig::builder()
                .with_root_certificates(RootCertStore::empty())
                .with_no_client_auth(),
        )),
        admission: Arc::new(Semaphore::new(8)),
        blocking: BlockingLane::new(std::num::NonZeroU16::new(1).unwrap()),
        sends: SendJournal::default(),
    }
}
fn pinned(ip: &str) -> PinnedMailServer {
    PinnedMailServer {
        config: MailServerConfig {
            host: ip.into(),
            port: 993.0,
            secure: true,
            user: "fixture-user".into(),
            password: "private-fixture-password".into(),
        },
        servername: "mail.example.com".into(),
    }
}
#[tokio::test]
async fn destination_and_owner_policy_fail_before_connect_with_no_retry() {
    use std::sync::atomic::AtomicUsize;
    let calls = Arc::new(AtomicUsize::new(0));
    let count = calls.clone();
    let (tx, cancel) = watch::channel(false);
    let host = test_host(
        Arc::new(move |e| {
            let count = count.clone();
            Box::pin(async move {
                count.fetch_add(1, Ordering::SeqCst);
                assert_eq!(e.owner, "owner-a");
                assert_eq!(e.user, "fixture-user");
                assert_eq!(e.servername, "mail.example.com");
                assert_eq!(e.address, "93.184.216.34".parse::<IpAddr>().unwrap());
                assert!(!format!("{e:?}").contains("private-fixture-password"));
                Err("foreign account sensitive context".into())
            })
        }),
        cancel,
    );
    for ip in ["127.0.0.1", "10.0.0.1", "::1", "mail.example.com"] {
        assert!(host.effect(&pinned(ip), "imap", "connect").is_err());
    }
    assert!(
        matches!(host.imap(pinned("93.184.216.34"), ProtocolLimits::default()).await, Err(e) if e == "Email operation is not authorized")
    );
    assert_eq!(calls.load(Ordering::SeqCst), 1);
    assert_eq!(host.admission.available_permits(), 8);
    drop(tx);
}
#[tokio::test]
async fn socket_admission_rejects_overload_before_policy_or_network() {
    let (_tx, cancel) = watch::channel(false);
    let host = test_host(
        Arc::new(|_| Box::pin(async { panic!("overload reached policy") })),
        cancel,
    );
    let _full = host.admission.clone().acquire_many_owned(8).await.unwrap();
    assert!(
        matches!(host.imap(pinned("93.184.216.34"), ProtocolLimits::default()).await, Err(e) if e == "Mail socket capacity exhausted")
    );
}
fn tls_fixture(trust: bool) -> (TlsConnector, tokio_rustls::TlsAcceptor) {
    use tokio_rustls::rustls::{
        ServerConfig,
        pki_types::{CertificateDer, PrivateKeyDer, PrivatePkcs8KeyDer},
    };
    let cert = CertificateDer::from(STANDARD.decode(TEST_CERT).unwrap());
    let key = PrivateKeyDer::Pkcs8(PrivatePkcs8KeyDer::from(STANDARD.decode(TEST_KEY).unwrap()));
    let mut roots = RootCertStore::empty();
    if trust {
        roots.add(cert.clone()).unwrap();
    }
    let client = ClientConfig::builder()
        .with_root_certificates(roots)
        .with_no_client_auth();
    let server = ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(vec![cert], key)
        .unwrap();
    (
        TlsConnector::from(Arc::new(client)),
        tokio_rustls::TlsAcceptor::from(Arc::new(server)),
    )
}
#[tokio::test]
async fn real_tls_rejects_untrusted_cert_and_wrong_servername_and_accepts_trusted_name() {
    for (trust, name, success) in [
        (false, "localhost", false),
        (true, "other.example.com", false),
        (true, "localhost", true),
    ] {
        let (wire, server, _cancel) = pair();
        let (client_tls, acceptor) = tls_fixture(trust);
        let fixture = tokio::spawn(async move {
            if let Ok(mut socket) = acceptor.accept(server).await {
                let _ = socket.write_all(b"220 secure\r\n").await;
            }
        });
        match wire.upgrade(&client_tls, name).await {
            Ok(mut tls) => {
                assert!(success);
                assert_eq!(tls.line(100).await.unwrap(), b"220 secure");
            }
            Err(e) => {
                assert!(!success);
                assert_eq!(e, "Mail TLS verification failed");
            }
        }
        fixture.await.unwrap();
    }
}
#[tokio::test]
async fn starttls_rejects_buffered_plaintext_injection() {
    let (mut wire, mut server, _cancel) = pair();
    let (tls, _) = tls_fixture(true);
    server
        .write_all(b"220 begin TLS\r\n250 injected\r\n")
        .await
        .unwrap();
    smtp_reply(&mut wire, 220).await.unwrap();
    assert!(!wire.io.buffer().is_empty());
    assert!(
        matches!(wire.upgrade(&tls, "localhost").await, Err(e) if e == "Unexpected data before mail TLS handshake")
    );
}
#[tokio::test]
async fn plaintext_greeting_hang_never_sends_credentials() {
    let (mut wire, mut server, _cancel) = pair();
    wire.limits.socket_ms = 10;
    assert_eq!(
        smtp_reply(&mut wire, 220).await.unwrap_err(),
        "Mail operation timed out"
    );
    assert!(
        tokio::time::timeout(Duration::from_millis(10), read_line(&mut server))
            .await
            .is_err()
    );
}

#[tokio::test]
async fn smtp_starttls_reissues_ehlo_before_authentication() {
    let (wire, mut server, _cancel) = pair();
    let (tls, acceptor) = tls_fixture(true);
    let mut config = pinned("93.184.216.34");
    config.config.secure = false;
    config.servername = "localhost".into();
    let fixture = tokio::spawn(async move {
        server.write_all(b"220 fixture\r\n").await.unwrap();
        assert_eq!(read_line(&mut server).await, "EHLO jait.local\r\n");
        server
            .write_all(b"250-fixture\r\n250 STARTTLS\r\n")
            .await
            .unwrap();
        assert_eq!(read_line(&mut server).await, "STARTTLS\r\n");
        server.write_all(b"220 upgrade\r\n").await.unwrap();
        let mut server = acceptor.accept(server).await.unwrap();
        assert_eq!(read_line(&mut server).await, "EHLO jait.local\r\n");
        server
            .write_all(b"250-fixture\r\n250 AUTH PLAIN\r\n")
            .await
            .unwrap();
        assert_eq!(read_line(&mut server).await, "AUTH PLAIN\r\n");
        server.write_all(b"334 challenge\r\n").await.unwrap();
        let auth = read_line(&mut server).await;
        assert_eq!(
            STANDARD.decode(auth.trim()).unwrap(),
            b"\0fixture-user\0private-fixture-password"
        );
        server.write_all(b"235 authenticated\r\n").await.unwrap();
    });
    smtp_auth(wire, &config, &tls).await.unwrap();
    fixture.await.unwrap();
}
#[tokio::test]
async fn smtp_without_starttls_fails_before_any_credential_write() {
    let (wire, mut server, _cancel) = pair();
    let (tls, _) = tls_fixture(true);
    let mut config = pinned("93.184.216.34");
    config.config.secure = false;
    let fixture = tokio::spawn(async move {
        server.write_all(b"220 fixture\r\n").await.unwrap();
        assert_eq!(read_line(&mut server).await, "EHLO jait.local\r\n");
        server.write_all(b"250 AUTH PLAIN\r\n").await.unwrap();
        let mut b = [0; 1];
        assert_eq!(server.read(&mut b).await.unwrap(), 0);
    });
    assert!(
        matches!(smtp_auth(wire, &config, &tls).await, Err(e) if e == "SMTP server requires STARTTLS support")
    );
    fixture.await.unwrap();
}
#[tokio::test]
async fn imap_starttls_authenticates_only_inside_tls_and_does_not_retry_failure() {
    let (wire, mut server, _cancel) = pair();
    let (tls, acceptor) = tls_fixture(true);
    let mut config = pinned("93.184.216.34");
    config.config.secure = false;
    config.servername = "localhost".into();
    let fixture = tokio::spawn(async move {
        server.write_all(b"* OK fixture\r\n").await.unwrap();
        assert_eq!(read_line(&mut server).await, "J1 STARTTLS\r\n");
        server.write_all(b"J1 OK upgrade\r\n").await.unwrap();
        let mut server = acceptor.accept(server).await.unwrap();
        assert_eq!(
            read_line(&mut server).await,
            "J1 LOGIN \"fixture-user\" \"private-fixture-password\"\r\n"
        );
        server
            .write_all(b"J1 NO sensitive provider diagnostic\r\n")
            .await
            .unwrap();
        let mut b = [0; 1];
        // Closing a TLS socket may produce EOF or an unclean-close diagnostic.
        assert!(matches!(server.read(&mut b).await, Ok(0) | Err(_)));
    });
    assert!(matches!(imap_auth(wire, &config, &tls).await, Err(e) if e == "IMAP command rejected"));
    fixture.await.unwrap();
}
#[tokio::test]
async fn move_failure_closes_session_without_copy_or_expunge_fallback() {
    let (wire, mut server, _cancel) = pair();
    let mut client = session(wire);
    client.selected = Some(("INBOX".into(), false));
    let fixture = tokio::spawn(async move {
        assert_eq!(read_line(&mut server).await, "J1 UID MOVE 9 \"Trash\"\r\n");
        server
            .write_all(b"J1 NO MOVE unsupported\r\n")
            .await
            .unwrap();
        let mut b = [0; 1];
        assert_eq!(server.read(&mut b).await.unwrap(), 0);
    });
    assert_eq!(
        client.move_message(9, "Trash").await.unwrap_err(),
        "IMAP command rejected"
    );
    assert!(client.wire.is_none());
    fixture.await.unwrap();
}
#[tokio::test]
async fn smtp_cancellation_after_data_is_an_uncertain_effect() {
    let (mut wire, mut server, cancel) = pair();
    let m = message();
    let (data, _, id) = mime::compose(&m).unwrap();
    let fixture = tokio::spawn(async move {
        read_line(&mut server).await;
        server.write_all(b"250 ok\r\n").await.unwrap();
        read_line(&mut server).await;
        server.write_all(b"354 continue\r\n").await.unwrap();
        loop {
            if read_line(&mut server).await == ".\r\n" {
                break;
            }
        }
        cancel.send(true).unwrap();
    });
    let error = smtp_send(&mut wire, &m, &data, &[], id, &SendJournal::default())
        .await
        .unwrap_err();
    assert!(error.contains("outcome is uncertain"));
    fixture.await.unwrap();
}

#[tokio::test]
async fn dropped_smtp_future_preserves_bounded_uncertain_evidence() {
    let (mut wire, mut server, _cancel) = pair();
    let m = message();
    let (data, _, id) = mime::compose(&m).unwrap();
    let evidence = SendJournal::default();
    let sent_id = id.clone();
    let fixture = tokio::spawn(async move {
        read_line(&mut server).await;
        server.write_all(b"250 ok\r\n").await.unwrap();
        read_line(&mut server).await;
        server.write_all(b"354 continue\r\n").await.unwrap();
        loop {
            if read_line(&mut server).await == ".\r\n" {
                break;
            }
        }
        let mut b = [0; 1];
        assert_eq!(server.read(&mut b).await.unwrap(), 0);
    });
    assert!(
        tokio::time::timeout(
            Duration::from_millis(30),
            smtp_send(&mut wire, &m, &data, &[], id, &evidence)
        )
        .await
        .is_err()
    );
    let entries = evidence.snapshot();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].message_id, sent_id);
    assert_eq!(entries[0].state, MailSendState::Uncertain);
    drop(wire);
    fixture.await.unwrap();
    for n in 1..64 {
        evidence
            .begin(&format!("<fixture-{n}@example.com>"))
            .unwrap();
    }
    assert!(evidence.begin("<overflow@example.com>").is_err());
    // Uncertain sends are never evicted just to admit more delivery attempts.
    assert_eq!(evidence.snapshot()[0].message_id, sent_id);
    evidence.accepted(&sent_id);
    evidence.begin("<new@example.com>").unwrap();
    assert_eq!(evidence.snapshot().len(), 64);
}
#[tokio::test]
async fn destination_policy_cannot_authorize_a_normalized_different_identity() {
    let (_tx, cancel) = watch::channel(false);
    let host = test_host(allow(), cancel);
    let mut config = pinned("93.184.216.34");
    config.config.user = " fixture-user ".into();
    assert!(host.effect(&config, "imap", "connect").is_err());
}
