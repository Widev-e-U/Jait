//! Five code-graph tool adapters. Opaque execution context retains consent and
//! cancellation; this factory never discovers a project or changes scope.
use super::{
    core_io::{HostError, HostPort},
    list_preview::format_ellipsed_list,
    memory_tools::MemoryToolResult,
};
use crate::{contracts::bounded_json::Utf16Text, services::calendar::js_text, text::js_trim};
use crate::{
    execution::process_runner::ProcessCancellation, services::code_graph::service::CodeGraphService,
};
use serde_json::{Value, json};
use std::sync::{Arc, OnceLock};
pub struct GraphToolContext<C> {
    pub fields: Value,
    pub capabilities: C,
}
pub struct CodeGraphTools<C> {
    pub port: HostPort<GraphToolContext<C>>,
}
pub fn metadata() -> &'static Value {
    static META: OnceLock<Value> = OnceLock::new();
    META.get_or_init(|| {
        serde_json::from_str(include_str!("code-graph-metadata.json")).expect("code graph metadata")
    })
}
fn output(ok: bool, message: impl Into<Utf16Text>, data: Option<Value>) -> MemoryToolResult {
    MemoryToolResult {
        ok: json!(ok),
        message: message.into(),
        data,
    }
}
fn number(value: &Value) -> String {
    value
        .as_f64()
        .map(|_| js_text(value))
        .unwrap_or_else(|| "0".into())
}
impl<C: Send + Sync> CodeGraphTools<C> {
    pub async fn execute(
        &self,
        name: &str,
        input: &Value,
        context: &GraphToolContext<C>,
    ) -> MemoryToolResult {
        match self.inner(name, input, context).await {
            Ok((message, data)) => output(true, message, Some(data)),
            Err(HostError::Error(message)) => output(false, message, None),
            Err(HostError::Thrown(value)) => output(false, js_text(&value), None),
        }
    }
    async fn inner(
        &self,
        name: &str,
        input: &Value,
        context: &GraphToolContext<C>,
    ) -> Result<(Utf16Text, Value), HostError> {
        let root = context.fields["projectRoot"]
            .as_str()
            .map(js_trim)
            .filter(|s| !s.is_empty())
            .ok_or_else(|| HostError::Error("A project is required for code graph tools".into()))?;
        let mut params = json!({"projectRoot":root});
        if let Some(user) = context.fields.get("userId") {
            params["userId"] = user.clone();
        }
        let (method, keys) = match name {
            "codegraph.index" => ("index", vec![]),
            "codegraph.query" => ("query", vec!["query", "mode", "maxNodes", "maxDepth"]),
            "codegraph.path" => ("shortestPath", vec!["source", "target", "maxDepth"]),
            "codegraph.prepare_graphrag" => ("prepareGraphRag", vec![]),
            "codegraph.status" => ("getIndex", vec![]),
            _ => return Err(HostError::Error("Unknown code graph tool".into())),
        };
        for key in keys {
            if let Some(value) = input.get(key) {
                params[key] = value.clone();
            }
        }
        let result = (self.port)(method, &params, context).await?;
        let message = match name {
            "codegraph.index" => format!(
                "Indexed {} nodes and {} edges.",
                number(&result["stats"]["nodeCount"]),
                number(&result["stats"]["edgeCount"])
            )
            .into(),
            "codegraph.query" => {
                let mut nodes: Vec<_> = result["nodes"]
                    .as_array()
                    .expect("typed graph query")
                    .iter()
                    .collect();
                nodes.sort_by(|a, b| {
                    b["degree"]
                        .as_f64()
                        .unwrap_or(0.0)
                        .total_cmp(&a["degree"].as_f64().unwrap_or(0.0))
                });
                nodes.truncate(8);
                let lines: Vec<Utf16Text> = nodes
                    .iter()
                    .map(|n| {
                        Utf16Text::from(format!(
                            "• {} ({})",
                            js_text(&n["label"]),
                            js_text(&n["type"])
                        ))
                    })
                    .collect();
                let mut message = Utf16Text::from(format!(
                    "Retrieved {} nodes and {} relationships.",
                    result["nodes"].as_array().unwrap().len(),
                    result["edges"].as_array().expect("typed graph edges").len()
                ));
                if !lines.is_empty() {
                    message.0.extend("\nTop nodes:\n".encode_utf16());
                    message.0.extend(format_ellipsed_list(&lines, None).0);
                }
                message
            }
            "codegraph.path" => {
                if result.is_null() {
                    return Err(HostError::Error("No code graph path found.".into()));
                }
                let line = result["nodes"]
                    .as_array()
                    .expect("typed graph path")
                    .iter()
                    .map(|n| js_text(&n["label"]))
                    .collect::<Vec<_>>()
                    .join(" → ");
                format!(
                    "Found a {}-hop path: {line}",
                    result["edges"].as_array().expect("typed graph edges").len()
                )
                .into()
            }
            "codegraph.prepare_graphrag" => format!(
                "Prepared {} entities and {} relationships for GraphRAG.",
                js_text(&result["manifest"]["entityCount"]),
                js_text(&result["manifest"]["relationshipCount"])
            )
            .into(),
            _ => {
                if result["status"] == "ready" {
                    "Code graph is ready.".into()
                } else {
                    format!("Code graph status: {}.", js_text(&result["status"])).into()
                }
            }
        };
        Ok((message, result))
    }
}
impl CodeGraphTools<Option<ProcessCancellation>> {
    pub fn for_service(service: Arc<CodeGraphService>) -> Self {
        let port: HostPort<GraphToolContext<Option<ProcessCancellation>>> =
            Arc::new(move |method, params, context| {
                let service = service.clone();
                Box::pin(async move {
                    let root = params["projectRoot"].as_str().expect("validated project");
                    let user = params["userId"].as_str();
                    let result = match method {
                        "index" => {
                            service
                                .index(
                                    root,
                                    user.map(str::to_owned),
                                    None,
                                    context.capabilities.clone(),
                                )
                                .await
                        }
                        "query" => service.query(root, user, params).await,
                        "shortestPath" => {
                            service
                                .shortest_path(
                                    root,
                                    user,
                                    params["source"].as_str().unwrap_or(""),
                                    params["target"].as_str().unwrap_or(""),
                                    params["maxDepth"].as_f64(),
                                )
                                .await
                        }
                        "prepareGraphRag" => service.prepare_graph_rag(root, user).await,
                        _ => service.get_index(root, user),
                    };
                    result.map_err(|e| HostError::Error(e.message))
                })
            });
        Self { port }
    }
}
