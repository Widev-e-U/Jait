//! Isolated contract checks. Path inclusion exercises the candidate without a
//! providers/mod.rs edit. These tests do not certify concrete adapter behavior.
pub use jait_gateway::providers::{
    acp_provider, codex_event_mapper, model_fetchers, provider_auth, registry, remote_cli, usage,
};
pub use jait_gateway::{execution, security};
#[path = "../src/providers/contracts.rs"]
#[allow(dead_code, unused_imports)]
mod contracts;

use contracts::*;
use serde_json::{Value, json};
use std::sync::{Arc, Mutex};

fn roundtrip<T: serde::de::DeserializeOwned + serde::Serialize>(wire: Value) {
    let typed: T = serde_json::from_value(wire.clone()).unwrap();
    assert_eq!(serde_json::to_value(typed).unwrap(), wire);
}

#[test]
fn complete_event_union_preserves_correlation_optional_null_and_rollback() {
    let events = [
        json!({"type":"usage","sessionId":"s","usage":{"inputTokens":2,"outputTokens":3,"scope":"turn"}}),
        json!({"type":"session.started","sessionId":"s"}),
        json!({"type":"session.completed","sessionId":"s"}),
        json!({"type":"session.error","sessionId":"s","error":"failure"}),
        json!({"type":"turn.started","sessionId":"s"}),
        json!({"type":"turn.started","sessionId":"s","turnId":"generation-2"}),
        json!({"type":"turn.completed","sessionId":"s"}),
        json!({"type":"token","sessionId":"s","content":"😀"}),
        json!({"type":"thinking","sessionId":"s","content":"reasoning"}),
        json!({"type":"tool.start","sessionId":"s","tool":"read","args":null}),
        json!({"type":"tool.start","sessionId":"s","tool":"read","args":{"p":"x"},"callId":"child","parentCallId":"parent"}),
        json!({"type":"tool.output","sessionId":"s","callId":"child","content":"fragment"}),
        json!({"type":"tool.result","sessionId":"s","tool":"read","ok":false,"message":"denied"}),
        json!({"type":"tool.result","sessionId":"s","tool":"read","ok":true,"message":"done","callId":"child","parentCallId":"parent","data":null}),
        json!({"type":"tool.result","sessionId":"s","tool":"read","ok":true,"message":"done","data":{"value":[1,false]}}),
        json!({"type":"tool.approval-required","sessionId":"s","tool":"write","args":null,"requestId":"approval-2"}),
        json!({"type":"message","sessionId":"s","role":"assistant","content":"answer"}),
        json!({"type":"message","sessionId":"s","role":"user","content":"question"}),
        json!({"type":"activity","sessionId":"s","kind":"progress","summary":"waiting"}),
        json!({"type":"activity","sessionId":"s","kind":"progress","summary":"waiting","payload":null}),
        json!({"type":"activity","sessionId":"s","kind":"progress","summary":"waiting","payload":[1,2]}),
        json!({"type":"content_rollback","sessionId":"s","contentLength":2,"segments":0}),
    ];
    for wire in events {
        let event: ProviderEvent = serde_json::from_value(wire.clone()).unwrap();
        assert_eq!(event.session_id(), "s");
        roundtrip::<ProviderEvent>(wire);
    }
}

#[test]
fn session_options_and_attachments_retain_wire_shapes() {
    for status in [
        "idle",
        "starting",
        "running",
        "completed",
        "interrupted",
        "error",
    ] {
        for mode in ["full-access", "supervised"] {
            roundtrip::<ProviderSession>(
                json!({"id":"s","providerId":"codex-account@node","threadId":"t","status":status,"runtimeMode":mode}),
            );
        }
    }
    roundtrip::<ProviderSession>(
        json!({"id":"s","providerId":"jait","threadId":"t","status":"error","runtimeMode":"supervised","error":"failed","startedAt":"a","completedAt":"b"}),
    );
    roundtrip::<StartSessionOptions>(
        json!({"threadId":"t","workingDirectory":"/project","mode":"supervised"}),
    );
    roundtrip::<StartSessionOptions>(
        json!({"threadId":"t","workingDirectory":"/project","mode":"full-access","model":"m","reasoningEffort":"high","env":{},"mcpServers":[
            {"name":"local","transport":"stdio","command":"engine","args":["--mode"],"env":{"CONFIG":"fixture"}},
            {"name":"remote","transport":"http","url":"https://example.test/mcp","headers":{"Authorization":"fixture"}},
            {"name":"legacy","transport":"sse","url":"https://example.test/sse","headers":{}}
        ]}),
    );
    roundtrip::<Vec<ProviderTurnAttachment>>(
        json!(["asset-ref", {"name":"image.png","mimeType":"image/png","data":"AA=="}]),
    );
    let guarded: security::consent_executor::RuntimeMode = RuntimeMode::Supervised.into();
    assert_eq!(guarded, security::consent_executor::RuntimeMode::Guarded);
    let full: security::consent_executor::RuntimeMode = RuntimeMode::FullAccess.into();
    assert_eq!(full, security::consent_executor::RuntimeMode::FullAccess);
}

