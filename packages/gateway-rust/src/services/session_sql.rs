//! Read-only queries over the supplied gateway SQLite connection. The policy is
//! applied before prepare. Service activation and connection ownership remain
//! explicit host decisions; this module exposes no HTTP or tool registration.
use crate::db::worker::{DatabaseError, DatabaseWorker};
use crate::text::{js_trim, js_whitespace};
use regex::Regex;
use rusqlite::{Connection, types::ValueRef};
use serde::Serialize;
use serde_json::{Value, json};
use std::sync::{Arc, LazyLock, Mutex};
const BLOCKED: &[&str] = &[
    "user_secrets",
    "users",
    "user_settings",
    "automation_repositories",
    "mobile_push_registrations",
];
const BANNED: &[&str] = &[
    "insert",
    "update",
    "delete",
    "drop",
    "create",
    "alter",
    "replace",
    "pragma",
    "attach",
    "detach",
    "vacuum",
    "reindex",
    "analyze",
    "begin",
    "commit",
    "end",
    "rollback",
    "savepoint",
    "release",
];
const FUNCTIONS: &[&str] = &[
    "writefile",
    "readfile",
    "fts3_tokenizer",
    "zipfile",
    "sqlar",
    "load_extension",
    "sqlite_load_extension",
];
#[derive(Clone, Copy, Debug, PartialEq)]
enum Kind {
    Word,
    Quoted,
    Other,
}
#[derive(Debug)]
struct Token {
    position: usize,
    kind: Kind,
    value: String,
}
fn word_start(c: char) -> bool {
    c.is_ascii_alphabetic() || c == '_'
}
fn word_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_' || c == '$'
}
fn tokenize(sql: &str) -> Vec<Token> {
    let chars: Vec<_> = sql.chars().collect();
    let mut i = 0;
    let mut tokens = vec![];
    while i < chars.len() {
        let c = chars[i];
        if js_whitespace(c) {
            i += 1;
            continue;
        }
        if c == '-' && chars.get(i + 1) == Some(&'-') {
            while i < chars.len() && chars[i] != '\n' {
                i += 1;
            }
            continue;
        }
        if c == '/' && chars.get(i + 1) == Some(&'*') {
            i += 2;
            while i < chars.len() && !(chars[i] == '*' && chars.get(i + 1) == Some(&'/')) {
                i += 1;
            }
            i += 2;
            continue;
        }
        if c == '\'' {
            i += 1;
            while i < chars.len() {
                if chars[i] == '\'' && chars.get(i + 1) == Some(&'\'') {
                    i += 2;
                    continue;
                }
                if chars[i] == '\'' {
                    i += 1;
                    break;
                }
                i += 1;
            }
            continue;
        }
        if matches!(c, '"' | '`' | '[') {
            let close = if c == '[' { ']' } else { c };
            let start = i + 1;
            i += 1;
            while i < chars.len() && chars[i] != close {
                i += 1;
            }
            tokens.push(Token {
                position: start - 1,
                kind: Kind::Quoted,
                value: js_trim(&chars[start..i].iter().collect::<String>()).to_lowercase(),
            });
            i += 1;
            continue;
        }
        if word_start(c) {
            let start = i;
            while i < chars.len() && word_char(chars[i]) {
                i += 1;
            }
            tokens.push(Token {
                position: start,
                kind: Kind::Word,
                value: chars[start..i]
                    .iter()
                    .collect::<String>()
                    .to_ascii_lowercase(),
            });
            continue;
        }
        tokens.push(Token {
            position: i,
            kind: Kind::Other,
            value: c.to_string(),
        });
        i += 1;
    }
    tokens
}
fn failure(error: &str, message: impl Into<String>) -> Value {
    json!({"ok":false,"error":error,"message":message.into()})
}
fn denied_keyword(word: &str) -> Value {
    failure(
        "readonly_violation",
        format!(
            "Refused: \"{word}\" is not allowed — this tool runs read-only SELECT queries only."
        ),
    )
}
fn validate(sql: &str) -> Option<Value> {
    let tokens = tokenize(sql);
    if tokens.is_empty() {
        return Some(failure(
            "invalid_sql",
            "sql is required — the input is empty or comment-only; pass a single SELECT or WITH query.",
        ));
    }
    let mut semicolon = false;
    for token in &tokens {
        if token.kind == Kind::Other && token.value == ";" {
            semicolon = true;
            continue;
        }
        if semicolon {
            return Some(failure(
                "multi_statement",
                "Refused: multiple SQL statements detected — pass exactly one SELECT or WITH query.",
            ));
        }
    }
    let first = tokens
        .iter()
        .find(|t| t.kind == Kind::Word)
        .map(|t| t.value.as_str());
    if !matches!(first, Some("select" | "with")) {
        return Some(if first.is_some_and(|word| BANNED.contains(&word)) {
            denied_keyword(first.unwrap())
        } else {
            failure(
                "readonly_violation",
                format!(
                    "Refused: only a single SELECT or WITH statement is allowed (got \"{}\").",
                    first.unwrap_or("nothing")
                ),
            )
        });
    }
    if let Some(token) = tokens.iter().find(|t| {
        (t.kind == Kind::Word
            && ((t.value != "end" && BANNED.contains(&t.value.as_str()))
                || t.value.starts_with("pragma_")))
            || (t.kind == Kind::Quoted && t.value.starts_with("pragma_"))
    }) {
        return Some(denied_keyword(&token.value));
    }
    for pair in tokens.windows(2) {
        if matches!(pair[0].kind, Kind::Word | Kind::Quoted)
            && FUNCTIONS.contains(&pair[0].value.as_str())
            && pair[1].kind == Kind::Other
            && pair[1].value == "("
        {
            return Some(failure(
                "banned_function",
                format!(
                    "Refused: function \"{}\" is not allowed — filesystem/extension SQLite functions are disabled in this tool.",
                    pair[0].value
                ),
            ));
        }
    }
    static STRINGS: LazyLock<Regex> = LazyLock::new(|| Regex::new("'(?:[^']|'')*'").unwrap());
    static PATTERNS: LazyLock<Vec<Regex>> = LazyLock::new(|| {
        BLOCKED
            .iter()
            .map(|table| {
                Regex::new(&format!("(^|[^A-Za-z0-9_])(?i-u:{table})([^A-Za-z0-9_]|$)")).unwrap()
            })
            .collect()
    });
    let without_strings = STRINGS.replace_all(sql, "''");
    for (table, pattern) in BLOCKED.iter().zip(PATTERNS.iter()) {
        if pattern.is_match(&without_strings) {
            return Some(failure(
                "blocked_table",
                format!(
                    "Refused: table \"{table}\" is excluded from this tool (credentials / sensitive configuration)."
                ),
            ));
        }
    }
    None
}
fn max_rows(value: Option<&Value>) -> usize {
    value
        .and_then(Value::as_f64)
        .filter(|v| v.is_finite() && v.floor() > 0.0)
        .map_or(200, |v| v.floor().min(200.0) as usize)
}
/// Mirrors the reference's lexical LIMIT clamp; final output is independently
/// capped even for signed or expression LIMITs and trailing semicolons.
fn clamp_limit(sql: &str, max_rows: usize) -> String {
    let chars: Vec<_> = sql.chars().collect();
    let mut out = String::new();
    let mut i = 0;
    let mut depth = 0usize;
    let mut in_string = false;
    let mut saw_limit = false;
    while i < chars.len() {
        let c = chars[i];
        if in_string {
            out.push(c);
            if c == '\'' {
                in_string = false;
            }
            i += 1;
            continue;
        }
        if c == '\'' {
            in_string = true;
            out.push(c);
            i += 1;
            continue;
        }
        if c == '(' {
            depth += 1;
            out.push(c);
            i += 1;
            continue;
        }
        if c == ')' {
            depth = depth.saturating_sub(1);
            out.push(c);
            i += 1;
            continue;
        }
        if word_start(c) {
            let start = i;
            let mut j = i;
            while j < chars.len() && word_char(chars[j]) {
                j += 1;
            }
            let word: String = chars[i..j].iter().collect();
            if depth == 0
                && word.eq_ignore_ascii_case("limit")
                && (i == 0 || !word_char(chars[i - 1]))
                && (j == chars.len() || !word_char(chars[j]))
            {
                let mut k = j;
                while k < chars.len() && js_whitespace(chars[k]) {
                    k += 1;
                }
                let mut m = k;
                while m < chars.len() && chars[m].is_ascii_digit() {
                    m += 1;
                }
                if m > k || matches!(chars.get(k), Some('+' | '-')) {
                    saw_limit = true;
                    if m > k
                        && chars[k..m]
                            .iter()
                            .collect::<String>()
                            .parse::<f64>()
                            .unwrap_or(f64::INFINITY)
                            > (max_rows + 1) as f64
                    {
                        out.push_str(&format!(" LIMIT {}", max_rows + 1));
                        i = m;
                        continue;
                    }
                }
                let end = if m > k { m } else { j };
                out.extend(&chars[start..end]);
                i = end;
                continue;
            }
            out.push_str(&word);
            i = j;
            continue;
        }
        out.push(c);
        i += 1;
    }
    if !saw_limit {
        out.push_str(&format!(" LIMIT {}", max_rows + 1));
    }
    out.trim_end_matches(js_whitespace).to_string()
}
fn sqlite_message(error: rusqlite::Error) -> String {
    match error {
        rusqlite::Error::SqliteFailure(_, Some(message))
        | rusqlite::Error::SqlInputError { msg: message, .. } => message,
        other => other.to_string(),
    }
}
#[derive(Debug, Serialize)]
pub struct SessionSqlColumn {
    pub name: String,
    #[serde(rename = "type")]
    pub column_type: String,
}
#[derive(Debug, Serialize)]
pub struct SessionSqlTable {
    pub table: String,
    pub columns: Vec<SessionSqlColumn>,
}
/// Run on the connection's existing bounded DB worker. This borrowed service does
/// not move a connection across threads or create a second database handle.
pub struct SessionSqlService<'a> {
    db: &'a Connection,
    state: QueryState,
}
impl<'a> SessionSqlService<'a> {
    pub fn new(db: &'a Connection) -> Self {
        Self {
            db,
            state: QueryState::default(),
        }
    }
    fn list_tables(&self) -> Result<Vec<String>, String> {
        static SHADOW: LazyLock<Regex> =
            LazyLock::new(|| Regex::new("_fts_(data|idx|content|docsize|config)$").unwrap());
        let mut stmt=self.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map_err(sqlite_message)?;
        let tables = stmt
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(sqlite_message)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(sqlite_message)?;
        Ok(tables
            .into_iter()
            .filter(|t| !BLOCKED.contains(&t.as_str()) && t != "_migrations" && !SHADOW.is_match(t))
            .collect())
    }
    fn columns(&self, table: &str) -> Result<Vec<SessionSqlColumn>, String> {
        let mut stmt = self
            .db
            .prepare("SELECT name, type FROM pragma_table_info(?)")
            .map_err(sqlite_message)?;
        stmt.query_map([table], |row| {
            Ok(SessionSqlColumn {
                name: row.get(0)?,
                column_type: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
            })
        })
        .map_err(sqlite_message)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(sqlite_message)
    }
    pub fn schema(&self) -> Value {
        let result = (|| -> Result<Value, String> {
            let tables = self
                .list_tables()?
                .into_iter()
                .map(|table| {
                    self.columns(&table)
                        .map(|columns| SessionSqlTable { table, columns })
                })
                .collect::<Result<Vec<_>, _>>()?;
            let mut blocked = BLOCKED.to_vec();
            blocked.sort();
            Ok(json!({"ok":true,"data":{"tables":tables,"blockedTables":blocked}}))
        })();
        result.unwrap_or_else(|message| failure("schema_error", message))
    }
    pub fn query(&mut self, input: &Value) -> Result<Value, String> {
        let Some(sql) = input.get("sql").and_then(Value::as_str) else {
            return Ok(failure(
                "invalid_sql",
                "sql must be a string — pass a single SELECT or WITH query.",
            ));
        };
        let sql = js_trim(sql);
        if sql.is_empty() {
            return Ok(failure(
                "invalid_sql",
                "sql is required — pass a single SELECT or WITH query.",
            ));
        }
        if let Some(error) = validate(sql) {
            return Ok(error);
        }
        let cap = max_rows(input.get("maxRows"));
        let clamped = clamp_limit(sql, cap);
        // Bun prepares the first statement and ignores the appended tail after
        // an allowed trailing semicolon. Preserve that without passing tail SQL
        // to rusqlite, whose prepare validates every statement in its input.
        let sql = if let Some(token) = tokenize(&clamped)
            .iter()
            .find(|t| t.kind == Kind::Other && t.value == ";")
        {
            clamped.chars().take(token.position).collect::<String>()
        } else {
            clamped
        };
        let query = (|| -> Result<(Vec<String>, Vec<Value>, bool), String> {
            let mut stmt = self.db.prepare(&sql).map_err(sqlite_message)?;
            // Defense after lexical policy: mutating statements must never run.
            if !stmt.readonly() {
                return Err("Query is not read-only".into());
            }
            let names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
            let mut reader = stmt.raw_query();
            let mut rows = vec![];
            let columns: Vec<_> = names
                .iter()
                .enumerate()
                .filter(|(i, name)| !names[..*i].contains(name))
                .map(|(_, name)| name.clone())
                .collect();
            let mut count = 0usize;
            while let Some(row) = reader.next().map_err(sqlite_message)? {
                let mut value = serde_json::Map::new();
                for (i, name) in names.iter().enumerate() {
                    let field = match row.get_ref(i).map_err(sqlite_message)? {
                        ValueRef::Null => Value::Null,
                        ValueRef::Integer(n) => js_number(n as f64),
                        ValueRef::Real(n) => js_number(n),
                        ValueRef::Text(text) => json!(String::from_utf8_lossy(text)),
                        ValueRef::Blob(bytes) => json!(format!("<blob {} bytes>", bytes.len())),
                    };
                    value.insert(name.clone(), field);
                }
                // Bun's SQLite row own-key enumeration follows projection order,
                // including numeric aliases; sanitization creates ordinary objects.
                if count < cap {
                    let ordered = ordered_keys(&value)
                        .into_iter()
                        .filter(|k| k != "__proto__")
                        .map(|k| {
                            let v = value.shift_remove(&k).unwrap();
                            (k, v)
                        })
                        .collect();
                    rows.push(Value::Object(ordered));
                }
                count = count.saturating_add(1);
            }
            // Empty results use statement metadata, which retains duplicate
            // projection names. Nonempty results use the first row's own keys.
            let columns = if count == 0 { names } else { columns };
            Ok((columns, rows, count > cap))
        })();
        let (columns, rows, truncated) = match query {
            Ok(result) => result,
            Err(message) => return Ok(failure("sql_error", message)),
        };
        let mut data =
            json!({"columns":columns,"rowCount":rows.len(),"rows":rows,"truncated":truncated});
        let mut tables_sent = self.state.0.lock().unwrap_or_else(|p| p.into_inner());
        if !*tables_sent {
            data["tables"] = json!(self.list_tables()?);
            *tables_sent = true;
        }
        Ok(json!({"ok":true,"data":data}))
    }
}
fn js_number(n: f64) -> Value {
    if !n.is_finite() {
        Value::Null
    } else {
        serde_json::from_str(ryu_js::Buffer::new().format(n)).unwrap()
    }
}
fn ordered_keys(value: &serde_json::Map<String, Value>) -> Vec<String> {
    let mut keys: Vec<_> = value.keys().cloned().collect();
    keys.sort_by_key(|s| {
        s.parse::<u32>()
            .ok()
            .filter(|n| *n < u32::MAX && n.to_string() == *s)
            .map_or((1, 0), |n| (0, n))
    });
    keys
}

#[derive(Clone, Default)]
struct QueryState(Arc<Mutex<bool>>);
/// Async service handle over the gateway's existing bounded SQLite worker.
/// Clones retain one service's first-success table-list state. Admission and
/// pre-dispatch cancellation use DatabaseWorker; running statements finish on
/// that worker, matching the reference's lack of a statement interrupt API.
#[derive(Clone)]
pub struct SessionSqlWorker {
    database: DatabaseWorker,
    state: QueryState,
}
impl SessionSqlWorker {
    pub fn new(database: DatabaseWorker) -> Self {
        Self {
            database,
            state: QueryState::default(),
        }
    }
    pub async fn query(&self, input: Value) -> Result<Value, DatabaseError> {
        let state = self.state.clone();
        self.database
            .run(move |db| {
                let mut service = SessionSqlService { db, state };
                service
                    .query(&input)
                    .map_err(|message| std::io::Error::other(message).into())
            })
            .await
    }
    pub async fn schema(&self) -> Result<Value, DatabaseError> {
        self.database
            .run(|db| Ok(SessionSqlService::new(db).schema()))
            .await
    }
}
