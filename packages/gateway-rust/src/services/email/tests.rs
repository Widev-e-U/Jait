//! Focused source tests only; no real mail servers/accounts.
use super::*;
use serde_json::{Value, json};
use std::{
    collections::VecDeque,
    sync::{Arc, Mutex},
};
fn fixture(responses: Vec<Value>) -> (transport::Transport, Arc<Mutex<Vec<transport::Request>>>) {
    let replies = Arc::new(Mutex::new(VecDeque::from(responses)));
    let requests = Arc::new(Mutex::new(Vec::new()));
    let captured = requests.clone();
    (
        Arc::new(move |r| {
            captured.lock().unwrap().push(r);
            let response = replies
                .lock()
                .unwrap()
                .pop_front()
                .expect("unexpected provider request");
            Box::pin(async move {
                Ok(transport::Response {
                    status: 200,
                    data: Ok(response),
                })
            })
        }),
        requests,
    )
}
#[test]
fn strict_validation_rejects_header_injection_and_null() {
    for input in [
        json!({"to":"victim@example.com\r\nBcc: injected@example.com","subject":"s","body":"b"}),
        json!({"to":"x@example.com","subject":"s","body":"b","html":null}),
        json!({"to":"x@example.com","subject":"s","body":"b","unknown":true}),
        json!({"to":"","subject":"s","body":"b"}),
    ] {
        assert!(connection::send_email(input).is_err());
    }
    assert!(
        connection::send_email(
            json!({"to":"","subject":"","body":"reply","replyToMessageId":"safe/id"})
        )
        .is_ok()
    );
    assert!(connection::account_settings(json!({"signatureEnabled":null})).is_err());
}
#[tokio::test]
async fn rejects_mixed_public_private_dns_without_connecting() {
    let config = contracts::MailServerConfig {
        host: "mail.example.com".into(),
        port: 993.0,
        secure: true,
        user: "u".into(),
        password: "secret".into(),
    };
    let resolver: remote_images::ImageResolver =
        Arc::new(|_| Box::pin(async { Ok(vec!["8.8.8.8".into(), "127.0.0.1".into()]) }));
    assert!(
        connection::public_mail_server(&config, &resolver)
            .await
            .is_err()
    );
}
#[test]
fn imap_ids_bind_folder_uid_validity_and_safe_uid() {
    use base64::Engine;
    let id = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .encode(json!(["INBOX", "1234", 42]).to_string());
    let parsed = imap::parse_imap_message_id(&id).unwrap();
    assert_eq!(parsed.folder, "INBOX");
    assert_eq!(parsed.validity, "1234");
    assert_eq!(parsed.uid, 42);
    for value in [
        json!(["INBOX\r\nSELECT bad", "1", 1]),
        json!(["INBOX", "1", 0]),
        json!(["INBOX", "1", 9_007_199_254_740_992u64]),
        json!(["INBOX", 1, 1]),
    ] {
        let id = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(value.to_string());
        assert!(imap::parse_imap_message_id(&id).is_err());
    }
}
#[tokio::test]
async fn gmail_reply_encodes_id_and_builds_mime() {
    let (http, requests) = fixture(vec![json!({"threadId":"thread"}), json!({"id":"sent"})]);
    let gmail = gmail::GmailClient::new(http);
    let input=connection::send_email(json!({"to":"a@example.com","subject":"s","body":"body","replyToMessageId":"a/b?format=full"})).unwrap();
    assert_eq!(gmail.send_message("token", input).await.unwrap().id, "sent");
    let r = requests.lock().unwrap();
    assert!(r[0].url.contains("a%2Fb%3Fformat%3Dfull?format=metadata"));
    let body: Value = serde_json::from_str(r[1].body.as_ref().unwrap()).unwrap();
    assert_eq!(body["threadId"], "thread");
    use base64::Engine;
    let raw = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(body["raw"].as_str().unwrap())
        .unwrap();
    assert!(String::from_utf8(raw).unwrap().ends_with("\r\n\r\nbody"));
}
#[tokio::test]
async fn outlook_reply_uses_comment_and_preserves_id() {
    let (http, requests) = fixture(vec![json!({})]);
    let client = outlook::OutlookClient::new(http);
    let input = connection::send_email(
        json!({"to":"","subject":"","body":"reply","replyToMessageId":"id/with?query"}),
    )
    .unwrap();
    assert_eq!(
        client.send_message("token", input).await.unwrap().id,
        "id/with?query"
    );
    let r = requests.lock().unwrap();
    assert!(r[0].url.ends_with("/id%2Fwith%3Fquery/reply"));
    let body: Value = serde_json::from_str(r[0].body.as_ref().unwrap()).unwrap();
    assert_eq!(body["comment"], "reply");
    assert!(body["message"].get("toRecipients").is_none());
}
#[tokio::test]
async fn malformed_provider_collections_fail() {
    let (http, _) = fixture(vec![json!({"value":"wrong"})]);
    assert!(
        outlook::OutlookClient::new(http)
            .list_folders("token")
            .await
            .is_err()
    );
    let (http, _) = fixture(vec![
        json!({"messages":[{"id":"1"}]}),
        json!({"labels":[]}),
        json!({"payload":{}}),
    ]);
    assert!(
        gmail::GmailClient::new(http)
            .list_messages(
                "token",
                contracts::ListMessagesOptions {
                    folder: None,
                    query: None,
                    limit: None
                }
            )
            .await
            .is_err()
    );
}
#[test]
fn registry_requires_secure_servers_and_rejects_entities() {
    let xml = r#"<clientConfig><emailProvider id="example.com"><displayName>Example</displayName><incomingServer type="imap"><hostname>imap.example.com</hostname><port>993</port><socketType>SSL</socketType><username>%EMAILADDRESS%</username></incomingServer><outgoingServer type="smtp"><hostname>smtp.example.com</hostname><port>587</port><socketType>STARTTLS</socketType><username>%EMAILLOCALPART%</username></outgoingServer></emailProvider></clientConfig>"#;
    let settings =
        connection::parse_autoconfig_xml("user@example.com", "example.com", xml).unwrap();
    assert_eq!(settings.imap.user, "user@example.com");
    assert_eq!(settings.smtp.user, "user");
    assert!(!settings.smtp.secure);
    assert!(
        connection::parse_autoconfig_xml(
            "user@example.com",
            "example.com",
            &xml.replace("SSL", "plain")
        )
        .is_err()
    );
    assert!(
        connection::parse_autoconfig_xml(
            "user@example.com",
            "example.com",
            &format!("<!ENTITY x SYSTEM 'file:///x'>{xml}")
        )
        .is_err()
    );
}

