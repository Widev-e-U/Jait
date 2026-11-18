//! W1 verification: `services/git-forge.ts` and `services/github-pull-requests.ts`.
//!
//! Reference policy
//! -----------------
//! No dispatch driver covers either component, so expectations below are literal
//! values produced by *running the real TypeScript implementation*:
//!
//!   cd /home/jakob/jait && bun .jait/artifacts/gateway-rust/verify-w1/ts/ref-git-forge.ts
//!
//! That script imports `packages/gateway/src/services/git.ts` (`parseGitRemote`)
//! and `packages/gateway/src/services/git-forge.ts` (`GitHubForge`,
//! `GitLabForge`) and prints the JSON captured in
//! `.jait/artifacts/gateway-rust/verify-w1/vectors/git-forge.json`.
//! String constants for the pull-request conflict payload are read from
//! `packages/gateway/src/services/github-pull-requests.ts` (line numbers cited
//! per assertion).

use jait_gateway::services::git_forge::{ForgeError, ForgeProvider, ForgeRepository};
use jait_gateway::services::github_pull_requests::{
    ConflictContent, ConflictFile, ConflictOutcome, GITHUB_TOKEN_SECRET_KEY,
    GITHUB_TOKEN_SECRET_TYPE,
};
use serde_json::json;

// ---------------------------------------------------------------------------
// services/git-forge.ts
// ---------------------------------------------------------------------------

/// reference: `new GitHubForge().buildCreatePrUrl({host:"github.com",owner:"acme",
/// repo:"widgets"}, "feat/x", "main")` ->
/// `https://github.com/acme/widgets/compare/main...feat%2Fx?expand=1`
#[test]
fn forge_github_create_pr_url_matches_ts() {
    let repo = ForgeRepository::new("github.com", "acme", "widgets").expect("valid selection");
    let url = repo
        .create_pr_url(ForgeProvider::Github, "feat/x", Some("main"))
        .expect("url");
    assert_eq!(
        url,
        "https://github.com/acme/widgets/compare/main...feat%2Fx?expand=1"
    );
    // TS omits the base when the caller passes only a head; its default is `main`.
    let default_base = repo
        .create_pr_url(ForgeProvider::Github, "feat/x", None)
        .expect("url");
    assert_eq!(default_base, url);
    // Identity surface used by credential scoping / audit logging.
    assert_eq!(repo.host(), "github.com");
    assert_eq!(repo.target(), "github.com/acme/widgets");
    assert_eq!(repo.web_url(), "https://github.com/acme/widgets");
    assert_eq!(repo.api_path(), "repos/acme/widgets");
}

/// reference: `new GitLabForge().buildCreatePrUrl({provider:"gitlab",
/// host:"gitlab.com", organization:"group/sub", repo:"proj"}, "feat/x", "main")`
/// -> `https://gitlab.com/group/sub/proj/-/merge_requests/new?merge_request[source_branch]=feat%2Fx`
/// The TS implementation emits unencoded `[`/`]`; the Rust side percent-encodes
/// them (equivalent per RFC 3986 sub-delims in a query). Compared here on the
/// decoded query pair + path so the assertion states the real contract.
#[test]
fn forge_gitlab_nested_group_keeps_namespace() {
    let repo = ForgeRepository::gitlab("gitlab.com", "group/sub", "proj").expect("valid selection");
    let url = repo
        .create_pr_url(ForgeProvider::Gitlab, "feat/x", Some("main"))
        .expect("url");
    let (path, query) = url.split_once('?').expect("query string");
    assert_eq!(
        path,
        "https://gitlab.com/group/sub/proj/-/merge_requests/new"
    );
    // Percent-decode so the assertion states the TS-decoded contract regardless
    // of how sub-delimiters are encoded.
    fn pct(s: &str) -> String {
        let b = s.as_bytes();
        let mut out = String::new();
        let mut i = 0;
        while i < b.len() {
            if b[i] == b'%'
                && i + 2 < b.len()
                && let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16)
            {
                out.push(v as char);
                i += 3;
                continue;
            }
            out.push(b[i] as char);
            i += 1;
        }
        out
    }
    assert_eq!(pct(query), "merge_request[source_branch]=feat/x");
    // Nested group is the owner (TS reports `organization: "group/sub"`).
    assert_eq!(repo.target(), "gitlab.com/group/sub/proj");
    assert_eq!(repo.host(), "gitlab.com");
}

