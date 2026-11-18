//! Messenger factories over an explicit bridge port. Connection setup returns a
//! private sign-in link; this module neither discovers credentials nor signs in.
use super::{core_io::HostError, core_jait::JaitPort};
use crate::{
    services::messenger_bridge::{MessengerAbortSignal, MessengerBridge, parse_messenger_command},
    text::{js_trim, js_whitespace},
};
use serde_json::{Value, json};
use std::sync::{Arc, LazyLock};

pub fn metadata() -> &'static Value {
    static DATA: LazyLock<Value> = LazyLock::new(|| {
        serde_json::from_str(include_str!("messenger-tools-metadata.json")).unwrap()
    });
    &DATA
}
fn fail(message: impl Into<String>) -> Value {
    json!({"ok":false,"message":message.into()})
}
fn length(s: &str) -> usize {
    s.encode_utf16().count()
}
fn keys(input: &Value) -> Vec<&String> {
    let mut keys: Vec<_> = input.as_object().unwrap().keys().collect();
    keys.sort_by_key(|key| {
        key.parse::<u32>()
            .ok()
            .filter(|n| *n < u32::MAX && n.to_string() == ***key)
            .map_or((1, 0), |n| (0, n))
    });
    keys
}
fn spread(input: &Value) -> Value {
    if input.is_object() {
        return input.clone();
    }
    let mut object = json!({});
    if let Some(values) = input.as_array() {
        for (i, value) in values.iter().enumerate() {
            object[i.to_string()] = value.clone();
        }
    } else if let Some(text) = input.as_str() {
        // Spread string indices matter for strict unknown-key diagnostics; their
        // values are never read by any published Messenger command schema.
        for (i, _) in text.encode_utf16().enumerate() {
            object[i.to_string()] = Value::Null;
        }
    }
    object
}
fn kind(value: &Value) -> &'static str {
    match value {
        Value::Null => "null",
        Value::Bool(_) => "boolean",
        Value::Number(_) => "number",
        Value::String(_) => "string",
        Value::Array(_) => "array",
        Value::Object(_) => "object",
    }
}
fn expected(
    input: &Value,
    key: &str,
    wanted: &str,
    optional: bool,
    errors: &mut Vec<String>,
) -> bool {
    match input.get(key) {
        None => {
            if !optional {
                errors.push(format!("{key}: Required"));
            }
            false
        }
        Some(value) if kind(value) == wanted => true,
        Some(value) => {
            errors.push(format!(
                "{key}: Expected {wanted}, received {}",
                kind(value)
            ));
            false
        }
    }
}
fn string(
    input: &Value,
    key: &str,
    optional: bool,
    min: usize,
    max: usize,
    trim: bool,
    errors: &mut Vec<String>,
) {
    if !expected(input, key, "string", optional, errors) {
        return;
    }
    let value = input[key].as_str().unwrap();
    let value = if trim { js_trim(value) } else { value };
    if length(value) < min {
        errors.push(format!(
            "{key}: String must contain at least {min} character(s)"
        ));
    }
    if length(value) > max {
        errors.push(format!(
            "{key}: String must contain at most {max} character(s)"
        ));
    }
}
fn room(input: &Value, optional: bool, errors: &mut Vec<String>) {
    string(input, "roomId", optional, 3, 512, false, errors);
    if let Some(value) = input["roomId"].as_str()
        && !value.starts_with('!')
    {
        errors.push("roomId: Invalid input: must start with \"!\"".into());
    }
}
fn limit(input: &Value, errors: &mut Vec<String>) {
    if !expected(input, "limit", "number", true, errors) {
        return;
    }
    let value = input["limit"].as_f64().unwrap();
    if value.fract() != 0.0 {
        errors.push("limit: Expected integer, received float".into());
    }
    if value < 1.0 {
        errors.push("limit: Number must be greater than or equal to 1".into());
    }
    if value > 50.0 {
        errors.push("limit: Number must be less than or equal to 50".into());
    }
}
fn user_id(value: &str) -> bool {
    value
        .strip_prefix('@')
        .and_then(|value| value.split_once(':'))
        .is_some_and(|(name, server)| {
            !name.is_empty()
                && !server.is_empty()
                && !name.chars().chain(server.chars()).any(js_whitespace)
        })
}
fn command_errors(action: &str, input: &Value) -> Vec<String> {
    let mut errors = vec![];
    let allowed: &[&str] = match action {
        "rooms" => {
            string(input, "query", true, 0, 200, false, &mut errors);
            string(input, "service", true, 0, 100, false, &mut errors);
            limit(input, &mut errors);
            &["action", "query", "service", "limit"]
        }
        "messages" => {
            room(input, false, &mut errors);
            limit(input, &mut errors);
            expected(input, "earlier", "boolean", true, &mut errors);
            &["action", "roomId", "limit", "earlier"]
        }
        "search" => {
            string(input, "query", false, 1, 200, true, &mut errors);
            room(input, true, &mut errors);
            limit(input, &mut errors);
            &["action", "query", "roomId", "limit"]
        }
        "send" => {
            room(input, false, &mut errors);
            string(input, "text", false, 1, 10_000, false, &mut errors);
            if input["text"]
                .as_str()
                .is_some_and(|text| js_trim(text).is_empty())
            {
                errors.push("text: Invalid input".into());
            }
            &["action", "roomId", "text"]
        }
        "open" => {
            string(input, "userId", false, 0, 512, false, &mut errors);
            if input["userId"]
                .as_str()
                .is_some_and(|value| !user_id(value))
            {
                errors.push("userId: Invalid".into());
            }
            &["action", "userId"]
        }
        _ => &["action"],
    };
    let extra = keys(input)
        .into_iter()
        .filter(|key| !allowed.contains(&key.as_str()))
        .map(|key| format!("'{key}'"))
        .collect::<Vec<_>>();
    if !extra.is_empty() {
        errors.push(format!(
            ": Unrecognized key(s) in object: {}",
            extra.join(", ")
        ));
    }
    errors
}
fn connect(input: &Value) -> Value {
    const BAD_FIELDS: &str = "Provide a homeserver and optional username only. Enter credentials privately in Messenger.";
    const BAD_URL: &str = "Invalid homeserver. Use HTTPS (or loopback HTTP), without credentials, query parameters, or fragments.";
    let Some(body) = input.as_object() else {
        return fail(BAD_FIELDS);
    };
    let Some(server) = input["homeserver"]
        .as_str()
        .filter(|server| length(server) <= 2048)
    else {
        return fail(BAD_FIELDS);
    };
    if body
        .keys()
        .any(|key| !matches!(key.as_str(), "homeserver" | "username"))
        || body
            .get("username")
            .is_some_and(|value| value.as_str().is_none_or(|value| length(value) > 512))
    {
        return fail(BAD_FIELDS);
    }
    let Ok(url) = url::Url::parse(server) else {
        return fail(BAD_URL);
    };
    let allowed = url.scheme() == "https"
        || url.scheme() == "http"
            && matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
    if !allowed
        || !url.username().is_empty()
        || url.password().is_some_and(|s| !s.is_empty())
        || url.query().is_some_and(|s| !s.is_empty())
        || url.fragment().is_some_and(|s| !s.is_empty())
    {
        return fail(BAD_URL);
    }
    let server = url.to_string();
    let mut params = url::form_urlencoded::Serializer::new(String::new());
    params.append_pair("homeserver", server.strip_suffix('/').unwrap_or(&server));
    if let Some(user) = input["username"].as_str().filter(|user| !user.is_empty()) {
        params.append_pair("username", user);
    }
    json!({"ok":true,"message":"Sign-in prepared. Open the link and enter credentials privately, then enable Allow assistant access in Connections to use messaging tools.","data":{"connected":false,"href":format!("/messenger?{}",params.finish())}})
}

