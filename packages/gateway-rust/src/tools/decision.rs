//! Structured advisory decisions; caller API keys/signal come from authenticated context.
use crate::services::system_one::{Cancellation, DecisionError, SystemOne, resolve_system_one};
use serde_json::{Map, Value, json};
use std::{collections::HashMap, sync::LazyLock};
pub fn metadata() -> &'static Value {
    static VALUE: LazyLock<Value> = LazyLock::new(|| {
        serde_json::from_str(include_str!("decision-metadata.json")).expect("tool metadata")
    });
    &VALUE
}
pub async fn evaluate(
    input: &Value,
    keys: Option<&HashMap<String, String>>,
    signal: Option<&Cancellation>,
    engine: &SystemOne,
) -> Value {
    match execute(input, keys, signal, engine).await {
        Ok(value) => value,
        Err(error) => {
            // The TS tool prefers an aborted signal over the concrete error code and keeps
            // the upstream status only for rejected HTTP responses.
            let code = match signal {
                Some(signal) if signal.is_aborted() => "cancelled",
                _ => error.code,
            };
            let status = match error.code {
                "upstream_http" => error.status,
                _ => None,
            };
            let base = DecisionError::new(code).message();
            let message = match status {
                Some(status) => format!("{base} (HTTP {status})"),
                None => base,
            };
            let data = match status {
                Some(status) => json!({"code":code,"status":status}),
                None => json!({"code":code}),
            };
            json!({"ok":false,"message":message,"data":data})
        }
    }
}
async fn execute(
    input: &Value,
    keys: Option<&HashMap<String, String>>,
    signal: Option<&Cancellation>,
    engine: &SystemOne,
) -> Result<Value, DecisionError> {
    // JavaScript property access on null throws before Array.isArray runs.
    if input.is_null() {
        return Err("invalid input".into());
    }
    let items = input
        .get("questions")
        .and_then(Value::as_array)
        .ok_or_else(|| DecisionError::new("invalid_input"))?;
    // TS maps every item to its id before checking duplicates; accessing a
    // property of null throws, including when earlier ids were duplicates.
    let mut ids: Vec<Option<&Value>> = Vec::with_capacity(items.len());
    for item in items {
        if item.is_null() {
            return Err("invalid question".into());
        }
        ids.push(item.get("id"));
    }
    for (index, id) in ids.iter().enumerate() {
        // JavaScript Set compares objects by identity. Distinct JSON values
        // represent distinct objects, even when their contents are equal.
        if id.is_some_and(|value| value.is_object() || value.is_array()) {
            continue;
        }
        if ids[..index].iter().any(|previous| previous == id) {
            return Err(DecisionError::new("invalid_input"));
        }
    }
    for id in &ids {
        match id {
            None | Some(Value::Null) => return Err(DecisionError::new("invalid_input")),
            Some(Value::String(id)) if crate::text::js_trim(id).is_empty() => {
                return Err(DecisionError::new("invalid_input"));
            }
            Some(Value::String(_)) => {}
            Some(_) => return Err("invalid question id".into()),
        }
    }
    let mut questions = Map::new();
    for (item, id) in items.iter().zip(ids) {
        let id = id.and_then(Value::as_str).expect("validated question id");
        let kind = item.get("type").cloned().unwrap_or(Value::Null);
        let instructions = item.get("instructions").cloned().unwrap_or(Value::Null);
        let mut q = json!({"type":kind,"instructions":instructions});
        if kind == "choice" {
            let empty = vec![];
            let options = match item.get("options") {
                None | Some(Value::Null) => &empty,
                Some(value) => value.as_array().ok_or("invalid options")?,
            };
            let mut criteria = Map::new();
            for option in options {
                if option.is_null() {
                    return Err("invalid option".into());
                }
                let id = property_key(option.get("id"))?;
                criteria.insert(
                    id,
                    option.get("description").cloned().unwrap_or(Value::Null),
                );
            }
            q["criteria"] = Value::Object(criteria);
        } else if kind == "score" {
            q["criteria"] = item
                .get("levels")
                .filter(|v| !v.is_null())
                .cloned()
                .unwrap_or_else(|| json!([]));
        }
        questions.insert(id.into(), q);
    }
    let state = match input.get("state").and_then(Value::as_str) {
        Some(state) => state,
        None if resolve_system_one(keys).is_none() => {
            return Err(DecisionError::new("not_configured"));
        }
        None => return Err("invalid state".into()),
    };
    let data = engine
        .evaluate(keys, state, &Value::Object(questions), signal)
        .await?;
    let message = crate::contracts::bounded_json::JsonGraph::from_value(&data["answers"])
        .stringify()
        .expect("JSON answers");
    Ok(json!({"ok":true,"message":message,"data":data}))
}

