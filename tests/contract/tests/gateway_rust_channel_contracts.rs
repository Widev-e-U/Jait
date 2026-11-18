#[path = "../src/internal_driver.rs"]
mod internal_driver;
use futures_util::future::BoxFuture;
use jait_gateway::integrations::channel_contracts::*;
use serde::{Serialize, de::DeserializeOwned};
use serde_json::{Value, json};
use std::{path::PathBuf, sync::Arc};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn roundtrip<T: DeserializeOwned + Serialize>(values: &Value) {
    for v in values.as_array().unwrap() {
        let record: T = serde_json::from_value(v.clone()).unwrap();
        assert_eq!(
            serde_json::to_value(record).unwrap(),
            *v,
            "channel contract parity"
        );
    }
}
#[test]
fn actual_strict_typescript_fixtures_roundtrip_all_channel_records() {
    let r = internal_driver::call(
        &root(),
        &root()
            .join(".jait/artifacts/gateway-rust/native-channel-contracts")
            .join(uuid::Uuid::new_v4().to_string()),
        json!({"version":1,"calls":[{"op":"nativechannelcontracts.run"}]}),
        &|| false,
    )
    .unwrap()[0]
        .clone();
    assert_eq!(r["strictTypes"], true);
    assert_eq!(r["exports"], json!([]));
    let c = &r["corpus"];
    roundtrip::<ChannelStatus>(&c["status"]);
    roundtrip::<ChannelStatusDetail>(&c["detail"]);
    roundtrip::<ChannelPairing>(&c["pairing"]);
    roundtrip::<InboundMessage>(&c["inbound"]);
    roundtrip::<ChannelChoice>(&c["choice"]);
    roundtrip::<OutboundMessage>(&c["outbound"]);
    roundtrip::<ChannelCommandDescriptor>(&c["command"]);
    roundtrip::<ChannelPairOptions>(&c["options"]);
    roundtrip::<ChannelSetupGuide>(&c["guide"]);
    roundtrip::<ChannelConfig>(&c["config"]);
}
#[test]
fn closed_unions_and_required_fields_reject_malformed_native_json() {
    for input in [json!("stopping"), json!(null), json!(42)] {
        assert!(serde_json::from_value::<ChannelStatus>(input).is_err());
    }
    assert!(serde_json::from_value::<InboundMessage>(json!({"channelId":"x"})).is_err());
    assert!(serde_json::from_value::<ChannelConfig>(json!({"enabled":"true"})).is_err());
    assert!(
        serde_json::from_value::<ChannelSetupGuide>(
            json!({"link":"","suggestedName":"","suggestedUsername":""})
        )
        .is_err()
    );
    // Required-nullable QR must remain present in native construction/encoding.
    let guide = ChannelSetupGuide {
        link: "".into(),
        qr: None,
        suggested_name: "".into(),
        suggested_username: "".into(),
    };
    assert_eq!(serde_json::to_value(guide).unwrap()["qr"], Value::Null);
}
struct Connector;
impl ChannelConnector for Connector {
    type Error = String;
    fn id(&self) -> &str {
        "fixture"
    }
    fn label(&self) -> &str {
        "Fixture"
    }
    fn start(
        &self,
        _e: Arc<ChannelConnectorEvents>,
        _c: Option<ChannelConfig>,
        _o: Option<ChannelPairOptions>,
    ) -> BoxFuture<'_, Result<(), String>> {
        Box::pin(async { Ok(()) })
    }
    fn stop(&self) -> BoxFuture<'_, Result<(), String>> {
        Box::pin(async { Ok(()) })
    }
    fn send(&self, _m: OutboundMessage) -> BoxFuture<'_, Result<(), String>> {
        Box::pin(async { Ok(()) })
    }
    fn status(&self) -> ChannelStatus {
        ChannelStatus::Stopped
    }
    fn current_qr(&self) -> Option<String> {
        None
    }
}
#[tokio::test]
async fn connector_required_signatures_callbacks_and_optional_absence_are_expressible() {
    let c = Connector;
    assert_eq!(c.id(), "fixture");
    assert_eq!(c.label(), "Fixture");
    assert_eq!(c.supports_choices(), None);
    assert_eq!(c.status(), ChannelStatus::Stopped);
    assert_eq!(c.current_qr(), None);
    let events = Arc::new(ChannelConnectorEvents {
        on_inbound: Arc::new(|m| assert_eq!(m.channel_id, "fixture")),
        on_status: Arc::new(|s, d| {
            assert_eq!(s, ChannelStatus::Stopped);
            assert!(d.is_none());
        }),
        on_paired: Some(Arc::new(|p| assert_eq!(p.sender_id, "sender"))),
    });
    c.start(
        events.clone(),
        Some(ChannelConfig::default()),
        Some(ChannelPairOptions::default()),
    )
    .await
    .unwrap();
    c.send(OutboundMessage {
        conversation_id: "r".into(),
        text: "t".into(),
        choices: None,
    })
    .await
    .unwrap();
    c.stop().await.unwrap();
    (events.on_status)(ChannelStatus::Stopped, None);
    (events.on_paired.as_ref().unwrap())(ChannelPairing {
        sender_id: "sender".into(),
        sender_name: None,
        conversation_id: "r".into(),
    });
    assert!(c.pair(None).is_none());
    assert!(c.setup_guide().is_none());
    assert!(c.start_typing("r").is_none());
    assert!(c.send_live("r".into(), "t".into()).is_none());
    assert!(c.edit_live("r".into(), "m".into(), "t".into()).is_none());
    assert!(c.set_command_menu(vec![]).is_none());
    let _: Option<BoxFuture<'_, Result<(), String>>> = c.pair(None);
    let _: Option<BoxFuture<'_, Result<ChannelSetupGuide, String>>> = c.setup_guide();
    let _: Option<TypingStop> = c.start_typing("r");
    let _: Option<BoxFuture<'_, Result<Option<String>, String>>> =
        c.send_live("r".into(), "t".into());
}
