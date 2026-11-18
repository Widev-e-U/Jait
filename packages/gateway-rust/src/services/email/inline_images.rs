//! CID substitution and bounded raster data URLs; no remote image requests.
use base64::{Engine, engine::general_purpose::STANDARD};
use regex::{Captures, Regex};
use std::{collections::HashMap, sync::LazyLock};
static CID: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?i-u:cid):([^"'<>\x{0009}-\x{000d}\x{0020}\x{00a0}\x{1680}\x{2000}-\x{200a}\x{2028}\x{2029}\x{202f}\x{205f}\x{3000}\x{feff}]+)"#).unwrap()
});
fn decode_uri(value: &str) -> Option<String> {
    let bytes = value.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            if i + 2 >= bytes.len()
                || !bytes[i + 1].is_ascii_hexdigit()
                || !bytes[i + 2].is_ascii_hexdigit()
            {
                return None;
            }
            i += 3;
        } else {
            i += 1;
        }
    }
    percent_encoding::percent_decode_str(value)
        .decode_utf8()
        .ok()
        .map(|s| s.into_owned())
}
pub fn embed_inline_images(html: &str, images: &HashMap<String, String>) -> String {
    CID.replace_all(html, |caps: &Captures<'_>| {
        let key = decode_uri(&caps[1])
            .map(|s| s.strip_prefix('<').unwrap_or(&s).to_string())
            .map(|s| s.strip_suffix('>').unwrap_or(&s).to_string());
        key.and_then(|key| images.get(&key))
            .filter(|s| !s.is_empty())
            .cloned()
            .unwrap_or_else(|| caps[0].into())
    })
    .into_owned()
}
pub fn inline_image_data(kind: &str, data: &str) -> Option<String> {
    if ![
        "image/png",
        "image/jpeg",
        "image/gif",
        "image/webp",
        "image/avif",
    ]
    .iter()
    .any(|t| kind.eq_ignore_ascii_case(t))
        || data.len() > 1_500_000
        || data.is_empty()
        || !data
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"+/_=-".contains(&b))
    {
        return None;
    }
    // Node's Buffer base64 decoder accepts URL-safe digits, stops at '=' and
    // ignores a trailing incomplete sextet. Canonicalize bytes on output.
    let mut bits = 0u32;
    let mut count = 0;
    let mut bytes = vec![];
    for b in data.bytes().take_while(|b| *b != b'=') {
        let digit = match b {
            b'A'..=b'Z' => b - b'A',
            b'a'..=b'z' => b - b'a' + 26,
            b'0'..=b'9' => b - b'0' + 52,
            b'+' | b'-' => 62,
            b'/' | b'_' => 63,
            _ => return None,
        };
        bits = (bits << 6) | u32::from(digit);
        count += 6;
        if count >= 8 {
            count -= 8;
            bytes.push((bits >> count) as u8);
            bits &= (1 << count) - 1;
        }
        if bytes.len() > 1024 * 1024 {
            return None;
        }
    }
    Some(format!(
        "data:{};base64,{}",
        kind.to_ascii_lowercase(),
        STANDARD.encode(bytes)
    ))
}
