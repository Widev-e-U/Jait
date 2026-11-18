use futures_util::future::BoxFuture;
use jait_gateway::integrations::{channel_contracts::*, telegram::*};
use serde_json::{Value, json};
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, AtomicI64, Ordering},
};
use tokio::sync::mpsc;

struct MockTransport {
    calls: Mutex<Vec<(String, Value)>>,
    updates: tokio::sync::Mutex<mpsc::Receiver<Value>>,
    fail_handshake: AtomicBool,
    handshakes: Mutex<std::collections::VecDeque<Value>>,
}
impl TelegramTransport for MockTransport {
    fn request(
        &self,
        _token: String,
        method: &'static str,
        body: Option<Value>,
        _budget: std::time::Duration,
    ) -> BoxFuture<'_, Result<Value, String>> {
        Box::pin(async move {
            self.calls
                .lock()
                .unwrap()
                .push((method.into(), body.unwrap_or(Value::Null)));
            match method {
                "getMe" if !self.handshakes.lock().unwrap().is_empty() => {
                    Ok(self.handshakes.lock().unwrap().pop_front().unwrap())
                }
                "getMe" if self.fail_handshake.swap(false, Ordering::SeqCst) => {
                    Ok(json!({"ok":false,"error_code":401,"description":"Unauthorized"}))
                }
                "getMe" => Ok(json!({"ok":true,"result":{"id":123,"username":"owned_bot"}})),
                "getUpdates" => self
                    .updates
                    .lock()
                    .await
                    .recv()
                    .await
                    .ok_or_else(|| "closed".into()),
                "sendMessage" => Ok(json!({"ok":true,"result":{"message_id":42}})),
                _ => Ok(json!({"ok":true,"result":true})),
            }
        })
    }
}
struct Fixture {
    connector: TelegramConnector,
    transport: Arc<MockTransport>,
    updates: mpsc::Sender<Value>,
    inbound: Arc<Mutex<Vec<InboundMessage>>>,
    paired: Arc<Mutex<Vec<ChannelPairing>>>,
    statuses: Arc<Mutex<Vec<ChannelStatus>>>,
    clock: Arc<AtomicI64>,
    events: Arc<ChannelConnectorEvents>,
}
fn fixture(allow_send: bool) -> Fixture {
    let (tx, rx) = mpsc::channel(32);
    let transport = Arc::new(MockTransport {
        calls: Mutex::new(Vec::new()),
        updates: tokio::sync::Mutex::new(rx),
        fail_handshake: AtomicBool::new(false),
        handshakes: Mutex::new(std::collections::VecDeque::new()),
    });
    let clock = Arc::new(AtomicI64::new(1700000000000));
    let other = clock.clone();
    let connector = TelegramConnector::with_dependencies(
        transport.clone(),
        Arc::new(move |action| {
            Box::pin(async move {
                if !allow_send && matches!(action, TelegramAction::Send { .. }) {
                    Err("denied".into())
                } else {
                    Ok(())
                }
            })
        }),
        TelegramOptions {
            token: Some("123456:private-test-token".into()),
            retry_min_ms: 1,
            retry_max_ms: 2,
            ..Default::default()
        },
        Arc::new(move || other.load(Ordering::SeqCst)),
        None,
    );
    let inbound = Arc::new(Mutex::new(Vec::new()));
    let received = inbound.clone();
    let paired = Arc::new(Mutex::new(Vec::new()));
    let pairs = paired.clone();
    let statuses = Arc::new(Mutex::new(Vec::new()));
    let states = statuses.clone();
    let events = Arc::new(ChannelConnectorEvents {
        on_inbound: Arc::new(move |v| received.lock().unwrap().push(v)),
        on_paired: Some(Arc::new(move |v| pairs.lock().unwrap().push(v))),
        on_status: Arc::new(move |v, _| states.lock().unwrap().push(v)),
    });
    Fixture {
        connector,
        transport,
        updates: tx,
        inbound,
        paired,
        statuses,
        clock,
        events,
    }
}
async fn until(mut predicate: impl FnMut() -> bool) {
    tokio::time::timeout(std::time::Duration::from_secs(3), async {
        while !predicate() {
            tokio::task::yield_now().await;
        }
    })
    .await
    .expect("condition reached");
}
fn paired_config() -> ChannelConfig {
    ChannelConfig {
        allowed_senders: Some(vec!["owner".into()]),
        ..Default::default()
    }
}
fn message(text: &str) -> Value {
    json!({"message_id":10,"chat":{"id":-42},"from":{"id":7,"username":"owner"},"text":text,"date":123})
}

