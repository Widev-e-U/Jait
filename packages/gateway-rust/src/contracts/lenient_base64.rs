//! Permissive base64 decoding for the Bun/Node Buffer boundary.
//! Source-free DeepSeek draft; acceptance uses actual Buffer comparisons.
pub fn decode_lenient_base64(text: &str) -> Vec<u8> {
    fn val(b: u8) -> Option<u8> {
        match b {
            b'A'..=b'Z' => Some(b - b'A'),
            b'a'..=b'z' => Some(b - b'a' + 26),
            b'0'..=b'9' => Some(b - b'0' + 52),
            b'+' | b'-' => Some(62),
            b'/' | b'_' => Some(63),
            _ => None,
        }
    }
    let mut out = Vec::new();
    let mut acc: u32 = 0;
    let mut nbits: u32 = 0;
    // Buffer decoding narrows UTF-16 code units to bytes before base64 parsing.
    for unit in text.encode_utf16() {
        let b = unit as u8;
        if b == b'=' {
            break;
        }
        if let Some(v) = val(b) {
            acc = (acc << 6) | v as u32;
            nbits += 6;
            if nbits >= 8 {
                nbits -= 8;
                out.push((acc >> nbits) as u8);
                acc &= (1u32 << nbits) - 1;
            }
        }
    }
    out
}
