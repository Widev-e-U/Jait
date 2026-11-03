//! Consumer-level contract evidence for the native Rust implementations of the
//! migrated TypeScript gateway data/provider/email components.
//!
//! Every expectation below is derived from the TypeScript reference under
//! `packages/gateway/src/...` and pinned to literals. No network access: the
//! mail transport is an injectable `Arc<dyn Fn(Request) -> ..>`.

use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

use jait_gateway::services::calendar::{Request, Response, Transport};
use jait_gateway::services::email::contracts::{
    EmailAccountSettings, ListMessagesOptions, MailServerConfig,
};
use jait_gateway::services::email::connection as email_connection;
use jait_gateway::services::email::{gmail::GmailClient, outlook::OutlookClient};
use serde_json::{json, Value};

type Recorder = Arc<Mutex<Vec<Request>>>;

/// Transport stub: records every outgoing request and replays queued responses.
fn stub(responses: Vec<Response>) -> (Transport, Recorder) {
    let seen: Recorder = Arc::new(Mutex::new(Vec::new()));
    let seen2 = Arc::clone(&seen);
    let queue = Arc::new(Mutex::new(VecDeque::from(responses)));
    let transport: Transport = Arc::new(move |req: Request| {
        seen2.lock().unwrap().push(req);
        let next = queue.lock().unwrap().pop_front().unwrap_or(Response {
            status: 500,
            data: Err("stub exhausted".into()),
        });
        Box::pin(async move { Ok(next) })
    });
    (transport, seen)
}

fn ok(data: Value) -> Response {
    Response {
        status: 200,
        data: Ok(data),
    }
}

fn status(code: u16) -> Response {
    Response {
        status: code,
        data: Ok(json!({"error": {"code": code}})),
    }
}

fn header_value(req: &Request, name: &str) -> Option<String> {
    req.headers
        .iter()
        .find(|(k, _)| k.eq_ignore_ascii_case(name))
        .map(|(_, v)| {
            let raw = v.to_string();
            serde_json::from_str::<String>(&raw).unwrap_or(raw)
        })
}

/// `("maxResults", "25")` style pairs from a URL query string, order-insensitive.
fn query_pairs(url: &str) -> Vec<(String, String)> {
    let mut pairs: Vec<(String, String)> = url
        .split_once('?')
        .map(|(_, q)| {
            q.split('&')
                .filter(|p| !p.is_empty())
                .map(|p| match p.split_once('=') {
                    Some((k, v)) => (k.to_string(), v.to_string()),
                    None => (p.to_string(), String::new()),
                })
                .collect()
        })
        .unwrap_or_default();
    pairs.sort();
    pairs
}

fn gmail_message(id: &str, label_ids: Value) -> Value {
    json!({
        "id": id,
        "threadId": "thread-1",
        "labelIds": label_ids,
        "snippet": "preview text",
        "payload": {"headers": [
            {"name": "From", "value": "ann@example.com"},
            {"name": "To", "value": "me@example.com"},
            {"name": "Subject", "value": "Quarterly report"},
            {"name": "Date", "value": "Mon, 1 Jan 2024 09:00:00 +0000"}
        ]}
    })
}

fn gmail_labels() -> Value {
    json!({"labels": [{"id": "INBOX", "name": "Inbox"}, {"id": "UNREAD", "name": "Unread"}]})
}

mod gmail {
    use super::*;

    fn options(folder: Option<&str>, query: Option<&str>, limit: Option<f64>) -> ListMessagesOptions {
        ListMessagesOptions {
            folder: folder.map(str::to_string),
            query: query.map(str::to_string),
            limit,
        }
    }

