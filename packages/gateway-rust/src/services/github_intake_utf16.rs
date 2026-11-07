//! Standalone bounded JavaScript string building block for GitHub intake.
//!
//! This parses one complete JSON string token, not a JSON document. Callers must
//! validate the surrounding document and apply the webhook's UTF-8 decoding and
//! error handling independently. Lone surrogates are retained as code units.

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Utf16String(Vec<u16>);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StringError {
    InvalidJsonString,
    InputLimit,
    UnitLimit,
    OutputLimit,
}

impl Utf16String {
    /// Construct from already decoded units, including unpaired surrogates.
    pub fn from_units(units: &[u16], max_units: usize) -> Result<Self, StringError> {
        if units.len() > max_units {
            return Err(StringError::UnitLimit);
        }
        Ok(Self(units.to_vec()))
    }

    pub fn as_units(&self) -> &[u16] {
        &self.0
    }

    /// Equivalent to JavaScript's `slice(0, end)` for a nonnegative end.
    pub fn prefix(&self, end: usize) -> Self {
        Self(self.0[..self.0.len().min(end)].to_vec())
    }

    /// Parse exactly one quoted JSON string. The input is already valid UTF-8.
    /// Limits count input bytes and decoded UTF-16 code units, respectively.
    pub fn parse_json(
        input: &str,
        max_input_bytes: usize,
        max_units: usize,
    ) -> Result<Self, StringError> {
        if input.len() > max_input_bytes {
            return Err(StringError::InputLimit);
        }
        let bytes = input.as_bytes();
        if bytes.len() < 2 || bytes[0] != b'"' {
            return Err(StringError::InvalidJsonString);
        }
        let mut units = Vec::new();
        let mut pos = 1;
        while pos < bytes.len() {
            match bytes[pos] {
                b'"' => {
                    return if pos + 1 == bytes.len() {
                        Ok(Self(units))
                    } else {
                        Err(StringError::InvalidJsonString)
                    }
                }
                0..=0x1f => return Err(StringError::InvalidJsonString),
                b'\\' => {
                    pos += 1;
                    let escape = *bytes.get(pos).ok_or(StringError::InvalidJsonString)?;
                    let unit = match escape {
                        b'"' => b'"' as u16,
                        b'\\' => b'\\' as u16,
                        b'/' => b'/' as u16,
                        b'b' => 8,
                        b'f' => 12,
                        b'n' => 10,
                        b'r' => 13,
                        b't' => 9,
                        b'u' => {
                            let mut n = 0u16;
                            for _ in 0..4 {
                                pos += 1;
                                let digit =
                                    *bytes.get(pos).ok_or(StringError::InvalidJsonString)?;
                                let value = match digit {
                                    b'0'..=b'9' => digit - b'0',
                                    b'a'..=b'f' => digit - b'a' + 10,
                                    b'A'..=b'F' => digit - b'A' + 10,
                                    _ => return Err(StringError::InvalidJsonString),
                                };
                                n = (n << 4) | u16::from(value);
                            }
                            n
                        }
                        _ => return Err(StringError::InvalidJsonString),
                    };
                    if units.len() >= max_units {
                        return Err(StringError::UnitLimit);
                    }
                    units.push(unit);
                    pos += 1;
                }
                _ => {
                    // pos remains at a UTF-8 character boundary.
                    let ch = input[pos..]
                        .chars()
                        .next()
                        .ok_or(StringError::InvalidJsonString)?;
                    let mut buf = [0u16; 2];
                    let encoded = ch.encode_utf16(&mut buf);
                    if encoded.len() > max_units.saturating_sub(units.len()) {
                        return Err(StringError::UnitLimit);
                    }
                    units.extend_from_slice(encoded);
                    pos += ch.len_utf8();
                }
            }
        }
        Err(StringError::InvalidJsonString)
    }

