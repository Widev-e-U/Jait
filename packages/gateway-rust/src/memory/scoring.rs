//! BM25 over an explicitly scoped document corpus; output retains document order.
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    sync::LazyLock,
};
static STOP_WORDS: LazyLock<HashSet<&'static str>> = LazyLock::new(|| {
    "a about an and any are as at be been but by can could did do does for from get had has have he her him his how if in into is it its just me my no not now of on or our out she should so some than that the their them then there these they this those to up us was we were what when where which while who why will with would you your".split_ascii_whitespace().collect()
});
pub fn bm25_tokens(text: &str) -> Vec<String> {
    text.to_lowercase()
        .split(|c: char| !c.is_ascii_lowercase() && !c.is_ascii_digit() && c != '_')
        .filter(|v| v.len() >= 2 && !STOP_WORDS.contains(v))
        .map(|v| v.strip_suffix('s').unwrap_or(v))
        .filter(|v| v.len() >= 2)
        .map(String::from)
        .collect()
}
#[derive(Deserialize)]
pub struct Bm25Document<T> {
    pub item: T,
    pub text: String,
}
#[derive(Serialize)]
pub struct Bm25Result<'a, T> {
    pub item: &'a T,
    pub score: f64,
}
pub fn bm25_rank<'a, T>(query: &str, documents: &'a [Bm25Document<T>]) -> Vec<Bm25Result<'a, T>> {
    let mut seen = HashSet::new();
    let terms = bm25_tokens(query)
        .into_iter()
        .filter(|v| seen.insert(v.clone()))
        .collect::<Vec<_>>();
    if terms.is_empty() || documents.is_empty() {
        return documents
            .iter()
            .map(|d| Bm25Result {
                item: &d.item,
                score: 0.0,
            })
            .collect();
    }
    let mut frequencies = vec![];
    let mut document_frequency: HashMap<String, usize> = HashMap::new();
    let mut total_length = 0;
    for document in documents {
        let tokens = bm25_tokens(&document.text);
        total_length += tokens.len();
        let mut counts: HashMap<String, usize> = HashMap::new();
        for token in tokens {
            *counts.entry(token).or_default() += 1
        }
        for token in counts.keys() {
            *document_frequency.entry(token.clone()).or_default() += 1
        }
        frequencies.push(counts);
    }
    let average = if total_length == 0 {
        1.0
    } else {
        total_length as f64 / documents.len() as f64
    };
    documents
        .iter()
        .zip(&frequencies)
        .map(|(document, frequencies)| {
            let length = frequencies.values().sum::<usize>() as f64;
            let mut score = 0.0;
            for term in &terms {
                let count = *frequencies.get(term).unwrap_or(&0) as f64;
                if count == 0.0 {
                    continue;
                }
                let df = *document_frequency.get(term).unwrap_or(&0) as f64;
                let idf = (1.0 + (documents.len() as f64 - df + 0.5) / (df + 0.5)).ln();
                let saturated = (count * (1.2 + 1.0))
                    / (count + 1.2 * (1.0 - 0.75 + (0.75 * length) / average));
                score += idf * saturated;
            }
            Bm25Result {
                item: &document.item,
                score,
            }
        })
        .collect()
}