/// reference: parseGitRemote("https://dev.azure.com/org/proj/_git/repo")
/// -> {host:"dev.azure.com", organization:"org", project:"proj", repo:"repo",
///     normalizedUrl:"https://dev.azure.com/org/proj/_git/repo"}
#[test]
fn forge_azure_urls_and_legacy_visualstudio_host() {
    let repo =
        ForgeRepository::azure("dev.azure.com", "org", "proj", "repo").expect("valid selection");
    assert_eq!(repo.web_url(), "https://dev.azure.com/org/proj/_git/repo");
    assert_eq!(repo.target(), "dev.azure.com/org/proj/_git/repo");
    assert_eq!(
        repo.organization_url().expect("azure"),
        "https://dev.azure.com/org"
    );
    assert_eq!(repo.api_path(), "repos/org/repo");

    let legacy =
        ForgeRepository::azure("org.visualstudio.com", "org", "proj", "repo").expect("legacy host");
    assert_eq!(
        legacy.web_url(),
        "https://org.visualstudio.com/proj/_git/repo"
    );
    assert_eq!(
        legacy.organization_url().expect("azure"),
        "https://org.visualstudio.com"
    );

    // `pullrequestcreate` + refs are the documented Azure create-PR shape.
    let url = repo
        .create_pr_url(ForgeProvider::AzureDevops, "feat/x", Some("main"))
        .expect("url");
    assert!(url.starts_with("https://dev.azure.com/org/proj/_git/repo/pullrequestcreate?"));
    assert!(url.contains("sourceRef=refs%2Fheads%2Ffeat%2Fx"));
}

/// error/edge: invalid selections and branch names are rejected before any
/// network work (TS `parseGitRemote`/`assertBranch` equivalents).
#[test]
fn forge_rejects_invalid_selections_and_branches() {
    // owner containing a space cannot be a slug
    assert_eq!(
        ForgeRepository::new("github.com", "acme co", "widgets").unwrap_err(),
        ForgeError::InvalidInput
    );
    // host with an empty label
    assert_eq!(
        ForgeRepository::new("github..com", "acme", "widgets").unwrap_err(),
        ForgeError::InvalidInput
    );
    // Azure host must be dev.azure.com or <org>.visualstudio.com
    assert_eq!(
        ForgeRepository::azure("example.com", "org", "proj", "repo").unwrap_err(),
        ForgeError::InvalidInput
    );
    // project names may contain spaces but never URL syntax
    assert_eq!(
        ForgeRepository::azure("dev.azure.com", "org", "pr:oj", "repo").unwrap_err(),
        ForgeError::InvalidInput
    );
    // organization_url is Azure-only
    let gh = ForgeRepository::new("github.com", "acme", "widgets").expect("valid");
    assert_eq!(gh.organization_url().unwrap_err(), ForgeError::InvalidInput);

    // branch validation: leading '-', '..', trailing '.lock', control chars.
    for bad in ["-bad", "a..b", "topic/x.lock", "with space", "a~1"] {
        assert_eq!(
            gh.create_pr_url(ForgeProvider::Github, bad, Some("main"))
                .unwrap_err(),
            ForgeError::InvalidInput,
            "branch {bad:?} must be rejected"
        );
    }
    // Provider/selection mismatch: Azure url requested from a non-Azure selection.
    assert_eq!(
        gh.create_pr_url(ForgeProvider::AzureDevops, "feat/x", None)
            .unwrap_err(),
        ForgeError::InvalidInput
    );
}

/// reference: `getForge(provider)` selector names in git-forge.ts plus the
/// owner-scoped credential aliases mirrored from the TS credential resolver.
#[test]
fn forge_selector_and_credential_aliases() {
    assert_eq!(
        ForgeProvider::from_selector("github"),
        Some(ForgeProvider::Github)
    );
    assert_eq!(
        ForgeProvider::from_selector("gitlab"),
        Some(ForgeProvider::Gitlab)
    );
    assert_eq!(
        ForgeProvider::from_selector("gitea"),
        Some(ForgeProvider::Gitea)
    );
    assert_eq!(
        ForgeProvider::from_selector("azure-devops"),
        Some(ForgeProvider::AzureDevops)
    );
    assert_eq!(
        ForgeProvider::from_selector("bitbucket"),
        Some(ForgeProvider::Bitbucket)
    );
    assert_eq!(ForgeProvider::from_selector("GitHub"), None);
    assert_eq!(ForgeProvider::from_selector(""), None);

    assert_eq!(
        ForgeProvider::Github.credential_aliases(),
        &["GH_TOKEN", "GITHUB_TOKEN"]
    );
    assert_eq!(
        ForgeProvider::AzureDevops.credential_aliases(),
        &["AZURE_DEVOPS_PAT", "AZURE_DEVOPS_TOKEN"]
    );
}

// ---------------------------------------------------------------------------
// services/github-pull-requests.ts
// ---------------------------------------------------------------------------

