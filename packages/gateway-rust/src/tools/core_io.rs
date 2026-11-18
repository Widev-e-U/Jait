//! Core edit/execute/web wrappers. Host ports retain filesystem scope, terminal
//! consent and outbound URL policy. These adapters grant no underlying engine credit.
use futures_util::future::{BoxFuture, join_all};
use serde_json::{Value, json};
use std::sync::{Arc, LazyLock};
#[derive(Debug, Clone, PartialEq)]
pub enum HostError {
    Error(String),
    Thrown(Value),
}
pub type HostPort<C> = Arc<
    dyn for<'a> Fn(&'a str, &'a Value, &'a C) -> BoxFuture<'a, Result<Value, HostError>>
        + Send
        + Sync,
>;
pub struct CoreIo<C> {
    port: HostPort<C>,
}
fn present(v: Option<&Value>) -> bool {
    v.is_some_and(|v| !v.is_null())
}
fn truthy(v: &Value) -> bool {
    match v {
        Value::Null => false,
        Value::Bool(v) => *v,
        Value::Number(n) => n.as_f64().is_some_and(|v| v != 0.0),
        Value::String(s) => !s.is_empty(),
        _ => true,
    }
}
fn text(v: Option<&Value>) -> String {
    match v {
        None => "undefined".into(),
        Some(Value::String(v)) => v.clone(),
        Some(Value::Null) => "null".into(),
        Some(Value::Array(v)) => v
            .iter()
            .map(|v| {
                if v.is_null() {
                    String::new()
                } else {
                    text(Some(v))
                }
            })
            .collect::<Vec<_>>()
            .join(","),
        Some(Value::Object(_)) => "[object Object]".into(),
        Some(v) => v.to_string(),
    }
}
fn fields(input: &Value, names: &[&str]) -> Value {
    let mut result = json!({});
    for name in names {
        if let Some(v) = input.get(*name) {
            result[*name] = v.clone();
        }
    }
    result
}
fn fail(message: impl Into<String>) -> Value {
    json!({"ok":false,"message":message.into()})
}
impl<C: Send + Sync> CoreIo<C> {
    pub fn new(port: HostPort<C>) -> Self {
        Self { port }
    }
    pub async fn execute(&self, input: &Value, context: &C) -> Result<Value, HostError> {
        let mut args = fields(
            input,
            &[
                "command",
                "terminalId",
                "timeout",
                "yieldTimeMs",
                "cwd",
                "sandbox",
                "sandboxMountMode",
            ],
        );
        if present(input.get("isBackground")) {
            args["isBackground"] = input["isBackground"].clone();
        }
        (self.port)("terminal", &args, context).await
    }
    pub async fn edit(&self, input: &Value, context: &C) -> Value {
        match self.edit_inner(input, context).await {
            Ok(v) => v,
            Err(HostError::Error(v)) => fail(v),
            Err(HostError::Thrown(_)) => fail("Edit failed"),
        }
    }
    async fn edit_inner(&self, input: &Value, context: &C) -> Result<Value, HostError> {
        if present(input.get("content"))
            && (present(input.get("search")) || present(input.get("replace")))
        {
            return Ok(fail(
                "Choose one edit mode: `content` for write, or `search` + `replace` for patch. Mixed modes are rejected without modifying the file.",
            ));
        }
        let path = text(input.get("path"));
        let explanation = text(input.get("explanation"));
        (self.port)("resolve", &fields(input, &["path"]), context).await?;
        if present(input.get("search")) {
            if !present(input.get("replace")) {
                return Ok(fail("Patch mode requires both `search` and `replace`."));
            }
            if input["search"] == input["replace"] {
                return Ok(fail(
                    "Search and replacement are identical; no change was made. Include the actual changed whitespace or newline in `replace`.",
                ));
            }
            let result = (self.port)(
                "patch",
                &fields(input, &["path", "search", "replace"]),
                context,
            )
            .await?;
            if !truthy(&result["matched"]) {
                return Ok(fail(format!(
                    "Search string not found in {path}. Ensure the search text is an exact literal match including whitespace and indentation. Read the file first to get the exact text."
                )));
            }
            let mut data = fields(input, &["path", "explanation"]);
            data["mode"] = json!("patch");
            return Ok(
                json!({"ok":true,"message":format!("Patched {path}: {explanation}"),"data":data}),
            );
        }
        if !present(input.get("content")) {
            return Ok(fail(
                "Provide `content` to create/overwrite, or `search` + `replace` to patch.",
            ));
        }
        (self.port)("write", &fields(input, &["path", "content"]), context).await?;
        let content = input["content"]
            .as_str()
            .ok_or_else(|| HostError::Error("content must be a string".into()))?;
        let size = content.len();
        let trailing = content.ends_with('\n');
        let mut data = fields(input, &["path", "explanation"]);
        data["mode"] = json!("write");
        data["size"] = json!(size);
        data["trailingNewline"] = json!(trailing);
        Ok(
            json!({"ok":true,"message":format!("Wrote {path} ({size} bytes; trailing newline: {}): {explanation}",if trailing {"yes"} else {"no"}),"data":data}),
        )
    }
    pub async fn read(&self, input: &Value, context: &C) -> Value {
        match self.read_inner(input, context).await {
            Ok(v) => v,
            Err(HostError::Error(s)) => fail(s),
            Err(HostError::Thrown(_)) => fail("Read failed"),
        }
    }
    async fn read_inner(&self, input: &Value, context: &C) -> Result<Value, HostError> {
        let args = fields(input, &["path"]);
        let path = text(input.get("path"));
        (self.port)("resolve", &args, context).await?;
        let is_dir = (self.port)("stat", &args, context)
            .await
            .ok()
            .is_some_and(|v| truthy(&v["isDirectory"]));
        if is_dir {
            let entries = (self.port)("list", &args, context).await?;
            let entries = entries
                .as_array()
                .ok_or_else(|| HostError::Error("entries.map is not a function".into()))?;
            let mut formatted = vec![];
            for entry in entries {
                if entry.is_null() {
                    return Err(HostError::Error(
                        "null is not an object (evaluating 'e.name')".into(),
                    ));
                }
                formatted.push(if entry.is_string() {
                    entry.clone()
                } else if truthy(&entry["name"]) && truthy(&entry["isDirectory"]) {
                    json!(format!("{}/", text(entry.get("name"))))
                } else if truthy(&entry["name"]) {
                    entry["name"].clone()
                } else {
                    json!(text(Some(entry)))
                });
            }
            let mut lines = formatted
                .iter()
                .take(8)
                .map(|v| format!("• {}", text(Some(v))))
                .collect::<Vec<_>>();
            if formatted.len() > 8 {
                lines.push(format!("… (+{} more)", formatted.len() - 8));
            }
            let suffix = if formatted.is_empty() {
                String::new()
            } else {
                format!(":\n{}", lines.join("\n"))
            };
            let mut data = args;
            data["type"] = json!("directory");
            data["entries"] = json!(formatted);
            return Ok(
                json!({"ok":true,"message":format!("Directory {path} — {} entries{suffix}",formatted.len()),"data":data}),
            );
        }
        let content = (self.port)("read", &args, context).await?;
        let content = content
            .as_str()
            .ok_or_else(|| HostError::Error("content.split is not a function".into()))?;
        let all_lines = content.split('\n').collect::<Vec<_>>();
        let total = all_lines.len();
        let start = input["startLine"].as_f64().unwrap_or(1.0).max(1.0) - 1.0;
        let available = input["endLine"]
            .as_f64()
            .unwrap_or(total as f64)
            .min(total as f64);
        let line_end = available.min(start + 6000.0);
        let mut end = start;
        let mut bytes = 0;
        while end < line_end {
            let line = if end.fract() == 0.0 {
                all_lines.get(end as usize).copied().unwrap_or("")
            } else {
                ""
            };
            let line_bytes = line.len() + 1;
            if bytes + line_bytes > 50 * 1024 && end > start {
                break;
            }
            bytes += line_bytes;
            end += 1.0;
        }
        let byte_cap = end < line_end;
        let truncated = byte_cap || line_end < available;
        let begin = (start as usize).min(total);
        let stop = (end as usize).min(total).max(begin);
        let num = |v: f64| -> String { ryu_js::Buffer::new().format(v).to_owned() };
        let mut numbered = all_lines[begin..stop]
            .iter()
            .enumerate()
            .map(|(i, line)| format!("{}\t{line}", num(start + i as f64 + 1.0)))
            .collect::<Vec<_>>()
            .join("\n");
        if truncated {
            numbered.push_str(&format!("\n\n[File content truncated ({}). Showing lines {}-{} of {total}. Use startLine={} to continue.]",if byte_cap {"50KB limit"}else{"6000 line limit"},num(start+1.0),num(end),num(end+1.0)));
        }
        let mut data = args;
        data["type"] = json!("file");
        data["content"] = json!(numbered);
        data["totalLines"] = json!(total);
        data["startLine"] = serde_json::from_str(&num(start + 1.0)).expect("finite line number");
        data["endLine"] = serde_json::from_str(&num(end)).expect("finite line number");
        data["truncated"] = json!(truncated);
        Ok(
            json!({"ok":true,"message":format!("{path} — lines {}-{} of {total}",num(start+1.0),num(end)),"data":data}),
        )
    }
    pub async fn web(&self, input: &Value, context: &C) -> Result<Value, HostError> {
        let inferred = if truthy(&input["url"]) || truthy(&input["urls"]) {
            "fetch"
        } else {
            "search"
        };
        let fetch = if present(input.get("mode")) {
            input["mode"].as_str() == Some("fetch")
        } else {
            inferred == "fetch"
        };
        if !fetch {
            if !truthy(&input["query"]) {
                return Ok(fail("Search mode requires a `query`."));
            }
            return (self.port)(
                "search",
                &fields(input, &["query", "provider", "limit"]),
                context,
            )
            .await;
        }
        let mut urls = vec![];
        if truthy(&input["url"]) {
            urls.push(input["url"].clone());
        }
        if truthy(&input["urls"]) {
            match &input["urls"] {
                Value::Array(v) => urls.extend(v.clone()),
                Value::String(s) => urls.extend(s.chars().map(|c| json!(c.to_string()))),
                _ => {
                    return Err(HostError::Error(
                        "Spread syntax requires ...iterable[Symbol.iterator] to be a function"
                            .into(),
                    ));
                }
            }
        }
        if urls.is_empty() {
            return Ok(fail(
                "Fetch mode requires at least one URL via `url` or `urls`.",
            ));
        }
        let args = urls
            .iter()
            .map(|url| {
                let mut args = fields(
                    input,
                    if urls.len() == 1 {
                        &["method", "body", "maxBytes"]
                    } else {
                        &["method", "maxBytes"]
                    },
                );
                args["url"] = url.clone();
                args
            })
            .collect::<Vec<_>>();
        if args.len() == 1 {
            return (self.port)("fetch", &args[0], context).await;
        }
        let settled = join_all(args.iter().map(|args| (self.port)("fetch", args, context))).await;
        let fetched = settled
            .into_iter()
            .zip(urls.iter())
            .map(|(result, url)| {
                let mut v = json!({"url":url});
                match result {
                    Ok(Value::Object(obj)) => {
                        for (k, x) in obj {
                            v[&k] = x;
                        }
                    }
                    Ok(_) => {}
                    Err(e) => {
                        v["ok"] = json!(false);
                        v["message"] = json!(match e {
                            HostError::Error(s) => format!("Error: {s}"),
                            HostError::Thrown(v) => text(Some(&v)),
                        });
                    }
                }
                v
            })
            .collect::<Vec<_>>();
        let count = fetched.iter().filter(|v| truthy(&v["ok"])).count();
        let mut lines = fetched
            .iter()
            .take(8)
            .map(|v| {
                format!(
                    "• {} {}",
                    if truthy(&v["ok"]) { "ok" } else { "FAILED" },
                    text(v.get("url"))
                )
            })
            .collect::<Vec<_>>();
        if fetched.len() > 8 {
            lines.push(format!("… (+{} more)", fetched.len() - 8));
        }
        Ok(
            json!({"ok":count>0,"message":format!("Fetched {count}/{} URLs successfully:\n{}",urls.len(),lines.join("\n")),"data":{"results":fetched}}),
        )
    }
}
pub fn metadata(name: &str) -> Option<&'static Value> {
    static VALUE: LazyLock<Value> = LazyLock::new(|| {
        serde_json::from_str(include_str!("core-io-metadata.json")).expect("core io metadata")
    });
    VALUE.get(name)
}
