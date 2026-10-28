//! Mailbox validation and public-only DNS pinning. No private-network bypass.
use super::contracts::*;
use super::remote_images::{ImageResolver, native_resolver};
use crate::{security::ssrf_guard::SsrfGuard, text::js_trim};
use serde_json::Value;
use std::{net::IpAddr, time::Duration};

fn units(s: &str) -> usize {
    s.encode_utf16().count()
}
fn clean(s: &str) -> bool {
    !s.contains(['\r', '\n', '\0'])
}
fn strict(value: &Value, keys: &[&str]) -> Result<(), String> {
    let object = value.as_object().ok_or("Expected an object")?;
    if object.keys().any(|k| !keys.contains(&k.as_str())) {
        return Err("Unrecognized email field".into());
    }
    Ok(())
}
fn optional_types(value: &Value, strings: &[&str], bools: &[&str]) -> Result<(), String> {
    for key in strings {
        if value.get(*key).is_some_and(|v| !v.is_string()) {
            return Err(format!("Invalid {key}"));
        }
    }
    for key in bools {
        if value.get(*key).is_some_and(|v| !v.is_boolean()) {
            return Err(format!("Invalid {key}"));
        }
    }
    Ok(())
}
pub fn validate_server(mut c: MailServerConfig) -> Result<MailServerConfig, String> {
    c.host = js_trim(&c.host).into();
    c.user = js_trim(&c.user).into();
    if c.host.is_empty()
        || units(&c.host) > 253
        || !c
            .host
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b".:-".contains(&b))
    {
        return Err("Enter a hostname or IP address".into());
    }
    if !c.port.is_finite() || c.port.fract() != 0.0 || !(1.0..=65535.0).contains(&c.port) {
        return Err("Invalid mail port".into());
    }
    if c.user.is_empty()
        || units(&c.user) > 320
        || !clean(&c.user)
        || c.password.is_empty()
        || units(&c.password) > 4096
    {
        return Err("Invalid mailbox credentials".into());
    }
    Ok(c)
}
pub fn validate_email(s: &str) -> Result<String, String> {
    let s = js_trim(s);
    // Same practical ASCII mailbox grammar used by the reference Zod email validator.
    let re = regex::Regex::new(r"(?i)^[A-Z0-9_+\-](?:[A-Z0-9_+.'\-]*[A-Z0-9_+\-])?@[A-Z0-9](?:[A-Z0-9\-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9\-]*[A-Z0-9])?)*\.[A-Z]{2,}$").unwrap();
    if units(s) > 320 || s.contains("..") || !re.is_match(s) {
        return Err("Invalid email address".into());
    }
    Ok(s.into())
}
pub fn connect_mailbox(value: Value) -> Result<ConnectMailboxInput, String> {
    strict(&value, &["email", "displayName", "imap", "smtp"])?;
    for k in ["imap", "smtp"] {
        strict(&value[k], &["host", "port", "secure", "user", "password"])?;
    }
    optional_types(&value, &["displayName"], &[])?;
    let mut c: ConnectMailboxInput =
        serde_json::from_value(value).map_err(|_| "Invalid mailbox configuration")?;
    c.email = validate_email(&c.email)?;
    if let Some(name) = c.display_name.as_mut() {
        *name = js_trim(name).into();
        if units(name) > 200 {
            return Err("Display name is too long".into());
        }
    }
    c.imap = validate_server(c.imap)?;
    c.smtp = validate_server(c.smtp)?;
    Ok(c)
}
pub fn account_settings(value: Value) -> Result<EmailAccountSettings, String> {
    strict(&value, &["displayName", "signature", "signatureEnabled"])?;
    optional_types(&value, &["displayName", "signature"], &["signatureEnabled"])?;
    let mut c: EmailAccountSettings =
        serde_json::from_value(value).map_err(|_| "Invalid account settings")?;
    if let Some(name) = c.display_name.as_mut() {
        *name = js_trim(name).into();
        if units(name) > 200 {
            return Err("Display name is too long".into());
        }
    }
    if c.signature.as_ref().is_some_and(|s| units(s) > 10_000) {
        return Err("Signature is too long".into());
    }
    Ok(c)
}
pub fn send_email(value: Value) -> Result<SendMessageInput, String> {
    send_with_limit(value, 2 * 1024 * 1024)
}
pub(crate) fn provider_send_email(input: SendMessageInput) -> Result<SendMessageInput, String> {
    // Service signatures are appended after validating the user's 2 MiB body.
    send_with_limit(
        serde_json::to_value(input).map_err(|e| e.to_string())?,
        2 * 1024 * 1024 + 70_000,
    )
}
fn send_with_limit(value: Value, max_body_units: usize) -> Result<SendMessageInput, String> {
    strict(
        &value,
        &[
            "to",
            "subject",
            "body",
            "cc",
            "bcc",
            "replyToMessageId",
            "html",
            "includeSignature",
        ],
    )?;
    optional_types(
        &value,
        &["cc", "bcc", "replyToMessageId"],
        &["html", "includeSignature"],
    )?;
    let c: SendMessageInput = serde_json::from_value(value).map_err(|_| "Invalid email message")?;
    for h in [Some(&c.to), Some(&c.subject), c.cc.as_ref(), c.bcc.as_ref()]
        .into_iter()
        .flatten()
    {
        if units(h) > 10_000 || !clean(h) {
            return Err("Mail headers cannot contain line breaks".into());
        }
    }
    if units(&c.body) > max_body_units {
        return Err("Email body is too large".into());
    }
    if c.reply_to_message_id
        .as_ref()
        .is_some_and(|s| s.is_empty() || units(s) > 2048 || !clean(s))
    {
        return Err("Invalid reply message id".into());
    }
    if js_trim(&c.to).is_empty() && c.reply_to_message_id.is_none() {
        return Err("A recipient or reply message is required".into());
    }
    Ok(c)
}
// Deliberately not Debug/Serialize: this capability contains a credential.
#[derive(Clone)]
pub struct PinnedMailServer {
    pub config: MailServerConfig,
    pub servername: String,
}
pub async fn public_mail_server(
    config: &MailServerConfig,
    resolve: &ImageResolver,
) -> Result<PinnedMailServer, String> {
    let config = validate_server(config.clone())?;
    let guard = SsrfGuard::default();
    let target = |s: &str| {
        if s.parse::<IpAddr>().is_ok_and(|a| a.is_ipv6()) {
            format!("https://[{s}]/")
        } else {
            format!("https://{s}/")
        }
    };
    guard
        .validate(&target(&config.host))
        .map_err(|e| e.to_string())?;
    let addresses = tokio::time::timeout(Duration::from_secs(8), resolve(config.host.clone()))
        .await
        .map_err(|_| "Mail server DNS timed out")??;
    if addresses.is_empty() {
        return Err("Mail server did not resolve".into());
    }
    if addresses.len() > 128 {
        return Err("Too many mail server addresses".into());
    }
    for address in &addresses {
        address
            .parse::<IpAddr>()
            .map_err(|_| "Invalid mail server address")?;
        guard
            .validate(&target(address))
            .map_err(|e| e.to_string())?;
    }
    let mut pinned = config.clone();
    pinned.host = addresses[0].clone();
    Ok(PinnedMailServer {
        config: pinned,
        servername: config.host,
    })
}
pub fn mail_resolver() -> ImageResolver {
    native_resolver()
}