#[test]
fn helpers_match_shared_observable_shapes() {
    assert_eq!(
        parse_start_payload(" /start@owned_bot code "),
        Some("code".into())
    );
    assert_eq!(parse_start_payload("/start"), Some("".into()));
    assert_eq!(parse_start_payload("/start code extra"), None);
    assert_eq!(parse_start_payload("/starter code"), None);
    assert_eq!(
        extract_bot_token("token 123456:abcdefghijklmnopqrstuvwxyz123456 done"),
        Some("123456:abcdefghijklmnopqrstuvwxyz123456".into())
    );
    assert!(sanitize_return_url(Some("javascript:alert(1)")).is_none());
    assert_eq!(
        sanitize_return_url(Some(" https://jait.example ")),
        Some("https://jait.example/".into())
    );
    assert_eq!(poll_backoff_ms(1, 1000, 30000), 1000);
    assert_eq!(poll_backoff_ms(1000, 1000, 30000), 30000);
    assert!(is_fatal_poll_error(Some(401)));
    assert!(!is_fatal_poll_error(Some(409)));
    let v = message_to_inbound(&message("  hello  "), 0).unwrap();
    assert_eq!(v.text, "hello");
    assert_eq!(v.sender_name.as_deref(), Some("@owner"));
    assert_eq!(v.timestamp, 123000.0);
    assert_eq!(v.conversation_id, "-42");
    let menu = to_telegram_commands(&[
        ChannelCommandDescriptor {
            name: " Model ".into(),
            description: " Choose ".into(),
        },
        ChannelCommandDescriptor {
            name: "model".into(),
            description: "duplicate".into(),
        },
        ChannelCommandDescriptor {
            name: "".into(),
            description: "empty".into(),
        },
    ]);
    assert_eq!(menu, json!([{"command":"model","description":"Choose"}]));
    assert_eq!(generate_username_slug(16).unwrap().len(), 16);
}

#[tokio::test]
async fn polling_normalizes_messages_advances_offsets_and_stop_cancels_pending_poll() {
    let f = fixture(true);
    f.connector
        .start_connector(f.events.clone(), paired_config(), None)
        .await
        .unwrap();
    assert_eq!(f.connector.status(), ChannelStatus::Connected);
    f.updates
        .send(json!({"ok":true,"result":[{"update_id":3,"message":message("hello")}]}))
        .await
        .unwrap();
    until(|| f.inbound.lock().unwrap().len() == 1).await;
    until(|| {
        f.transport
            .calls
            .lock()
            .unwrap()
            .iter()
            .any(|(m, v)| m == "getUpdates" && v["offset"] == 4)
    })
    .await;
    f.connector.stop_connector().await.unwrap();
    assert_eq!(f.connector.status(), ChannelStatus::Stopped);
    let before = f.transport.calls.lock().unwrap().len();
    tokio::task::yield_now().await;
    assert_eq!(f.transport.calls.lock().unwrap().len(), before);
    assert!(
        f.connector
            .send_message(OutboundMessage {
                conversation_id: "-42".into(),
                text: "x".into(),
                choices: None
            })
            .await
            .is_err()
    );
}