struct TestProtocol {
    drops: Arc<std::sync::atomic::AtomicUsize>,
    pending_fetch: bool,
    flags: Arc<Mutex<Vec<(String, bool)>>>,
    validity: String,
}
struct TestSession {
    drops: Arc<std::sync::atomic::AtomicUsize>,
    pending_fetch: bool,
    flags: Arc<Mutex<Vec<(String, bool)>>>,
    validity: String,
}
impl Drop for TestSession {
    fn drop(&mut self) {
        self.drops.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    }
}
impl imap::ImapSession for TestSession {
    fn select<'a>(
        &'a mut self,
        folder: &'a str,
        _read_only: bool,
    ) -> futures_util::future::BoxFuture<'a, Result<imap::MailboxState, String>> {
        Box::pin(async move {
            Ok(imap::MailboxState {
                path: folder.into(),
                uid_validity: self.validity.clone(),
                exists: 1,
            })
        })
    }
    fn folders(
        &mut self,
        _max: usize,
    ) -> futures_util::future::BoxFuture<'_, Result<Vec<imap::HostFolder>, String>> {
        Box::pin(async { Ok(vec![]) })
    }
    fn search_tail<'a>(
        &'a mut self,
        _query: &'a str,
        _max: usize,
    ) -> futures_util::future::BoxFuture<'a, Result<Vec<u64>, String>> {
        Box::pin(async { Ok(vec![]) })
    }
    fn fetch(
        &mut self,
        _range: imap::FetchRange,
        _source: bool,
        _max_items: usize,
        _max_bytes: usize,
    ) -> futures_util::future::BoxFuture<'_, Result<Vec<imap::HostMessage>, String>> {
        let pending = self.pending_fetch;
        Box::pin(async move {
            if pending {
                std::future::pending::<()>().await;
            }
            Err("fixture has no source".into())
        })
    }
    fn flag<'a>(
        &'a mut self,
        _uid: u64,
        flag: &'a str,
        add: bool,
    ) -> futures_util::future::BoxFuture<'a, Result<(), String>> {
        Box::pin(async move {
            self.flags.lock().unwrap().push((flag.into(), add));
            Ok(())
        })
    }
    fn move_message<'a>(
        &'a mut self,
        _uid: u64,
        _folder: &'a str,
    ) -> futures_util::future::BoxFuture<'a, Result<(), String>> {
        Box::pin(async { panic!("permanent deletion must be disabled") })
    }
}
impl imap::MailProtocolHost for TestProtocol {
    fn imap(
        &self,
        server: connection::PinnedMailServer,
        limits: imap::ProtocolLimits,
    ) -> futures_util::future::BoxFuture<'_, Result<Box<dyn imap::ImapSession>, String>> {
        assert_eq!(server.config.host, "8.8.8.8");
        assert_eq!(server.servername, "mail.example.com");
        assert_eq!(limits.max_message_bytes, 10 * 1024 * 1024);
        let session = TestSession {
            drops: self.drops.clone(),
            pending_fetch: self.pending_fetch,
            flags: self.flags.clone(),
            validity: self.validity.clone(),
        };
        Box::pin(async { Ok(Box::new(session) as Box<dyn imap::ImapSession>) })
    }
    fn smtp(
        &self,
        _server: connection::PinnedMailServer,
        _limits: imap::ProtocolLimits,
        _message: Option<imap::SmtpMessage>,
    ) -> futures_util::future::BoxFuture<'_, Result<Option<String>, String>> {
        Box::pin(async { Err("SMTP was not expected in this fixture".into()) })
    }
    fn parse_mime(
        &self,
        _source: Vec<u8>,
        _max: usize,
    ) -> futures_util::future::BoxFuture<'_, Result<imap::ParsedMime, String>> {
        Box::pin(async { Err("MIME parse was not expected in this fixture".into()) })
    }
}
fn protocol(pending: bool, validity: &str) -> Arc<TestProtocol> {
    Arc::new(TestProtocol {
        drops: Arc::new(std::sync::atomic::AtomicUsize::new(0)),
        pending_fetch: pending,
        flags: Arc::new(Mutex::new(vec![])),
        validity: validity.into(),
    })
}
fn imap_client(host: Arc<TestProtocol>) -> imap::ImapMailboxClient {
    let config=connection::connect_mailbox(json!({"email":"user@example.com","imap":{"host":"mail.example.com","port":993,"secure":true,"user":"user","password":"secret"},"smtp":{"host":"mail.example.com","port":587,"secure":false,"user":"user","password":"secret"}})).unwrap();
    imap::ImapMailboxClient::new(
        config,
        host,
        Arc::new(|_| Box::pin(async { Ok(vec!["8.8.8.8".into()]) })),
    )
    .unwrap()
}
fn imap_id() -> String {
    use base64::Engine;
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(json!(["INBOX", "1", 1]).to_string())
}
#[tokio::test]
async fn imap_cancellation_drops_owned_session() {
    let host = protocol(true, "1");
    let client = imap_client(host.clone());
    assert!(
        tokio::time::timeout(
            std::time::Duration::from_millis(10),
            client.get_message("", &imap_id())
        )
        .await
        .is_err()
    );
    assert_eq!(host.drops.load(std::sync::atomic::Ordering::SeqCst), 1);
}
#[tokio::test]
async fn imap_uid_changes_and_permanent_deletion_fail_closed() {
    let host = protocol(false, "2");
    let client = imap_client(host.clone());
    assert_eq!(
        client.get_message("", &imap_id()).await.unwrap_err(),
        "Mailbox changed. Refresh the message list."
    );
    assert!(
        client
            .delete_message("", &imap_id())
            .await
            .unwrap_err()
            .contains("permanent deletion is disabled")
    );
    assert_eq!(host.drops.load(std::sync::atomic::Ordering::SeqCst), 2);
}
#[tokio::test]
async fn imap_unread_inverts_seen_and_starred_uses_flagged() {
    let host = protocol(false, "1");
    let client = imap_client(host.clone());
    client
        .tag_message(
            "",
            &imap_id(),
            vec!["UNREAD".into(), "STARRED".into()],
            vec!["UNREAD".into()],
        )
        .await
        .unwrap();
    assert_eq!(
        *host.flags.lock().unwrap(),
        vec![
            ("\\Seen".into(), false),
            ("\\Flagged".into(), true),
            ("\\Seen".into(), true)
        ]
    );
}

