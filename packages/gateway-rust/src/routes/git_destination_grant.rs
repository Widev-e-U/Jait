//! Host-issued destination scope for the Git execution authority.
//!
//! This is a policy primitive only. It does not resolve DNS, constrain redirects,
//! protect Git configuration or hold a repository lease. Callers must enforce
//! those boundaries and retain authority through execution before enabling effects
//! (`runtime::git_network` does so for https remotes).
use std::{
    path::{Component, Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::Instant,
};

/// One exact host and port, operation, owner, node and repository root.
/// This does not scope a scheme, URL path, proxy, or repository on the host.
/// Issuance belongs to the trusted host after its consent decision; constructing a
/// scope from an untrusted request is not authorization.
#[derive(Clone)]
pub(crate) struct GitDestinationGrant {
    owner: String,
    node: String,
    root: PathBuf,
    operation: String,
    host: String,
    port: u16,
    expires_at: Instant,
    revoked: Arc<AtomicBool>,
}

fn valid_identity(value: &str) -> bool {
    !value.is_empty() && value.len() <= 512 && !value.chars().any(char::is_control)
}

// Only a conservative lowercase ASCII hostname spelling is accepted. URL
// parsing, aliases, address resolution, proxies and redirects require a
// separate reviewed destination resolver.
fn valid_host(host: &str) -> bool {
    host.len() <= 253
        && !host.is_empty()
        && host.split('.').all(|label| {
            !label.is_empty()
                && label.len() <= 63
                && label
                    .as_bytes()
                    .first()
                    .is_some_and(u8::is_ascii_alphanumeric)
                && label
                    .as_bytes()
                    .last()
                    .is_some_and(u8::is_ascii_alphanumeric)
                && label
                    .bytes()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
        })
        && host
            .rsplit('.')
            .next()
            .is_some_and(|label| label.as_bytes().first().is_some_and(u8::is_ascii_lowercase))
}

impl GitDestinationGrant {
    /// The host must canonicalize the root and establish its identity. This
    /// function checks lexical form only and does not inspect the filesystem.
    pub(crate) fn issue(
        owner: String,
        node: String,
        root: PathBuf,
        operation: String,
        host: String,
        port: u16,
        expires_at: Instant,
    ) -> Option<Self> {
        if !valid_identity(&owner)
            || !valid_identity(&node)
            || !valid_identity(&operation)
            || !root.is_absolute()
            || root.as_os_str().as_encoded_bytes().contains(&0)
            || root
                .components()
                .any(|c| matches!(c, Component::ParentDir | Component::CurDir))
            || root.as_os_str() != root.components().collect::<PathBuf>().as_os_str()
            || !valid_host(&host)
            || port == 0
            || expires_at <= Instant::now()
        {
            return None;
        }
        Some(Self {
            owner,
            node,
            root,
            operation,
            host,
            port,
            expires_at,
            revoked: Arc::new(AtomicBool::new(false)),
        })
    }

    /// Exact comparison at this instant only. A positive result is not a network
    /// or process lease; expiry or revocation does not stop an already-started child.
    pub(crate) fn permits(
        &self,
        owner: &str,
        node: &str,
        root: &Path,
        operation: &str,
        host: &str,
        port: u16,
    ) -> bool {
        !self.revoked.load(Ordering::Acquire)
            && Instant::now() < self.expires_at
            && self.owner == owner
            && self.node == node
            && self.root.as_os_str() == root.as_os_str()
            && self.operation == operation
            && self.host == host
            && self.port == port
    }

    /// False once revoked or expired, so a holder can drop the grant.
    pub(crate) fn is_active(&self) -> bool {
        !self.revoked.load(Ordering::Acquire) && Instant::now() < self.expires_at
    }

    #[cfg(test)]
    pub(crate) fn revoke(&self) {
        self.revoked.store(true, Ordering::Release);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    fn grant(now: Instant) -> GitDestinationGrant {
        GitDestinationGrant::issue(
            "owner".into(),
            "local".into(),
            "/repo".into(),
            "fetch".into(),
            "git.example".into(),
            443,
            now + Duration::from_secs(10),
        )
        .unwrap()
    }

    #[test]
    fn scope_is_exact_and_expires() {
        let now = Instant::now();
        let g = grant(now);
        let permits = |owner, node, root: &str, operation, host, port| {
            g.permits(owner, node, Path::new(root), operation, host, port)
        };
        assert!(permits(
            "owner",
            "local",
            "/repo",
            "fetch",
            "git.example",
            443
        ));
        assert!(!permits(
            "other",
            "local",
            "/repo",
            "fetch",
            "git.example",
            443
        ));
        assert!(!permits(
            "owner",
            "remote",
            "/repo",
            "fetch",
            "git.example",
            443
        ));
        assert!(!permits(
            "owner",
            "local",
            "/repo/nested",
            "fetch",
            "git.example",
            443
        ));
        assert!(!permits(
            "owner",
            "local",
            "/repo",
            "push",
            "git.example",
            443
        ));
        assert!(!permits(
            "owner",
            "local",
            "/repo",
            "fetch",
            "evil.git.example",
            443
        ));
        assert!(!permits(
            "owner",
            "local",
            "/repo",
            "fetch",
            "git.example",
            444
        ));
        let mut expired = g.clone();
        expired.expires_at = now;
        assert!(!expired.permits(
            "owner",
            "local",
            Path::new("/repo"),
            "fetch",
            "git.example",
            443
        ));
        g.clone().revoke();
        assert!(!permits(
            "owner",
            "local",
            "/repo",
            "fetch",
            "git.example",
            443
        ));
    }

    #[test]
    fn malformed_or_ambiguous_grants_are_rejected() {
        let now = Instant::now();
        for host in [
            "",
            "Git.example",
            "git.example.",
            "-git.example",
            "*.example",
            "127.0.0.1",
            "0x7f000001",
            "0177.0.0.1",
            "0x7f.0.0.1",
            "2130706433",
            "example.123",
            "git.example:443",
            "git.example@evil",
        ] {
            assert!(
                GitDestinationGrant::issue(
                    "owner".into(),
                    "local".into(),
                    "/repo".into(),
                    "fetch".into(),
                    host.into(),
                    443,
                    now + Duration::from_secs(1)
                )
                .is_none(),
                "{host}"
            );
        }
        for root in [
            "/repo/../other",
            "/repo/./nested",
            "/repo//nested",
            "/repo/",
            "/repo/\0nested",
        ] {
            assert!(
                GitDestinationGrant::issue(
                    "owner".into(),
                    "local".into(),
                    root.into(),
                    "fetch".into(),
                    "git.example".into(),
                    443,
                    now + Duration::from_secs(1)
                )
                .is_none(),
                "{root}"
            );
        }
        assert!(
            GitDestinationGrant::issue(
                "owner".into(),
                "local".into(),
                "/repo".into(),
                "fetch".into(),
                "git.example".into(),
                443,
                now
            )
            .is_none()
        );
    }
}
