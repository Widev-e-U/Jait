//! File-tool factories over a caller-authorized filesystem port. `resolve` must
//! select the scoped local/remote facade before any operation; these wrappers
//! neither grant filesystem permission nor activate tools in the live registry.
use super::{
    core_io::{HostError, HostPort},
    list_preview::format_ellipsed_list,
};
use crate::{contracts::bounded_json::Utf16Text, text::js_trim};
use base64::{Engine, engine::general_purpose::STANDARD};
use serde_json::{Value, json};
use std::sync::LazyLock;
pub fn metadata(kind: &str) -> Option<&'static Value> {
    static DATA: LazyLock<Value> = LazyLock::new(|| {
        serde_json::from_str(include_str!("file-tools-metadata.json"))
            .expect("file tool definitions")
    });
    DATA.get(kind)
}
#[derive(Clone, Copy)]
pub enum FileOperation {
    Read,
    Write,
    Patch,
    List,
    Stat,
    Image,
}
impl FileOperation {
    fn key(self) -> &'static str {
        match self {
            Self::Read => "read",
            Self::Write => "write",
            Self::Patch => "patch",
            Self::List => "list",
            Self::Stat => "stat",
            Self::Image => "image",
        }
    }
    fn fallback(self) -> &'static str {
        match self {
            Self::Read => "Read failed",
            Self::Write => "Write failed",
            Self::Patch => "Patch failed",
            Self::List => "List failed",
            Self::Stat => "Stat failed",
            Self::Image => "View image failed",
        }
    }
}
pub struct FileTool<C> {
    port: HostPort<C>,
    operation: FileOperation,
}
pub fn create_file_read_tool<C>(port: HostPort<C>) -> FileTool<C> {
    FileTool::new(port, FileOperation::Read)
}
pub fn create_file_write_tool<C>(port: HostPort<C>) -> FileTool<C> {
    FileTool::new(port, FileOperation::Write)
}
pub fn create_file_patch_tool<C>(port: HostPort<C>) -> FileTool<C> {
    FileTool::new(port, FileOperation::Patch)
}
pub fn create_file_list_tool<C>(port: HostPort<C>) -> FileTool<C> {
    FileTool::new(port, FileOperation::List)
}
pub fn create_file_stat_tool<C>(port: HostPort<C>) -> FileTool<C> {
    FileTool::new(port, FileOperation::Stat)
}
pub fn create_image_view_tool<C>(port: HostPort<C>) -> FileTool<C> {
    FileTool::new(port, FileOperation::Image)
}
fn truthy(v: &Value) -> bool {
    match v {
        Value::Null => false,
        Value::Bool(v) => *v,
        Value::String(v) => !v.is_empty(),
        Value::Number(v) => v.as_f64().is_some_and(|n| n != 0.0),
        _ => true,
    }
}
fn js_string(v: &Value) -> String {
    match v {
        Value::Null => "null".into(),
        Value::String(v) => v.clone(),
        Value::Object(_) => "[object Object]".into(),
        Value::Array(v) => v
            .iter()
            .map(|v| {
                if v.is_null() {
                    String::new()
                } else {
                    js_string(v)
                }
            })
            .collect::<Vec<_>>()
            .join(","),
        _ => v.to_string(),
    }
}
fn fields(input: &Value, keys: &[&str]) -> Value {
    let mut out = json!({});
    for key in keys {
        if let Some(v) = input.get(*key) {
            out[*key] = v.clone();
        }
    }
    out
}
fn fail(message: impl Into<String>) -> Value {
    json!({"ok":false,"message":message.into()})
}
impl<C> FileTool<C> {
    pub fn new(port: HostPort<C>, operation: FileOperation) -> Self {
        Self { port, operation }
    }
    pub fn definition(&self) -> &'static Value {
        metadata(self.operation.key()).expect("file factory metadata")
    }
}
impl<C: Send + Sync> FileTool<C> {
    pub async fn execute(&self, input: &Value, context: &C) -> Value {
        match self.inner(input, context).await {
            Ok(v) => v,
            Err(HostError::Error(s)) => fail(s),
            Err(HostError::Thrown(_)) => fail(self.operation.fallback()),
        }
    }
    async fn inner(&self, input: &Value, context: &C) -> Result<Value, HostError> {
        let path = input["path"]
            .as_str()
            .ok_or_else(|| HostError::Error("path must be a string".into()))?;
        let args = fields(input, &["path"]);
        let trimmed = js_trim(path);
        let extension = trimmed
            .rsplit_once('.')
            .map(|(_, ext)| ext.to_ascii_lowercase())
            .unwrap_or_default();
        if matches!(self.operation, FileOperation::Image)
            && !["png", "jpg", "jpeg", "gif", "webp"].contains(&extension.as_str())
        {
            return Ok(fail("Only PNG, JPG, GIF, or WEBP images are supported"));
        }
        (self.port)("resolve", &args, context).await?;
        let mut data = fields(input, &["path"]);
        let message = match self.operation {
            FileOperation::Read => {
                let content = (self.port)("read", &args, context).await?;
                let size = content
                    .as_str()
                    .ok_or_else(|| HostError::Error("read content must be a string".into()))?
                    .len();
                data["content"] = content;
                data["size"] = json!(size);
                format!("Read {path}")
            }
            FileOperation::Write => {
                (self.port)("write", &fields(input, &["path", "content"]), context).await?;
                let size = input["content"]
                    .as_str()
                    .ok_or_else(|| HostError::Error("content must be a string".into()))?
                    .len();
                data["size"] = json!(size);
                format!("Wrote {path} ({size} bytes)")
            }
            FileOperation::Patch => {
                let result = (self.port)(
                    "patch",
                    &fields(input, &["path", "search", "replace"]),
                    context,
                )
                .await?;
                if !truthy(&result["matched"]) {
                    return Ok(fail(format!("Search string not found in {path}")));
                }
                data["matched"] = json!(true);
                format!("Patched {path}")
            }
            FileOperation::List => {
                let entries = (self.port)("list", &args, context).await?;
                let entries_array = entries
                    .as_array()
                    .ok_or_else(|| HostError::Error("entries must be an array".into()))?;
                let lines: Vec<_> = entries_array
                    .iter()
                    .map(|entry| {
                        let line = if let Some(s) = entry.as_str() {
                            format!("• {s}")
                        } else if truthy(&entry["name"]) {
                            format!(
                                "• {}{}",
                                js_string(&entry["name"]),
                                if truthy(&entry["isDirectory"]) {
                                    "/"
                                } else {
                                    ""
                                }
                            )
                        } else {
                            format!("• {}", js_string(entry))
                        };
                        Utf16Text(line.encode_utf16().collect())
                    })
                    .collect();
                let count = entries_array.len();
                let suffix = if lines.is_empty() {
                    ".".into()
                } else {
                    format!(
                        ":\n{}",
                        String::from_utf16_lossy(&format_ellipsed_list(&lines, None).0)
                    )
                };
                data["entries"] = entries;
                format!("Listed {count} entries in {path}{suffix}")
            }
            FileOperation::Stat => {
                let info = (self.port)("stat", &args, context).await?;
                if let Some(info) = info.as_object() {
                    for (key, value) in info {
                        data[key] = value.clone();
                    }
                }
                format!("Stat {path}")
            }
            FileOperation::Image => {
                let info = (self.port)("stat", &args, context).await?;
                if truthy(&info["isDirectory"]) {
                    return Ok(fail(format!("{path} is not a file")));
                }
                let bytes = (self.port)("binary", &args, context).await?;
                let bytes: Vec<u8> = bytes
                    .as_array()
                    .ok_or_else(|| HostError::Error("binary content must be bytes".into()))?
                    .iter()
                    .map(|v| v.as_u64().unwrap_or(0) as u8)
                    .collect();
                let size = bytes.len();
                let inline = size <= 8_000;
                data["mimeType"] = json!(match extension.as_str() {
                    "png" => "image/png",
                    "gif" => "image/gif",
                    "webp" => "image/webp",
                    _ => "image/jpeg",
                });
                data["size"] = json!(size);
                data["inline"] = json!(inline);
                for key in ["modified", "isDirectory"] {
                    if let Some(v) = info.get(key) {
                        data[key] = v.clone();
                    }
                }
                if inline {
                    data["base64"] = json!(STANDARD.encode(bytes));
                }
                let name = trimmed.rsplit('/').next().unwrap_or(trimmed);
                if inline {
                    format!("Displaying image {name}")
                } else {
                    format!(
                        "Displaying image {name} — {size} bytes is too large to inline, so the chat loads it from its path"
                    )
                }
            }
        };
        Ok(json!({"ok":true,"message":message,"data":data}))
    }
}
