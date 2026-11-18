//! Rust comparison semantics for mechanically translated, isolated gateway fixtures.
//! The TypeScript adapter returns observations only; it contains no matchers.
#[path = "tail_stream.rs"]
mod tail_stream;
#[path = "tail_text_pattern.rs"]
mod tail_text_pattern;

use serde_json::{Value, json};
use std::{cmp::Ordering, path::Path};

fn value(boxed: &Value) -> &Value {
    &boxed["value"]
}
// Reference values (objects, arrays, functions, class instances) use identity
// semantics for toBe; primitives, symbols and null use structural/value equality.
fn is_reference_value(boxed: &Value) -> bool {
    boxed["type"] == "function"
        || (boxed["type"] == "object" && !boxed.get("value").is_none_or(|value| value.is_null()))
}
// JavaScript strings may contain lone surrogates; retain exact UTF-16 units.
fn string_units(value: &Value) -> Option<Vec<u16>> {
    if let Some(text) = value.as_str() {
        return Some(text.encode_utf16().collect());
    }
    if value["__jait_type"] != "utf16" {
        return None;
    }
    value["units"]
        .as_array()?
        .iter()
        .map(|n| n.as_u64().and_then(|n| u16::try_from(n).ok()))
        .collect()
}
fn expected_box(value: &Value) -> Value {
    if value["__jait_type"] == "undefined" {
        return json!({"type":"undefined"});
    }
    let kind = match value {
        Value::Null | Value::Object(_) | Value::Array(_) => "object",
        Value::Bool(_) => "boolean",
        Value::Number(_) => "number",
        Value::String(_) => "string",
    };
    json!({"type":kind,"value":value,"prototype":if value.is_array() { Value::String("Array".into()) } else if value.is_object() { Value::String("Object".into()) } else { Value::Null }})
}
fn pattern(actual: &Value, expected: &Value) -> bool {
    if let Some(kind) = expected["__jait_matcher"].as_str() {
        return match kind {
            "not" => !pattern(actual, &expected["value"]),
            "textPattern" => actual
                .as_str()
                .is_some_and(|text| tail_text_pattern::is_match(text, expected)),
            "anything" => !actual.is_null() && actual["__jait_type"] != "undefined",
            "any" => match expected["type"].as_str().unwrap_or("") {
                "String" => actual.is_string(),
                "Number" => actual.is_number(),
                "Boolean" => actual.is_boolean(),
                "Function" => actual["__jait_type"] == "function",
                "AbortSignal" => actual["__jait_type"] == "AbortSignal",
                "Array" => actual.is_array(),
                "Object" => actual.is_object() || actual.is_array(),
                kind => panic!("unsupported asymmetric constructor: {kind}"),
            },
            // Only the requested object's keys are a subset. Ordinary nested
            // values retain equality semantics; nested subsets are explicit.
            "objectContaining" => expected["value"]
                .as_object()
                .expect("object pattern")
                .iter()
                .all(|(key, expected)| {
                    actual.get(key).is_some_and(|actual| {
                        pattern(
                            &without_undefined_properties(actual),
                            &without_undefined_properties(expected),
                        )
                    })
                }),
            "arrayContaining" => actual.as_array().is_some_and(|values| {
                expected["value"]
                    .as_array()
                    .expect("array pattern")
                    .iter()
                    .all(|item| values.iter().any(|value| pattern(value, item)))
            }),
            "stringContaining" => actual.as_str().is_some_and(|text| {
                text.contains(expected["value"].as_str().expect("substring pattern"))
            }),
            kind => panic!("unsupported asymmetric matcher: {kind}"),
        };
    }
    // Vitest iterable equality treats Set values and Map entries as unordered.
    // Keep arrays ordered and require matching container types and cardinality.
    if matches!(actual["__jait_type"].as_str(), Some("set" | "map")) {
        if actual["__jait_type"] != expected["__jait_type"] {
            return false;
        }
        let field = if actual["__jait_type"] == "set" {
            "values"
        } else {
            "entries"
        };
        let Some(values) = actual[field].as_array() else {
            return false;
        };
        let Some(items) = expected[field].as_array() else {
            return false;
        };
        return values.len() == items.len()
            && values
                .iter()
                .all(|value| items.iter().any(|item| pattern(value, item)));
    }
    match (actual, expected) {
        (Value::Object(object), Value::Object(fields)) => {
            object.len() == fields.len()
                && fields.iter().all(|(key, expected)| {
                    object
                        .get(key)
                        .is_some_and(|value| pattern(value, expected))
                })
        }
        (Value::Array(values), Value::Array(items)) => {
            values.len() == items.len()
                && values
                    .iter()
                    .zip(items)
                    .all(|(value, expected)| pattern(value, expected))
        }
        _ => actual == expected,
    }
}
// Vitest's toEqual ignores undefined object properties; toStrictEqual retains them.
fn without_undefined_properties(value: &Value) -> Value {
    match value {
        Value::Object(fields) => Value::Object(
            fields
                .iter()
                .filter(|(_, value)| {
                    value
                        .get("__jait_type")
                        .is_none_or(|kind| kind != "undefined")
                })
                .map(|(key, value)| (key.clone(), without_undefined_properties(value)))
                .collect(),
        ),
        Value::Array(items) => {
            Value::Array(items.iter().map(without_undefined_properties).collect())
        }
        _ => value.clone(),
    }
}

