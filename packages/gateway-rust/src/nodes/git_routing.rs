//! Route Git operations consistently with filesystem node selection.
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFsNode {
    pub id: String,
    #[serde(default)]
    pub is_gateway: bool,
    pub platform: Option<String>,
}
pub fn resolve_remote_git_node_id(
    nodes: &[GitFsNode],
    cwd: &str,
    requested: Option<&str>,
    exists_locally: bool,
) -> Option<String> {
    if let Some(id) = requested
        .map(crate::text::js_trim)
        .filter(|v| !v.is_empty())
    {
        if id == "gateway" {
            return None;
        }
        return Some(
            nodes
                .iter()
                .find(|node| node.id == id && !node.is_gateway)
                .map(|node| node.id.as_str())
                .unwrap_or(id)
                .into(),
        );
    }
    if exists_locally {
        return None;
    }
    let bytes = cwd.as_bytes();
    let windows = bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && matches!(bytes[2], b'/' | b'\\');
    nodes
        .iter()
        .find(|node| !node.is_gateway && (!windows || node.platform.as_deref() == Some("windows")))
        .map(|node| node.id.clone())
}
