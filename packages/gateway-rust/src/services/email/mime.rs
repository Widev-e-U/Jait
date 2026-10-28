//! Bounded MIME subset. No external resource loading, executable markup or file writes.
//! Unsupported charsets/encodings fail explicitly instead of returning corrupt text.
use crate::services::email::imap::{ParsedMime, SmtpMessage};
use base64::{Engine, engine::general_purpose::STANDARD};
use std::sync::atomic::{AtomicBool, Ordering};

pub(super) const MAX_MAIL: usize = 10 * 1024 * 1024;
const MAX_HEADERS: usize = 64 * 1024;
fn error() -> String {
    "Invalid or unsupported MIME message".into()
}
fn check(cancel: &AtomicBool) -> Result<(), String> {
    if cancel.load(Ordering::Relaxed) {
        Err("MIME parsing cancelled".into())
    } else {
        Ok(())
    }
}
/// Parsed header pairs plus the remaining body bytes.
pub(super) type ParsedHeaders<'a> = (Vec<(String, String)>, &'a [u8]);

pub(super) fn headers(source: &[u8]) -> Result<ParsedHeaders<'_>, String> {
    if let Some(body) = source
        .strip_prefix(b"\r\n")
        .or_else(|| source.strip_prefix(b"\n"))
    {
        return Ok((Vec::new(), body));
    }
    let end = source
        .windows(4)
        .position(|w| w == b"\r\n\r\n")
        .map(|n| (n, 4))
        .or_else(|| source.windows(2).position(|w| w == b"\n\n").map(|n| (n, 2)))
        .ok_or_else(error)?;
    if end.0 > MAX_HEADERS {
        return Err(error());
    }
    let block = std::str::from_utf8(&source[..end.0]).map_err(|_| error())?;
    let mut result: Vec<(String, String)> = Vec::new();
    for line in block.split('\n') {
        let line = line.strip_suffix('\r').unwrap_or(line);
        if line.len() > 16_384 || line.contains(['\0', '\r']) {
            return Err(error());
        }
        if line.starts_with([' ', '\t']) {
            let (_, value) = result.last_mut().ok_or_else(error)?;
            value.push(' ');
            value.push_str(line.trim());
        } else {
            if result.len() >= 256 {
                return Err(error());
            }
            let (name, value) = line.split_once(':').ok_or_else(error)?;
            if name.is_empty() || !name.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-') {
                return Err(error());
            }
            result.push((name.to_ascii_lowercase(), value.trim().into()));
        }
    }
    Ok((result, &source[end.0 + end.1..]))
}
pub(super) fn header(fields: &[(String, String)], key: &str) -> String {
    fields
        .iter()
        .filter(|(k, _)| k == key)
        .map(|(_, v)| v.as_str())
        .collect::<Vec<_>>()
        .join(", ")
}
fn charset(bytes: Vec<u8>, name: &str) -> Result<String, String> {
    match name.trim_matches('"').to_ascii_lowercase().as_str() {
        "utf-8" | "utf8" | "" => String::from_utf8(bytes).map_err(|_| error()),
        "us-ascii" | "ascii" if bytes.is_ascii() => String::from_utf8(bytes).map_err(|_| error()),
        "iso-8859-1" | "latin1" => Ok(bytes.into_iter().map(char::from).collect()),
        _ => Err(error()),
    }
}
fn unquote(value: &str) -> Result<String, String> {
    if let Some(inner) = value.strip_prefix('"') {
        let inner = inner.strip_suffix('"').ok_or_else(error)?;
        let mut chars = inner.chars();
        let mut out = String::new();
        while let Some(c) = chars.next() {
            out.push(if c == '\\' {
                chars.next().ok_or_else(error)?
            } else {
                c
            });
        }
        Ok(out)
    } else {
        Ok(value.to_string())
    }
}
fn parameter(value: &str, key: &str) -> Result<Option<String>, String> {
    // Semicolons inside quoted strings are data.
    let mut quoted = false;
    let mut escape = false;
    let mut start = 0;
    let mut parts = Vec::new();
    for (i, c) in value.char_indices() {
        if escape {
            escape = false;
            continue;
        }
        if c == '\\' && quoted {
            escape = true;
            continue;
        }
        if c == '"' {
            quoted = !quoted;
        }
        if c == ';' && !quoted {
            parts.push(&value[start..i]);
            start = i + 1;
        }
    }
    if quoted || escape {
        return Err(error());
    }
    parts.push(&value[start..]);
    for part in parts.into_iter().skip(1) {
        if let Some((k, v)) = part.split_once('=')
            && k.trim().eq_ignore_ascii_case(key) {
                return unquote(v.trim()).map(Some);
            }
    }
    Ok(None)
}
fn qp(bytes: &[u8], word: bool) -> Result<Vec<u8>, String> {
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'_' if word => {
                out.push(b' ');
                i += 1;
            }
            b'=' if !word && bytes.get(i + 1..i + 3) == Some(b"\r\n") => i += 3,
            b'=' if !word && bytes.get(i + 1) == Some(&b'\n') => i += 2,
            b'=' => {
                let pair = bytes.get(i + 1..i + 3).ok_or_else(error)?;
                let digit = |b: u8| (b as char).to_digit(16).map(|n| n as u8).ok_or_else(error);
                out.push(digit(pair[0])? * 16 + digit(pair[1])?);
                i += 3;
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    Ok(out)
}
pub(super) fn decode_header(value: &str) -> Result<String, String> {
    let mut rest = value;
    let mut out = String::new();
    let mut previous_word = false;
    while let Some(pos) = rest.find("=?") {
        let prefix = &rest[..pos];
        if !(previous_word && prefix.trim().is_empty()) {
            out.push_str(prefix);
        }
        let encoded = &rest[pos + 2..];
        let (cs, encoded) = encoded.split_once('?').ok_or_else(error)?;
        let (encoding, encoded) = encoded.split_once('?').ok_or_else(error)?;
        let (data, suffix) = encoded.split_once("?=").ok_or_else(error)?;
        let bytes = if encoding.eq_ignore_ascii_case("B") {
            STANDARD.decode(data).map_err(|_| error())?
        } else if encoding.eq_ignore_ascii_case("Q") {
            qp(data.as_bytes(), true)?
        } else {
            return Err(error());
        };
        out.push_str(&charset(bytes, cs)?);
        rest = suffix;
        previous_word = true;
    }
    out.push_str(rest);
    if out.contains(['\r', '\n', '\0']) {
        return Err(error());
    }
    Ok(out)
}
struct Budget<'a> {
    nodes: usize,
    decoded: usize,
    html_max: usize,
    cancel: &'a AtomicBool,
}
fn walk(
    source: &[u8],
    depth: usize,
    budget: &mut Budget<'_>,
    result: &mut ParsedMime,
) -> Result<(), String> {
    check(budget.cancel)?;
    budget.nodes += 1;
    if depth > 20 || budget.nodes > 256 {
        return Err(error());
    }
    let (fields, body) = headers(source)?;
    let content_type = header(&fields, "content-type");
    let kind = content_type
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    let disposition = header(&fields, "content-disposition");
    let attachment = disposition
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .eq_ignore_ascii_case("attachment")
        || parameter(&disposition, "filename")?.is_some()
        || parameter(&content_type, "name")?.is_some();
    if attachment
        || (!kind.is_empty() && !kind.starts_with("text/") && !kind.starts_with("multipart/"))
    {
        result.attachment_count += 1;
        return Ok(());
    }
    if kind.starts_with("multipart/") {
        let boundary = parameter(&content_type, "boundary")?.ok_or_else(error)?;
        if boundary.is_empty()
            || boundary.len() > 70
            || !boundary.is_ascii()
            || boundary.contains(['\r', '\n', '\0'])
        {
            return Err(error());
        }
        let marker = format!("--{boundary}");
        let terminal = format!("--{boundary}--");
        let mut offset = 0;
        let mut start = None;
        let mut closed = false;
        for line in body.split_inclusive(|b| *b == b'\n') {
            check(budget.cancel)?;
            let bare = line.strip_suffix(b"\n").unwrap_or(line);
            let bare = bare.strip_suffix(b"\r").unwrap_or(bare);
            let bare = bare.trim_ascii_end();
            if bare == marker.as_bytes() || bare == terminal.as_bytes() {
                if let Some(begin) = start.take() {
                    let mut end = offset;
                    if body[..end].ends_with(b"\r\n") {
                        end -= 2;
                    } else if body[..end].ends_with(b"\n") {
                        end -= 1;
                    }
                    walk(&body[begin..end], depth + 1, budget, result)?;
                }
                if bare == terminal.as_bytes() {
                    closed = true;
                    break;
                }
                start = Some(offset + line.len());
            }
            offset += line.len();
        }
        if !closed {
            return Err(error());
        }
        return Ok(());
    }
    let encoding = header(&fields, "content-transfer-encoding").to_ascii_lowercase();
    let bytes = match encoding.trim() {
        "base64" => {
            let filtered: Vec<u8> = body
                .iter()
                .copied()
                .filter(|b| !b.is_ascii_whitespace())
                .collect();
            STANDARD.decode(filtered).map_err(|_| error())?
        }
        "quoted-printable" => qp(body, false)?,
        "" | "7bit" | "8bit" | "binary" => body.to_vec(),
        _ => return Err(error()),
    };
    budget.decoded = budget.decoded.saturating_add(bytes.len());
    if budget.decoded > MAX_MAIL {
        return Err(error());
    }
    let text = charset(
        bytes,
        parameter(&content_type, "charset")?
            .as_deref()
            .unwrap_or("utf-8"),
    )?;
    if kind == "text/html" {
        if result.html.len().saturating_add(text.len()) > budget.html_max {
            return Err("MIME HTML exceeds limit".into());
        }
        result.html.push_str(&text);
    } else if kind.is_empty() || kind == "text/plain" {
        result.text.push_str(&text);
    }
    if result.text.len().saturating_add(result.html.len()) > MAX_MAIL {
        return Err(error());
    }
    check(budget.cancel)
}
pub(super) fn parse(
    source: &[u8],
    html_max: usize,
    cancel: &AtomicBool,
) -> Result<ParsedMime, String> {
    if source.len() > MAX_MAIL || html_max > MAX_MAIL {
        return Err(error());
    }
    let (fields, _) = headers(source)?;
    let optional = |key| {
        let v = header(&fields, key);
        if v.is_empty() { None } else { Some(v) }
    };
    let references = header(&fields, "references")
        .split_whitespace()
        .map(str::to_string)
        .collect::<Vec<_>>();
    if references.len() > 100 {
        return Err(error());
    }
    let mut result = ParsedMime {
        cc: decode_header(&header(&fields, "cc"))?,
        text: String::new(),
        html: String::new(),
        attachment_count: 0,
        reply_to: optional("reply-to")
            .map(|v| decode_header(&v))
            .transpose()?,
        message_id: optional("message-id"),
        references,
    };
    walk(
        source,
        0,
        &mut Budget {
            nodes: 0,
            decoded: 0,
            html_max,
            cancel,
        },
        &mut result,
    )?;
    Ok(result)
}
fn clean_header(value: &str) -> Result<(), String> {
    if value.len() > 4096 || value.contains(['\r', '\n', '\0']) {
        Err("Invalid email header".into())
    } else {
        Ok(())
    }
}
pub(super) fn recipients(value: &str) -> Result<Vec<String>, String> {
    clean_header(value)?;
    let mut result = Vec::new();
    let mut quoted = false;
    let mut escaped = false;
    let mut start = 0;
    let mut parts = Vec::new();
    for (i, c) in value.char_indices() {
        if escaped {
            escaped = false;
            continue;
        }
        if c == '\\' && quoted {
            escaped = true;
            continue;
        }
        if c == '"' {
            quoted = !quoted;
        }
        if c == ',' && !quoted {
            parts.push(&value[start..i]);
            start = i + 1;
        }
    }
    if quoted || escaped {
        return Err("Invalid email recipient".into());
    }
    parts.push(&value[start..]);
    for part in parts {
        let part = part.trim();
        let address = if let Some((_, tail)) = part.rsplit_once('<') {
            tail.strip_suffix('>')
                .ok_or("Invalid email recipient")?
                .trim()
        } else {
            part
        };
        result.push(crate::services::email::connection::validate_email(address)?);
        if result.len() > 100 {
            return Err("Too many email recipients".into());
        }
    }
    Ok(result)
}
pub(super) fn compose(message: &SmtpMessage) -> Result<(Vec<u8>, Vec<String>, String), String> {
    for value in [
        &message.from_name,
        &message.from_address,
        &message.to,
        &message.subject,
    ] {
        clean_header(value)?;
    }
    for value in [&message.cc, &message.bcc, &message.in_reply_to]
        .into_iter()
        .flatten()
    {
        clean_header(value)?;
    }
    if message.body.len() > MAX_MAIL || message.references.len() > 100 {
        return Err("Email message is too large".into());
    }
    for value in &message.references {
        clean_header(value)?;
    }
    crate::services::email::connection::validate_email(&message.from_address)?;
    let mut addresses = recipients(&message.to)?;
    for value in [&message.cc, &message.bcc].into_iter().flatten() {
        addresses.extend(recipients(value)?);
    }
    if addresses.len() > 100 {
        return Err("Too many email recipients".into());
    }
    let id = format!("<{}@jait.local>", uuid::Uuid::new_v4());
    let encode = |value: &str| format!("=?UTF-8?B?{}?=", STANDARD.encode(value.as_bytes()));
    let mut data = format!(
        "From: {} <{}>\r\nTo: {}\r\nSubject: {}\r\nMessage-ID: {}\r\nDate: {}\r\nMIME-Version: 1.0\r\n",
        encode(&message.from_name),
        message.from_address,
        message.to,
        encode(&message.subject),
        id,
        chrono::Utc::now().to_rfc2822()
    );
    if let Some(cc) = &message.cc {
        data.push_str(&format!("Cc: {cc}\r\n"));
    }
    if let Some(reply) = &message.in_reply_to {
        data.push_str(&format!("In-Reply-To: {reply}\r\n"));
    }
    if !message.references.is_empty() {
        data.push_str(&format!("References: {}\r\n", message.references.join(" ")));
    }
    data.push_str(&format!(
        "Content-Type: text/{}; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n",
        if message.html { "html" } else { "plain" }
    ));
    let encoded = STANDARD.encode(message.body.as_bytes());
    for chunk in encoded.as_bytes().chunks(76) {
        data.push_str(std::str::from_utf8(chunk).map_err(|_| error())?);
        data.push_str("\r\n");
    }
    if data.split("\r\n").any(|line| line.len() > 998) {
        return Err("Email header line is too long".into());
    }
    if data.len() > 16 * 1024 * 1024 {
        return Err("Email message is too large".into());
    }
    Ok((data.into_bytes(), addresses, id))
}