    #[tokio::test]
    async fn list_messages_builds_ts_query_and_parses_summary() {
        let (transport, seen) = stub(vec![
            ok(json!({"messages": [{"id": "m1"}]})),
            ok(gmail_labels()),
            ok(gmail_message("m1", json!(["INBOX", "UNREAD", "CATEGORY_PERSONAL"]))),
        ]);
        let client = GmailClient::new(transport);

        let summaries = client
            .list_messages("tok", options(Some("inbox"), Some("from:ann"), Some(99.0)))
            .await
            .expect("list_messages");

        let seen = seen.lock().unwrap();
        assert_eq!(seen.len(), 3, "list, labels and metadata requests");
        assert_eq!(seen[0].method, "GET");
        assert!(seen[0]
            .url
            .starts_with("https://gmail.googleapis.com/gmail/v1/users/me/messages?"));
        // TS gmail.ts: maxResults is clamped to the 50 message cap.
        assert_eq!(
            query_pairs(&seen[0].url),
            vec![
                ("labelIds".to_string(), "INBOX".to_string()),
                ("maxResults".to_string(), "50".to_string()),
                ("q".to_string(), "from%3Aann".to_string()),
            ]
        );
        assert_eq!(header_value(&seen[0], "authorization").as_deref(), Some("Bearer tok"));

        assert!(seen[1]
            .url
            .starts_with("https://gmail.googleapis.com/gmail/v1/users/me/labels"));
        assert!(seen[2]
            .url
            .starts_with("https://gmail.googleapis.com/gmail/v1/users/me/messages/m1?"));
        assert!(seen[2].url.contains("format=metadata"));
        assert!(seen[2].url.contains("metadataHeaders=Subject"));

        assert_eq!(summaries.len(), 1);
        let m = &summaries[0];
        assert_eq!(m.id, "m1");
        assert_eq!(m.thread_id.as_deref(), Some("thread-1"));
        assert_eq!(m.from, "ann@example.com");
        assert_eq!(m.to, "me@example.com");
        assert_eq!(m.subject, "Quarterly report");
        assert_eq!(m.date, "Mon, 1 Jan 2024 09:00:00 +0000");
        assert_eq!(m.snippet, "preview text");
        assert!(m.unread);
        // CATEGORY_* labels are dropped and known ids are humanised via /labels.
        assert_eq!(
            m.labels,
            vec!["Inbox".to_string(), "Unread".to_string()]
        );
        assert!(!m.has_attachments);
    }

    #[tokio::test]
    async fn list_messages_empty_inbox_skips_label_lookup() {
        let (transport, seen) = stub(vec![ok(json!({"messages": []}))]);
        let client = GmailClient::new(transport);

        let summaries = client
            .list_messages("tok", options(None, None, None))
            .await
            .expect("list_messages");

        assert!(summaries.is_empty());
        let seen = seen.lock().unwrap();
        assert_eq!(seen.len(), 1, "only the list request is issued");
        // Defaults follow TS: 25 messages when no limit is supplied.
        assert_eq!(
            query_pairs(&seen[0].url),
            vec![("maxResults".to_string(), "25".to_string())]
        );
    }

