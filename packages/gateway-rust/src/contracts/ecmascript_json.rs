//! JSON.parse / JSON.stringify data domain: UTF-16 strings, IEEE-754 numbers,
//! integer-index key ordering, duplicate-key replacement, and iterative traversal.
//! No evaluation, prototype setters, filesystem access or model/runtime dependency.
use crate::contracts::bounded_json::Utf16Text;
use serde::Serialize;

#[derive(Clone, Debug)]
pub(crate) enum JsonValue {
    Null,
    Boolean(bool),
    Number(f64),
    String(Utf16Text),
    Array(Vec<usize>),
    Object(Vec<(Vec<u16>, usize)>),
}
#[derive(Clone, Debug)]
pub struct JsonDocument {
    pub(crate) nodes: Vec<JsonValue>,
    pub(crate) root: usize,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct JsonSyntaxError;
impl std::fmt::Display for JsonSyntaxError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("invalid JSON")
    }
}
impl std::error::Error for JsonSyntaxError {}
#[derive(Clone, Copy)]
enum Frame {
    Array(usize, bool, bool),
    Object(usize, bool, bool),
}
struct Parser<'a> {
    text: &'a [u16],
    cursor: usize,
    nodes: Vec<JsonValue>,
}
impl Parser<'_> {
    fn whitespace(&mut self) {
        while self
            .text
            .get(self.cursor)
            .is_some_and(|u| matches!(u, 9 | 10 | 13 | 32))
        {
            self.cursor += 1;
        }
    }
    fn take(&mut self, wanted: u16) -> Result<(), JsonSyntaxError> {
        if self.text.get(self.cursor) == Some(&wanted) {
            self.cursor += 1;
            Ok(())
        } else {
            Err(JsonSyntaxError)
        }
    }
    fn string(&mut self) -> Result<Vec<u16>, JsonSyntaxError> {
        self.take(34)?;
        let mut out = Vec::new();
        loop {
            let unit = *self.text.get(self.cursor).ok_or(JsonSyntaxError)?;
            self.cursor += 1;
            match unit {
                34 => return Ok(out),
                92 => {
                    let escape = *self.text.get(self.cursor).ok_or(JsonSyntaxError)?;
                    self.cursor += 1;
                    out.push(match escape {
                        34 | 92 | 47 => escape,
                        98 => 8,
                        102 => 12,
                        110 => 10,
                        114 => 13,
                        116 => 9,
                        117 => {
                            let mut result = 0u16;
                            for _ in 0..4 {
                                let next = *self.text.get(self.cursor).ok_or(JsonSyntaxError)?;
                                self.cursor += 1;
                                let digit = match next {
                                    48..=57 => next - 48,
                                    65..=70 => next - 55,
                                    97..=102 => next - 87,
                                    _ => return Err(JsonSyntaxError),
                                };
                                result = (result << 4) | digit;
                            }
                            result
                        }
                        _ => return Err(JsonSyntaxError),
                    });
                }
                0..=31 => return Err(JsonSyntaxError),
                _ => out.push(unit),
            }
        }
    }
    fn number(&mut self) -> Result<f64, JsonSyntaxError> {
        let start = self.cursor;
        if self.text.get(self.cursor) == Some(&45) {
            self.cursor += 1;
        }
        match self.text.get(self.cursor) {
            Some(48) => self.cursor += 1,
            Some(49..=57) => {
                self.cursor += 1;
                while self
                    .text
                    .get(self.cursor)
                    .is_some_and(|u| (48..=57).contains(u))
                {
                    self.cursor += 1;
                }
            }
            _ => return Err(JsonSyntaxError),
        }
        if self.text.get(self.cursor) == Some(&46) {
            self.cursor += 1;
            let begin = self.cursor;
            while self
                .text
                .get(self.cursor)
                .is_some_and(|u| (48..=57).contains(u))
            {
                self.cursor += 1;
            }
            if begin == self.cursor {
                return Err(JsonSyntaxError);
            }
        }
        if self
            .text
            .get(self.cursor)
            .is_some_and(|u| matches!(u, 69 | 101))
        {
            self.cursor += 1;
            if self
                .text
                .get(self.cursor)
                .is_some_and(|u| matches!(u, 43 | 45))
            {
                self.cursor += 1;
            }
            let begin = self.cursor;
            while self
                .text
                .get(self.cursor)
                .is_some_and(|u| (48..=57).contains(u))
            {
                self.cursor += 1;
            }
            if begin == self.cursor {
                return Err(JsonSyntaxError);
            }
        }
        String::from_utf16(&self.text[start..self.cursor])
            .map_err(|_| JsonSyntaxError)?
            .parse()
            .map_err(|_| JsonSyntaxError)
    }
    fn value(&mut self) -> Result<(usize, Option<Frame>), JsonSyntaxError> {
        self.whitespace();
        let id = self.nodes.len();
        let (node, frame) = match self.text.get(self.cursor) {
            Some(34) => (JsonValue::String(Utf16Text(self.string()?)), None),
            Some(91) => {
                self.cursor += 1;
                (
                    JsonValue::Array(vec![]),
                    Some(Frame::Array(id, true, false)),
                )
            }
            Some(123) => {
                self.cursor += 1;
                (
                    JsonValue::Object(vec![]),
                    Some(Frame::Object(id, true, false)),
                )
            }
            Some(116 | 102 | 110) => {
                let (literal, node) = match self.text[self.cursor] {
                    116 => ("true", JsonValue::Boolean(true)),
                    102 => ("false", JsonValue::Boolean(false)),
                    _ => ("null", JsonValue::Null),
                };
                for unit in literal.encode_utf16() {
                    self.take(unit)?;
                }
                (node, None)
            }
            Some(45 | 48..=57) => (JsonValue::Number(self.number()?), None),
            _ => return Err(JsonSyntaxError),
        };
        self.nodes.push(node);
        Ok((id, frame))
    }
}
impl JsonDocument {
    pub fn parse(text: &str) -> Result<Self, JsonSyntaxError> {
        Self::parse_utf16(&text.encode_utf16().collect::<Vec<_>>())
    }
    pub fn parse_utf16(text: &[u16]) -> Result<Self, JsonSyntaxError> {
        let mut parser = Parser {
            text,
            cursor: 0,
            nodes: vec![],
        };
        let (root, frame) = parser.value()?;
        let mut stack = Vec::new();
        if let Some(frame) = frame {
            stack.push(frame);
        }
        while let Some(frame) = stack.pop() {
            parser.whitespace();
            match frame {
                Frame::Array(id, first, after) => {
                    if after {
                        match parser.text.get(parser.cursor) {
                            Some(44) => {
                                parser.cursor += 1;
                                stack.push(Frame::Array(id, false, false));
                            }
                            Some(93) => parser.cursor += 1,
                            _ => return Err(JsonSyntaxError),
                        }
                    } else if first && parser.text.get(parser.cursor) == Some(&93) {
                        parser.cursor += 1;
                    } else {
                        let (child, frame) = parser.value()?;
                        let JsonValue::Array(values) = &mut parser.nodes[id] else {
                            unreachable!()
                        };
                        values.push(child);
                        stack.push(Frame::Array(id, false, true));
                        if let Some(frame) = frame {
                            stack.push(frame);
                        }
                    }
                }
                Frame::Object(id, first, after) => {
                    if after {
                        match parser.text.get(parser.cursor) {
                            Some(44) => {
                                parser.cursor += 1;
                                stack.push(Frame::Object(id, false, false));
                            }
                            Some(125) => parser.cursor += 1,
                            _ => return Err(JsonSyntaxError),
                        }
                    } else if first && parser.text.get(parser.cursor) == Some(&125) {
                        parser.cursor += 1;
                    } else {
                        let key = parser.string()?;
                        parser.whitespace();
                        parser.take(58)?;
                        let (child, frame) = parser.value()?;
                        let JsonValue::Object(values) = &mut parser.nodes[id] else {
                            unreachable!()
                        };
                        if let Some((_, value)) = values.iter_mut().find(|(k, _)| *k == key) {
                            *value = child;
                        } else {
                            values.push((key, child));
                        }
                        stack.push(Frame::Object(id, false, true));
                        if let Some(frame) = frame {
                            stack.push(frame);
                        }
                    }
                }
            }
        }
        parser.whitespace();
        if parser.cursor != parser.text.len() {
            return Err(JsonSyntaxError);
        }
        Ok(Self {
            nodes: parser.nodes,
            root,
        })
    }
    pub(crate) fn field(&self, id: usize, name: &str) -> Option<usize> {
        let key: Vec<u16> = name.encode_utf16().collect();
        match &self.nodes[id] {
            JsonValue::Object(values) => values.iter().find(|(k, _)| *k == key).map(|(_, v)| *v),
            _ => None,
        }
    }
    pub(crate) fn string(&self, id: usize) -> Option<&Utf16Text> {
        match &self.nodes[id] {
            JsonValue::String(s) => Some(s),
            _ => None,
        }
    }
    pub(crate) fn number(&self, id: usize) -> Option<f64> {
        match self.nodes[id] {
            JsonValue::Number(n) => Some(n),
            _ => None,
        }
    }
    pub(crate) fn set_field(&mut self, id: usize, name: &str, value: usize) {
        let key: Vec<u16> = name.encode_utf16().collect();
        let JsonValue::Object(values) = &mut self.nodes[id] else {
            panic!("object required")
        };
        if let Some((_, entry)) = values.iter_mut().find(|(k, _)| *k == key) {
            *entry = value;
        } else {
            values.push((key, value));
        }
    }
    pub fn stringify(&self) -> String {
        self.stringify_value(self.root)
    }
    pub(crate) fn stringify_value(&self, root: usize) -> String {
        enum Emit<'a> {
            Node(usize),
            Text(&'static str),
            Key(&'a [u16]),
        }
        let mut stack = vec![Emit::Node(root)];
        let mut output = String::new();
        while let Some(next) = stack.pop() {
            match next {
                Emit::Text(text) => output.push_str(text),
                Emit::Key(units) => output.push_str(
                    &serde_json::to_string(&Utf16Text(units.to_vec())).expect("UTF-16 quote"),
                ),
                Emit::Node(id) => match &self.nodes[id] {
                    JsonValue::Null => output.push_str("null"),
                    JsonValue::Boolean(v) => output.push_str(if *v { "true" } else { "false" }),
                    JsonValue::Number(n) => {
                        let mut buffer = ryu_js::Buffer::new();
                        output.push_str(if !n.is_finite() {
                            "null"
                        } else if *n == 0.0 {
                            "0"
                        } else {
                            buffer.format(*n)
                        });
                    }
                    JsonValue::String(v) => {
                        output.push_str(&serde_json::to_string(v).expect("UTF-16 quote"))
                    }
                    JsonValue::Array(values) => {
                        output.push('[');
                        stack.push(Emit::Text("]"));
                        for (index, child) in values.iter().enumerate().rev() {
                            stack.push(Emit::Node(*child));
                            if index > 0 {
                                stack.push(Emit::Text(","));
                            }
                        }
                    }
                    JsonValue::Object(values) => {
                        let index_key = |key: &[u16]| {
                            String::from_utf16(key).ok().and_then(|s| {
                                s.parse::<u32>()
                                    .ok()
                                    .filter(|n| *n < u32::MAX && n.to_string() == s)
                            })
                        };
                        let mut ordered: Vec<_> = values
                            .iter()
                            .filter(|(key, _)| index_key(key).is_some())
                            .collect();
                        ordered.sort_by_key(|(key, _)| index_key(key).unwrap());
                        ordered.extend(values.iter().filter(|(key, _)| index_key(key).is_none()));
                        output.push('{');
                        stack.push(Emit::Text("}"));
                        for (index, (key, value)) in ordered.into_iter().enumerate().rev() {
                            stack.push(Emit::Node(*value));
                            stack.push(Emit::Text(":"));
                            stack.push(Emit::Key(key));
                            if index > 0 {
                                stack.push(Emit::Text(","));
                            }
                        }
                    }
                },
            }
        }
        output
    }
}
/// Raw JSON serializer preserves UTF-16 code units and JS number formatting.
impl Serialize for JsonDocument {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let json = serde_json::value::RawValue::from_string(self.stringify())
            .map_err(serde::ser::Error::custom)?;
        json.serialize(serializer)
    }
}
