//! Port of `packages/gateway/src/security/index.ts`.
//!
//! Pure re-export barrel for the security cluster; the TS barrel is mirrored
//! one-for-one except where a native item is named differently or is missing
//! entirely. Renames are called out inline; missing items are listed under `Gaps`.

// `export { PathGuard, PathGuardOptions, PathTraversalError } from './path-guard.js'`
//
// `PathGuardOptions` has no native struct (`PathGuard` takes explicit constructor
// arguments) — see `Gaps`.
pub use super::path_guard::{PathGuard, PathTraversalError};

// `export { ConsentManager, ConsentDecision, ConsentManagerOptions, ConsentRequest,
//          ConsentStatus } from './consent-manager.js'`
//
// `security::contracts` also defines `ConsentRequest`/`ConsentDecision`; the
// consent-manager pair is exported here because that is the TS barrel's source.
pub use super::consent_manager::{
    ConsentDecision, ConsentManager, ConsentManagerOptions, ConsentRequest, ConsentStatus,
};

// `export * from './tool-permissions.js'`
pub use super::tool_permissions::{
    get_unknown_tool_permission, is_command_allowed, is_path_allowed_by_permission, match_glob,
    requires_consent, resolve_tool_permission, ConsentLevel, PolicySource, ResolvedToolPermission,
    ToolPermission, ToolPermissionConfig,
};

// `export * from './tool-profiles.js'`
pub use super::tool_profiles::{
    extend_profile, get_profile, list_profiles, serialize_profile, ProfileName,
};

// `export * from './trust-engine.js'`
pub use super::trust_engine::{TrustEngine, TrustState};

// `export { ConsentAwareExecutor, ConsentAwareExecutorOptions, ExecuteOptions }
//  from './consent-executor.js'`
pub use super::consent_executor::{ConsentAwareExecutor, ConsentExecutorOptions, ExecuteOptions};

// `export { SSRFGuard, SSRFGuardOptions } from './ssrf-guard.js'`
//
// Native type is spelled `SsrfGuard`; `SSRFGuardOptions` does not exist natively.
pub use super::ssrf_guard::SsrfGuard;

// `export * from './contracts.js'`
pub use super::contracts::{AuditRecord, SecurityService, TrustLevel};

// `export * from './sandbox-manager.js'`
//
// TS `SandboxMountMode` -> `MountMode`, `SandboxRunOptions` -> `CommandOptions`,
// `SandboxRunResult` -> `RunResult`, `SandboxBrowserOptions` -> `BrowserOptions`,
// `SandboxBrowserResult` -> `OwnedBrowser`.
pub use super::sandbox_manager::{
    BrowserOptions, CommandOptions, MountMode, OwnedBrowser, RunResult, SandboxManager,
};

// Gaps: TS exports from `security/index.ts` with no native counterpart.
//
// - `PathGuardOptions` — no native options struct; `PathGuard` takes explicit
//   constructor arguments instead.
// - `SSRFGuardOptions` — no native options struct; `SsrfGuard` is constructed from
//   explicit values.
// - `SSRFGuard` — spelled `SsrfGuard` natively (re-exported above under the native
//   name; no alias is invented).
// - `SandboxMountMode` / `SandboxRunOptions` / `SandboxRunResult` /
//   `SandboxBrowserOptions` / `SandboxBrowserResult` — ported under the native names
//   `MountMode` / `CommandOptions` / `RunResult` / `BrowserOptions` / `OwnedBrowser`
//   (re-exported above); the TS spellings are not aliased.
// - `WindowsSandboxOptions`, `WindowsSandboxResult`, `WindowsSandboxStopOptions` —
//   no native windows-sandbox option/result structs.
// - `LinuxDesktopSandboxOptions`, `LinuxDesktopSandboxResult` — the Linux desktop
//   driver lives in the `integrations::os_control` cluster
//   (`OsExecOptions`/`OsExecResult`), not in `security`; nothing is re-exported here.
// - `ConsentAwareExecutorOptions` — natively `ConsentExecutorOptions` (re-exported
//   above; TS spelling not aliased).

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn unknown_tool_permission_matches_the_ts_default() {
        let resolved = get_unknown_tool_permission("mystery-tool");
        assert_eq!(resolved.permission.tool_name, "mystery-tool");
        assert!(!resolved.known_tool);
        assert_eq!(resolved.permission.consent_level, ConsentLevel::Dangerous);
        assert_eq!(resolved.source, PolicySource::UnknownTool);
    }

    #[test]
    fn match_glob_does_not_cross_path_separators() {
        assert!(match_glob("foo.ts", "*.ts"));
        assert!(!match_glob("nested/foo.ts", "*.ts"));
        assert!(match_glob("nested/foo.ts", "**/*.ts"));
        assert!(!match_glob("foo.ts", "*.rs"));
    }

    #[test]
    fn unknown_tool_always_requires_consent() {
        let approvals: HashSet<String> = HashSet::new();
        assert!(requires_consent(None, 1.0, &approvals));
    }

    #[test]
    fn profile_surface_is_populated_and_rejects_unknown_names() {
        assert!(!list_profiles().is_empty());
        assert!(get_profile("definitely-not-a-profile").is_err());
    }

    #[test]
    fn barrel_names_resolve_to_the_owning_modules() {
        use std::any::TypeId;

        assert_eq!(
            TypeId::of::<PathGuard>(),
            TypeId::of::<super::super::path_guard::PathGuard>()
        );
        assert_eq!(
            TypeId::of::<ConsentManager>(),
            TypeId::of::<super::super::consent_manager::ConsentManager>()
        );
        assert_eq!(
            TypeId::of::<ToolPermission>(),
            TypeId::of::<super::super::tool_permissions::ToolPermission>()
        );
        assert_eq!(
            TypeId::of::<ProfileName>(),
            TypeId::of::<super::super::tool_profiles::ProfileName>()
        );
        assert_eq!(
            TypeId::of::<TrustState>(),
            TypeId::of::<super::super::trust_engine::TrustState>()
        );
        assert_eq!(
            TypeId::of::<ConsentExecutorOptions>(),
            TypeId::of::<super::super::consent_executor::ConsentExecutorOptions>()
        );
        assert_eq!(
            TypeId::of::<SsrfGuard>(),
            TypeId::of::<super::super::ssrf_guard::SsrfGuard>()
        );
        assert_eq!(
            TypeId::of::<SandboxManager>(),
            TypeId::of::<super::super::sandbox_manager::SandboxManager>()
        );
    }
}