/// Thunderbird's fixed public HTTPS registry. The stream and total request are
/// bounded; redirects and XML entity declarations are rejected.
pub async fn discover_mail_settings(email: &str) -> Result<DiscoveredMailSettings, String> {
    let email = validate_email(email)?;
    let (_, domain) = email.rsplit_once('@').ok_or("Invalid email address")?;
    let domain = url::Host::parse(domain)
        .map_err(|_| "Enter a public email domain")?
        .to_string()
        .to_ascii_lowercase();
    if !regex::Regex::new(r"^[a-z0-9.-]+\.[a-z]{2,}$")
        .unwrap()
        .is_match(&domain)
    {
        return Err("Enter a public email domain".into());
    }
    tokio::time::timeout(Duration::from_secs(8), async {
        let client = reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(8))
            .build()
            .map_err(|_| "Mail discovery unavailable")?;
        let mut response = client
            .get(format!(
                "https://autoconfig.thunderbird.net/v1.1/{}",
                super::transport::enc(&domain)
            ))
            .send()
            .await
            .map_err(|_| "Mail discovery request failed")?;
        if !response.status().is_success() {
            return Err(
                "No automatic settings found. Enter your provider's IMAP and SMTP settings.".into(),
            );
        }
        let mut body = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| "Provider settings read failed")?
        {
            if body.len().saturating_add(chunk.len()) > 65_536 {
                return Err("Provider settings response is too large".into());
            }
            body.extend_from_slice(&chunk);
        }
        let xml = std::str::from_utf8(&body).map_err(|_| "Invalid provider settings")?;
        parse_autoconfig_xml(&email, &domain, xml)
    })
    .await
    .map_err(|_| "Mail discovery timed out")?
}

