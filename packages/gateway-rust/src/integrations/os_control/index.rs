//! Port of `packages/gateway/src/os-control/index.ts`.
//!
//! Barrel for the desktop OS-control cluster (Linux-desktop sandbox driver, dockur
//! Windows VM driver, resolver). The native home is `crate::integrations::os_control`
//! rather than a top-level `os_control` module, so the barrel lives here.
//!
//! Everything below is a re-export; the TS barrel is mirrored one-for-one except
//! where noted under `Gaps` (the Windows driver has not been ported yet).

// `export * from "./types.js"`
pub use super::contracts::{
    MouseButton, OsClickOptions, OsControlDriver, OsDriverBinding, OsDriverType, OsExecOptions,
    OsKeyOptions, OsScreenshot, OsScrollOptions, OsTypeOptions, PngBuffer, ScrollDirection,
};

// `export { LinuxDesktopOsControlDriver } from "./linux-desktop-driver.js"`
pub use super::linux_desktop::LinuxDesktopOsControlDriver;

// `export { createOsControlResolver } from "./resolver.js"` + resolver types.
//
// The factory is the constructor `OsControlResolver::new`; `OsSandboxConnection` is
// the native `OsSandboxConnection` enum (see `Gaps` for the factory name).
pub use super::resolver::{OsControlResolver, OsSandboxConnection, OsSandboxInfo, WindowsSshConfig};

// Gaps: TS exports from `os-control/index.ts` with no native counterpart.
//
// - `createOsControlResolver` — no free factory function; construct
//   `resolver::OsControlResolver::new(...)` directly (same behaviour, method form).
// - `WindowsOsControlDriver` — the dockur Windows driver has not been ported; only
//   `ResolverError`, `OsSandboxConnection`, `WindowsSshConfig` and the
//   `OsDriverFactory` trait exist natively for the Windows path.
// - `buildWindowsSendKeys`, `escapeSendKeysText`, `extractSshPort` —
//   `windows-driver.ts` has no native port at all (grep for `build_windows_send_keys`,
//   `escape_send_keys_text`, `extract_ssh_port` is empty).
// - `ResolverError` and the `OsDriverFactory` trait are native additions that the TS
//   barrel does not export (they are reachable via `resolver::` directly).

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_decoding_matches_the_ts_helper() {
        let decode = super::super::linux_desktop::decode_base64;
        assert_eq!(decode("aGk="), b"hi");
        assert!(decode("").is_empty());
    }

    #[test]
    fn barrel_names_resolve_to_the_owning_modules() {
        use std::any::TypeId;

        assert_eq!(
            TypeId::of::<OsScreenshot>(),
            TypeId::of::<super::super::contracts::OsScreenshot>()
        );
        assert_eq!(
            TypeId::of::<OsClickOptions>(),
            TypeId::of::<super::super::contracts::OsClickOptions>()
        );
        assert_eq!(
            TypeId::of::<OsScrollOptions>(),
            TypeId::of::<super::super::contracts::OsScrollOptions>()
        );
        assert_eq!(
            TypeId::of::<OsDriverType>(),
            TypeId::of::<super::super::contracts::OsDriverType>()
        );
        assert_eq!(
            TypeId::of::<WindowsSshConfig>(),
            TypeId::of::<super::super::resolver::WindowsSshConfig>()
        );
        assert_eq!(
            TypeId::of::<LinuxDesktopOsControlDriver>(),
            TypeId::of::<super::super::linux_desktop::LinuxDesktopOsControlDriver>()
        );
    }
}
