//! Command-local output slices and bounded live tails for retained PTY chunks.
pub fn terminal_output_slice(
    buffer: &[String],
    chunk_count: usize,
    offset: f64,
    end: Option<f64>,
    lines: f64,
    trim_done: bool,
) -> String {
    let offset = if offset.is_finite() {
        offset.trunc().max(0.0)
    } else {
        0.0
    };
    let bounded = end.is_some_and(f64::is_finite);
    let end = if bounded {
        end.unwrap().trunc().max(offset)
    } else {
        chunk_count as f64
    };
    let retained_start = chunk_count.saturating_sub(buffer.len()) as f64;
    let offset_index = (offset - retained_start).clamp(0.0, buffer.len() as f64) as usize;
    let end_index = (end - retained_start)
        .min(buffer.len() as f64)
        .max(offset_index as f64) as usize;
    let start = if bounded {
        offset_index as f64
    } else if lines.is_nan() {
        f64::NAN
    } else {
        (end_index as f64 - lines).max(offset_index as f64)
    };
    // Empty command ranges cannot reconnect to a preceding partial line.
    if start == end_index as f64 {
        return String::new();
    }
    // ECMAScript slice truncates fractional indices and treats NaN as zero.
    let start_index = (start as usize).min(buffer.len());
    let mut output = if start_index <= end_index {
        buffer[start_index..end_index].concat()
    } else {
        String::new()
    };
    if trim_done && let Some(index) = output.rfind("\u{1b}]633;D") {
        output.truncate(index);
    }
    if start != offset_index as f64 || offset_index == 0 {
        return output;
    }
    let prefix = buffer[..offset_index].concat();
    let line_start = prefix.rfind(['\n', '\r']).map(|i| i + 1).unwrap_or(0);
    format!("{}{}", &prefix[line_start..], output)
}
