//! ECMAScript-compatible UTF-16 previews, including fractional/nonfinite budgets.
use crate::contracts::bounded_json::Utf16Text;
pub const PREVIEW_MAX_CHARS: f64 = 120.0;
pub const PREVIEW_MAX_ITEMS: f64 = 8.0;
fn whitespace(unit: u16) -> bool {
    char::from_u32(unit as u32).is_some_and(crate::text::js_whitespace)
}
pub fn ellipsize_text(value: &[u16], max_chars: Option<f64>) -> Utf16Text {
    let max = max_chars.unwrap_or(PREVIEW_MAX_CHARS);
    let mut clean = vec![];
    let mut space = false;
    for unit in value {
        if whitespace(*unit) {
            space = true;
        } else {
            if space && !clean.is_empty() {
                clean.push(32);
            }
            clean.push(*unit);
            space = false;
        }
    }
    if max <= 0.0 {
        return Utf16Text(vec![]);
    }
    if clean.len() as f64 <= max {
        return Utf16Text(clean);
    }
    clean.truncate(((max - 1.0).max(0.0) as usize).min(clean.len()));
    while clean.last() == Some(&32) {
        clean.pop();
    }
    clean.push(0x2026);
    Utf16Text(clean)
}
pub fn format_ellipsed_list(lines: &[Utf16Text], max_items: Option<f64>) -> Utf16Text {
    if lines.is_empty() {
        return Utf16Text(vec![]);
    }
    let max = max_items.unwrap_or(PREVIEW_MAX_ITEMS);
    let count = if max.is_nan() {
        0
    } else {
        max.floor().max(0.0) as usize
    }
    .min(lines.len());
    let mut parts = lines[..count]
        .iter()
        .map(|s| s.0.clone())
        .collect::<Vec<_>>();
    if count < lines.len() {
        parts.push(
            format!("… (+{} more)", lines.len() - count)
                .encode_utf16()
                .collect(),
        );
    }
    Utf16Text(parts.join(&10))
}
pub fn summarize_with_preview(
    summary: &[u16],
    lines: &[Utf16Text],
    max_items: Option<f64>,
) -> Utf16Text {
    let preview = format_ellipsed_list(lines, max_items);
    let mut result = summary.to_vec();
    if !preview.0.is_empty() {
        result.push(10);
        result.extend(preview.0);
    }
    Utf16Text(result)
}
pub fn memory_line(id: &str, text: &[u16], kind: Option<&str>, extra: Option<&str>) -> Utf16Text {
    let parts = [Some(id), kind]
        .into_iter()
        .flatten()
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>();
    let mut result = format!("• [{}] ", parts.join(" · "))
        .encode_utf16()
        .collect::<Vec<_>>();
    result.extend(ellipsize_text(text, None).0);
    if let Some(extra) = extra.filter(|s| !s.is_empty()) {
        result.extend(format!(" ({extra})").encode_utf16());
    }
    Utf16Text(result)
}
