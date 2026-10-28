use url::Url;
pub fn is_allowed_request_origin(
    origin: Option<&str>,
    host: Option<&str>,
    cors_origin: &str,
) -> bool {
    let Some(origin) = origin.filter(|v| !v.is_empty()) else {
        return true;
    };
    if [
        "tauri://localhost",
        "http://tauri.localhost",
        "https://tauri.localhost",
        "capacitor://localhost",
    ]
    .contains(&origin)
    {
        return true;
    }
    let Ok(url) = Url::parse(origin) else {
        return false;
    };
    if !["http", "https"].contains(&url.scheme()) || url.origin().ascii_serialization() != origin {
        return false;
    }
    let Some(name) = url.host_str() else {
        return false;
    };
    let authority = match url.port() {
        Some(port) => format!("{name}:{port}"),
        None => name.to_string(),
    };
    host == Some(authority.as_str())
        || cors_origin
            .split(',')
            .any(|v| crate::text::js_trim(v) == origin)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_clients_without_origin_are_allowed() {
        assert!(is_allowed_request_origin(None, Some("api.test"), ""));
        assert!(is_allowed_request_origin(Some(""), Some("api.test"), ""));
    }

    #[test]
    fn shell_origins_are_trusted() {
        for origin in [
            "tauri://localhost",
            "http://tauri.localhost",
            "https://tauri.localhost",
            "capacitor://localhost",
        ] {
            assert!(is_allowed_request_origin(Some(origin), Some("api.test"), ""));
        }
    }

    #[test]
    fn same_origin_and_configured_cors_are_allowed() {
        assert!(is_allowed_request_origin(
            Some("http://localhost:3000"),
            Some("localhost:3000"),
            ""
        ));
        assert!(is_allowed_request_origin(
            Some("https://app.test"),
            None,
            "https://app.test, https://other.test"
        ));
    }

    #[test]
    fn cross_origin_and_malformed_origins_are_rejected() {
        assert!(!is_allowed_request_origin(
            Some("https://evil.test"),
            Some("app.test"),
            "https://app.test"
        ));
        assert!(!is_allowed_request_origin(
            Some("http://app.test/"),
            Some("app.test"),
            ""
        ));
        assert!(!is_allowed_request_origin(
            Some("file://app.test"),
            Some("app.test"),
            ""
        ));
        assert!(!is_allowed_request_origin(
            Some("not a url"),
            Some("app.test"),
            ""
        ));
    }
}