/// reference: github-pull-requests.ts:604 `{ status: "conflicts", files }`.
/// Rust normalizes the same shape; a binary side redacts *both* texts and
/// a missing stage becomes empty text.
#[test]
fn pr_conflict_payload_matches_ts_shape() {
    let files = vec![
        ConflictFile {
            path: "src/a.ts".into(),
            ours: ConflictContent::Text("ours".into()),
            theirs: ConflictContent::Text("theirs".into()),
        },
        ConflictFile {
            path: "logo.png".into(),
            ours: ConflictContent::Binary,
            theirs: ConflictContent::Text("ignored".into()),
        },
        ConflictFile {
            path: "deleted.ts".into(),
            ours: ConflictContent::Missing,
            theirs: ConflictContent::Text("theirs".into()),
        },
    ];
    assert_eq!(
        ConflictOutcome::Conflicts(files).into_json(),
        json!({
            "status": "conflicts",
            "files": [
                {"path": "src/a.ts", "binary": false, "ours": "ours", "theirs": "theirs"},
                {"path": "logo.png", "binary": true, "ours": "", "theirs": ""},
                {"path": "deleted.ts", "binary": false, "ours": "", "theirs": "theirs"},
            ]
        })
    );
}

/// edge: an empty conflict set (TS returns `{status:"conflicts",files:[]}` when
/// resolution produced nothing) must not collapse to `merged`.
#[test]
fn pr_empty_conflict_set_stays_conflicts() {
    let value = ConflictOutcome::Conflicts(Vec::new()).into_json();
    assert_eq!(value, json!({"status": "conflicts", "files": []}));
    assert_eq!(value["files"].as_array().map(Vec::len), Some(0));
}

/// reference: github-pull-requests.ts:646 `{status:"pushed", message:"Conflicts
/// resolved and pushed."}` — asserted verbatim.
#[test]
fn pr_pushed_payload_matches_ts() {
    assert_eq!(
        ConflictOutcome::Pushed.into_json(),
        json!({"status": "pushed", "message": "Conflicts resolved and pushed."})
    );
}

/// reference: github-pull-requests.ts:34-35
/// `export const GITHUB_TOKEN_SECRET_TYPE = "forge-token"` /
/// `export const GITHUB_TOKEN_SECRET_KEY = "github.com"` — the secret-store key
/// under which pull-request tokens are persisted.
#[test]
fn pr_token_secret_constants_match_ts() {
    assert_eq!(GITHUB_TOKEN_SECRET_TYPE, "forge-token");
    assert_eq!(GITHUB_TOKEN_SECRET_KEY, "github.com");
}

/// The native session passes a host-scoped token to the authority only in the
/// appropriate environment key. Denial must stop before any process starts.
#[tokio::test]
async fn github_session_auth_is_owner_scoped_and_authority_gated() {
    use jait_gateway::execution::process_runner::{ProcessCancellation, ProcessPool};
    use jait_gateway::routes::git::GitCommandAuthority;
    use jait_gateway::services::git_forge::{ForgeSession, GitHubForge};
    use std::{
        num::NonZeroU16,
        path::PathBuf,
        sync::{Arc, Mutex},
    };

    for (host, expected_key, forbidden_key) in [
        ("github.com", "GH_TOKEN", "GH_ENTERPRISE_TOKEN"),
        ("git.example.com", "GH_ENTERPRISE_TOKEN", "GH_TOKEN"),
    ] {
        let observed = Arc::new(Mutex::new(None));
        let captured = observed.clone();
        let authority: GitCommandAuthority = Arc::new(move |request, _| {
            *captured.lock().unwrap() = Some(request);
            Box::pin(async { Err("denied".into()) })
        });
        let session = ForgeSession::new(
            "alice".into(),
            PathBuf::from("/owned"),
            ForgeRepository::new(host, "acme", "repo").unwrap(),
            "test-secret".into(),
            authority,
            ProcessPool::new(NonZeroU16::new(1).unwrap()),
        )
        .unwrap();
        assert_eq!(
            GitHubForge::new(session)
                .check_auth(ProcessCancellation::default())
                .await,
            Err(ForgeError::Denied)
        );
        let request = observed.lock().unwrap().take().unwrap();
        assert_eq!(request.owner, "alice");
        assert_eq!(request.cwd, PathBuf::from("/owned"));
        assert_eq!(
            request.operation,
            format!("forge.github.auth-status:{host}/acme/repo")
        );
        assert_eq!(request.program, "gh");
        assert_eq!(request.arguments, ["api", "--hostname", host, "user"]);
        assert_eq!(
            request.environment.get(expected_key).map(String::as_str),
            Some("test-secret")
        );
        assert!(!request.environment.contains_key(forbidden_key));
        assert!(
            !request
                .arguments
                .iter()
                .any(|arg| arg.contains("test-secret"))
        );
        assert!(request.input.is_none());
    }
}
