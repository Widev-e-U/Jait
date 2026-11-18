use anyhow::{Context, Result, ensure};
use reqwest::{
    Method,
    blocking::{Client, Response},
    header,
};
use serde_json::Value;
use std::{io::Read, time::Duration};

#[derive(Clone)]
pub struct Api {
    pub base: String,
    client: Client,
}

impl Api {
    pub fn new(base: &str) -> Result<Self> {
        let url = reqwest::Url::parse(base)?;
        ensure!(
            matches!(url.scheme(), "http" | "https"),
            "backend must use HTTP(S)"
        );
        ensure!(
            url.username().is_empty() && url.password().is_none(),
            "credentials belong in headers"
        );
        ensure!(
            url.path() == "/" && url.query().is_none() && url.fragment().is_none(),
            "backend URL must be an origin"
        );
        Ok(Self {
            base: base.trim_end_matches('/').into(),
            client: Client::builder()
                .timeout(Duration::from_secs(10))
                .connect_timeout(Duration::from_secs(3))
                .redirect(reqwest::redirect::Policy::none())
                .no_proxy()
                .build()?,
        })
    }

    pub fn request(
        &self,
        method: &str,
        path: &str,
        token: Option<&str>,
        body: Option<Value>,
    ) -> Result<Response> {
        let mut request = self.client.request(
            Method::from_bytes(method.as_bytes())?,
            format!("{}{path}", self.base),
        );
        if let Some(token) = token {
            request = request.bearer_auth(token);
        }
        if let Some(body) = body {
            request = request.json(&body);
        }
        request
            .send()
            .with_context(|| format!("{method} {path} failed"))
    }

    pub fn expect(
        &self,
        method: &str,
        path: &str,
        token: Option<&str>,
        body: Option<Value>,
        status: u16,
    ) -> Result<Response> {
        let response = self.request(method, path, token, body)?;
        let actual = response.status().as_u16();
        ensure!(
            actual == status,
            "{method} {path}: expected HTTP {status}, got {actual}{}",
            error_excerpt(response)
        );
        Ok(response)
    }

    pub fn json(
        &self,
        method: &str,
        path: &str,
        token: Option<&str>,
        body: Option<Value>,
        status: u16,
    ) -> Result<Value> {
        let response = self.expect(method, path, token, body, status)?;
        ensure!(
            response
                .headers()
                .get(header::CONTENT_TYPE)
                .and_then(|v| v.to_str().ok())
                .is_some_and(|v| v.starts_with("application/json")),
            "{method} {path}: expected JSON content type"
        );
        let bytes = bounded_body(response)?;
        serde_json::from_slice(&bytes).with_context(|| format!("{method} {path}: invalid JSON"))
    }

    pub fn cookie_request(&self, path: &str, cookie: &str) -> Result<Response> {
        Ok(self
            .client
            .post(format!("{}{path}", self.base))
            .header(header::COOKIE, cookie)
            .send()?)
    }
}

/// Diagnostic excerpt for status mismatches. Only error responses are echoed:
/// success bodies may contain bearer tokens (see `equal`).
fn error_excerpt(response: Response) -> String {
    if response.status().as_u16() < 400 {
        return String::new();
    }
    let text = match bounded_body(response) {
        Ok(bytes) => String::from_utf8_lossy(&bytes).chars().take(300).collect(),
        Err(_) => "<unreadable body>".to_owned(),
    };
    format!(" — {}", text.replace(['\n', '\r'], " "))
}

pub fn bounded_body(response: Response) -> Result<Vec<u8>> {
    let mut bytes = Vec::new();
    response.take(2_097_153).read_to_end(&mut bytes)?;
    ensure!(
        bytes.len() <= 2_097_152,
        "response exceeded 2 MiB contract limit"
    );
    Ok(bytes)
}

pub fn string(value: &Value, key: &str) -> Result<String> {
    let text = value[key]
        .as_str()
        .with_context(|| format!("missing string field {key}"))?;
    ensure!(!text.is_empty(), "empty field {key}");
    Ok(text.to_owned())
}

pub fn equal(actual: &Value, expected: Value, label: &str) -> Result<()> {
    // Do not echo bodies: auth responses contain bearer tokens.
    ensure!(*actual == expected, "{label}: value mismatch");
    Ok(())
}