#[test]
fn malformed_control_events_and_unknown_modes_fail_closed() {
    for wire in [
        json!({"type":"tool.approval-required","sessionId":"s","tool":"write","args":{}}),
        json!({"type":"tool.approval-required","sessionId":"s","tool":"write","requestId":"r"}),
        json!({"type":"tool.output","sessionId":"s","content":"no correlation"}),
        json!({"type":"message","sessionId":"s","role":"system","content":"untrusted"}),
        json!({"type":"content_rollback","sessionId":"s","contentLength":-1,"segments":0}),
        json!({"type":"not-an-event","sessionId":"s"}),
    ] {
        assert!(
            serde_json::from_value::<ProviderEvent>(wire.clone()).is_err(),
            "{wire}"
        );
    }
    assert!(
        serde_json::from_value::<StartSessionOptions>(
            json!({"threadId":"t","workingDirectory":"/p","mode":"guarded"})
        )
        .is_err()
    );
    assert!(
        serde_json::from_value::<ProviderTurnAttachment>(
            json!({"name":"x","mimeType":"image/png"})
        )
        .is_err()
    );
}

#[test]
fn existing_codex_and_acp_events_bridge_without_wire_changes() {
    // Exercise every variant of the existing mapper, not a replacement mapper.
    for wire in [
        json!({"type":"token","sessionId":"s","content":"text"}),
        json!({"type":"message","sessionId":"s","role":"assistant","content":"text"}),
        json!({"type":"activity","sessionId":"s","kind":"x","summary":"x","payload":null}),
        json!({"type":"tool.start","sessionId":"s","tool":"x","args":{},"callId":"c"}),
        json!({"type":"tool.output","sessionId":"s","callId":"c","content":"text"}),
        json!({"type":"tool.result","sessionId":"s","tool":"x","ok":true,"message":"ok","callId":"c","data":false}),
        json!({"type":"turn.started","sessionId":"s"}),
        json!({"type":"turn.completed","sessionId":"s"}),
        json!({"type":"session.completed","sessionId":"s"}),
        json!({"type":"session.error","sessionId":"s","error":"error"}),
        json!({"type":"usage","sessionId":"s","usage":{"inputTokens":0,"outputTokens":0}}),
    ] {
        let old: codex_event_mapper::ProviderEvent = serde_json::from_value(wire.clone()).unwrap();
        let acp = acp_provider::AcpEvent::Provider(old.clone());
        assert_eq!(
            serde_json::to_value(ProviderEvent::try_from(old).unwrap()).unwrap(),
            wire
        );
        assert_eq!(
            serde_json::to_value(ProviderEvent::try_from(acp).unwrap()).unwrap(),
            wire
        );
    }
    for acp in [
        acp_provider::AcpEvent::Thinking {
            session_id: "s".into(),
            content: "reasoning".into(),
        },
        acp_provider::AcpEvent::SessionStarted {
            session_id: "s".into(),
        },
    ] {
        let expected = acp.to_value();
        assert_eq!(
            serde_json::to_value(ProviderEvent::try_from(acp).unwrap()).unwrap(),
            expected
        );
    }
    let invalid = codex_event_mapper::ProviderEvent::Message {
        session_id: "s".into(),
        role: "system".into(),
        content: "x".into(),
    };
    assert_eq!(
        ProviderEvent::try_from(invalid).unwrap_err(),
        "Unsupported provider message role"
    );
}

