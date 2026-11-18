use anyhow::{Context, Result, ensure};
use serde_json::Value;

/// Parse complete SSE JSON data frames, ignoring comments and transport IDs.
/// Chunk boundaries disappear when the bounded response reader assembles bytes.
pub fn events(bytes: &[u8]) -> Result<Vec<Value>> {
    let text = std::str::from_utf8(bytes).context("SSE was not UTF-8")?;
    let normalized = text.replace("\r\n", "\n").replace('\r', "\n");
    let mut result = Vec::new();
    let mut data = Vec::new();
    for line in normalized.split('\n') {
        if line.is_empty() {
            if !data.is_empty() {
                result
                    .push(serde_json::from_str(&data.join("\n")).context("SSE data was not JSON")?);
                data.clear();
            }
        } else if let Some(value) = line.strip_prefix("data:") {
            data.push(value.strip_prefix(' ').unwrap_or(value));
        }
    }
    ensure!(data.is_empty(), "truncated SSE frame");
    Ok(result)
}

pub fn idle_snapshot(bytes: &[u8], session: &str) -> Result<Value> {
    let events = events(bytes)?;
    ensure!(
        events.len() == 2,
        "idle stream must contain snapshot then done"
    );
    let snapshot = &events[0];
    ensure!(
        snapshot["type"] == "snapshot",
        "first SSE event must be snapshot"
    );
    ensure!(
        snapshot["streaming"] == false,
        "idle snapshot must not be streaming"
    );
    ensure!(
        snapshot["messages"].as_array().is_some_and(Vec::is_empty),
        "new session must have empty history"
    );
    ensure!(
        snapshot["seq"].is_u64(),
        "snapshot needs a nonnegative sequence"
    );
    ensure!(
        snapshot["total"] == 0 && snapshot["hasMore"] == false,
        "empty history pagination mismatch"
    );
    ensure!(events[1]["type"] == "done", "final SSE event must be done");
    ensure!(
        events[1]["session_id"] == session,
        "done must identify the requested session"
    );
    Ok(snapshot.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_crlf_comments_and_multiline_data() {
        let frames =
            events(b": keepalive\r\nid: 4\r\ndata: {\r\ndata: \"type\": \"done\"}\r\n\r\n")
                .unwrap();
        assert_eq!(frames[0]["type"], "done");
    }

    #[test]
    fn rejects_malformed_and_truncated_data() {
        assert!(events(b"data: nope\n\n").is_err());
        assert!(events(b"data: {}").is_err());
        assert!(events(&[0xff]).is_err());
    }

    #[test]
    fn detects_missing_wrong_or_reordered_completion() {
        let snapshot = "data: {\"type\":\"snapshot\",\"streaming\":false,\"messages\":[],\"seq\":0,\"total\":0,\"hasMore\":false}\n\n";
        let done = "data: {\"type\":\"done\",\"session_id\":\"owned\"}\n\n";
        assert!(idle_snapshot(format!("{snapshot}{done}").as_bytes(), "owned").is_ok());
        assert!(idle_snapshot(snapshot.as_bytes(), "owned").is_err());
        assert!(idle_snapshot(format!("{done}{snapshot}").as_bytes(), "owned").is_err());
        assert!(idle_snapshot(format!("{snapshot}{done}").as_bytes(), "other").is_err());
    }
}
