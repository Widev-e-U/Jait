//! JSON-compatible storage ceilings, including JavaScript graph/UTF-16 semantics.
use serde_json::Value;
use std::collections::HashSet;
pub const SUFFIX: &str = "… [truncated by Jait]";
#[derive(Clone, Debug)]
pub enum JsonNode {
    Null,
    Bool(bool),
    Number(f64),
    String(Vec<u16>),
    BigInt(String),
    Undefined,
    Array(Vec<usize>),
    Object(Vec<(String, usize)>),
}
/// Explicit node identities represent repeated objects and cycles without unsafe code.
#[derive(Clone, Debug)]
pub struct JsonGraph {
    pub nodes: Vec<JsonNode>,
    pub root: usize,
}
impl JsonGraph {
    pub fn from_value(value: &Value) -> Self {
        fn add(value: &Value, nodes: &mut Vec<JsonNode>) -> usize {
            let node = match value {
                Value::Null => JsonNode::Null,
                Value::Bool(v) => JsonNode::Bool(*v),
                Value::Number(v) => JsonNode::Number(v.as_f64().unwrap_or(f64::NAN)),
                Value::String(v) => JsonNode::String(v.encode_utf16().collect()),
                Value::Array(v) => JsonNode::Array(v.iter().map(|v| add(v, nodes)).collect()),
                Value::Object(v) => {
                    JsonNode::Object(v.iter().map(|(k, v)| (k.clone(), add(v, nodes))).collect())
                }
            };
            let index = nodes.len();
            nodes.push(node);
            index
        }
        let mut nodes = vec![];
        let root = add(value, &mut nodes);
        Self { nodes, root }
    }
    pub fn stringify(&self) -> Option<String> {
        encode(self, self.root, &mut HashSet::new(), 0).map(|v| v.unwrap_or_else(|| "null".into()))
    }
    pub fn bounded(&self, max_bytes: usize) -> String {
        let ceiling = max_bytes.max(128);
        let original = self.stringify();
        if let Some(original) = original.as_ref().filter(|v| v.len() <= ceiling) {
            return original.clone();
        }
        for limits in [(8, 16000, 100, 100), (5, 2000, 25, 50), (3, 256, 10, 20)] {
            let mut output = Self {
                nodes: vec![],
                root: 0,
            };
            output.root = compact(self, self.root, &mut output, limits, 0, &mut HashSet::new());
            if let Some(value) = output.stringify().filter(|v| v.len() <= ceiling) {
                return value;
            }
        }
        match original {
            Some(original) => format!(
                "{{\"__jait_truncated__\":true,\"originalBytes\":{}}}",
                original.len()
            ),
            None => "{\"__jait_truncated__\":true,\"reason\":\"unserializable\"}".into(),
        }
    }
}
/// JavaScript text can contain lone UTF-16 surrogates after slicing. Keep the
/// code units until a transport encodes them instead of silently substituting.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Utf16Text(pub Vec<u16>);
impl From<&str> for Utf16Text {
    fn from(value: &str) -> Self {
        Self(value.encode_utf16().collect())
    }
}
impl From<String> for Utf16Text {
    fn from(value: String) -> Self {
        Self::from(value.as_str())
    }
}
impl<'de> serde::Deserialize<'de> for Utf16Text {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        <String as serde::Deserialize>::deserialize(deserializer).map(Self::from)
    }
}
impl serde::Serialize for Utf16Text {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let raw = serde_json::value::RawValue::from_string(quote(&self.0)).expect("quoted UTF-16");
        serde::Serialize::serialize(&raw, serializer)
    }
}
fn quote(units: &[u16]) -> String {
    let mut result = String::from("\"");
    for ch in char::decode_utf16(units.iter().copied()) {
        match ch {
            Ok(ch) => {
                let text = serde_json::to_string(&ch.to_string()).expect("JSON character");
                result.push_str(&text[1..text.len() - 1]);
            }
            Err(e) => result.push_str(&format!("\\u{:04x}", e.unpaired_surrogate())),
        }
    }
    result.push('"');
    result
}
fn quote_str(text: &str) -> String {
    quote(&text.encode_utf16().collect::<Vec<_>>())
}
fn number(value: f64) -> String {
    if !value.is_finite() {
        return "null".into();
    }
    ryu_js::Buffer::new().format(value).to_owned()
}