#[tokio::test]
async fn deep_link_pairs_once_and_consumes_start_without_agent_dispatch() {
    let f = fixture(true);
    f.connector
        .start_connector(
            f.events.clone(),
            ChannelConfig::default(),
            Some(ChannelPairOptions {
                return_url: Some("https://jait.example".into()),
            }),
        )
        .await
        .unwrap();
    assert_eq!(f.connector.status(), ChannelStatus::Qr);
    let link = f.connector.current_link().unwrap();
    let code = url_payload(&link);
    f.updates.send(json!({"ok":true,"result":[{"update_id":1,"message":message(&format!("/start {code}"))}]})).await.unwrap();
    until(|| f.paired.lock().unwrap().len() == 1).await;
    until(|| f.connector.status() == ChannelStatus::Connected).await;
    assert!(f.inbound.lock().unwrap().is_empty());
    until(|| {
        f.transport.calls.lock().unwrap().iter().any(|(m, v)| {
            m == "sendMessage" && v["text"].as_str().unwrap_or("").contains("Back to Jait")
        })
    })
    .await;
    f.updates.send(json!({"ok":true,"result":[{"update_id":2,"message":message(&format!("/start {code}"))}]})).await.unwrap();
    until(|| {
        f.transport
            .calls
            .lock()
            .unwrap()
            .iter()
            .any(|(m, v)| m == "sendMessage" && v["text"] == "👋 I'm Jait. Just send me a message.")
    })
    .await;
    assert_eq!(f.paired.lock().unwrap().len(), 1);
    f.connector.stop_connector().await.unwrap();
}
fn url_payload(link: &str) -> String {
    link.split("?start=").nth(1).unwrap().to_owned()
}

#[tokio::test]
async fn expired_pairing_does_not_link_and_denied_send_never_reaches_transport() {
    let f = fixture(false);
    f.connector
        .start_connector(f.events.clone(), ChannelConfig::default(), None)
        .await
        .unwrap();
    let code = url_payload(&f.connector.current_link().unwrap());
    f.clock.fetch_add(300001, Ordering::SeqCst);
    f.updates.send(json!({"ok":true,"result":[{"update_id":1,"message":message(&format!("/start {code}"))}]})).await.unwrap();
    until(|| {
        f.transport
            .calls
            .lock()
            .unwrap()
            .iter()
            .filter(|(m, _)| m == "getUpdates")
            .count()
            >= 2
    })
    .await;
    assert!(f.paired.lock().unwrap().is_empty());
    assert!(
        !f.transport
            .calls
            .lock()
            .unwrap()
            .iter()
            .any(|(m, _)| m == "sendMessage")
    );
    f.connector.stop_connector().await.unwrap();
    f.connector
        .start_connector(f.events.clone(), paired_config(), None)
        .await
        .unwrap();
    assert!(
        f.connector
            .send_message(OutboundMessage {
                conversation_id: "recipient".into(),
                text: "payload".into(),
                choices: None
            })
            .await
            .is_err()
    );
    assert!(
        !f.transport
            .calls
            .lock()
            .unwrap()
            .iter()
            .any(|(m, _)| m == "sendMessage")
    );
    f.connector.stop_connector().await.unwrap();
}

#[tokio::test]
async fn choice_tokens_round_trip_and_command_scopes_are_independent() {
    let f = fixture(true);
    f.connector
        .start_connector(f.events.clone(), paired_config(), None)
        .await
        .unwrap();
    f.connector
        .send_message(OutboundMessage {
            conversation_id: "-42".into(),
            text: "Choose".into(),
            choices: Some(vec![ChannelChoice {
                label: "Long model".into(),
                value: "/model provider/long-model".into(),
            }]),
        })
        .await
        .unwrap();
    let token = f
        .transport
        .calls
        .lock()
        .unwrap()
        .iter()
        .find(|(m, _)| m == "sendMessage")
        .unwrap()
        .1["reply_markup"]["inline_keyboard"][0][0]["callback_data"]
        .as_str()
        .unwrap()
        .to_owned();
    f.updates
        .send(json!({"ok":true,"result":[{"update_id":4,"callback_query":{
            "id":"callback","from":{"id":7},"data":token,"message":message("button")
        }}]}))
        .await
        .unwrap();
    until(|| f.inbound.lock().unwrap().len() == 1).await;
    assert_eq!(
        f.inbound.lock().unwrap()[0].text,
        "/model provider/long-model"
    );
    f.connector
        .set_command_menu(vec![ChannelCommandDescriptor {
            name: "model".into(),
            description: "Choose".into(),
        }])
        .unwrap()
        .await
        .unwrap();
    assert_eq!(
        f.transport
            .calls
            .lock()
            .unwrap()
            .iter()
            .filter(|(m, _)| m == "setMyCommands")
            .count(),
        3
    );
    f.connector.stop_connector().await.unwrap();
}