/// Restricted registry XML grammar: scalar fields and secure server elements.
/// No arbitrary XML expansion or external-resource loader. Non-scalar/corrupt
/// configurations fail explicitly and the UI can use manual configuration.
pub fn parse_autoconfig_xml(
    email: &str,
    domain: &str,
    xml: &str,
) -> Result<DiscoveredMailSettings, String> {
    if xml.len() > 65_536
        || regex::Regex::new(r"(?i)<!DOCTYPE|<!ENTITY")
            .unwrap()
            .is_match(xml)
    {
        return Err("Invalid provider settings".into());
    }
    // Remove comments before finding elements; comments must never advertise a server.
    let comments = regex::Regex::new(r"(?s)<!--.*?-->").unwrap();
    let xml = comments.replace_all(xml, "");
    let providers =
        regex::Regex::new(r"(?s)<emailProvider(?:\s[^<>]*)?>(.*?)</emailProvider\s*>").unwrap();
    let provider = providers
        .captures(&xml)
        .and_then(|c| c.get(1))
        .ok_or("Invalid provider settings")?
        .as_str();
    fn scalar(xml: &str, tag: &str) -> Result<Option<String>, String> {
        let pattern = format!(r"(?s)<{tag}\s*>(.*?)</{tag}\s*>");
        let re = regex::Regex::new(&pattern).map_err(|_| "Invalid provider field")?;
        let Some(value) = re.captures(xml).and_then(|c| c.get(1)) else {
            return Ok(None);
        };
        let value = value.as_str().trim();
        if let Some(cdata) = value
            .strip_prefix("<![CDATA[")
            .and_then(|s| s.strip_suffix("]]>"))
        {
            return Ok(Some(cdata.into()));
        }
        if value.contains('<') {
            return Err("Invalid provider settings".into());
        }
        // The reference disables entity processing; preserve entity text.
        Ok(Some(value.into()))
    }
    let choose = |element: &str, kind: &str| -> Result<PublicMailServerConfig, String> {
        let re =
            regex::Regex::new(&format!(r"(?s)<{element}\s+([^<>]*)>(.*?)</{element}\s*>")).unwrap();
        let attribute =
            regex::Regex::new(&format!(r#"(?:^|\s)type\s*=\s*["']{kind}["'](?:\s|$)"#)).unwrap();
        for cap in re.captures_iter(provider).take(128) {
            if !attribute.is_match(&cap[1]) {
                continue;
            }
            let socket = scalar(&cap[2], "socketType")?.unwrap_or_default();
            if socket != "SSL" && socket != "STARTTLS" {
                continue;
            }
            let user = scalar(&cap[2], "username")?
                .filter(|s| !s.is_empty())
                .unwrap_or("%EMAILADDRESS%".into())
                .replace("%EMAILADDRESS%", email)
                .replace("%EMAILLOCALPART%", email.split('@').next().unwrap_or(""))
                .replace("%EMAILDOMAIN%", domain);
            let host = scalar(&cap[2], "hostname")?.ok_or("Missing provider hostname")?;
            let port = scalar(&cap[2], "port")?
                .ok_or("Missing provider port")?
                .parse::<f64>()
                .map_err(|_| "Invalid provider port")?;
            let config = validate_server(MailServerConfig {
                host,
                port,
                secure: socket == "SSL",
                user,
                password: "validation-only".into(),
            })?;
            return Ok(PublicMailServerConfig {
                host: config.host,
                port: config.port,
                secure: config.secure,
                user: config.user,
            });
        }
        Err("This provider does not advertise secure IMAP/SMTP. Enter settings manually.".into())
    };
    Ok(DiscoveredMailSettings {
        name: scalar(provider, "displayName")?
            .filter(|s| !s.is_empty())
            .unwrap_or(domain.into()),
        imap: choose("incomingServer", "imap")?,
        smtp: choose("outgoingServer", "smtp")?,
    })
}