fn ordered(entries: &[(String, usize)]) -> Vec<&(String, usize)> {
    let index = |key: &str| {
        key.parse::<u32>()
            .ok()
            .filter(|n| *n < u32::MAX && n.to_string() == key)
    };
    let mut indices = entries
        .iter()
        .filter(|(k, _)| index(k).is_some())
        .collect::<Vec<_>>();
    indices.sort_by_key(|(k, _)| index(k).unwrap());
    indices.extend(entries.iter().filter(|(k, _)| index(k).is_none()));
    indices
}
/// Outer option is failure (cycle/BigInt); inner option is JavaScript undefined.
fn encode(
    graph: &JsonGraph,
    id: usize,
    active: &mut HashSet<usize>,
    depth: usize,
) -> Option<Option<String>> {
    if depth > 512 {
        return None;
    }
    let node = graph.nodes.get(id)?;
    Some(Some(match node {
        JsonNode::Null => "null".into(),
        JsonNode::Bool(v) => v.to_string(),
        JsonNode::Number(v) => number(*v),
        JsonNode::String(v) => quote(v),
        JsonNode::Undefined => return Some(None),
        JsonNode::BigInt(_) => return None,
        JsonNode::Array(values) => {
            if !active.insert(id) {
                return None;
            }
            let mut elements = vec![];
            for &child in values {
                elements
                    .push(encode(graph, child, active, depth + 1)?.unwrap_or_else(|| "null".into()))
            }
            active.remove(&id);
            format!("[{}]", elements.join(","))
        }
        JsonNode::Object(values) => {
            if !active.insert(id) {
                return None;
            }
            let mut elements = vec![];
            for (key, child) in ordered(values) {
                if let Some(value) = encode(graph, *child, active, depth + 1)? {
                    elements.push(format!("{}:{value}", quote_str(key)))
                }
            }
            active.remove(&id);
            format!("{{{}}}", elements.join(","))
        }
    }))
}
fn truncate(units: &[u16], max: usize) -> Vec<u16> {
    if units.len() <= max {
        return units.to_vec();
    }
    let suffix = SUFFIX.encode_utf16().collect::<Vec<_>>();
    let mut end = max.saturating_sub(suffix.len()).min(units.len());
    if end > 0
        && end < units.len()
        && (0xd800..=0xdbff).contains(&units[end - 1])
        && (0xdc00..=0xdfff).contains(&units[end])
    {
        end -= 1
    }
    let mut value = units[..end].to_vec();
    value.extend(suffix);
    value
}
fn push(graph: &mut JsonGraph, node: JsonNode) -> usize {
    let id = graph.nodes.len();
    graph.nodes.push(node);
    id
}
fn text(graph: &mut JsonGraph, value: &str) -> usize {
    push(graph, JsonNode::String(value.encode_utf16().collect()))
}
fn compact(
    input: &JsonGraph,
    id: usize,
    output: &mut JsonGraph,
    limits: (usize, usize, usize, usize),
    depth: usize,
    seen: &mut HashSet<usize>,
) -> usize {
    let Some(node) = input.nodes.get(id) else {
        return push(output, JsonNode::Undefined);
    };
    let compacted = match node {
        JsonNode::Null | JsonNode::Bool(_) | JsonNode::Number(_) | JsonNode::Undefined => {
            node.clone()
        }
        JsonNode::String(v) => JsonNode::String(truncate(v, limits.1)),
        JsonNode::BigInt(v) => JsonNode::String(v.encode_utf16().collect()),
        JsonNode::Array(values) => {
            if depth >= limits.0 {
                return text(output, "[nested value truncated]");
            }
            if !seen.insert(id) {
                return text(output, "[circular reference]");
            }
            let mut result = values
                .iter()
                .take(limits.2)
                .map(|v| compact(input, *v, output, limits, depth + 1, seen))
                .collect::<Vec<_>>();
            if values.len() > limits.2 {
                result.push(text(
                    output,
                    &format!("[{} more item(s) truncated]", values.len() - limits.2),
                ))
            }
            JsonNode::Array(result)
        }
        JsonNode::Object(values) => {
            if depth >= limits.0 {
                return text(output, "[nested value truncated]");
            }
            if !seen.insert(id) {
                return text(output, "[circular reference]");
            }
            let mut result = vec![];
            for (key, child) in ordered(values).into_iter().take(limits.3) {
                let child = compact(input, *child, output, limits, depth + 1, seen);
                if key != "__proto__" && !matches!(output.nodes[child], JsonNode::Undefined) {
                    result.push((key.clone(), child))
                }
            }
            if values.len() > limits.3 {
                let id = push(output, JsonNode::Number((values.len() - limits.3) as f64));
                if let Some((_, value)) = result
                    .iter_mut()
                    .find(|(k, _)| k == "__jait_truncated_entries__")
                {
                    *value = id
                } else {
                    result.push(("__jait_truncated_entries__".into(), id))
                }
            }
            JsonNode::Object(result)
        }
    };
    push(output, compacted)
}
pub fn serialize_bounded_json(value: &Value, max_bytes: usize) -> String {
    JsonGraph::from_value(value).bounded(max_bytes)
}
pub fn limit_utf8(value: &str, max_bytes: usize, suffix: Option<&str>) -> String {
    if value.len() <= max_bytes {
        return value.into();
    }
    let suffix = suffix.unwrap_or(SUFFIX);
    let suffix = if suffix.len() <= max_bytes {
        suffix
    } else {
        ""
    };
    let mut end = (max_bytes - suffix.len()).min(value.len());
    while !value.is_char_boundary(end) {
        end -= 1
    }
    format!("{}{suffix}", &value[..end])
}
pub fn limit_serialized_json(value: &str, max_bytes: usize) -> String {
    if value.len() <= max_bytes {
        return value.into();
    }
    match serde_json::from_str::<Value>(value) {
        Ok(value) => serialize_bounded_json(&value, max_bytes),
        Err(_) => serialize_bounded_json(
            &serde_json::json!({"__jait_truncated__":true,"reason":"invalid JSON","preview":value}),
            max_bytes,
        ),
    }
}

/// Enumerable JSON object fields, including JavaScript string-index UTF-16 units.
pub fn object_spread(
    value: &Value,
) -> std::collections::BTreeMap<String, Box<serde_json::value::RawValue>> {
    use serde_json::value::{RawValue, to_raw_value};
    match value {
        Value::Object(fields) => fields
            .iter()
            .map(|(k, v)| (k.clone(), to_raw_value(v).expect("JSON value")))
            .collect(),
        Value::Array(items) => items
            .iter()
            .enumerate()
            .map(|(i, v)| (i.to_string(), to_raw_value(v).expect("JSON value")))
            .collect(),
        Value::String(text) => text
            .encode_utf16()
            .enumerate()
            .map(|(i, unit)| {
                (
                    i.to_string(),
                    RawValue::from_string(
                        serde_json::to_string(&Utf16Text(vec![unit])).expect("UTF-16 JSON"),
                    )
                    .expect("JSON string"),
                )
            })
            .collect(),
        _ => Default::default(),
    }
}