fn subset(actual: &Value, expected: &Value) -> bool {
    if expected.get("__jait_matcher").is_some() {
        return pattern(actual, expected);
    }
    match expected {
        Value::Object(fields) => actual.as_object().is_some_and(|object| {
            fields.iter().all(|(key, expected)| {
                object
                    .get(key)
                    .is_some_and(|actual| subset(actual, expected))
            })
        }),
        Value::Array(items) => actual.as_array().is_some_and(|values| {
            values.len() == items.len()
                && values
                    .iter()
                    .zip(items)
                    .all(|(actual, expected)| subset(actual, expected))
        }),
        _ => pattern(actual, expected),
    }
}
fn property_segments(path: &str) -> Vec<String> {
    let mut segments = Vec::new();
    let mut segment = String::new();
    let mut chars = path.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '\\' if chars
                .peek()
                .is_some_and(|c| ['.', '[', ']', '\\'].contains(c)) =>
            {
                segment.push(chars.next().unwrap());
            }
            '.' => {
                if !segment.is_empty() {
                    segments.push(std::mem::take(&mut segment));
                }
            }
            '[' if chars.peek().is_some_and(char::is_ascii_digit) => {
                let mut index = String::new();
                while chars.peek().is_some_and(char::is_ascii_digit) {
                    index.push(chars.next().unwrap());
                }
                if chars.peek() == Some(&']') {
                    chars.next();
                    if !segment.is_empty() {
                        segments.push(std::mem::take(&mut segment));
                    }
                    segments.push(index);
                } else {
                    segment.push('[');
                    segment.push_str(&index);
                }
            }
            _ => segment.push(c),
        }
    }
    if !segment.is_empty() {
        segments.push(segment);
    }
    segments
}
fn property<'a>(actual: &'a Value, path: &Value) -> Option<&'a Value> {
    let segments: Vec<String> = match path {
        Value::Array(parts) => parts
            .iter()
            .map(|part| {
                part.as_str()
                    .map(str::to_owned)
                    .unwrap_or_else(|| part.to_string())
            })
            .collect(),
        Value::String(text) => {
            // Vitest first checks an exact own property, even when its name
            // contains path punctuation. Array paths keep each segment literal.
            if let Some(value) = actual.as_object().and_then(|object| object.get(text)) {
                return Some(value);
            }
            property_segments(text)
        }
        _ => panic!("property path must be a string or array"),
    };
    let mut result = actual;
    for segment in segments {
        result = match result {
            Value::Array(items) => items.get(segment.parse::<usize>().ok()?)?,
            Value::Object(object) => object.get(&segment)?,
            _ => return None,
        };
    }
    Some(result)
}
fn truthy(actual: &Value) -> bool {
    match actual["type"].as_str().unwrap_or("") {
        "undefined" => false,
        "boolean" => value(actual).as_bool().unwrap_or(false),
        "number" => value(actual).as_f64().is_some_and(|number| number != 0.0),
        "nonfinite" => value(actual) != "NaN",
        "string" => value(actual).as_str().is_some_and(|text| !text.is_empty()),
        "object" => !value(actual).is_null(),
        _ => true,
    }
}
fn number(value: &Value) -> f64 {
    value
        .as_f64()
        .expect("numeric assertion requires a numeric observation")
}
fn numeric_order(actual: &Value, expected: &Value) -> Option<Ordering> {
    if actual["type"] == "bigint" && expected["type"] == "bigint" {
        fn parts(value: &Value) -> (bool, &str) {
            let text = value["value"].as_str().expect("serialized BigInt");
            let digits = text.strip_prefix('-').unwrap_or(text);
            assert!(
                !digits.is_empty() && digits.bytes().all(|byte| byte.is_ascii_digit()),
                "invalid BigInt"
            );
            let digits = digits.trim_start_matches('0');
            (text.starts_with('-') && !digits.is_empty(), digits)
        }
        let (a_negative, a) = parts(actual);
        let (e_negative, e) = parts(expected);
        let order = match (a_negative, e_negative) {
            (true, false) => Ordering::Less,
            (false, true) => Ordering::Greater,
            _ => {
                let magnitude = a.len().cmp(&e.len()).then_with(|| a.cmp(e));
                if a_negative {
                    magnitude.reverse()
                } else {
                    magnitude
                }
            }
        };
        return Some(order);
    }
    number(value(actual)).partial_cmp(&number(value(expected)))
}

