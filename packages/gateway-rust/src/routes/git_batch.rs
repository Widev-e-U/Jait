//! Bounded parsing for the Git service's `cat-file --batch` diff reads.
//! This module performs no process execution and grants no repository access.
//! A caller must authorize the repository and command, cap output while reading,
//! and use the existing per-object fallback when this parser rejects a response.

use std::collections::{HashMap, HashSet};

pub const MAX_DIFF_FILE_BYTES: usize = 10 * 1024 * 1024;
pub const MAX_DIFF_BATCH_OUTPUT_BYTES: usize = 64 * 1024 * 1024;

/// Match the reference placeholder without reading the file body.
pub(super) fn oversized_placeholder(size: u64) -> String {
    // Positive exact ties round up as in JavaScript's toFixed(1).
    let tenths = (u128::from(size) * 10 + 524_288) / 1_048_576;
    format!(
        "(file too large to diff: {}.{} MB, limit 10 MB)",
        tenths / 10,
        tenths % 10
    )
}

#[derive(Debug, PartialEq, Eq)]
pub enum BatchError {
    OutputLimit,
    InvalidSpec,
    InvalidHeader,
    Truncated,
    InvalidDelimiter,
    TrailingOutput,
}

/// Deduplicate specs in insertion order, preserving the reference's input order.
/// Newlines are rejected because they would create additional batch requests.
pub fn batch_input(specs: &[String]) -> Result<(Vec<String>, Vec<u8>), BatchError> {
    let mut seen = HashSet::new();
    let mut unique = Vec::new();
    let mut input = Vec::new();
    for spec in specs {
        if spec.contains(['\n', '\r', '\0']) {
            return Err(BatchError::InvalidSpec);
        }
        if seen.insert(spec.as_str()) {
            input.extend_from_slice(spec.as_bytes());
            input.push(b'\n');
            unique.push(spec.clone());
        }
    }
    Ok((unique, input))
}

