//! Provider account and backend quota aggregation, preserving source order.
use serde_json::{Map, Value, json};
fn truthy(v: &Value) -> bool {
    match v {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64().is_some_and(|n| n != 0.0),
        Value::String(s) => !s.is_empty(),
        _ => true,
    }
}
fn error(output: &mut Map<String, Value>, errors: &Value, account: &str) {
    if let Some(value) = errors.get(account) {
        output.insert("error".into(), value.clone());
    } else if account == "__proto__" {
        output.insert("error".into(), json!({}));
    } else if ![
        "constructor",
        "toString",
        "toLocaleString",
        "valueOf",
        "hasOwnProperty",
        "isPrototypeOf",
        "propertyIsEnumerable",
        "__defineGetter__",
        "__defineSetter__",
        "__lookupGetter__",
        "__lookupSetter__",
    ]
    .contains(&account)
    {
        output.insert("error".into(), Value::Null);
    }
}
/// Inputs follow UsageAccount/ProviderUsageSnapshot declarations. Quota objects
/// retain all provider fields; no quota or account label normalization is applied.
pub fn summarize_provider_usage(
    accounts: &[Value],
    quotas: &[Value],
    options: &Value,
    now: &str,
) -> Value {
    let mut profiles = vec![];
    for account in accounts {
        let account_quotas: Vec<_> = quotas
            .iter()
            .filter(|q| q["accountId"] == account["id"])
            .cloned()
            .collect();
        let provider = account["providerType"].as_str().unwrap_or("");
        let label = if account_quotas
            .iter()
            .any(|q| q["providerType"] == "opencode-go")
        {
            "OpenCode Go"
        } else {
            match provider {
                "claude-code" => "Claude Code",
                "codex" => "Codex",
                other => other,
            }
        };
        let plan = account_quotas
            .iter()
            .find(|q| truthy(&q["planType"]))
            .map(|q| q["planType"].clone())
            .unwrap_or(Value::Null);
        let mut output=json!({"id":account["id"],"providerType":provider,"providerLabel":label,
            "profileLabel":account["label"],"locationLabel":if account["nodeId"]=="gateway" {"Gateway profile"} else {"Remote profile"},
            "planType":plan,"quotas":account_quotas}).as_object().unwrap().clone();
        error(
            &mut output,
            &options["quotaErrors"],
            account["id"].as_str().unwrap_or(""),
        );
        profiles.push(Value::Object(output));
    }
    for backend in options["jaitBackendProfiles"]
        .as_array()
        .into_iter()
        .flatten()
    {
        let account = backend["quotaAccountId"].as_str().unwrap_or("");
        let mut output=json!({"id":backend["id"],"providerType":backend["providerType"],
            "providerLabel":backend["providerLabel"],"profileLabel":backend["profileLabel"],
            "locationLabel":"Jait backend","accountLabel":backend["accountLabel"],
            "planType":backend["planType"],
            "quotas":quotas.iter().filter(|q|q["accountId"].as_str()==Some(account)).cloned().collect::<Vec<_>>()}).as_object().unwrap().clone();
        error(&mut output, &options["quotaErrors"], account);
        profiles.push(Value::Object(output));
    }
    json!({"generatedAt":now,"profiles":profiles})
}