/// A bridge request receives the original cancellation host, owner, and validated
/// command. It is never retried here. Executor consent remains mandatory.
pub struct MessengerTools<C> {
    pub request: JaitPort<C>,
}
impl<C: Send + Sync> MessengerTools<C> {
    pub async fn execute(
        &self,
        name: &str,
        input: &Value,
        context: &Value,
        signal: &C,
    ) -> Result<Value, HostError> {
        let Some(action) = name.strip_prefix("messenger.") else {
            return Ok(fail("Unknown Messenger tool."));
        };
        if action == "connect" {
            return Ok(connect(input));
        }
        if !matches!(
            action,
            "status" | "rooms" | "messages" | "search" | "send" | "open"
        ) {
            return Ok(fail("Unknown Messenger tool."));
        }
        let mut command = spread(input);
        command["action"] = json!(action);
        let Some(command) = parse_messenger_command(&command) else {
            return Ok(fail(format!(
                "Invalid Messenger arguments: {}",
                command_errors(action, &command).join("; ")
            )));
        };
        Ok(
            (self.request)("request", vec![context["userId"].clone(), command], signal)
                .await?
                .unwrap_or(Value::Null),
        )
    }
}
impl MessengerTools<Option<MessengerAbortSignal>> {
    /// Bind the already migrated bridge; construction reads no host state.
    pub fn from_bridge(bridge: Arc<MessengerBridge>) -> Self {
        Self {
            request: Arc::new(move |_, args, signal| {
                let future = bridge.request(args[0].as_str(), &args[1], signal.clone(), None);
                Box::pin(async move {
                    future
                        .await
                        .map(|value| Some(serde_json::to_value(value).unwrap()))
                        .map_err(HostError::Error)
                })
            }),
        }
    }
}
