//! Port of `packages/gateway/src/providers/index.ts`.
//!
//! Pure re-export barrel for the provider cluster. Every name below resolves to the
//! module that owns the behaviour; nothing is implemented here. The TS barrel is
//! mirrored one-for-one, except where noted under `Gaps`.
//!
//! The TS barrel also re-exports `ProviderInfo` (via `./contracts.js`); that type has
//! no native struct, so no fake re-export is introduced (see `Gaps`).

pub use super::acp_provider::{AcpProvider, AcpProviderConfig};
pub use super::jait_provider::JaitProvider;
pub use super::registry::ProviderRegistry;
pub use super::remote_cli::RemoteCliProvider;

// TS `export * from './contracts.js'` (minus `ProviderInfo`, see `Gaps`).
pub use super::contracts::{
    CliProviderAdapter, McpServerRef, ProviderEvent, ProviderId, ProviderSession,
    ProviderSessionStatus, RuntimeMode, StartSessionOptions,
};

// TS `export { loadAcpProviderConfigs } from './acp-provider.js'`.
//
// Native home of the loader is `acp_registry` (port of `acp-registry.ts`); the native
// name is kept rather than aliased to the TS name.
pub use super::acp_registry::load_acp_registry_provider_configs;

// Gaps: TS exports from `providers/index.ts` with no native counterpart.
//
// - `ProviderInfo` — no native struct; provider metadata is produced as
//   `serde_json::Value` by `providers::registry::ProviderAdapter::info()`.
// - `loadAcpProviderConfigs` (re-exported from `./acp-provider.js`) — the native
//   loader lives in `providers::acp_registry` under the name
//   `load_acp_registry_provider_configs` (mirroring `acp-registry.ts`, which is where
//   the registry-backed loader was actually ported). `providers::acp_provider`
//   exposes no loader function, so no alias with the TS name is exported.
// - `ProviderAdapter` (structural counterpart of `CliProviderAdapter`) is not part of
//   the TS barrel surface and is therefore not re-exported here; import it from
//   `providers::registry` or `providers::contracts`.

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_surface_is_wired_through_the_barrel() {
        let registry = ProviderRegistry::default();
        assert!(registry.list().is_empty());
        assert!(registry.get("missing").is_none());
        let err = match registry.get_or_throw("missing") {
            Ok(_) => String::from("<resolved unexpectedly>"),
            Err(err) => err,
        };
        assert_eq!(err, "Unknown provider: missing");
    }

    #[test]
    fn contract_names_resolve_to_the_owning_module() {
        use std::any::TypeId;

        assert_eq!(
            TypeId::of::<ProviderSession>(),
            TypeId::of::<super::super::contracts::ProviderSession>()
        );
        assert_eq!(
            TypeId::of::<ProviderSessionStatus>(),
            TypeId::of::<super::super::contracts::ProviderSessionStatus>()
        );
        assert_eq!(
            TypeId::of::<ProviderEvent>(),
            TypeId::of::<super::super::contracts::ProviderEvent>()
        );
        assert_eq!(
            TypeId::of::<StartSessionOptions>(),
            TypeId::of::<super::super::contracts::StartSessionOptions>()
        );
        assert_eq!(
            TypeId::of::<McpServerRef>(),
            TypeId::of::<super::super::contracts::McpServerRef>()
        );
        // `ProviderId` is a `String` alias.
        assert_eq!(TypeId::of::<ProviderId>(), TypeId::of::<String>());
    }

    #[test]
    fn provider_names_resolve_to_the_owning_modules() {
        use std::any::TypeId;

        assert_eq!(
            TypeId::of::<JaitProvider>(),
            TypeId::of::<super::super::jait_provider::JaitProvider>()
        );
        assert_eq!(
            TypeId::of::<RemoteCliProvider>(),
            TypeId::of::<super::super::remote_cli::RemoteCliProvider>()
        );
        assert_eq!(
            TypeId::of::<AcpProvider>(),
            TypeId::of::<super::super::acp_provider::AcpProvider>()
        );
        assert_eq!(
            TypeId::of::<AcpProviderConfig>(),
            TypeId::of::<super::super::acp_provider::AcpProviderConfig>()
        );
        assert_eq!(
            TypeId::of::<ProviderRegistry>(),
            TypeId::of::<super::super::registry::ProviderRegistry>()
        );
    }

    #[test]
    fn contract_module_exports_the_session_boundary_trait() {
        // Compile-time check only: the barrel name resolves as a generic bound. The
        // crate has no implementor yet (`providers/contracts.rs` header documents that
        // registry adapters do not implement it), so nothing is instantiated here.
        #[allow(dead_code)]
        fn bound_is_reachable<T: ?Sized + CliProviderAdapter>() {}
    }
}
