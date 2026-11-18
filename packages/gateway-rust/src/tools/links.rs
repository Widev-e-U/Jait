//! Safe internal chat links and primary-search query updates.
use crate::text::js_trim;
use serde_json::{Value, json};
use std::sync::LazyLock;
fn pages() -> &'static Value {
    static VALUE: LazyLock<Value> = LazyLock::new(|| {
        serde_json::from_str(include_str!("link-pages.json")).expect("embedded page paths")
    });
    &VALUE
}
pub fn metadata() -> &'static Value {
    static VALUE: LazyLock<Value> = LazyLock::new(|| {
        serde_json::from_str(include_str!("link-metadata.json")).expect("embedded link definition")
    });
    &VALUE
}
fn url(value: &str) -> Option<url::Url> {
    url::Url::parse("https://jait.invalid")
        .ok()?
        .join(value)
        .ok()
}
fn href(url: &url::Url) -> String {
    let mut result = url.path().to_string();
    if let Some(query) = url.query().filter(|q| !q.is_empty()) {
        result.push('?');
        result.push_str(query);
    }
    result
}
pub fn safe_notification_link(value: &Value) -> Option<String> {
    let value = value.as_str()?;
    if value.encode_utf16().count() > 4096
        || !value.starts_with('/')
        || value.starts_with("//")
        || value.chars().any(|c| c == '\\' || c <= '\u{001f}')
    {
        return None;
    }
    let url = url(value)?;
    if url.origin().ascii_serialization() != "https://jait.invalid" {
        return None;
    }
    if !pages().as_array()?.iter().any(|p| p["path"] == url.path())
        && !["/chat", "/email", "/pull-requests"].contains(&url.path())
    {
        return None;
    }
    Some(href(&url))
}
pub fn parse_jait_rendered_link(value: &Value) -> Option<Value> {
    let input = value.as_object()?;
    let original = input.get("href")?.as_str()?;
    if original.contains('#') {
        return None;
    }
    let href = safe_notification_link(input.get("href")?)?;
    let label = input.get("label")?.as_str()?;
    if label.chars().any(|c| c < ' ') {
        return None;
    }
    let label = js_trim(label);
    if label.is_empty() || label.encode_utf16().count() > 160 {
        return None;
    }
    Some(json!({"kind":"jait-link","href":href,"label":label}))
}
pub fn render_link(input: &Value) -> Value {
    let Some(data) = parse_jait_rendered_link(input) else {
        return json!({"ok":false,"message":"Provide a supported internal Jait path and a non-empty label of at most 160 characters. External URLs and fragments are not supported."});
    };
    let Some(search) = input.get("search") else {
        return json!({"ok":true,"message":data["label"],"data":data});
    };
    let Some(search) = search.as_str() else {
        return json!({"ok":false,"message":"Search must be a string."});
    };
    let mut url = url(data["href"].as_str().expect("parsed href")).expect("validated internal URL");
    let path = match url.path() {
        "/chat" => "/",
        "/email" => "/emails",
        other => other,
    };
    if !pages()
        .as_array()
        .expect("page array")
        .iter()
        .any(|p| p["path"] == path && p["search"] == true)
    {
        return json!({"ok":false,"message":"This page has no primary search bar. Use jait.catalog for its supported queryParameters."});
    }
    let mut found = false;
    let mut pairs = vec![];
    for (key, value) in url.query_pairs() {
        if key == "q" {
            if !found {
                pairs.push(("q".to_string(), search.to_string()));
                found = true;
            }
        } else {
            pairs.push((key.into_owned(), value.into_owned()));
        }
    }
    if !found {
        pairs.push(("q".into(), search.into()));
    }
    url.set_query(None);
    {
        let mut query = url.query_pairs_mut();
        for (key, value) in pairs {
            query.append_pair(&key, &value);
        }
    }
    let Some(data) = parse_jait_rendered_link(&json!({"href":href(&url),"label":data["label"]}))
    else {
        return json!({"ok":false,"message":"The search link exceeds the supported URL length."});
    };
    json!({"ok":true,"message":data["label"],"data":data})
}
