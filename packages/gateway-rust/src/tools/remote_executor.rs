//! Remote routing over caller-authorized local/WS capabilities. Node selection
//! does not authorize execution. The local executor retains consent and scope;
//! terminal calls stay on its persistent terminal path with the owning node.
use super::{core_io::HostError, filesystem_resolver::FileSystemResolver};
use crate::{
    execution::command_timeout::TimeoutPolicy, runtime::blocking::BlockingLane,
    services::calendar::js_text, surfaces::filesystem::OutputCallback,
};
use futures_util::future::BoxFuture;
use serde_json::{Value, json};
use std::{path::Path, sync::Arc};
const REMOTE_TOOLS: &[&str] = &[
    "execute",
    "terminal.run",
    "jait.terminal",
    "read",
    "file.read",
    "edit",
    "file.write",
    "file.patch",
    "file.list",
    "file.stat",
    "image.view",
    "search",
    "file.search",
    "os.query",
];
fn terminal(name: &str) -> bool {
    matches!(name, "execute" | "terminal.run" | "jait.terminal")
}
pub fn proxy_timeout_ms(name: &str, input: &Value, policy: &TimeoutPolicy) -> f64 {
    if terminal(name) && input["isBackground"] != true {
        policy.resolve(input.get("timeout")).milliseconds + 30_000.0
    } else {
        120_000.0
    }
}
#[derive(Clone, Debug)]
pub struct FsNode {
    pub id: String,
    pub platform: Option<String>,
    pub is_gateway: bool,
}
#[derive(Clone)]
pub struct RemoteContext {
    pub data: Value,
    pub on_output_chunk: Option<OutputCallback>,
}
pub type LocalExecutor = Arc<
    dyn for<'a> Fn(
            &'a str,
            &'a Value,
            &'a RemoteContext,
            Option<&'a Value>,
        ) -> BoxFuture<'a, Result<Value, HostError>>
        + Send
        + Sync,
>;
pub trait RemoteControlPlane: Send + Sync {
    fn find_node(&self, id: &str) -> Result<bool, HostError>;
    fn fs_nodes(&self) -> Result<Vec<FsNode>, HostError>;
    fn proxy<'a>(
        &'a self,
        node: &'a str,
        tool: &'a str,
        input: &'a Value,
        options: Value,
        on_output_chunk: Option<OutputCallback>,
    ) -> BoxFuture<'a, Result<Value, HostError>>;
}
pub async fn resolve_remote_node_for_session(
    ws: &dyn RemoteControlPlane,
    project_path: Option<&str>,
    project_node_id: Option<&str>,
    lane: &BlockingLane,
) -> Result<Option<String>, HostError> {
    if let Some(id) = project_node_id.filter(|s| !s.is_empty() && *s != "gateway")
        && ws.find_node(id)?
    {
        return Ok(Some(id.into()));
    }
    let Some(path) = project_path.filter(|s| !s.is_empty()) else {
        return Ok(None);
    };
    let owned = path.to_owned();
    if lane
        .run(move || Path::new(&owned).exists())
        .await
        .map_err(|e| HostError::Error(e.to_string()))?
    {
        return Ok(None);
    }
    let bytes = path.as_bytes();
    let windows = bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && matches!(bytes[2], b'/' | b'\\');
    Ok(ws
        .fs_nodes()?
        .into_iter()
        .find(|n| !n.is_gateway && (!windows || n.platform.as_deref() == Some("windows")))
        .map(|n| n.id))
}
pub struct RemoteToolExecutor {
    ws: Arc<dyn RemoteControlPlane>,
    local: LocalExecutor,
    node: Option<String>,
    resolver: FileSystemResolver,
    policy: TimeoutPolicy,
}
pub fn create_remote_tool_executor(
    ws: Arc<dyn RemoteControlPlane>,
    local: LocalExecutor,
    node: Option<String>,
    resolver: FileSystemResolver,
    policy: TimeoutPolicy,
) -> RemoteToolExecutor {
    RemoteToolExecutor {
        ws,
        local,
        node,
        resolver,
        policy,
    }
}
impl RemoteToolExecutor {
    pub async fn execute(
        &self,
        tool: &str,
        input: &Value,
        context: &RemoteContext,
        options: Option<&Value>,
    ) -> Result<Value, HostError> {
        let Some(node) = self
            .node
            .as_deref()
            .filter(|s| !s.is_empty() && REMOTE_TOOLS.contains(&tool))
        else {
            return (self.local)(tool, input, context, options).await;
        };
        if terminal(tool) {
            if !self.ws.find_node(node)? {
                return Ok(
                    json!({"ok":false,"message":format!("Project node {node} is disconnected; terminal command was not run")}),
                );
            }
            let mut context = context.clone();
            context.data["executionNodeId"] = json!(node);
            return (self.local)(tool, input, &context, options).await;
        }
        if matches!(tool, "read" | "file.read")
            && let Some(path) = input["path"].as_str()
            && self
                .resolver
                .is_gateway_local_path_outside_project(path, context.data["projectRoot"].as_str())
                .await
                .map_err(HostError::Error)?
        {
            return (self.local)(tool, input, context, options).await;
        }
        if !self.ws.find_node(node)? {
            return (self.local)(tool, input, context, options).await;
        }
        let mut proxy_options = json!({"timeoutMs":serde_json::from_str::<Value>(ryu_js::Buffer::new().format(proxy_timeout_ms(tool,input,&self.policy))).expect("finite proxy timeout")});
        for key in ["sessionId", "projectRoot"] {
            if let Some(v) = context.data.get(key) {
                proxy_options[key] = v.clone();
            }
        }
        // Every terminal alias returned above. The reference's legacy one-shot
        // background-registration branch is therefore unreachable for this allow-list.
        match self
            .ws
            .proxy(
                node,
                tool,
                input,
                proxy_options,
                context.on_output_chunk.clone(),
            )
            .await
        {
            Ok(v) => Ok(v),
            Err(error) => Ok(
                json!({"ok":false,"message":format!("Remote execution failed: {}",match error{HostError::Error(s)=>s,HostError::Thrown(v)=>js_text(&v)})}),
            ),
        }
    }
}