fn resolve_observed(pattern: &Value, observed: &Value) -> Value {
    if let Some(index) = pattern.get("__jait_observed").and_then(Value::as_u64) {
        return observed[index as usize].clone();
    }
    match pattern {
        Value::Array(items) => Value::Array(
            items
                .iter()
                .map(|item| resolve_observed(item, observed))
                .collect(),
        ),
        Value::Object(fields) => Value::Object(
            fields
                .iter()
                .map(|(key, item)| (key.clone(), resolve_observed(item, observed)))
                .collect(),
        ),
        _ => pattern.clone(),
    }
}
pub(crate) fn matches(observation: &Value, rule: &Value) -> bool {
    if rule["rejects"] == true && observation["threw"] != true {
        return false;
    }
    let actual = &observation["actual"];
    let expected = if rule["hybrid"] == true {
        expected_box(&resolve_observed(
            &rule["expected"],
            &observation["other"]["value"],
        ))
    } else if rule["dynamic"] == true {
        observation["other"].clone()
    } else {
        expected_box(&rule["expected"])
    };
    let a = value(actual);
    let e = value(&expected);
    match rule["matcher"].as_str().expect("matcher") {
        "toComplete" => observation["completed"] == true,
        "toBe" => {
            if e.get("__jait_matcher").is_some() {
                return pattern(a, e);
            }
            // Objects, functions and other reference values compare by identity.
            // Never fall back to structural equality when identity metadata is
            // missing: a transport regression would otherwise let a distinct but
            // equal-looking value (e.g. another AbortSignal with the same state)
            // satisfy an identity assertion.
            if is_reference_value(actual) {
                assert!(
                    !observation["ref"].is_null(),
                    "toBe on a reference value is missing identity metadata (ref)"
                );
                if rule["dynamic"] != true {
                    return false;
                }
                assert!(
                    !observation["otherRef"].is_null(),
                    "toBe identity comparison is missing the expected operand reference"
                );
                return observation["ref"] == observation["otherRef"];
            }
            if !observation["ref"].is_null() {
                if rule["dynamic"] != true {
                    return false;
                }
                return observation["ref"] == observation["otherRef"];
            }
            actual["type"] == expected["type"] && actual.get("value") == expected.get("value")
        }
        "toEqual" | "toStrictEqual" => {
            if actual["type"] == "function" && rule["dynamic"] == true {
                assert!(
                    !observation["ref"].is_null() && !observation["otherRef"].is_null(),
                    "function equality is missing identity metadata"
                );
                return observation["ref"] == observation["otherRef"];
            }
            if rule["matcher"] == "toStrictEqual" && actual["prototype"] != expected["prototype"] {
                return false;
            }
            if actual["type"] == "function" && e.get("__jait_matcher").is_some() {
                return pattern(&json!({"__jait_type":"function"}), e);
            }
            (actual["type"] == expected["type"] || e.get("__jait_matcher").is_some())
                && if rule["matcher"] == "toEqual" {
                    pattern(
                        &without_undefined_properties(a),
                        &without_undefined_properties(e),
                    )
                } else {
                    pattern(a, e)
                }
        }
        "toMatchObject" => subset(a, e),
        "toBeUndefined" => actual["type"] == "undefined",
        "toBeDefined" => actual["type"] != "undefined",
        "toBeNull" => actual["type"] == "object" && a.is_null(),
        "toBeTruthy" => truthy(actual),
        "toBeFalsy" => !truthy(actual),
        "toBeTypeOf" => actual["type"] == *e,
        "toHaveLength" => {
            let length = match a {
                Value::Array(items) => items.len(),
                Value::String(text) => text.encode_utf16().count(),
                _ if actual["type"] == "string" => string_units(a).expect("UTF-16 string").len(),
                _ => panic!("length assertion requires an array or string"),
            };
            Some(length as u64) == e.as_u64()
        }
        "toContain" | "toContainEqual" => {
            if actual["type"] == "string" {
                if let (Some(text), Some(part)) = (string_units(a), string_units(e)) {
                    return part.is_empty()
                        || text.windows(part.len()).any(|window| window == part);
                }
                return false;
            }
            let items = if actual["prototype"] == "Set" && a["__jait_type"] == "set" {
                a["values"].as_array().expect("serialized Set values")
            } else if let Some(items) = a.as_array() {
                items
            } else {
                return false;
            };
            if rule["matcher"] == "toContain"
                && (expected["type"] == "object" && !e.is_null() || expected["type"] == "function")
            {
                let refs = observation["itemRefs"]
                    .as_array()
                    .expect("collection reference observations");
                return !observation["otherRef"].is_null()
                    && refs.contains(&observation["otherRef"]);
            }
            items.iter().any(|item| pattern(item, e))
        }
        "toMatch" => {
            let text = a.as_str().expect("text match observation");
            if e.is_string() {
                text.contains(e.as_str().unwrap())
            } else {
                pattern(a, e)
            }
        }
        "toHaveProperty" => property(a, e).is_some_and(|observed| {
            rule.get("propertyValue")
                .is_none_or(|expected| pattern(observed, expected))
        }),
        "toHaveBeenCalled" => !a.as_array().expect("mock call trace").is_empty(),
        "toHaveBeenCalledOnce" => a.as_array().expect("mock call trace").len() == 1,
        "toHaveBeenCalledTimes" => {
            Some(a.as_array().expect("mock call trace").len() as u64) == e.as_u64()
        }
        "toHaveBeenCalledWith" => a
            .as_array()
            .expect("mock call trace")
            .iter()
            .any(|args| pattern(args, e)),
        "toHaveBeenLastCalledWith" => a
            .as_array()
            .expect("mock call trace")
            .last()
            .is_some_and(|args| pattern(args, e)),
        "toHaveBeenNthCalledWith" => {
            let args = e.as_array().expect("nth call arguments");
            let index = args[0].as_u64().expect("call index") as usize;
            assert!(index > 0, "call indices start at one");
            a.as_array()
                .expect("mock call trace")
                .get(index - 1)
                .is_some_and(|actual| pattern(actual, &Value::Array(args[1..].to_vec())))
        }
        "toBeGreaterThan" => numeric_order(actual, &expected) == Some(Ordering::Greater),
        "toBeGreaterThanOrEqual" => {
            numeric_order(actual, &expected).is_some_and(|order| order != Ordering::Less)
        }
        "toBeLessThan" => numeric_order(actual, &expected) == Some(Ordering::Less),
        "toBeLessThanOrEqual" => {
            numeric_order(actual, &expected).is_some_and(|order| order != Ordering::Greater)
        }
        "toThrow" | "toThrowError" => {
            if observation["threw"] != true {
                return false;
            }
            if rule["dynamic"] == true {
                match expected["type"].as_str().unwrap_or("") {
                    "function" => {
                        let prototype = observation
                            .get("expectedPrototype")
                            .filter(|id| id.as_u64().is_some_and(|value| value > 0))
                            .expect("exception constructor is missing prototype identity");
                        observation["prototypes"]
                            .as_array()
                            .expect("exception is missing its prototype chain")
                            .contains(prototype)
                    }
                    "object" if e.get("message").is_some() => observation["error"] == e["message"],
                    "string" => observation["error"]
                        .as_str()
                        .is_some_and(|message| message.contains(e.as_str().unwrap())),
                    kind => panic!("unsupported dynamic exception expectation: {kind}"),
                }
            } else if let Some(expected) = rule.get("expected") {
                observation["error"].as_str().is_some_and(|message| {
                    if let Some(part) = expected.as_str() {
                        message.contains(part)
                    } else {
                        pattern(&Value::String(message.to_owned()), expected)
                    }
                })
            } else {
                true
            }
        }
        "toBeInstanceOf" => {
            !observation["expectedPrototype"].is_null()
                && observation["prototypes"]
                    .as_array()
                    .is_some_and(|chain| chain.contains(&observation["expectedPrototype"]))
        }
        matcher => panic!("unsupported translated matcher: {matcher}"),
    }
}

