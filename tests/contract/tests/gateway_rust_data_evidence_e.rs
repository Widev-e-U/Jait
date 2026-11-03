//! Consumer-level contract tests for `packages/gateway/src/channels/msteams/connector.ts`
//! against the native port in `jait_gateway::integrations::msteams`.
//!
//! Expectations are taken from the TypeScript reference: the service-URL
//! allowlist, `normalizeConversationId`, `stripTeamsMarkup`/`htmlToText`, and
//! `activityToInbound`.
use jait_gateway::integrations::msteams::{
    activity_to_inbound, html_to_text, is_allowed_service_url, normalize_conversation_id,
};
use serde_json::json;

#[test]
fn service_url_admission_accepts_only_https_bot_framework_endpoints() {
    // Allowed: the public Bot Framework service hosts used by the connector.
    assert!(is_allowed_service_url(
        "https://smba.trafficmanager.net/emea/"
    ));
    assert!(is_allowed_service_url(
        "https://region.botframework.azure.cn/teams/"
    ));

    // Plaintext is never admitted, even on an allowlisted host.
    assert!(!is_allowed_service_url("http://smba.trafficmanager.net/"));

    // Suffix confusion and prefix confusion: the host must match exactly or be
    // a real subdomain of an allowed host.
    assert!(!is_allowed_service_url(
        "https://smba.trafficmanager.net.evil.test/"
    ));
    assert!(!is_allowed_service_url(
        "https://evilsmba.trafficmanager.net/"
    ));

    // Embedded credentials, non-default ports, queries and fragments are
    // rejected rather than silently normalized away.
    assert!(!is_allowed_service_url(
        "https://user:pass@smba.trafficmanager.net/"
    ));
    assert!(!is_allowed_service_url(
        "https://smba.trafficmanager.net:444/"
    ));
    assert!(!is_allowed_service_url(
        "https://smba.trafficmanager.net/?x=y"
    ));
    assert!(!is_allowed_service_url(
        "https://smba.trafficmanager.net/#fragment"
    ));

    // Unparseable input is a rejection, not a panic.
    assert!(!is_allowed_service_url("not a url"));
    assert!(!is_allowed_service_url(""));
}

#[test]
fn conversation_id_strips_thread_and_message_suffixes() {
    // Teams appends `;messageid=` and thread suffixes; the connector keys
    // conversations on the bare thread id.
    assert_eq!(
        normalize_conversation_id("19:abc@thread.skype;messageid=123"),
        "19:abc@thread.skype"
    );
    assert_eq!(
        normalize_conversation_id("19:abc;messageid=root"),
        "19:abc"
    );
    assert_eq!(normalize_conversation_id("19:abc"), "19:abc");
    assert_eq!(normalize_conversation_id(""), "");
    assert_eq!(normalize_conversation_id("a;messageid="), "a");
}

#[test]
fn html_to_text_strips_mentions_tags_and_decodes_entities() {
    // `<at>` mentions are address prefixes, not message text; inline HTML is
    // flattened and entities are decoded.
    assert_eq!(
        html_to_text("<at>Ada</at> hello <b>there</b> &amp; &lt;x&gt;"),
        "hello there & <x>"
    );
    // Mention-only messages collapse to empty so they are dropped upstream.
    assert_eq!(html_to_text("<at>bot</at>"), "");
    // Non-breaking spaces render as ordinary spaces, then run-collapse.
    assert_eq!(html_to_text("hello&nbsp; there"), "hello there");
}

#[test]
fn activity_projection_matches_connector_contract() {
    let activity = json!({
        "type": "message",
        "text": "<at>Jait</at> hello there",
        "conversation": { "id": "19:abc@thread.skype;messageid=1700000000000" },
        "from": { "id": "user-1", "aadObjectId": "aad-1", "name": "Alice" },
        "recipient": { "id": "bot-1" },
        "timestamp": "2024-01-02T03:04:05.000Z"
    });
    let message = activity_to_inbound(&activity, 42.0).expect("message activity projects");
    assert_eq!(message.channel_id, "msteams");
    assert_eq!(message.conversation_id, "19:abc@thread.skype");
    assert_eq!(message.sender_id, "aad-1");
    assert_eq!(message.sender_name.as_deref(), Some("Alice"));
    assert_eq!(message.text, "hello there");
    // `Date.parse("2024-01-02T03:04:05.000Z")`, not the supplied fallback.
    assert_eq!(message.timestamp, 1_704_164_645_000.0);
    assert!(!message.from_me);
    assert!(!message.is_self_chat);
}

#[test]
fn activity_projection_rejects_unusable_activities_and_falls_back() {
    // Only `message` activities are inbound.
    assert!(activity_to_inbound(
        &json!({
            "type": "typing",
            "text": "hi",
            "conversation": { "id": "19:abc" }
        }),
        0.0
    )
    .is_none());
    // A message with no conversation cannot be routed.
    assert!(activity_to_inbound(
        &json!({ "type": "message", "text": "hi" }),
        0.0
    )
    .is_none());
    // Mention-only or empty bodies carry no user text.
    assert!(activity_to_inbound(
        &json!({
            "type": "message",
            "text": "<at>bot</at>",
            "conversation": { "id": "19:abc" }
        }),
        0.0
    )
    .is_none());

    // Without `aadObjectId` the connector falls back to the Teams user id, and
    // without any sender id to the conversation id.
    let no_aad = json!({
        "type": "message",
        "text": "hi",
        "conversation": { "id": "19:abc" },
        "from": { "id": "teams-user" }
    });
    assert_eq!(
        activity_to_inbound(&no_aad, 0.0).unwrap().sender_id,
        "teams-user"
    );

    let no_sender = json!({
        "type": "message",
        "text": "hi",
        "conversation": { "id": "19:abc" }
    });
    let projected = activity_to_inbound(&no_sender, 7.0).unwrap();
    assert_eq!(projected.sender_id, "19:abc");
    assert_eq!(projected.sender_name, None);
    // Missing/invalid timestamps fall back to the supplied clock.
    assert_eq!(projected.timestamp, 7.0);

    // Echoes of the bot's own message are flagged as `from_me`.
    let echo = json!({
        "type": "message",
        "text": "hi",
        "conversation": { "id": "19:abc" },
        "from": { "id": "bot-1" },
        "recipient": { "id": "bot-1" }
    });
    assert!(activity_to_inbound(&echo, 0.0).unwrap().from_me);
}
