//! Notification text and activation parsing are platform independent and testable without Tauri.
use serde_json::{json, Value};

pub fn activation_from_arg(arg: &str) -> Option<Value> {
    if arg.len() > 8192 { return None; }
    let url = url::Url::parse(arg).ok()?;
    if url.scheme() != "jait-notification" || url.host_str() != Some("open") { return None; }
    let params: std::collections::HashMap<_, _> = url.query_pairs().into_owned().collect();
    let link = params.get("link")?;
    if !link.starts_with('/') || link.starts_with("//") || link.contains('\\') || link.chars().any(char::is_control) { return None; }
    let id = params.get("id")?;
    Some(json!({ "id": id, "link": link, "scope": params.get("scope") }))
}

pub fn activation_uri(payload: &Value) -> String {
    let mut url = url::Url::parse("jait-notification://open").unwrap();
    url.query_pairs_mut()
        .append_pair("id", payload.get("replaceId").or_else(|| payload.get("id")).and_then(Value::as_str).unwrap_or("jait"))
        .append_pair("link", payload.get("link").and_then(Value::as_str).unwrap_or("/chat"))
        .append_pair("scope", payload.get("scope").and_then(Value::as_str).unwrap_or(""));
    url.to_string()
}

fn xml_escape(value: &str) -> String {
    value.chars().filter(|c| !c.is_control() || matches!(c, '\n' | '\t'))
        .collect::<String>().replace('&', "&amp;").replace('<', "&lt;")
        .replace('>', "&gt;").replace('"', "&quot;").replace('\'', "&apos;")
}

pub fn toast_xml(payload: &Value) -> String {
    let title = xml_escape(payload.get("title").and_then(Value::as_str).unwrap_or("Jait"));
    let body = xml_escape(payload.get("body").and_then(Value::as_str).unwrap_or_default());
    let uri = xml_escape(&activation_uri(payload));
    let read_action = payload.get("markReadLink").and_then(Value::as_str)
        .filter(|link| link.starts_with("/messenger?") && !link.contains('\\') && !link.chars().any(char::is_control))
        .map(|link| {
            let mut action_payload = payload.clone();
            action_payload["link"] = json!(link);
            let action_uri = xml_escape(&activation_uri(&action_payload));
            format!(r#"<action content="Mark as read" activationType="protocol" arguments="{action_uri}"/>"#)
        }).unwrap_or_default();
    format!(r#"<toast activationType="protocol" launch="{uri}"><visual><binding template="ToastGeneric"><text>{title}</text><text>{body}</text></binding></visual><actions><action content="Open in Jait" activationType="protocol" arguments="{uri}"/>{read_action}</actions></toast>"#)
}

/// Windows tags are limited to 16 characters. Stable across process restarts.
pub fn toast_tag(id: &str) -> String {
    let hash = id.bytes().fold(0xcbf29ce484222325u64, |h, b| (h ^ b as u64).wrapping_mul(0x100000001b3));
    format!("{hash:016x}")
}

#[cfg(all(windows, feature = "shell"))]
pub fn show(app_id: &str, payload: &Value) -> Result<(), String> {
    use windows::{core::HSTRING, Data::Xml::Dom::XmlDocument, UI::Notifications::{ToastNotification, ToastNotificationManager}};
    let run = || -> windows::core::Result<()> {
        let doc = XmlDocument::new()?;
        doc.LoadXml(&HSTRING::from(toast_xml(payload)))?;
        let toast = ToastNotification::CreateToastNotification(&doc)?;
        let id = payload.get("replaceId").or_else(|| payload.get("id")).and_then(Value::as_str).unwrap_or("jait");
        toast.SetTag(&HSTRING::from(toast_tag(id)))?;
        toast.SetGroup(&HSTRING::from("jait"))?;
        ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(app_id))?.Show(&toast)
    };
    run().map_err(|e| e.to_string())
}

#[cfg(all(windows, feature = "shell"))]
pub fn remove(app_id: &str, id: &str) -> Result<(), String> {
    use windows::{core::HSTRING, UI::Notifications::ToastNotificationManager};
    let run = || -> windows::core::Result<()> {
        ToastNotificationManager::History()?.RemoveGroupedTagWithId(&HSTRING::from(toast_tag(id)), &HSTRING::from("jait"), &HSTRING::from(app_id))
    };
    run().map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn notification_round_trip_preserves_destination_and_scope() {
        let p = json!({"id":"event", "replaceId":"chat:1", "link":"/chat?sessionId=a%26b&projectId=p", "scope":"https://my.gateway"});
        let a = activation_from_arg(&activation_uri(&p)).unwrap();
        assert_eq!(a["id"], "chat:1");
        assert_eq!(a["link"], p["link"]);
        assert_eq!(a["scope"], p["scope"]);
    }
    #[test]
    fn read_action_preserves_exact_target_and_scope() {
        let read = "/messenger?action=mark-read&roomId=%21room&eventId=%24old&account=%40me&homeserver=https%3A%2F%2Fmatrix.test";
        let payload = json!({"id":"matrix:$old", "title":"Private", "link":"/messenger?roomId=%21room", "scope":"https://gateway.test", "markReadLink":read});
        let xml = toast_xml(&payload);
        assert!(xml.contains("content=\"Mark as read\""));
        let mut action_payload = payload.clone();
        action_payload["link"] = json!(read);
        let activation = activation_from_arg(&activation_uri(&action_payload)).unwrap();
        assert_eq!(activation["link"], read);
        assert_eq!(activation["id"], "matrix:$old");
        assert_eq!(activation["scope"], "https://gateway.test");
        assert!(!toast_xml(&json!({"markReadLink":"https://evil.test"})).contains("Mark as read"));
    }
    #[test]
    fn rejects_untrusted_activation_and_escapes_text() {
        for arg in ["https://example.com", "jait-notification://open?id=x&link=//evil", "jait-notification://other?id=x&link=/chat"] {
            assert!(activation_from_arg(arg).is_none());
        }
        let xml = toast_xml(&json!({"title":"<&\"", "body":"test"}));
        assert!(xml.contains("&lt;&amp;&quot;"));
        assert!(!xml.contains("<text><"));
        assert_eq!(toast_tag("chat:1").len(), 16);
        assert_ne!(toast_tag("chat:1"), toast_tag("chat:2"));
    }
}
