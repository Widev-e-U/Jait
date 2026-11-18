//! Tool input schema subset, including coercion and observable mutation.
//! This validates parameters; scope and consent remain executor responsibilities.
use crate::contracts::{
    bounded_json::Utf16Text,
    ecmascript_json::{JsonDocument, JsonValue},
};
use serde::Serialize;
use serde_json::{Value, json};
use std::{cell::RefCell, rc::Rc};

#[derive(Clone, Debug)]
enum Node {
    Null,
    Bool(bool),
    Number(f64),
    String(Utf16Text),
    Array(Vec<Node>),
    Object(Rc<RefCell<Vec<(Utf16Text, Node)>>>),
    Function,
}
impl Node {
    fn from_json(v: &Value) -> Self {
        match v {
            Value::Null => Self::Null,
            Value::Bool(v) => Self::Bool(*v),
            Value::Number(v) => Self::Number(v.as_f64().unwrap()),
            Value::String(v) => Self::String(Utf16Text::from(v.clone())),
            Value::Array(v) => Self::Array(v.iter().map(Self::from_json).collect()),
            Value::Object(v) => Self::Object(Rc::new(RefCell::new(
                entries(v)
                    .into_iter()
                    .map(|(k, v)| (Utf16Text::from(k.clone()), Self::from_json(v)))
                    .collect(),
            ))),
        }
    }
    fn document(document: &JsonDocument, id: usize) -> Self {
        match &document.nodes[id] {
            JsonValue::Null => Self::Null,
            JsonValue::Boolean(v) => Self::Bool(*v),
            JsonValue::Number(v) => Self::Number(*v),
            JsonValue::String(v) => Self::String(v.clone()),
            JsonValue::Array(v) => {
                Self::Array(v.iter().map(|id| Self::document(document, *id)).collect())
            }
            JsonValue::Object(v) => {
                let mut values: Vec<_> = v.iter().collect();
                values.sort_by_key(|(key, _)| {
                    String::from_utf16(key)
                        .ok()
                        .and_then(|s| {
                            s.parse::<u32>()
                                .ok()
                                .filter(|n| *n < u32::MAX && n.to_string() == s)
                        })
                        .map_or((1, 0), |n| (0, n))
                });
                Self::Object(Rc::new(RefCell::new(
                    values
                        .into_iter()
                        .map(|(key, id)| (Utf16Text(key.clone()), Self::document(document, *id)))
                        .collect(),
                )))
            }
        }
    }
    fn stringify(&self) -> String {
        match self {
            Self::String(v) => serde_json::to_string(v).unwrap(),
            Self::Number(v) => {
                if !v.is_finite() {
                    "null".into()
                } else if *v == 0.0 {
                    "0".into()
                } else {
                    ryu_js::Buffer::new().format(*v).into()
                }
            }
            Self::Object(v) => format!(
                "{{{}}}",
                v.borrow()
                    .iter()
                    .filter(|(_, v)| !matches!(v, Self::Function))
                    .map(|(k, v)| format!(
                        "{}:{}",
                        serde_json::to_string(k).unwrap(),
                        v.stringify()
                    ))
                    .collect::<Vec<_>>()
                    .join(",")
            ),
            Self::Array(v) => format!(
                "[{}]",
                v.iter().map(Self::stringify).collect::<Vec<_>>().join(",")
            ),
            _ => self.json().to_string(),
        }
    }
    fn text_units(&self) -> Result<Vec<u16>, ValidationException> {
        Ok(match self {
            Self::String(v) => v.0.clone(),
            Self::Object(fields) => {
                if fields.borrow().iter().any(|(k, v)| {
                    k.0 == "toString".encode_utf16().collect::<Vec<_>>()
                        && !matches!(v, Self::Function)
                }) {
                    return Err(exception("TypeError"));
                }
                self.string().encode_utf16().collect()
            }
            Self::Array(v) => {
                let mut units = vec![];
                for (i, v) in v.iter().enumerate() {
                    if i > 0 {
                        units.push(44);
                    }
                    if !matches!(v, Self::Null) {
                        units.extend(v.text_units()?);
                    }
                }
                units
            }
            _ => self.string().encode_utf16().collect(),
        })
    }
    fn json(&self) -> Value {
        match self {
            Self::Null | Self::Function => Value::Null,
            Self::Bool(v) => json!(v),
            Self::Number(v) => {
                if v.is_finite() {
                    serde_json::from_str(ryu_js::Buffer::new().format(*v)).unwrap()
                } else {
                    Value::Null
                }
            }
            Self::String(v) => json!(String::from_utf16_lossy(&v.0)),
            Self::Array(v) => Value::Array(v.iter().map(Self::json).collect()),
            Self::Object(v) => Value::Object(
                v.borrow()
                    .iter()
                    .filter(|(_, v)| !matches!(v, Self::Function))
                    .map(|(k, v)| (String::from_utf16_lossy(&k.0), v.json()))
                    .collect(),
            ),
        }
    }
    fn string(&self) -> String {
        match self {
            Self::Null => "null".into(),
            Self::Bool(v) => v.to_string(),
            Self::Number(v) => ryu_js::Buffer::new().format(*v).into(),
            Self::String(v) => String::from_utf16_lossy(&v.0),
            Self::Object(_) => "[object Object]".into(),
            Self::Function => "function Object() { [native code] }".into(),
            Self::Array(v) => v
                .iter()
                .map(|v| {
                    if matches!(v, Self::Null) {
                        String::new()
                    } else {
                        v.string()
                    }
                })
                .collect::<Vec<_>>()
                .join(","),
        }
    }
    fn typeof_(&self) -> &'static str {
        match self {
            Self::Null | Self::Object(_) | Self::Array(_) => "object",
            Self::Bool(_) => "boolean",
            Self::Number(_) => "number",
            Self::String(_) => "string",
            Self::Function => "function",
        }
    }
    fn get(&self, key: &str) -> Option<Self> {
        if let Self::Object(v) = self
            && let Some((_, v)) = v
                .borrow()
                .iter()
                .find(|(k, _)| k.0 == key.encode_utf16().collect::<Vec<_>>())
        {
            return Some(v.clone());
        }

        match key {
            "__proto__" => Some(Self::from_json(&json!({}))),
            "constructor"
            | "toString"
            | "hasOwnProperty"
            | "valueOf"
            | "isPrototypeOf"
            | "propertyIsEnumerable"
            | "toLocaleString"
            | "__defineGetter__"
            | "__defineSetter__"
            | "__lookupGetter__"
            | "__lookupSetter__" => Some(Self::Function),
            _ => None,
        }
    }
    fn set(&self, key: &str, value: Self) {
        if let Self::Object(v) = self {
            let mut fields = v.borrow_mut();
            if let Some((_, v)) = fields
                .iter_mut()
                .find(|(k, _)| k.0 == key.encode_utf16().collect::<Vec<_>>())
            {
                *v = value;
            } else if key != "__proto__" {
                fields.push((Utf16Text::from(key), value));
            }
        }
    }
    fn shallow_copy(&self) -> Self {
        if let Self::Object(v) = self {
            Self::Object(Rc::new(RefCell::new(v.borrow().clone())))
        } else {
            self.clone()
        }
    }
}
#[derive(Debug, Serialize, PartialEq)]
pub struct ValidationResult {
    pub valid: bool,
    pub errors: Vec<Utf16Text>,
}
#[derive(Debug, Serialize, PartialEq)]
pub struct ValidationException {
    pub name: &'static str,
}
fn entries(fields: &serde_json::Map<String, Value>) -> Vec<(&String, &Value)> {
    let mut entries: Vec<_> = fields.iter().collect();
    entries.sort_by_key(|(k, _)| {
        k.parse::<u32>()
            .ok()
            .filter(|n| *n < u32::MAX && n.to_string() == **k)
            .map_or((1, 0), |n| (0, n))
    });
    entries
}
fn exception(name: &'static str) -> ValidationException {
    ValidationException { name }
}
/// Owns reference-compatible object identity during validation. Output is JSON;
/// keys separately retain own properties whose function values JSON omits.
pub struct ToolInput(Node);
impl ToolInput {
    pub fn new(value: &Value) -> Self {
        Self(Node::from_json(value))
    }
    /// Non-finite numbers are possible before the JSON wire boundary.
    pub fn set_number_property(&mut self, key: &str, value: f64) {
        self.0.set(key, Node::Number(value));
    }
    pub fn stringify(&self) -> String {
        self.0.stringify()
    }
    pub fn parse(text: &str) -> Result<Self, crate::contracts::ecmascript_json::JsonSyntaxError> {
        let document = JsonDocument::parse(text)?;
        Ok(Self(Node::document(&document, document.root)))
    }
    /// Lossy projection for callers that require serde_json; use stringify for wire output.
    pub fn value(&self) -> Value {
        self.0.json()
    }
    pub fn keys(&self) -> Option<Vec<Utf16Text>> {
        match &self.0 {
            Node::Object(v) => Some(v.borrow().iter().map(|(k, _)| k.clone()).collect()),
            Node::Array(v) => Some(
                (0..v.len())
                    .map(|i| Utf16Text::from(i.to_string()))
                    .collect(),
            ),
            _ => None,
        }
    }
}
fn check(kind: &str, value: &Node) -> Result<bool, ValidationException> {
    Ok(match kind {
        "null" => matches!(value, Node::Null),
        "boolean" => matches!(value, Node::Bool(_)),
        "string" => matches!(value, Node::String(_)),
        "number" => matches!(value,Node::Number(n) if n.is_finite()),
        "integer" => matches!(value,Node::Number(n) if n.is_finite() && n.fract()==0.0),
        "object" => matches!(value, Node::Object(_)),
        "array" => matches!(value, Node::Array(_)),
        "__proto__"
        | "hasOwnProperty"
        | "isPrototypeOf"
        | "propertyIsEnumerable"
        | "__defineGetter__"
        | "__defineSetter__"
        | "__lookupGetter__"
        | "__lookupSetter__" => return Err(exception("TypeError")),
        "constructor" | "toString" | "valueOf" | "toLocaleString" => true,
        _ => false,
    })
}
fn has_checker(kind: &str) -> bool {
    matches!(
        kind,
        "null"
            | "boolean"
            | "string"
            | "number"
            | "integer"
            | "object"
            | "array"
            | "constructor"
            | "toString"
            | "valueOf"
            | "toLocaleString"
            | "hasOwnProperty"
            | "__proto__"
    )
}
fn number(s: &str) -> Option<f64> {
    let s = crate::text::js_trim(s);
    if s.is_empty() {
        return Some(0.0);
    }
    for (prefix, radix) in [("0x", 16), ("0o", 8), ("0b", 2)] {
        if s.to_ascii_lowercase().starts_with(prefix) {
            let digits = &s[2..];
            if digits.is_empty() {
                return None;
            }
            return digits.chars().try_fold(0.0, |n, c| {
                c.to_digit(radix)
                    .map(|v| n * f64::from(radix) + f64::from(v))
            });
        }
    }
    if matches!(s, "Infinity" | "+Infinity") {
        return Some(f64::INFINITY);
    }
    if s == "-Infinity" {
        return Some(f64::NEG_INFINITY);
    }
    if s.chars()
        .any(|c| !c.is_ascii_digit() && !"+-.eE".contains(c))
    {
        return None;
    }
    s.parse().ok().filter(|n: &f64| !n.is_nan())
}
fn coerce(kind: &str, v: Node) -> Node {
    if let Node::String(text) = &v {
        let s = String::from_utf16(&text.0).unwrap_or_else(|_| "\u{fffd}".into());
        match kind {
            "number" | "integer" => {
                if let Some(n) = number(&s) {
                    return Node::Number(n);
                }
            }
            "boolean" => match s.as_str() {
                "true" => return Node::Bool(true),
                "false" => return Node::Bool(false),
                _ => {}
            },
            "object" | "array" => {
                if let Ok(document) = JsonDocument::parse_utf16(&text.0) {
                    let parsed = Node::document(&document, document.root);
                    if check(kind, &parsed).unwrap_or(false) {
                        return parsed;
                    }
                }
            }
            _ => {}
        }
    }
    v
}
// The reference constructs RegExp without the Unicode flag. Feed raw UTF-16
// units, including escaped surrogate literals, to avoid regress pairing them.
fn pattern_units(pattern: &str) -> Vec<u32> {
    let units: Vec<u16> = pattern.encode_utf16().collect();
    let mut out = vec![];
    let mut i = 0;
    while i < units.len() {
        if units[i] == 92 {
            if units.get(i + 1) == Some(&117) && i + 6 <= units.len() {
                let text: String = units[i + 2..i + 6]
                    .iter()
                    .filter_map(|u| char::from_u32(u32::from(*u)))
                    .collect();
                if let Ok(unit) = u16::from_str_radix(&text, 16)
                    && (0xd800..=0xdfff).contains(&unit)
                {
                    out.push(u32::from(unit));
                    i += 6;
                    continue;
                }
            }
            out.push(92);
            i += 1;
            if i < units.len() {
                out.push(u32::from(units[i]));
                i += 1;
            }
        } else {
            out.push(u32::from(units[i]));
            i += 1;
        }
    }
    out
}
fn path_name(path: &str) -> &str {
    if path == "$" {
        "input"
    } else {
        path.strip_prefix("$.").unwrap_or(path)
    }
}
fn property(
    schema: &Value,
    value: Node,
    path: &str,
    errors: &mut Vec<Utf16Text>,
) -> Result<Node, ValidationException> {
    let types: Vec<&str> = match &schema["type"] {
        Value::Array(v) => v.iter().filter_map(Value::as_str).collect(),
        v => vec![v.as_str().unwrap_or("undefined")],
    };
    if matches!(value, Node::Null) && types.contains(&"null") {
        return Ok(value);
    }
    let mut selected = None;
    for kind in &types {
        if check(kind, &value)? {
            selected = Some(*kind);
            break;
        }
    }
    let kind = selected
        .or_else(|| types.iter().copied().find(|t| *t != "null"))
        .unwrap_or("null");
    let original_type = value.typeof_();
    let mut current = value;
    if has_checker(kind) && !check(kind, &current)? {
        current = coerce(kind, current);
        if !check(kind, &current)? {
            errors.push(Utf16Text::from(format!(
                "Property '{}' expected type '{}', got '{}'",
                path_name(path),
                kind,
                original_type
            )));
            return Ok(current);
        }
    }
    if let Some(values) = schema["enum"].as_array().filter(|v| !v.is_empty()) {
        let text = current.text_units()?;
        if !values.iter().any(|v| {
            v.as_str()
                .is_some_and(|s| s.encode_utf16().collect::<Vec<_>>() == text)
        }) {
            let prefix = format!(
                "Property '{}' must be one of [{}], got '",
                path_name(path),
                values
                    .iter()
                    .map(|v| Node::from_json(v).string())
                    .collect::<Vec<_>>()
                    .join(", ")
            );
            let mut units: Vec<u16> = prefix.encode_utf16().collect();
            units.extend(text);
            units.push(39);
            errors.push(Utf16Text(units));
        }
    }
    if let Node::String(s) = &current {
        let length = s.0.len() as f64;
        for (bound, less, label) in [("minLength", true, "least"), ("maxLength", false, "most")] {
            if let Some(n) = schema[bound].as_f64()
                && if less { length < n } else { length > n }
            {
                errors.push(Utf16Text::from(format!(
                    "Property '{}' must contain at {label} {} characters",
                    path_name(path),
                    Node::Number(n).string()
                )));
            }
        }
        if let Some(pattern) = schema["pattern"].as_str().filter(|s| !s.is_empty()) {
            let regex = regress::Regex::from_unicode(
                pattern_units(pattern).into_iter(),
                regress::Flags::default(),
            )
            .map_err(|_| exception("SyntaxError"))?;
            if regex.find_from_ucs2(&s.0, 0).next().is_none() {
                errors.push(Utf16Text::from(format!(
                    "Property '{}' must match pattern {pattern}",
                    path_name(path)
                )));
            }
        }
    }
    if let Node::Array(values) = &current {
        for (bound, less, label) in [("minItems", true, "least"), ("maxItems", false, "most")] {
            if let Some(n) = schema[bound].as_f64()
                && if less {
                    (values.len() as f64) < n
                } else {
                    (values.len() as f64) > n
                }
            {
                errors.push(Utf16Text::from(format!(
                    "Property '{}' must contain at {label} {} items",
                    path_name(path),
                    Node::Number(n).string()
                )));
            }
        }
    }
    if kind == "object"
        && matches!(current, Node::Object(_))
        && let Some(properties) = schema["properties"].as_object()
    {
        if let Some(required) = schema["required"].as_array() {
            for key in required.iter().filter_map(Value::as_str) {
                if current.get(key).is_none() {
                    errors.push(Utf16Text::from(format!(
                        "Missing required property: {}",
                        path_name(&format!("{path}.{key}"))
                    )));
                }
            }
        }
        for (key, child) in entries(properties) {
            if let Some(v) = current.get(key).filter(|v| !matches!(v, Node::Null)) {
                current.set(key, property(child, v, &format!("{path}.{key}"), errors)?);
            }
        }
    }

    if kind == "array"
        && !schema["items"].is_null()
        && let Node::Array(values) = current
    {
        current = Node::Array(
            values
                .into_iter()
                .enumerate()
                .map(|(i, v)| property(&schema["items"], v, &format!("{path}[{i}]"), errors))
                .collect::<Result<_, _>>()?,
        );
    }

    Ok(current)
}
fn validate(schema: &Value, obj: Node) -> Result<ValidationResult, ValidationException> {
    let obj = if matches!(obj, Node::Null) {
        Node::from_json(&json!({}))
    } else {
        obj
    };
    if !matches!(obj, Node::Object(_)) {
        return Ok(ValidationResult {
            valid: false,
            errors: vec!["Input must be an object".into()],
        });
    }
    let mut errors = vec![];
    if let Some(required) = schema["required"].as_array() {
        for key in required.iter().filter_map(Value::as_str) {
            let kind = &schema["properties"][key]["type"];
            let nullable = kind == "null"
                || kind
                    .as_array()
                    .is_some_and(|v| v.iter().any(|v| v == "null"));
            if obj
                .get(key)
                .is_none_or(|v| matches!(v, Node::Null) && !nullable)
            {
                errors.push(Utf16Text::from(format!("Missing required property: {key}")));
            }
        }
    }
    let properties = schema["properties"]
        .as_object()
        .ok_or_else(|| exception("TypeError"))?;
    for (key, child) in entries(properties) {
        if let Some(v) = obj.get(key).filter(|v| !matches!(v, Node::Null)) {
            obj.set(key, property(child, v, &format!("$.{key}"), &mut errors)?);
        }
    }
    if let Some(conditions) = schema["allOf"].as_array() {
        for condition in conditions {
            if validate(&condition["if"], obj.shallow_copy())?.valid {
                let mut then = json!({"properties":{}});
                if let Some(fields) = condition["then"].as_object() {
                    for (k, v) in fields {
                        then[k] = v.clone();
                    }
                }
                errors.extend(validate(&then, obj.clone())?.errors);
            }
        }
    }
    Ok(ValidationResult {
        valid: errors.is_empty(),
        errors,
    })
}
pub fn validate_tool_input(
    schema: &Value,
    input: &mut ToolInput,
) -> Result<ValidationResult, ValidationException> {
    validate(schema, input.0.clone())
}