    /// Produce a JSON string token using JSON.stringify's well-formed surrogate
    /// escaping. Output limit is measured in UTF-8 bytes, including quotes.
    pub fn to_json(&self, max_output_bytes: usize) -> Result<String, StringError> {
        fn append(out: &mut String, s: &str, limit: usize) -> Result<(), StringError> {
            if s.len() > limit.saturating_sub(out.len()) {
                return Err(StringError::OutputLimit);
            }
            out.push_str(s);
            Ok(())
        }
        let mut out = String::new();
        append(&mut out, "\"", max_output_bytes)?;
        let mut i = 0;
        while i < self.0.len() {
            let u = self.0[i];
            match u {
                0x22 => append(&mut out, "\\\"", max_output_bytes)?,
                0x5c => append(&mut out, "\\\\", max_output_bytes)?,
                8 => append(&mut out, "\\b", max_output_bytes)?,
                9 => append(&mut out, "\\t", max_output_bytes)?,
                10 => append(&mut out, "\\n", max_output_bytes)?,
                12 => append(&mut out, "\\f", max_output_bytes)?,
                13 => append(&mut out, "\\r", max_output_bytes)?,
                0..=0x1f => append(&mut out, &format!("\\u{u:04x}"), max_output_bytes)?,
                0xd800..=0xdbff
                    if self
                        .0
                        .get(i + 1)
                        .is_some_and(|v| (0xdc00..=0xdfff).contains(v)) =>
                {
                    let low = self.0[i + 1];
                    let scalar =
                        0x10000 + ((u32::from(u) - 0xd800) << 10) + (u32::from(low) - 0xdc00);
                    let mut buf = [0; 4];
                    append(
                        &mut out,
                        char::from_u32(scalar).unwrap().encode_utf8(&mut buf),
                        max_output_bytes,
                    )?;
                    i += 1;
                }
                0xd800..=0xdfff => append(&mut out, &format!("\\u{u:04x}"), max_output_bytes)?,
                _ => {
                    let mut buf = [0; 4];
                    append(
                        &mut out,
                        char::from_u32(u32::from(u)).unwrap().encode_utf8(&mut buf),
                        max_output_bytes,
                    )?;
                }
            }
            i += 1;
        }
        append(&mut out, "\"", max_output_bytes)?;
        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn parse(s: &str) -> Result<Utf16String, StringError> {
        Utf16String::parse_json(s, 1000, 1000)
    }

    #[test]
    fn preserves_surrogates_and_javascript_slice() {
        let text = format!("\"{}😀z\"", "a".repeat(200));
        let s = parse(&text).unwrap();
        let prefix = s.prefix(201);
        assert_eq!(prefix.as_units().len(), 201);
        assert_eq!(prefix.as_units()[200], 0xd83d);
        assert_eq!(
            prefix.to_json(1000).unwrap(),
            format!("\"{}\\ud83d\"", "a".repeat(200))
        );
        assert_eq!(
            parse("\"\\ud83d\\ude00\\ud800x\\udc00\"")
                .unwrap()
                .to_json(100)
                .unwrap(),
            "\"😀\\ud800x\\udc00\""
        );
    }

    #[test]
    fn json_escapes_and_roundtrip_all_units() {
        let all: Vec<u16> = (0..=u16::MAX).collect();
        let value = Utf16String::from_units(&all, all.len()).unwrap();
        let json = value.to_json(400_000).unwrap();
        assert_eq!(
            Utf16String::parse_json(&json, json.len(), all.len()).unwrap(),
            value
        );
        assert_eq!(
            parse("\"\\\"\\\\\\/\\b\\f\\n\\r\\t\\u0000\"")
                .unwrap()
                .to_json(100)
                .unwrap(),
            "\"\\\"\\\\/\\b\\f\\n\\r\\t\\u0000\""
        );
    }

    #[test]
    fn rejects_malformed_tokens() {
        for input in [
            "",
            "a",
            "\"",
            "\"x\" ",
            "\"x\"\"y\"",
            "\"\n\"",
            "\"\\x\"",
            "\"\\u123\"",
            "\"\\u12xz\"",
            "\"\\",
        ] {
            assert_eq!(
                parse(input),
                Err(StringError::InvalidJsonString),
                "{input:?}"
            );
        }
    }

    #[test]
    fn bounds_are_inclusive_and_byte_based() {
        assert_eq!(
            Utf16String::parse_json("\"😀\"", 5, 2),
            Err(StringError::InputLimit)
        );
        assert_eq!(
            Utf16String::parse_json("\"😀\"", 6, 1),
            Err(StringError::UnitLimit)
        );
        let value = Utf16String::parse_json("\"😀\"", 6, 2).unwrap();
        assert_eq!(value.to_json(5), Err(StringError::OutputLimit));
        assert_eq!(value.to_json(6).unwrap(), "\"😀\"");
        assert_eq!(
            Utf16String::from_units(&[0xd800], 0),
            Err(StringError::UnitLimit)
        );
        assert_eq!(
            Utf16String::from_units(&[0xd800], 1).unwrap().to_json(7),
            Err(StringError::OutputLimit)
        );
        assert_eq!(
            Utf16String::from_units(&[0xd800], 1)
                .unwrap()
                .to_json(8)
                .unwrap(),
            "\"\\ud800\""
        );
        assert_eq!(
            parse("\"\"").unwrap().to_json(1),
            Err(StringError::OutputLimit)
        );
    }
}