/// Decode one output record per unique input. A malformed response is rejected
/// as a whole so the caller can run the reference's per-object fallback.
pub fn parse_batch(specs: &[String], output: &[u8]) -> Result<HashMap<String, String>, BatchError> {
    if output.len() > MAX_DIFF_BATCH_OUTPUT_BYTES {
        return Err(BatchError::OutputLimit);
    }
    let (unique, _) = batch_input(specs)?;
    let mut results = HashMap::with_capacity(unique.len());
    let mut offset = 0usize;
    for spec in unique {
        let line_len = output
            .get(offset..)
            .ok_or(BatchError::Truncated)?
            .iter()
            .position(|b| *b == b'\n')
            .ok_or(BatchError::Truncated)?;
        let end = offset.checked_add(line_len).ok_or(BatchError::Truncated)?;
        let header = &output[offset..end];
        offset = end + 1;
        if header.ends_with(b" missing") {
            if header.strip_suffix(b" missing") != Some(spec.as_bytes()) {
                return Err(BatchError::InvalidHeader);
            }
            results.insert(spec, String::new());
            continue;
        }
        let mut fields = header.split(|b| *b == b' ');
        let oid = fields.next().ok_or(BatchError::InvalidHeader)?;
        let kind = fields.next().ok_or(BatchError::InvalidHeader)?;
        let size_bytes = fields.next().ok_or(BatchError::InvalidHeader)?;
        if fields.next().is_some()
            || !matches!(oid.len(), 40 | 64)
            || !oid.iter().all(u8::is_ascii_hexdigit)
            || !matches!(kind, b"blob" | b"tree" | b"commit" | b"tag")
        {
            return Err(BatchError::InvalidHeader);
        }
        if size_bytes.is_empty() || !size_bytes.iter().all(u8::is_ascii_digit) {
            return Err(BatchError::InvalidHeader);
        }
        let size = std::str::from_utf8(size_bytes)
            .map_err(|_| BatchError::InvalidHeader)?
            .parse::<usize>()
            .map_err(|_| BatchError::InvalidHeader)?;
        let body_end = offset.checked_add(size).ok_or(BatchError::Truncated)?;
        let body = output.get(offset..body_end).ok_or(BatchError::Truncated)?;
        if output.get(body_end) != Some(&b'\n') {
            return Err(if body_end == output.len() {
                BatchError::Truncated
            } else {
                BatchError::InvalidDelimiter
            });
        }
        let text = if size > MAX_DIFF_FILE_BYTES {
            oversized_placeholder(size as u64)
        } else {
            let mut text = String::from_utf8_lossy(body).into_owned();
            // Reference removes exactly one terminal LF, including its preceding CR.
            if text.ends_with('\n') {
                text.pop();
                if text.ends_with('\r') {
                    text.pop();
                }
            }
            text
        };
        results.insert(spec, text);
        offset = body_end + 1;
    }
    if offset != output.len() {
        return Err(BatchError::TrailingOutput);
    }
    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preserves_order_and_rejects_input_record_injection() {
        let specs = vec!["HEAD:a".into(), "HEAD:b".into(), "HEAD:a".into()];
        let (unique, input) = batch_input(&specs).unwrap();
        assert_eq!(unique, vec!["HEAD:a", "HEAD:b"]);
        assert_eq!(input, b"HEAD:a\nHEAD:b\n");
        assert_eq!(
            batch_input(&["HEAD:a\nHEAD:b".into()]),
            Err(BatchError::InvalidSpec)
        );
    }

    #[test]
    fn decodes_missing_binary_and_one_terminal_newline() {
        let specs = vec!["HEAD:a".into(), "HEAD:b".into(), "HEAD:c".into()];
        let output = b"HEAD:a missing\n0000000000000000000000000000000000000000 blob 5\na\xffb\r\n\n0000000000000000000000000000000000000000 blob 3\nx\n\n\n";
        let values = parse_batch(&specs, output).unwrap();
        assert_eq!(values["HEAD:a"], "");
        assert_eq!(values["HEAD:b"], "a\u{fffd}b");
        assert_eq!(values["HEAD:c"], "x\n");
    }

    #[test]
    fn rejects_incomplete_or_ambiguous_records() {
        let specs = vec!["HEAD:a".into()];
        assert_eq!(
            parse_batch(
                &specs,
                b"0000000000000000000000000000000000000000 blob 2\na"
            ),
            Err(BatchError::Truncated)
        );
        assert_eq!(
            parse_batch(
                &specs,
                b"0000000000000000000000000000000000000000 blob 1\naX"
            ),
            Err(BatchError::InvalidDelimiter)
        );
        assert_eq!(
            parse_batch(
                &specs,
                b"0000000000000000000000000000000000000000 blob nope\n"
            ),
            Err(BatchError::InvalidHeader)
        );
        assert_eq!(
            parse_batch(&specs, b"HEAD:a missing\nextra"),
            Err(BatchError::TrailingOutput)
        );
        assert_eq!(
            parse_batch(&specs, b"HEAD:other missing\n"),
            Err(BatchError::InvalidHeader)
        );
        assert_eq!(
            parse_batch(&specs, b"garbage blob 1\na\n"),
            Err(BatchError::InvalidHeader)
        );
        assert_eq!(
            parse_batch(
                &specs,
                b"0000000000000000000000000000000000000000 bogus 1\na\n"
            ),
            Err(BatchError::InvalidHeader)
        );
    }

    #[test]
    fn reports_large_blob_without_decoding_it() {
        let size = MAX_DIFF_FILE_BYTES + 262_144;
        let mut output =
            format!("0000000000000000000000000000000000000000 blob {size}\n").into_bytes();
        output.resize(output.len() + size, b'x');
        output.push(b'\n');
        let values = parse_batch(&["HEAD:a".into()], &output).unwrap();
        assert_eq!(
            values["HEAD:a"],
            "(file too large to diff: 10.3 MB, limit 10 MB)"
        );
    }
}