#[tokio::test]
async fn account_owner_oauth_replay_signature_and_disconnect() {
    let db = rusqlite::Connection::open_in_memory().unwrap();
    crate::db::migrate_database(&db).unwrap();
    let db =
        crate::db::worker::DatabaseWorker::new(db, std::num::NonZeroU16::new(16).unwrap()).unwrap();
    let clock: crate::time::Clock = Arc::new(|| 1_700_000_000_000);
    let secrets =
        crate::services::user_secrets::UserSecretService::with_clock("fixture", clock.clone());
    let (http, requests) = fixture(vec![
        json!({"access_token":"fixture-access","refresh_token":"fixture-refresh","expires_in":3600}),
        json!({"emailAddress":"user@example.com"}),
        json!({"id":"sent"}),
    ]);
    let email = Arc::new(service::EmailService::with_sources(
        db.clone(),
        secrets.clone(),
        http,
        protocol(false, "1"),
        Arc::new(|_| panic!("OAuth mailbox must not resolve IMAP")),
        clock,
        Arc::new(|_| {
            Some(oauth::OAuthClientCredentials {
                client_id: "fixture-id".into(),
                client_secret: "fixture-secret".into(),
            })
        }),
    ));
    let connect = email
        .start_connect(
            Some("owner"),
            contracts::OAuthEmailProvider::Gmail,
            "https://fixture.invalid/api/email/oauth/callback",
        )
        .await
        .unwrap();
    let url = url::Url::parse(connect["authUrl"].as_str().unwrap()).unwrap();
    let state = url
        .query_pairs()
        .find(|(k, _)| k == "state")
        .unwrap()
        .1
        .to_string();
    let account = email
        .complete_connect("fixture-code", &state)
        .await
        .unwrap();
    assert!(
        email
            .complete_connect("fixture-code", &state)
            .await
            .unwrap_err()
            .to_string()
            .contains("invalid or expired")
    );
    assert!(
        email
            .get_account(Some("other"), &account.id)
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        email
            .send_message(
                Some("other"),
                Some(&account.id),
                json!({"to":"recipient@example.com","subject":"s","body":"b"})
            )
            .await
            .is_err()
    );
    assert_eq!(requests.lock().unwrap().len(), 2);
    let updated = email
        .update_account(
            Some("owner"),
            &account.id,
            json!({"signature":"<hello>\n&bye","signatureEnabled":true,"displayName":"Name"}),
        )
        .await
        .unwrap();
    assert_eq!(updated.display_name, "Name");
    email
        .send_message(
            Some("owner"),
            Some(&account.id),
            json!({"to":"recipient@example.com","subject":"s","body":"<p>body</p>","html":true}),
        )
        .await
        .unwrap();
    use base64::Engine;
    let request = requests.lock().unwrap().last().unwrap().clone();
    let raw: Value = serde_json::from_str(request.body.as_ref().unwrap()).unwrap();
    let body = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(raw["raw"].as_str().unwrap())
        .unwrap();
    assert!(
        String::from_utf8(body)
            .unwrap()
            .contains("&lt;hello&gt;<br>&amp;bye")
    );
    assert!(!email.disconnect(Some("other"), &account.id).await.unwrap());
    assert!(email.disconnect(Some("owner"), &account.id).await.unwrap());
    assert!(email.list_accounts(Some("owner")).await.unwrap().is_empty());
    db.run(move |db| {
        assert!(
            secrets
                .list(db, Some("owner"), Some("email-account"))?
                .is_empty()
        );
        assert!(
            secrets
                .list(db, Some("owner"), Some("email-account-settings"))?
                .is_empty()
        );
        Ok(())
    })
    .await
    .unwrap();
    let (_, cancelled) = tokio::sync::watch::channel(false);
    let tools = crate::tools::email_tools::EmailTools {
        email: email.clone(),
        authorize: Arc::new(|_, _, _| Box::pin(async { Err("fixture policy denied".into()) })),
        ui: None,
    };
    let context = crate::tools::email_tools::EmailToolContext {
        user_id: Some("owner".into()),
        session_id: "fixture-session".into(),
        cancelled,
    };
    let result = tools
        .execute("email_delete", &json!({"id":"1"}), &context)
        .await;
    assert_eq!(result["ok"], false);
    assert_eq!(result["message"], "fixture policy denied");
    let (_, cancelled) = tokio::sync::watch::channel(true);
    let context = crate::tools::email_tools::EmailToolContext {
        user_id: Some("owner".into()),
        session_id: "fixture-session".into(),
        cancelled,
    };
    let result = tools
        .execute("email_send", &json!({"body":"never send"}), &context)
        .await;
    assert_eq!(result["message"], "Email operation cancelled");
    db.shutdown().await.unwrap();
}

#[tokio::test]
async fn gmail_full_preserves_padded_bodies_and_embeds_existing_inline_helper() {
    let (http, _) = fixture(vec![
        json!({"id":"message","payload":{"mimeType":"multipart/mixed","parts":[{"mimeType":"text/plain","body":{"data":"SGVsbG8="}},{"mimeType":"text/html","body":{"data":"PGltZyBzcmM9ImNpZDppbWFnZSI+"}},{"mimeType":"image/png","filename":"image.png","headers":[{"name":"Content-ID","value":"<image>"}],"body":{"data":"AA==","size":1}}]}}),
        json!({"labels":[]}),
    ]);
    let message = gmail::GmailClient::new(http)
        .get_message("token", "message")
        .await
        .unwrap();
    assert_eq!(message.body_text, "Hello");
    assert!(message.body_html.contains("data:image/png;base64,AA=="));
    assert!(message.summary.has_attachments);
}