#[tokio::test]
async fn fatal_handshake_reports_error_without_retry_or_leaked_token() {
    let f = fixture(true);
    f.transport.fail_handshake.store(true, Ordering::SeqCst);
    f.connector
        .start_connector(f.events.clone(), paired_config(), None)
        .await
        .unwrap();
    assert_eq!(f.connector.status(), ChannelStatus::Error);
    assert_eq!(
        f.transport
            .calls
            .lock()
            .unwrap()
            .iter()
            .filter(|(m, _)| m == "getMe")
            .count(),
        1
    );
    assert!(
        !f.transport
            .calls
            .lock()
            .unwrap()
            .iter()
            .any(|(m, _)| m == "getUpdates")
    );
    assert!(f.statuses.lock().unwrap().contains(&ChannelStatus::Error));
    f.connector.stop_connector().await.unwrap();
}

#[tokio::test]
async fn native_transport_rejects_credential_path_injection_before_network() {
    let transport = TelegramHttpTransport;
    assert!(
        transport
            .request(
                "token/../../private".into(),
                "getMe",
                None,
                std::time::Duration::from_secs(1)
            )
            .await
            .is_err()
    );
    assert!(
        transport
            .request(
                "123:token".into(),
                "../redirect",
                None,
                std::time::Duration::from_secs(1)
            )
            .await
            .is_err()
    );
}

#[tokio::test]
async fn repeated_transient_handshakes_report_one_error_then_recover() {
    let f = fixture(true);
    f.transport.handshakes.lock().unwrap().extend([
        json!({"ok":false,"error_code":503,"description":"first outage"}),
        json!({"ok":false,"error_code":502,"description":"second outage"}),
        json!({"ok":false,"error_code":503,"description":"third outage"}),
    ]);
    f.connector
        .start_connector(f.events.clone(), paired_config(), None)
        .await
        .unwrap();
    until(|| f.connector.status() == ChannelStatus::Connected).await;
    assert_eq!(
        *f.statuses.lock().unwrap(),
        vec![
            ChannelStatus::Connecting,
            ChannelStatus::Error,
            ChannelStatus::Connected
        ]
    );
    assert_eq!(
        f.transport
            .calls
            .lock()
            .unwrap()
            .iter()
            .filter(|(m, _)| m == "getMe")
            .count(),
        4
    );
    f.connector.stop_connector().await.unwrap();
}

#[tokio::test]
async fn fatal_reconnect_failure_is_reported_and_stops_retrying() {
    let f = fixture(true);
    f.transport.handshakes.lock().unwrap().extend([
        json!({"ok":false,"error_code":503,"description":"network down"}),
        json!({"ok":false,"error_code":401,"description":"revoked token"}),
    ]);
    f.connector
        .start_connector(f.events.clone(), paired_config(), None)
        .await
        .unwrap();
    until(|| {
        f.statuses
            .lock()
            .unwrap()
            .iter()
            .filter(|s| **s == ChannelStatus::Error)
            .count()
            == 2
    })
    .await;
    assert_eq!(f.connector.status(), ChannelStatus::Error);
    assert_eq!(
        f.transport
            .calls
            .lock()
            .unwrap()
            .iter()
            .filter(|(m, _)| m == "getMe")
            .count(),
        2
    );
    assert!(
        !f.transport
            .calls
            .lock()
            .unwrap()
            .iter()
            .any(|(m, _)| m == "getUpdates")
    );
    f.connector.stop_connector().await.unwrap();
}