// A compile/use probe of the new seam, not an implementation of an adapter.
#[derive(Default)]
struct BoundaryProbe {
    calls: Mutex<Vec<Value>>,
}
impl ProviderAdapter for BoundaryProbe {
    fn id(&self) -> &str {
        "probe"
    }
    fn info(&self) -> Value {
        json!({"id":"probe","available":true})
    }
    fn check_availability(&self) -> ProviderFuture<'static, ()> {
        Box::pin(async { Ok(()) })
    }
}
impl CliProviderAdapter for BoundaryProbe {
    fn start_session<'a>(
        &'a self,
        _: ProviderSessionContext<'a>,
        _: StartSessionOptions,
    ) -> ProviderFuture<'a, ProviderSession> {
        Box::pin(async { Err("probe does not start sessions".into()) })
    }
    fn send_turn<'a>(
        &'a self,
        c: ProviderSessionContext<'a>,
        session: &'a str,
        message: &'a str,
        attachments: Option<&'a [ProviderTurnAttachment]>,
    ) -> ProviderFuture<'a, ()> {
        Box::pin(async move {
            self.calls.lock().unwrap().push(json!([
                "send",
                c.owner_user_id,
                session,
                message,
                attachments
            ]));
            c.cancellation.wait_cancelled().await;
            Err("cancelled".into())
        })
    }
    fn interrupt_turn<'a>(
        &'a self,
        c: ProviderSessionContext<'a>,
        _: &'a str,
    ) -> ProviderFuture<'a, ()> {
        Box::pin(async move {
            c.cancellation.cancel();
            Ok(())
        })
    }
    fn respond_to_approval<'a>(
        &'a self,
        c: ProviderSessionContext<'a>,
        session: &'a str,
        request: &'a str,
        approved: bool,
    ) -> ProviderFuture<'a, ()> {
        Box::pin(async move {
            self.calls.lock().unwrap().push(json!([
                "approval",
                c.owner_user_id,
                session,
                request,
                approved
            ]));
            Ok(())
        })
    }
    fn stop_session<'a>(
        &'a self,
        _: ProviderSessionContext<'a>,
        _: &'a str,
    ) -> ProviderFuture<'a, ()> {
        Box::pin(async { Err("probe does not stop sessions".into()) })
    }
    fn on_event(&self, _: ProviderEventHandler) -> Unsubscribe {
        Box::new(|| {})
    }
}

#[tokio::test]
async fn object_safe_boundary_keeps_control_callable_while_send_is_pending() {
    let concrete = Arc::new(BoundaryProbe::default());
    let adapter: Arc<dyn CliProviderAdapter> = concrete.clone();
    let cancel = execution::process_runner::ProcessCancellation::default();
    let context = ProviderSessionContext {
        owner_user_id: "owner",
        cancellation: &cancel,
    };
    let attachments = [ProviderTurnAttachment::Image {
        name: "x.png".into(),
        mime_type: "image/png".into(),
        data: "AA==".into(),
    }];
    let mut send = adapter.send_turn(context, "session-2", "hello", Some(&attachments));
    assert!(futures_util::poll!(&mut send).is_pending());
    adapter
        .respond_to_approval(context, "session-2", "request-2", false)
        .await
        .unwrap();
    adapter.interrupt_turn(context, "session-2").await.unwrap();
    assert_eq!(send.await.unwrap_err(), "cancelled");
    assert_eq!(
        *concrete.calls.lock().unwrap(),
        vec![
            json!(["send","owner","session-2","hello",[{"name":"x.png","mimeType":"image/png","data":"AA=="}]]),
            json!(["approval", "owner", "session-2", "request-2", false]),
        ]
    );
    assert!(
        adapter
            .steer_turn(context, "session-2", "later", Some("generation-1"))
            .is_none()
    );
    assert_eq!(adapter.has_session("owner", "session-2"), None);
    assert!(adapter.list_models().is_none());
    assert!(adapter.get_auth_status().is_none());
    assert!(adapter.start_login().is_none());
    assert!(adapter.logout().is_none());
    assert!(adapter.send_login_input("code").is_none());
    assert!(adapter.reset_models().is_none());
    (adapter.on_event(Arc::new(|_| {})))();
}