fn property_key(value: Option<&Value>) -> Result<String, String> {
    Ok(match value {
        None => "undefined".into(),
        Some(Value::Null) => "null".into(),
        Some(Value::String(v)) => v.clone(),
        Some(Value::Bool(v)) => v.to_string(),
        Some(Value::Number(v)) => ryu_js::Buffer::new()
            .format(v.as_f64().expect("JSON number"))
            .into(),
        Some(Value::Array(items)) => items
            .iter()
            .map(|v| {
                if v.is_null() {
                    Ok(String::new())
                } else {
                    property_key(Some(v))
                }
            })
            .collect::<Result<Vec<_>, _>>()?
            .join(","),
        Some(Value::Object(object)) => {
            if object.contains_key("toString") {
                return Err("Cannot convert object to primitive value".into());
            }
            "[object Object]".into()
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::system_one::{DecisionHttpResponse, DecisionRequest, DecisionTransport};
    use std::{
        future::Future,
        pin::Pin,
        sync::{Arc, Mutex},
    };
    struct Peer {
        requests: Mutex<Vec<DecisionRequest>>,
    }
    impl DecisionTransport for Peer {
        fn send<'a>(
            &'a self,
            request: DecisionRequest,
        ) -> Pin<Box<dyn Future<Output = Result<DecisionHttpResponse, String>> + Send + 'a>>
        {
            self.requests.lock().unwrap().push(request);
            Box::pin(async {
                Ok(DecisionHttpResponse {
                    status: 200,
                    body: Ok(
                        json!({"model":"peer","answers":{"route":{"type":"choice","choice":"1"},"level":{"type":"score","score":0.5}}}),
                    ),
                })
            })
        }
    }
    #[tokio::test(start_paused = true)]
    async fn tool_deduplicates_coerced_option_ids_and_returns_exact_answer_json() {
        let peer = Arc::new(Peer {
            requests: Mutex::new(vec![]),
        });
        let engine = SystemOne::new(peer.clone());
        let keys = HashMap::from([("JEV_API_KEY".into(), "fixture".into())]);
        let value=evaluate(&json!({"state":"context","questions":[{"id":"route","type":"choice","instructions":"pick","options":[{"id":1,"description":"old"},{"id":null,"description":"null"},{"id":1,"description":"new"}]},{"id":"level","type":"score","instructions":"rate","levels":["low","high"]}]}),Some(&keys),None,&engine).await;
        assert_eq!(value["ok"], true);
        assert_eq!(
            value["message"],
            r#"{"route":{"type":"choice","choice":"1"},"level":{"type":"score","score":0.5}}"#
        );
        let request = &peer.requests.lock().unwrap()[0];
        let body: Value = serde_json::from_str(&request.body).unwrap();
        assert_eq!(
            body["questions"]["route"]["criteria"],
            json!({"1":"new","null":"null"})
        );
    }
    #[tokio::test(start_paused = true)]
    async fn duplicate_and_blank_ids_return_invalid_input_without_using_the_backend() {
        let peer = Arc::new(Peer {
            requests: Mutex::new(vec![]),
        });
        let engine = SystemOne::new(peer.clone());
        let keys = HashMap::from([("JEV_API_KEY".into(), "fixture".into())]);
        for ids in [["x", "x"], ["x", " \u{feff}"]] {
            let value=evaluate(&json!({"state":"context","questions":ids.iter().map(|id|json!({"id":id,"type":"noul","instructions":"question"})).collect::<Vec<_>>()}),Some(&keys),None,&engine).await;
            assert_eq!(
                value,
                json!({
                    "ok": false,
                    "message": "Invalid decision input. Check the state, question IDs, and choice or score criteria.",
                    "data": {"code": "invalid_input"},
                })
            );
        }
        assert!(peer.requests.lock().unwrap().is_empty());
    }
    #[tokio::test]
    async fn malformed_inputs_match_typescript_error_precedence_and_cancellation() {
        let peer = Arc::new(Peer {
            requests: Mutex::new(vec![]),
        });
        let engine = SystemOne::new(peer.clone());
        let valid = json!({"id":"q","type":"noul","instructions":"x"});
        let cases = [
            (Value::Null, "unavailable"),
            (json!(3), "invalid_input"),
            (json!({}), "invalid_input"),
            (json!({"state":"x","questions":[null]}), "unavailable"),
            (json!({"state":"x","questions":[{"id":1}]}), "unavailable"),
            (json!({"questions":[valid.clone()]}), "not_configured"),
            (
                json!({"state":"x","questions":[valid.clone(),valid,null]}),
                "unavailable",
            ),
        ];
        for (input, expected) in cases {
            let result = evaluate(&input, None, None, &engine).await;
            assert_eq!(result["data"]["code"], expected, "{input}");
            let cancelled = Cancellation::default();
            cancelled.abort("test");
            let result = evaluate(&input, None, Some(&cancelled), &engine).await;
            assert_eq!(result["data"]["code"], "cancelled", "{input}");
        }
        assert!(peer.requests.lock().unwrap().is_empty());
    }
}
