//! Mermaid chat results and project architecture persistence adapters.
//! Call architecture generation on the bounded database/blocking worker.
use crate::{
    services::architecture_diagrams::{ArchitectureDiagramService, DiagramError},
    text::js_trim,
};
use serde_json::{Value, json};
use std::sync::LazyLock;
pub fn metadata() -> &'static Value {
    static VALUE: LazyLock<Value> = LazyLock::new(|| {
        serde_json::from_str(include_str!("diagrams-metadata.json"))
            .expect("embedded tool definitions")
    });
    &VALUE
}
pub fn render_diagram(input: &Value) -> Value {
    let Some(diagram) = input["diagram"]
        .as_str()
        .filter(|s| !js_trim(s).is_empty() && s.encode_utf16().count() <= 20000)
    else {
        return json!({"ok":false,"message":"Provide Mermaid source between 1 and 20000 characters."});
    };
    let title = match input.get("title") {
        None => "Diagram",
        Some(Value::String(s)) if s.encode_utf16().count() <= 200 => {
            let s = js_trim(s);
            if s.is_empty() { "Diagram" } else { s }
        }
        _ => {
            return json!({"ok":false,"message":"Title must be a string of at most 200 characters."});
        }
    };
    json!({"ok":true,"message":"Mermaid source ready for display in chat.","data":{"kind":"mermaid-diagram","diagram":js_trim(diagram),"title":title}})
}
#[derive(Default)]
pub struct ArchitectureContext<'a> {
    pub project_root: Option<&'a str>,
    pub user_id: Option<&'a str>,
    pub session_id: Option<&'a str>,
}
pub type UiSink<'a> = dyn FnMut(Value, Option<&str>) -> Result<(), DiagramError> + 'a;
fn request_id() -> Result<String, DiagramError> {
    const ALPHABET: &[u8; 64] = b"_-0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let mut entropy = [0u8; 21];
    getrandom::fill(&mut entropy).map_err(|e| e.to_string())?;
    Ok(entropy
        .iter()
        .map(|n| ALPHABET[(n & 63) as usize] as char)
        .collect())
}
pub fn generate_architecture(
    input: &Value,
    context: ArchitectureContext<'_>,
    store: Option<&ArchitectureDiagramService<'_>>,
    mut sink: Option<&mut UiSink<'_>>,
) -> Result<Value, DiagramError> {
    let diagram = match input.get("diagram") {
        None | Some(Value::Null) => "",
        Some(Value::String(s)) => js_trim(s),
        _ => return Err("diagram.trim is not a function".into()),
    };
    if diagram.is_empty() {
        return Ok(json!({"ok":false,"message":"No diagram content provided"}));
    }
    let Some(project) = context.project_root.map(js_trim).filter(|s| !s.is_empty()) else {
        return Ok(
            json!({"ok":false,"message":"A project is required to store architecture diagrams"}),
        );
    };
    let request_id = request_id()?;
    let path = store.map(|s| s.get_file_path(project)).transpose()?;
    let saved = store
        .map(|s| s.save(project, diagram, context.user_id))
        .transpose()?;
    let path = saved
        .as_ref()
        .and_then(|s| s["filePath"].as_str())
        .map(String::from)
        .or_else(|| path.map(|p| p.to_string_lossy().into_owned()));
    if let Some(sink) = sink.as_mut() {
        let mut data = json!({"diagram":diagram,"requestId":request_id,"projectRoot":project});
        if let Some(path) = &path {
            data["filePath"] = json!(path);
        }
        sink(
            json!({"command":"architecture.update","data":data}),
            context.session_id,
        )?;
    }
    Ok(
        json!({"ok":true,"message":"Architecture diagram saved to .jait/architecture.mmd and sent to the editor.",
        "data":{"requestId":request_id,"diagramLength":diagram.encode_utf16().count(),"projectRoot":project,"filePath":path,
        "updatedAt":saved.as_ref().and_then(|s|s["updatedAt"].as_str())}}),
    )
}