#[allow(dead_code)]
pub fn check_source(
    root: &Path,
    file: &str,
    name: &str,
    rules: &[Value],
    source: &Path,
    copy: &Path,
    cancelled: &dyn Fn() -> bool,
) {
    tail_stream::run_source(
        root,
        file,
        name,
        rules,
        matches,
        tail_stream::SourceReview {
            source,
            copy,
            cancelled,
        },
    );
}

pub fn check(file: &str, name: &str, rules_source: &str) {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("tests directory")
        .parent()
        .expect("repository");
    let rules: Vec<Value> =
        serde_json::from_str(rules_source).expect("static Rust assertion metadata");
    assert!(!rules.is_empty(), "{name}: no translated assertions");
    tail_stream::run(root, file, name, &rules, matches);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn property_paths_support_brackets_escaped_names_and_exact_own_keys() {
        let observation = json!({"actual":{"type":"object","value":{"items":[{"name":"first"}],"a.b":{"c[d]":1},"items[0]":"literal"}}});
        for (path, value) in [
            (json!("items[0].name"), json!("first")),
            (json!("items.0.name"), json!("first")),
            (json!(["items", 0, "name"]), json!("first")),
            (json!(["a.b", "c[d]"]), json!(1)),
            (json!(r"a\.b.c\[d\]"), json!(1)),
            (json!("items[0]"), json!("literal")),
        ] {
            assert!(
                matches(
                    &observation,
                    &json!({"matcher":"toHaveProperty","expected":path,"propertyValue":value})
                ),
                "path={path}"
            );
        }
        assert!(!matches(
            &observation,
            &json!({"matcher":"toHaveProperty","expected":"items[1].name"})
        ));
        assert!(!matches(
            &observation,
            &json!({"matcher":"toHaveProperty","expected":"items[0].name","propertyValue":"wrong"})
        ));
    }

    #[test]
    fn set_and_map_equality_is_unordered_but_arrays_remain_ordered() {
        for matcher in ["toEqual", "toStrictEqual"] {
            let rule = json!({"matcher":matcher,"dynamic":true});
            for (kind, field, values, items) in [
                ("Set", "values", json!([2, 1]), json!([1, 2])),
                (
                    "Map",
                    "entries",
                    json!([["b", 2], ["a", 1]]),
                    json!([["a", 1], ["b", 2]]),
                ),
            ] {
                let tag = kind.to_lowercase();
                let mut left = json!({"__jait_type":tag});
                left[field] = values;
                let mut right = json!({"__jait_type":tag});
                right[field] = items;
                let mut observation = json!({"actual":{"type":"object","prototype":kind,"value":left},"other":{"type":"object","prototype":kind,"value":right}});
                assert!(matches(&observation, &rule));
                observation["other"]["value"][field][0] = json!("different");
                assert!(!matches(&observation, &rule));
                observation["other"]["value"][field] = json!([]);
                assert!(!matches(&observation, &rule));
            }
            let arrays = json!({"actual":{"type":"object","prototype":"Array","value":[2,1]},"other":{"type":"object","prototype":"Array","value":[1,2]}});
            assert!(!matches(&arrays, &rule));
        }
    }

    #[test]
    fn nested_date_types_are_distinct_from_iso_strings() {
        for matcher in ["toEqual", "toStrictEqual"] {
            let rule = json!({"matcher":matcher,"dynamic":true});
            let date = json!({"x":{"__jait_type":"date","value":"2020-01-01T00:00:00.000Z"}});
            let mut observation = json!({"actual":{"type":"object","prototype":"Object","value":date},"other":{"type":"object","prototype":"Object","value":date}});
            assert!(matches(&observation, &rule));
            observation["other"]["value"]["x"] = json!("2020-01-01T00:00:00.000Z");
            assert!(!matches(&observation, &rule));
        }
    }

    #[test]
    fn lone_surrogate_strings_retain_exact_length_and_membership() {
        let actual =
            json!({"type":"string","value":{"__jait_type":"utf16","units":[55357,120,121]}});
        let observation = json!({"actual":actual});
        assert!(matches(
            &observation,
            &json!({"matcher":"toHaveLength","expected":3})
        ));
        assert!(!matches(
            &observation,
            &json!({"matcher":"toHaveLength","expected":2})
        ));
        assert!(matches(
            &observation,
            &json!({"matcher":"toContain","expected":"xy"})
        ));
        assert!(!matches(
            &observation,
            &json!({"matcher":"toContain","expected":"xx"})
        ));
        assert!(matches(
            &observation,
            &json!({"matcher":"toContain","expected":""})
        ));
    }

    #[test]
    fn bigint_ordering_preserves_sign_and_precision() {
        let big = |value: &str| json!({"type":"bigint","value":value});
        for (left, right, expected) in [
            (
                "99999999999999999999999999999999999999999",
                "100000000000000000000000000000000000000000",
                Ordering::Less,
            ),
            ("-20", "-3", Ordering::Less),
            ("-1", "0", Ordering::Less),
            ("-0", "0", Ordering::Equal),
            ("20", "3", Ordering::Greater),
        ] {
            assert_eq!(numeric_order(&big(left), &big(right)), Some(expected));
        }
    }

    #[test]
    fn loose_equality_ignores_undefined_object_keys_but_not_null_or_strict_keys() {
        let actual = json!({"type":"object","prototype":"Object","value":{"code":"ABC","optional":{"__jait_type":"undefined"}}});
        let observation = json!({"actual":actual});
        assert!(matches(
            &observation,
            &json!({"matcher":"toEqual","expected":{"code":"ABC"}})
        ));
        assert!(!matches(
            &observation,
            &json!({"matcher":"toStrictEqual","expected":{"code":"ABC"}})
        ));
        let observation =
            json!({"actual":{"type":"object","value":{"code":"ABC","optional":null}}});
        assert!(!matches(
            &observation,
            &json!({"matcher":"toEqual","expected":{"code":"ABC"}})
        ));
    }

    #[test]
    fn set_membership_checks_values_and_rejects_missing_members() {
        let observation = json!({"actual":{"type":"object","prototype":"Set","value":{"__jait_type":"set","values":["memory.search", "skills.manage"]}}});
        assert!(matches(
            &observation,
            &json!({"matcher":"toContain","expected":"memory.search"})
        ));
        assert!(!matches(
            &observation,
            &json!({"matcher":"toContain","expected":"missing.tool"})
        ));
        assert!(!matches(
            &observation,
            &json!({"matcher":"toContain","expected":"set"})
        ));
    }

    #[test]
    fn collection_contains_uses_identity_but_contains_equal_uses_structure() {
        for actual in [
            json!([{"id":1}]),
            json!({"__jait_type":"set","values":[{"id":1}]}),
        ] {
            let prototype = if actual.is_array() { "Array" } else { "Set" };
            let mut observation = json!({"actual":{"type":"object","prototype":prototype,"value":actual},"itemRefs":[1],"other":{"type":"object","value":{"id":1}},"otherRef":2});
            assert!(!matches(
                &observation,
                &json!({"matcher":"toContain","dynamic":true})
            ));
            assert!(matches(
                &observation,
                &json!({"matcher":"toContainEqual","dynamic":true})
            ));
            observation["otherRef"] = json!(1);
            assert!(matches(
                &observation,
                &json!({"matcher":"toContain","dynamic":true})
            ));
        }
    }

    #[test]
    fn identity_matches_same_object_and_rejects_equal_but_distinct_objects() {
        let signal = json!({"type":"object","prototype":"AbortSignal","value":{"__jait_type":"AbortSignal","aborted":false}});
        let same =
            json!({"actual":signal,"other":{"type":"object","value":{}},"ref":7,"otherRef":7});
        assert!(matches(&same, &json!({"matcher":"toBe","dynamic":true})));
        let different =
            json!({"actual":signal,"other":{"type":"object","value":{}},"ref":7,"otherRef":8});
        assert!(!matches(
            &different,
            &json!({"matcher":"toBe","dynamic":true})
        ));
        // Primitives keep value equality and need no reference metadata.
        assert!(matches(
            &json!({"actual":{"type":"boolean","value":true}}),
            &json!({"matcher":"toBe","expected":true})
        ));
    }

    #[test]
    fn function_equality_requires_same_reference_for_both_equality_matchers() {
        for matcher in ["toEqual", "toStrictEqual"] {
            let rule = json!({"matcher":matcher,"dynamic":true});
            let mut observation = json!({"actual":{"type":"function","name":"same"},"other":{"type":"function","name":"same"},"ref":1,"otherRef":1});
            assert!(matches(&observation, &rule));
            observation["otherRef"] = json!(2);
            assert!(!matches(&observation, &rule));
            observation.as_object_mut().unwrap().remove("ref");
            assert!(std::panic::catch_unwind(|| matches(&observation, &rule)).is_err());
        }
    }

    #[test]
    #[should_panic(expected = "missing identity metadata")]
    fn identity_without_reference_metadata_is_rejected() {
        let observation = json!({"actual":{"type":"object","prototype":"AbortSignal","value":{"__jait_type":"AbortSignal","aborted":false}},"other":{"type":"object","value":{}},"otherRef":8});
        let _ = matches(&observation, &json!({"matcher":"toBe","dynamic":true}));
    }

    #[test]
    fn exception_constructor_comparisons_require_identity_metadata() {
        let rule = json!({"matcher":"toThrow","dynamic":true});
        let complete = json!({"threw":true,"other":{"type":"function","name":"Error"},"expectedPrototype":1,"prototypes":[1,2]});
        assert!(matches(&complete, &rule));
        for missing in ["expectedPrototype", "prototypes"] {
            let mut observation = complete.clone();
            observation.as_object_mut().unwrap().remove(missing);
            assert!(std::panic::catch_unwind(|| matches(&observation, &rule)).is_err());
        }
    }
}