    #[tokio::test]
    async fn list_messages_rejects_more_than_page_limit() {
        let ids: Vec<Value> = (0..51).map(|i| json!({"id": format!("m{i}")})).collect();
        let (transport, seen) = stub(vec![ok(json!({"messages": ids}))]);
        let client = GmailClient::new(transport);

        let err = client
            .list_messages("tok", options(None, None, None))
            .await
            .expect_err("51 messages exceeds the 50 message page limit");
        assert_eq!(err, "Gmail returned too many messages");
        assert_eq!(seen.lock().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn http_error_status_is_mapped_with_provider_prefix() {
        let (transport, _seen) = stub(vec![status(401)]);
        let client = GmailClient::new(transport);

        let err = client
            .list_messages("tok", options(None, None, None))
            .await
            .expect_err("401 must surface as an error");
        assert_eq!(err, "Gmail API error: HTTP 401");
    }
}

mod outlook {
    use super::*;

    fn options(folder: Option<&str>, query: Option<&str>, limit: Option<f64>) -> ListMessagesOptions {
        ListMessagesOptions {
            folder: folder.map(str::to_string),
            query: query.map(str::to_string),
            limit,
        }
    }

    fn outlook_message() -> Value {
        json!({
            "id": "AAMk1",
            "conversationId": "conv-1",
            "subject": "Hello",
            "bodyPreview": "body preview",
            "receivedDateTime": "2024-01-01T09:00:00Z",
            "isRead": false,
            "hasAttachments": true,
            "categories": ["Blue category"],
            "from": {"emailAddress": {"address": "ann@example.com", "name": "Ann"}},
            "toRecipients": [
                {"emailAddress": {"address": "me@example.com", "name": "Me"}},
                {"emailAddress": {"address": "bob@example.com"}}
            ]
        })
    }

    #[tokio::test]
    async fn list_messages_uses_graph_folder_path_and_parses_summary() {
        let (transport, seen) = stub(vec![ok(json!({"value": [outlook_message()]}))]);
        let client = OutlookClient::new(transport);

        let summaries = client
            .list_messages("tok", options(Some("Sent Items"), Some("q\"uote"), Some(7.0)))
            .await
            .expect("list_messages");

        let seen = seen.lock().unwrap();
        assert_eq!(seen.len(), 1);
        assert_eq!(seen[0].method, "GET");
        assert!(seen[0].url.starts_with(
            "https://graph.microsoft.com/v1.0/me/mailFolders/Sent%20Items/messages?"
        ));
        // `$search` quotes are stripped by TS and paging is capped at 50.
        assert_eq!(
            query_pairs(&seen[0].url),
            vec![
                ("%24search".to_string(), "%22quote%22".to_string()),
                (
                    "%24select".to_string(),
                    "id%2CconversationId%2Csubject%2CbodyPreview%2CreceivedDateTime%2CisRead%2ChasAttachments%2Ccategories%2Cfrom%2CtoRecipients".to_string()
                ),
                ("%24top".to_string(), "7".to_string()),
            ]
        );
        assert_eq!(header_value(&seen[0], "authorization").as_deref(), Some("Bearer tok"));
        assert_eq!(header_value(&seen[0], "consistencylevel").as_deref(), Some("eventual"));

        let m = &summaries[0];
        assert_eq!(m.id, "AAMk1");
        assert_eq!(m.thread_id.as_deref(), Some("conv-1"));
        assert_eq!(m.from, "Ann <ann@example.com>");
        assert_eq!(m.to, "Me <me@example.com>, bob@example.com");
        assert_eq!(m.subject, "Hello");
        assert_eq!(m.snippet, "body preview");
        assert_eq!(m.date, "2024-01-01T09:00:00Z");
        assert!(m.unread);
        assert!(m.has_attachments);
        assert_eq!(m.labels, vec!["Blue category".to_string()]);
    }

    #[tokio::test]
    async fn list_messages_without_query_orders_by_received_date() {
        let (transport, seen) = stub(vec![ok(json!({"value": []}))]);
        let client = OutlookClient::new(transport);

        let summaries = client
            .list_messages("tok", options(None, Some(""), None))
            .await
            .expect("list_messages");
        assert!(summaries.is_empty());

        let seen = seen.lock().unwrap();
        // Empty folder/query fall back to the inbox folder and the $orderby branch.
        assert!(seen[0]
            .url
            .starts_with("https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?"));
        let pairs = query_pairs(&seen[0].url);
        assert!(pairs.contains(&("%24orderby".to_string(), "receivedDateTime+desc".to_string())));
        assert!(pairs.contains(&("%24top".to_string(), "25".to_string())));
        assert!(!pairs.iter().any(|(k, _)| k == "%24search"));
    }

    #[tokio::test]
    async fn list_messages_rejects_more_than_page_limit() {
        let items: Vec<Value> = (0..51).map(|_| outlook_message()).collect();
        let (transport, _seen) = stub(vec![ok(json!({"value": items}))]);
        let client = OutlookClient::new(transport);

        let err = client
            .list_messages("tok", options(None, None, None))
            .await
            .expect_err("51 messages exceeds the 50 message page limit");
        assert_eq!(err, "Outlook returned too many messages");
    }

    #[tokio::test]
    async fn graph_error_status_is_mapped_with_provider_prefix() {
        let (transport, _seen) = stub(vec![status(503)]);
        let client = OutlookClient::new(transport);

        let err = client
            .list_messages("tok", options(None, None, None))
            .await
            .expect_err("503 must surface as an error");
        assert_eq!(err, "Microsoft Graph error: HTTP 503");
    }
}

mod transport {
    use super::*;

    #[tokio::test]
    async fn gmail_requests_do_not_send_consistency_level() {
        let (transport, seen) = stub(vec![ok(json!({"messages": []}))]);
        let client = GmailClient::new(transport);
        client
            .list_messages(
                "tok",
                ListMessagesOptions {
                    folder: None,
                    query: None,
                    limit: None,
                },
            )
            .await
            .expect("list_messages");

        let seen = seen.lock().unwrap();
        assert_eq!(header_value(&seen[0], "consistencylevel").as_deref(), None);
        assert_eq!(header_value(&seen[0], "authorization").as_deref(), Some("Bearer tok"));
    }

    #[tokio::test]
    async fn outlook_search_requests_send_consistency_level() {
        let (transport, seen) = stub(vec![ok(json!({"value": []}))]);
        let client = OutlookClient::new(transport);
        client
            .list_messages(
                "tok",
                ListMessagesOptions {
                    folder: None,
                    query: Some("hello".into()),
                    limit: None,
                },
            )
            .await
            .expect("list_messages");

        let seen = seen.lock().unwrap();
        assert_eq!(header_value(&seen[0], "consistencylevel").as_deref(), Some("eventual"));
        assert_eq!(seen[0].method, "GET");
        assert_eq!(seen[0].body, None);
    }

    #[tokio::test]
    async fn provider_error_messages_are_distinct_per_provider() {
        let (g_transport, _g) = stub(vec![status(429)]);
        let gmail_err = GmailClient::new(g_transport)
            .list_messages(
                "tok",
                ListMessagesOptions {
                    folder: None,
                    query: None,
                    limit: None,
                },
            )
            .await
            .expect_err("429 is an error");
        assert_eq!(gmail_err, "Gmail API error: HTTP 429");

        let (o_transport, _o) = stub(vec![status(429)]);
        let outlook_err = OutlookClient::new(o_transport)
            .list_messages(
                "tok",
                ListMessagesOptions {
                    folder: None,
                    query: None,
                    limit: None,
                },
            )
            .await
            .expect_err("429 is an error");
        assert_eq!(outlook_err, "Microsoft Graph error: HTTP 429");
        assert_ne!(gmail_err, outlook_err);
    }
}

mod mailbox_validators {
    use super::*;

    fn server(host: &str, port: f64, user: &str, password: &str) -> MailServerConfig {
        MailServerConfig {
            host: host.into(),
            port,
            secure: true,
            user: user.into(),
            password: password.into(),
        }
    }

    #[test]
    fn validate_email_trims_and_rejects_malformed_addresses() {
        assert_eq!(
            email_connection::validate_email("  Ann@Example.COM  ").expect("valid address"),
            "Ann@Example.COM"
        );
        assert_eq!(
            email_connection::validate_email("not-an-address").unwrap_err(),
            "Invalid email address"
        );
        assert_eq!(
            email_connection::validate_email("ann..b@example.com").unwrap_err(),
            "Invalid email address"
        );
    }

    #[test]
    fn validate_server_trims_and_enforces_port_range() {
        let trimmed = email_connection::validate_server(server(" imap.example.com ", 993.0, " ann ", "pw"))
            .expect("valid server");
        assert_eq!(trimmed.host, "imap.example.com");
        assert_eq!(trimmed.user, "ann");

        assert_eq!(
            email_connection::validate_server(server("imap.example.com", 0.0, "ann", "pw")).unwrap_err(),
            "Invalid mail port"
        );
        assert_eq!(
            email_connection::validate_server(server("imap.example.com", 993.5, "ann", "pw")).unwrap_err(),
            "Invalid mail port"
        );
        assert_eq!(
            email_connection::validate_server(server("imap.example.com", 65536.0, "ann", "pw"))
                .unwrap_err(),
            "Invalid mail port"
        );
        assert_eq!(
            email_connection::validate_server(server("imap example com", 993.0, "ann", "pw")).unwrap_err(),
            "Enter a hostname or IP address"
        );
        assert_eq!(
            email_connection::validate_server(server("imap.example.com", 993.0, "ann", "")).unwrap_err(),
            "Invalid mailbox credentials"
        );
    }

    #[test]
    fn send_email_requires_recipient_or_reply_and_blocks_header_injection() {
        let no_recipient = json!({"to": "   ", "subject": "Hi", "body": "text"});
        assert_eq!(
            email_connection::send_email(no_recipient).unwrap_err(),
            "A recipient or reply message is required"
        );

        let injected = json!({"to": "ann@example.com\nBcc: eve@example.com", "subject": "Hi", "body": "text"});
        assert_eq!(
            email_connection::send_email(injected).unwrap_err(),
            "Mail headers cannot contain line breaks"
        );

        let ok = email_connection::send_email(json!({
            "to": " ann@example.com ",
            "subject": "Hi",
            "body": "text",
            "replyToMessageId": "<abc@example.com>"
        }))
        .expect("valid message");
        assert_eq!(ok.to, " ann@example.com ");
        assert_eq!(ok.subject, "Hi");
        assert_eq!(ok.reply_to_message_id.as_deref(), Some("<abc@example.com>"));
    }

    #[test]
    fn send_email_body_limit_is_two_mebibytes() {
        let body = "a".repeat(2 * 1024 * 1024);
        email_connection::send_email(json!({"to": "ann@example.com", "subject": "Hi", "body": body}))
            .expect("exactly 2 MiB is accepted");

        let body = "a".repeat(2 * 1024 * 1024 + 1);
        assert_eq!(
            email_connection::send_email(json!({"to": "ann@example.com", "subject": "Hi", "body": body}))
                .unwrap_err(),
            "Email body is too large"
        );
    }

    #[test]
    fn account_settings_enforces_signature_limit() {
        let settings: EmailAccountSettings = serde_json::from_value(json!({
            "displayName": "  Ann  ",
            "signature": "sig",
            "signatureEnabled": true
        }))
        .expect("settings deserialize");
        assert_eq!(settings.display_name.as_deref(), Some("  Ann  "));

        assert_eq!(
            email_connection::account_settings(json!({
                "signature": "s".repeat(10_001)
            }))
            .unwrap_err(),
            "Signature is too long"
        );
        let trimmed = email_connection::account_settings(json!({"displayName": "  Ann  "}))
            .expect("valid settings");
        assert_eq!(trimmed.display_name.as_deref(), Some("Ann"));
    }
}
