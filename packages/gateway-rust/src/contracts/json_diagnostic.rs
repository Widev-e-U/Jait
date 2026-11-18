//! Stored-JSON parsing with ECMAScript value semantics and Bun-style diagnostics.
//! Diagnostic parsing is iterative; hostile nesting cannot consume the call stack.
use super::{bounded_json::Utf16Text, ecmascript_json::JsonDocument};
#[derive(Clone, Debug)]
pub struct JsonParseError(pub Utf16Text);
impl std::fmt::Display for JsonParseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&String::from_utf16_lossy(&self.0.0))
    }
}
impl std::error::Error for JsonParseError {}
#[derive(Clone, Copy)]
enum Frame {
    Value,
    RootEnd,
    ArrayFirst,
    ArrayNext,
    ArrayAfterComma,
    ObjectFirst,
    ObjectNext,
    ObjectAfterComma,
    Colon,
}
struct Diagnostic<'a> {
    text: &'a str,
    cursor: usize,
}
impl Diagnostic<'_> {
    fn whitespace(&mut self) {
        while self
            .peek()
            .is_some_and(|c| matches!(c, ' ' | '\t' | '\n' | '\r'))
        {
            self.advance();
        }
    }
    fn peek(&self) -> Option<char> {
        self.text[self.cursor..].chars().next()
    }
    fn advance(&mut self) {
        if let Some(c) = self.peek() {
            self.cursor += c.len_utf8();
        }
    }
    fn string(&mut self) -> Result<(), String> {
        self.advance();
        loop {
            match self.peek() {
                None | Some('\x00'..='\x1f') => return Err("Unterminated string".into()),
                Some('"') => {
                    self.advance();
                    return Ok(());
                }
                Some('\\') => {
                    self.advance();
                    let Some(c) = self.peek() else {
                        return Err("Unterminated string".into());
                    };
                    self.advance();
                    match c {
                        '"' | '\\' | '/' | 'b' | 'f' | 'n' | 'r' | 't' => {}
                        'u' => {
                            for _ in 0..4 {
                                if !self.peek().is_some_and(|c| c.is_ascii_hexdigit()) {
                                    return Err("\\u must be followed by 4 hex digits".into());
                                }
                                self.advance();
                            }
                        }
                        _ => return Err(format!("Invalid escape character {c}")),
                    }
                }
                _ => self.advance(),
            }
        }
    }
    fn number(&mut self) -> Result<(), String> {
        if self.peek() == Some('-') {
            self.advance();
        }
        match self.peek() {
            Some('0') => self.advance(),
            Some('1'..='9') => {
                while self.peek().is_some_and(|c| c.is_ascii_digit()) {
                    self.advance();
                }
            }
            _ => return Err("Invalid number".into()),
        }
        if self.peek() == Some('.') {
            self.advance();
            if !self.peek().is_some_and(|c| c.is_ascii_digit()) {
                return Err("Invalid digits after decimal point".into());
            }
            while self.peek().is_some_and(|c| c.is_ascii_digit()) {
                self.advance();
            }
        }
        if matches!(self.peek(), Some('e' | 'E')) {
            let saved = self.cursor;
            self.advance();
            if matches!(self.peek(), Some('+' | '-')) {
                self.advance();
            }
            if self.peek().is_some_and(|c| c.is_ascii_digit()) {
                while self.peek().is_some_and(|c| c.is_ascii_digit()) {
                    self.advance();
                }
            } else {
                self.cursor = saved;
            }
        }
        Ok(())
    }
    fn lexical_error(&mut self) -> Result<(), String> {
        let saved = self.cursor;
        match self.peek() {
            Some('"') => self.string()?,
            Some('-' | '0'..='9') => self.number()?,
            Some('\'') => return Err("Single quotes (') are not allowed in JSON".into()),
            Some(c)
                if !c.is_ascii_alphabetic()
                    && !matches!(
                        c,
                        '_' | '$' | '[' | ']' | '{' | '}' | ':' | ',' | '.' | '(' | ')' | ';' | '='
                    ) =>
            {
                return Err(format!("Unrecognized token '{c}'"));
            }
            _ => {}
        }
        self.cursor = saved;
        Ok(())
    }
    fn run(&mut self) -> Result<(), String> {
        let mut stack = vec![Frame::RootEnd, Frame::Value];
        while let Some(frame) = stack.pop() {
            self.whitespace();
            self.lexical_error()?;
            match frame {
                Frame::RootEnd => {
                    if self.peek().is_some() {
                        return Err("Unable to parse JSON string".into());
                    }
                }
                Frame::Value => match self.peek() {
                    None => return Err("Unexpected EOF".into()),
                    Some('[') => {
                        self.advance();
                        stack.push(Frame::ArrayFirst);
                    }
                    Some('{') => {
                        self.advance();
                        stack.push(Frame::ObjectFirst);
                    }
                    Some('"') => self.string()?,
                    Some('\'') => return Err("Single quotes (') are not allowed in JSON".into()),
                    Some('-' | '0'..='9') => self.number()?,
                    Some(_) => {
                        let remaining = &self.text[self.cursor..];
                        if let Some(word) = ["null", "true", "false"]
                            .into_iter()
                            .find(|w| remaining.starts_with(w))
                        {
                            self.cursor += word.len();
                        } else if self
                            .peek()
                            .is_some_and(|c| c.is_ascii_alphabetic() || matches!(c, '_' | '$'))
                        {
                            let start = self.cursor;
                            while self.peek().is_some_and(|c| {
                                c.is_ascii_alphanumeric() || matches!(c, '_' | '$')
                            }) {
                                self.advance();
                            }
                            return Err(format!(
                                "Unexpected identifier \"{}\"",
                                &self.text[start..self.cursor]
                            ));
                        } else {
                            let c = self.peek().unwrap();
                            return Err(format!(
                                "{} token '{c}'",
                                if matches!(c, ']' | '}' | ':' | ',' | '.' | '(' | ')' | ';' | '=')
                                {
                                    "Unexpected"
                                } else {
                                    "Unrecognized"
                                }
                            ));
                        }
                    }
                },
                Frame::ArrayFirst => {
                    if self.peek() == Some(']') {
                        self.advance();
                    } else {
                        stack.extend([Frame::ArrayNext, Frame::Value]);
                    }
                }
                Frame::ArrayNext => match self.peek() {
                    Some(']') => self.advance(),
                    Some(',') => {
                        self.advance();
                        stack.push(Frame::ArrayAfterComma);
                    }
                    _ => return Err("Expected ']'".into()),
                },
                Frame::ArrayAfterComma => {
                    if self.peek() == Some(']') {
                        return Err("Unexpected comma at the end of array expression".into());
                    } else {
                        stack.extend([Frame::ArrayNext, Frame::Value]);
                    }
                }
                Frame::ObjectFirst => {
                    if self.peek() == Some('}') {
                        self.advance();
                    } else if self.peek() == Some('"') {
                        self.string()?;
                        stack.extend([Frame::ObjectNext, Frame::Value, Frame::Colon]);
                    } else {
                        return Err("Expected '}'".into());
                    }
                }
                Frame::ObjectNext => match self.peek() {
                    Some('}') => self.advance(),
                    Some(',') => {
                        self.advance();
                        stack.push(Frame::ObjectAfterComma);
                    }
                    _ => return Err("Expected '}'".into()),
                },
                Frame::ObjectAfterComma => {
                    if self.peek() == Some('"') {
                        self.string()?;
                        stack.extend([Frame::ObjectNext, Frame::Value, Frame::Colon]);
                    } else {
                        return Err("Property name must be a string literal".into());
                    }
                }
                Frame::Colon => {
                    if self.peek() == Some(':') {
                        self.advance();
                    } else {
                        return Err(
                            "Expected ':' before value in object property definition".into()
                        );
                    }
                }
            }
        }
        Ok(())
    }
}
pub fn parse(text: &str) -> Result<JsonDocument, JsonParseError> {
    JsonDocument::parse(text).map_err(|_| {
        let reason = Diagnostic { text, cursor: 0 }
            .run()
            .err()
            .unwrap_or_else(|| "Unable to parse JSON string".into());
        let reason = if reason.starts_with("Unrecognized token '")
            || reason.starts_with("Invalid escape character ")
        {
            let mut units = reason.encode_utf16().collect::<Vec<_>>();
            if let Some(i) = units.windows(2).position(|p| {
                (0xd800..=0xdbff).contains(&p[0]) && (0xdc00..=0xdfff).contains(&p[1])
            }) {
                units.remove(i + 1);
            }
            units
        } else {
            reason.encode_utf16().collect()
        };
        let mut message = "JSON Parse error: ".encode_utf16().collect::<Vec<_>>();
        message.extend(reason);
        JsonParseError(Utf16Text(message))
    })
}
