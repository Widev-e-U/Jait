//! Retrieval, replacement, and durable-fact extraction over a caller-scoped backend.
//! Call from a bounded blocking worker: persistence and optional log writes block.
use super::{
    entries::{MemoryBackend, MemoryEntry, MemoryScope, MemorySource},
    scoring::{Bm25Document, bm25_rank},
};
use chrono::{DateTime, NaiveDate, SecondsFormat, Utc};
use regex::Regex;
use serde::Deserialize;
use std::{
    collections::HashSet,
    fs::{self, OpenOptions},
    io::{self, Write},
    path::{Path, PathBuf},
    sync::{Arc, LazyLock},
};

#[derive(Clone, Debug)]
pub struct MemoryTime {
    pub iso: String,
    pub millis: i64,
}
impl MemoryTime {
    pub fn now() -> Self {
        let now = Utc::now();
        Self {
            iso: now.to_rfc3339_opts(SecondsFormat::Millis, true),
            millis: now.timestamp_millis(),
        }
    }
}
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveMemoryInput {
    pub scope: MemoryScope,
    pub content: String,
    pub source: MemorySource,
    pub expires_at: Option<String>,
}
#[derive(Debug)]
pub enum MemoryError<E> {
    Backend(E),
    Log(io::Error),
    Entropy(getrandom::Error),
}
pub struct MemoryEngine<B> {
    backend: B,
    memory_dir: Option<PathBuf>,
    clock: Arc<dyn Fn() -> MemoryTime + Send + Sync>,
}
impl<B: MemoryBackend> MemoryEngine<B> {
    pub fn new(backend: B, memory_dir: Option<PathBuf>) -> Self {
        Self {
            backend,
            memory_dir,
            clock: Arc::new(MemoryTime::now),
        }
    }
    pub fn with_clock(mut self, clock: impl Fn() -> MemoryTime + Send + Sync + 'static) -> Self {
        self.clock = Arc::new(clock);
        self
    }
    pub fn save(&self, input: SaveMemoryInput) -> Result<MemoryEntry, MemoryError<B::Error>> {
        let now = (self.clock)();
        let existing = self.replacement(&input).map_err(MemoryError::Backend)?;
        let id = match &existing {
            Some(entry) => entry.id.clone(),
            None => {
                let mut bytes = [0_u8; 21];
                getrandom::fill(&mut bytes).map_err(MemoryError::Entropy)?;
                const ALPHABET: &[u8; 64] =
                    b"_-0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
                bytes
                    .iter()
                    .map(|v| ALPHABET[(v & 63) as usize] as char)
                    .collect()
            }
        };
        let entry = MemoryEntry {
            id,
            scope: input.scope,
            content: input.content,
            source: input.source,
            created_at: existing
                .as_ref()
                .map(|e| e.created_at.clone())
                .unwrap_or_else(|| now.iso.clone()),
            updated_at: now.iso,
            expires_at: input.expires_at,
        };
        if let Some(existing) = existing {
            self.backend.update(&entry).map_err(MemoryError::Backend)?;
            if normalize(&existing.content) != normalize(&entry.content) {
                self.write_log(&entry).map_err(MemoryError::Log)?;
            }
        } else {
            self.backend.save(&entry).map_err(MemoryError::Backend)?;
            self.write_log(&entry).map_err(MemoryError::Log)?;
        }
        Ok(entry)
    }
    pub fn list(&self, scope: Option<&MemoryScope>) -> Result<Vec<MemoryEntry>, B::Error> {
        self.backend.forget_expired(None)?;
        self.backend.list(scope)
    }
    pub fn search(
        &self,
        query: &str,
        limit: Option<f64>,
        scope: Option<&MemoryScope>,
    ) -> Result<Vec<MemoryEntry>, B::Error> {
        let entries = self.list(scope)?;
        let docs = entries
            .into_iter()
            .map(|entry| Bm25Document {
                text: entry.content.clone(),
                item: entry,
            })
            .collect::<Vec<_>>();
        let ranked = bm25_rank(query, &docs);
        let best = ranked.iter().map(|r| r.score).fold(0.0_f64, f64::max);
        if best <= 0.0 {
            return Ok(vec![]);
        }
        let now = (self.clock)().millis;
        let freshness_weight = best * 0.1;
        let mut matches = ranked
            .into_iter()
            .filter(|r| r.score >= best * 0.5)
            .map(|r| {
                (
                    r.item,
                    r.score + recency(&r.item.updated_at, now) * freshness_weight,
                )
            })
            .collect::<Vec<_>>();
        matches.sort_by(|a, b| b.1.total_cmp(&a.1));
        let length = matches.len();
        let limit = limit.unwrap_or(5.0);
        let end = if limit.is_nan() {
            0
        } else if limit < 0.0 {
            (length as f64 + limit.trunc()).max(0.0) as usize
        } else {
            limit as usize
        };
        Ok(matches
            .into_iter()
            .take(end)
            .map(|(entry, _)| entry.clone())
            .collect())
    }
    pub fn forget(&self, id: &str) -> Result<bool, B::Error> {
        self.backend.forget(id)
    }
    pub fn forget_expired(&self, now: Option<&str>) -> Result<usize, B::Error> {
        self.backend.forget_expired(now)
    }
    pub fn flush_pre_compaction(
        &self,
        session_id: &str,
        snippets: &[String],
    ) -> Result<usize, MemoryError<B::Error>> {
        let facts = extract_pre_compaction_facts(snippets);
        let count = facts.len();
        for content in facts {
            self.save(SaveMemoryInput {
                scope: MemoryScope::Project,
                content,
                source: MemorySource {
                    kind: "pre_compaction".into(),
                    id: session_id.into(),
                    surface: "chat".into(),
                },
                expires_at: None,
            })?;
        }
        Ok(count)
    }
    fn replacement(&self, input: &SaveMemoryInput) -> Result<Option<MemoryEntry>, B::Error> {
        let normalized = normalize(&input.content);
        if normalized.is_empty() {
            return Ok(None);
        }
        let existing = self.backend.list(Some(&input.scope))?;
        let mut best: Option<(MemoryEntry, f64)> = None;
        for entry in existing {
            if input.source.kind != "pre_compaction"
                && entry.source.kind == input.source.kind
                && entry.source.id == input.source.id
                && entry.source.surface == input.source.surface
            {
                return Ok(Some(entry));
            }
            let score = if normalize(&entry.content) == normalized {
                1.0
            } else {
                lexical_similarity(&input.content, &entry.content)
            };
            if score >= 0.82 && best.as_ref().is_none_or(|(_, s)| score > *s) {
                best = Some((entry, score));
            }
        }
        Ok(best.map(|(entry, _)| entry))
    }
    fn write_log(&self, entry: &MemoryEntry) -> io::Result<()> {
        let Some(dir) = &self.memory_dir else {
            return Ok(());
        };
        let date = entry.created_at.chars().take(10).collect::<String>();
        let daily = dir.join(format!("{date}.md"));
        let curated = dir.parent().unwrap_or(Path::new(".")).join("MEMORY.md");
        let line = format!(
            "- [{}] {} (source={}:{}@{})\n",
            entry.scope.as_str(),
            entry.content,
            entry.source.kind,
            entry.source.id,
            entry.source.surface
        );
        fs::create_dir_all(dir)?;
        OpenOptions::new()
            .create(true)
            .append(true)
            .open(daily)?
            .write_all(line.as_bytes())?;
        if !curated.exists() {
            fs::write(&curated, "# Curated Memory\n\n")?;
        }
        let bytes = fs::read(&curated)?;
        let contents = String::from_utf8_lossy(&bytes);
        if !contents.contains(crate::text::js_trim(&line)) {
            OpenOptions::new()
                .append(true)
                .open(curated)?
                .write_all(line.as_bytes())?;
        }
        Ok(())
    }
}
fn normalize(value: &str) -> String {
    let lowered = value.to_lowercase();
    let mut result = String::new();
    let mut whitespace = false;
    for c in lowered.chars() {
        if crate::text::js_trim(&c.to_string()).is_empty() {
            whitespace = true;
        } else {
            if whitespace && !result.is_empty() {
                result.push(' ');
            }
            whitespace = false;
            result.push(c);
        }
    }
    result
}
fn collapse(value: &str) -> String {
    let mut out = String::new();
    let mut whitespace = false;
    for c in value.chars() {
        if crate::text::js_trim(&c.to_string()).is_empty() {
            whitespace = true;
        } else {
            if whitespace && !out.is_empty() {
                out.push(' ');
            }
            out.push(c);
            whitespace = false;
        }
    }
    out
}
fn token_set(value: &str) -> HashSet<String> {
    normalize(value)
        .split(|c: char| !c.is_ascii_alphanumeric() && c != '_')
        .map(|v| v.strip_suffix('s').unwrap_or(v))
        .filter(|v| v.len() >= 2)
        .map(String::from)
        .collect()
}
fn lexical_similarity(left: &str, right: &str) -> f64 {
    let left = token_set(left);
    let right = token_set(right);
    if left.is_empty() || right.is_empty() {
        return 0.0;
    }
    left.intersection(&right).count() as f64 / left.len().max(right.len()) as f64
}
fn date_millis(value: &str) -> Option<i64> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|v| v.timestamp_millis())
        .or_else(|| {
            NaiveDate::parse_from_str(value, "%Y-%m-%d")
                .ok()
                .and_then(|v| v.and_hms_opt(0, 0, 0))
                .map(|v| v.and_utc().timestamp_millis())
        })
        .or_else(|| {
            if value.len() == 4 && value.bytes().all(|v| v.is_ascii_digit()) {
                NaiveDate::from_ymd_opt(value.parse().ok()?, 1, 1)?
                    .and_hms_opt(0, 0, 0)
                    .map(|v| v.and_utc().timestamp_millis())
            } else {
                None
            }
        })
}
fn recency(value: &str, now: i64) -> f64 {
    let Some(updated) = date_millis(value) else {
        return 0.0;
    };
    let days = ((now as f64 - updated as f64) / 86_400_000.0).max(0.0);
    1.0 / (1.0 + days / 30.0)
}
static ROLE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i-u)^\[(?:user|assistant|system|tool)\] *").unwrap());
static REMEMBER: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i-u)^(?:remember that|remember:) +").unwrap());
static REJECT: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i-u)^(let me\b|i was\b|i'?m\b|i think\b|i don'?t\b|i need\b|i see\b|now let me\b|did you\b|do you\b|can you\b|could you\b|would you\b|will you\b|please\b|pls\b|ok\b|okay\b|sure\b|thanks\b|thank you\b|what\b|how\b|why\b|when\b|where\b|which\b|who\b|commit\b|push\b|pull\b|fix\b|make\b|add\b|run\b|start\b|stop\b|restart\b|delete\b|remove\b|create\b|update\b|check\b|verify\b|build\b|deploy\b|install\b|uninstall\b|kill\b|test\b|trace\b|show\b|tell\b|give\b|find\b|open\b|close\b|merge\b|rebase\b|undo\b|redo\b)").unwrap()
});
static STRONG: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i-u)\b(prefers?|preferred|always|never|avoid|source of truth|lives? in|stored in|belongs? in|configured|workflow|api key|do not\b|don'?t\b|instead\b|remember that)\b").unwrap()
});
static RULE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i-u)\b(should|must)\b").unwrap());
static VAGUE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i-u)\b(this|that|here|it)\b").unwrap());
pub fn extract_pre_compaction_facts(snippets: &[String]) -> Vec<String> {
    let mut seen = HashSet::new();
    snippets
        .iter()
        .filter_map(|snippet| {
            let collapsed = collapse(snippet);
            let no_role = ROLE.replace(&collapsed, "");
            let no_prefix = REMEMBER.replace(&no_role, "");
            let content = crate::text::js_trim(&no_prefix);
            if content.encode_utf16().count() < 24
                || content.contains('?')
                || REJECT.is_match(content)
            {
                return None;
            }
            let prefix =
                String::from_utf16_lossy(&content.encode_utf16().take(40).collect::<Vec<_>>());
            if !STRONG.is_match(content) && !(RULE.is_match(content) && !VAGUE.is_match(&prefix)) {
                return None;
            }
            if !seen.insert(normalize(content)) {
                return None;
            }
            Some(content.to_owned())
        })
        .take(20)
        .collect()
}