#[cfg(test)]
mod nested_reference_tests {
    use super::matches;
    use serde_json::json;

    #[test]
    fn deep_matchers_preserve_function_and_signal_identity() {
        for kind in ["function", "AbortSignal"] {
            let same = json!({"__jait_type":kind,"ref":1});
            let different = json!({"__jait_type":kind,"ref":2});
            for matcher in ["toEqual", "toStrictEqual", "toMatchObject"] {
                let mut observation = json!({
                    "actual":{"type":"object","value":{"nested":same}},
                    "other":{"type":"object","value":{"nested":same}}
                });
                let rule = json!({"matcher":matcher,"dynamic":true});
                assert!(matches(&observation, &rule), "{kind} {matcher}: same");
                observation["other"]["value"]["nested"] = different.clone();
                assert!(!matches(&observation, &rule), "{kind} {matcher}: different");
            }
            let mut observation = json!({
                "actual":{"type":"object","value":[[same]]},
                "other":{"type":"object","value":[same]}
            });
            let rule = json!({"matcher":"toHaveBeenCalledWith","dynamic":true});
            assert!(matches(&observation, &rule), "{kind}: same argument");
            observation["other"]["value"][0] = different;
            assert!(!matches(&observation, &rule), "{kind}: different argument");
        }
    }
}
