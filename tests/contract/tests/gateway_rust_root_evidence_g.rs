//! Consumer-level contract evidence for the `(root)`/`lib` cluster components whose
//! native ports are reachable from the public crate surface:
//!   * `packages/gateway/src/index.ts`  -> `jait_gateway::runtime::application::ApplicationConfig`
//!   * `packages/gateway/src/server.ts` -> `jait_gateway::runtime::server::Gateway`
//!   * `packages/gateway/src/lib/network-scan.ts` -> `jait_gateway::network_scan` helpers
//!
//! Every expectation is a literal derived from the TypeScript reference (or, for the
//! Rust-only stateless entry, from the documented fail-closed opt-in contract).

use std::collections::BTreeMap;

fn lookup_of(pairs: &[(&str, &str)]) -> impl Fn(&str) -> Option<String> {
    let map: BTreeMap<String, String> = pairs
        .iter()
        .map(|(k, v)| ((*k).to_string(), (*v).to_string()))
        .collect();
    move |key: &str| map.get(key).cloned()
}

// ---------------------------------------------------------------------------
// packages/gateway/src/index.ts -> src/main.rs + src/runtime/application.rs
// ---------------------------------------------------------------------------
mod index_ts {
    use super::lookup_of;
    use jait_gateway::config::GatewayConfig;
    use jait_gateway::runtime::application::ApplicationConfig;

    #[test]
    fn default_executable_is_stateless_unless_opted_in() {
        // index.ts boots the gateway only when the entry is asked to; the Rust entry
        // stays stateless unless JAIT_RUST_APPLICATION is exactly "1".
        for pairs in [
            vec![],
            vec![("JAIT_RUST_APPLICATION", "")],
            vec![("JAIT_RUST_APPLICATION", "0")],
        ] {
            let config = ApplicationConfig::from_lookup(lookup_of(&pairs))
                .expect("disabled entry must not fail");
            assert!(
                config.is_none(),
                "unset/empty/0 must not construct an application: {pairs:?}"
            );
        }
    }

    #[test]
    fn invalid_opt_in_fails_closed_before_reading_any_state() {
        // A malformed opt-in is refused outright, i.e. it is not treated as "0".
        for value in ["true", "yes", "2", "01", "1 "] {
            let error =
                ApplicationConfig::from_lookup(lookup_of(&[("JAIT_RUST_APPLICATION", value)]))
                    .err()
                    .unwrap_or_else(|| panic!("{value:?} must be refused"));
            assert_eq!(error.to_string(), "JAIT_RUST_APPLICATION must be 0 or 1");
        }
    }

    #[test]
    fn opt_in_requires_absolute_paths_and_a_non_blank_secret() {
        let missing_db =
            ApplicationConfig::from_lookup(lookup_of(&[("JAIT_RUST_APPLICATION", "1")]))
                .err()
                .expect("missing database path must fail");
        assert_eq!(missing_db.to_string(), "JAIT_RUST_DB");

        let relative_db = ApplicationConfig::from_lookup(lookup_of(&[
            ("JAIT_RUST_APPLICATION", "1"),
            ("JAIT_RUST_DB", "state/jait.db"),
        ]))
        .err()
        .expect("relative database path must fail");
        assert_eq!(
            relative_db.to_string(),
            "JAIT_RUST_DB must be an absolute path"
        );

        let relative_root = ApplicationConfig::from_lookup(lookup_of(&[
            ("JAIT_RUST_APPLICATION", "1"),
            ("JAIT_RUST_DB", "/srv/jait/jait.db"),
            ("JAIT_RUST_PROJECT_ROOT", "./project"),
        ]))
        .err()
        .expect("relative project root must fail");
        assert_eq!(
            relative_root.to_string(),
            "JAIT_RUST_PROJECT_ROOT must be an absolute path"
        );

        let blank_secret = ApplicationConfig::from_lookup(lookup_of(&[
            ("JAIT_RUST_APPLICATION", "1"),
            ("JAIT_RUST_DB", "/srv/jait/jait.db"),
            ("JAIT_RUST_PROJECT_ROOT", "/srv/jait/project"),
            ("JWT_SECRET", "   \t "),
        ]))
        .err()
        .expect("whitespace-only secret must fail");
        assert_eq!(
            blank_secret.to_string(),
            "JWT_SECRET is required for the Rust application"
        );
    }

    #[test]
    fn fully_specified_entry_defaults_cors_empty_and_never_implies_provider_health() {
        let config = ApplicationConfig::from_lookup(lookup_of(&[
            ("JAIT_RUST_APPLICATION", "1"),
            ("JAIT_RUST_DB", "/srv/jait/jait.db"),
            ("JAIT_RUST_PROJECT_ROOT", "/srv/jait/project"),
            ("JWT_SECRET", "  secret-value  "),
        ]))
        .expect("valid configuration must build")
        .expect("opt-in must construct an application");
        assert_eq!(
            config.database_path,
            std::path::PathBuf::from("/srv/jait/jait.db")
        );
        assert_eq!(
            config.project_root,
            std::path::PathBuf::from("/srv/jait/project")
        );
        // JS `.trim()` semantics on the signing secret.
        assert_eq!(config.jwt_secret, "secret-value");
        assert_eq!(config.cors_origin, "");
        assert!(
            config.health.is_none(),
            "provider activation stays separate"
        );

        let with_cors = ApplicationConfig::from_lookup(lookup_of(&[
            ("JAIT_RUST_APPLICATION", "1"),
            ("JAIT_RUST_DB", "/srv/jait/jait.db"),
            ("JAIT_RUST_PROJECT_ROOT", "/srv/jait/project"),
            ("JWT_SECRET", "secret"),
            ("CORS_ORIGIN", "https://example.test"),
        ]))
        .expect("valid configuration must build")
        .expect("opt-in must construct an application");
        assert_eq!(with_cors.cors_origin, "https://example.test");
    }

    #[test]
    fn startup_resolves_gateway_binding_before_the_application_opt_in() {
        // main.rs:20 resolves the listening config before main.rs:26 resolves the
        // application, so a bad bind address is the error the operator sees first.
        let lookup = lookup_of(&[
            ("JAIT_RUST_PORT", "eighty"),
            ("JAIT_RUST_APPLICATION", "maybe"),
        ]);
        let binding =
            GatewayConfig::from_lookup(&lookup).expect_err("invalid port must fail first");
        assert_eq!(
            binding.to_string(),
            "JAIT_RUST_PORT must be an integer from 0 to 65535"
        );

        let valid_binding = lookup_of(&[]);
        let config =
            GatewayConfig::from_lookup(&valid_binding).expect("empty environment is valid");
        assert_eq!(config.address.to_string(), "127.0.0.1:8220");
        assert!(config.address.ip().is_loopback());

        let non_loopback = lookup_of(&[("JAIT_RUST_HOST", "0.0.0.0")]);
        assert_eq!(
            GatewayConfig::from_lookup(&non_loopback)
                .expect_err("routable bind must be refused")
                .to_string(),
            "JAIT_RUST_HOST must be loopback during migration"
        );
    }
}

// ---------------------------------------------------------------------------
// packages/gateway/src/server.ts -> src/runtime/server.rs
// ---------------------------------------------------------------------------
mod server_ts {
    use jait_gateway::health::{HealthSnapshot, HealthState};
    use jait_gateway::runtime::Gateway;
    use jait_gateway::{Gateway as ReexportedGateway, config::GatewayConfig};
    use std::net::SocketAddr;
    use std::sync::Arc;

    fn bind(address: &str) -> std::io::Result<Gateway> {
        let config = GatewayConfig {
            address: address.parse::<SocketAddr>().unwrap(),
        };
        let health = HealthState::new(None, HealthSnapshot::default());
        Arc::new(&()).clone();
        futures_block_on(Gateway::bind(config, health))
    }

    fn futures_block_on<F: std::future::Future>(future: F) -> F::Output {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(future)
    }

    #[test]
    fn crate_reexports_the_gateway_type() {
        // `jait_gateway::Gateway` is the documented public alias (lib.rs:36).
        fn same_type<T>(_: std::marker::PhantomData<T>) {}
        same_type::<ReexportedGateway>(std::marker::PhantomData);
        same_type::<Gateway>(std::marker::PhantomData);
    }

    #[test]
    fn refuses_non_loopback_addresses_with_invalid_input() {
        for address in ["0.0.0.0:8080", "192.168.1.10:8080", "10.0.0.1:1"] {
            let error = bind(address)
                .err()
                .unwrap_or_else(|| panic!("{address} must be refused"));
            assert_eq!(error.kind(), std::io::ErrorKind::InvalidInput, "{address}");
            assert_eq!(
                error.to_string(),
                "migration gateway requires loopback",
                "{address}"
            );
        }
    }

    #[test]
    fn binds_loopback_ephemeral_port_and_reports_the_real_address() {
        let gateway = bind("127.0.0.1:0").expect("loopback bind must succeed");
        let actual = gateway
            .local_addr()
            .expect("listener must report an address");
        assert!(actual.ip().is_loopback(), "{actual}");
        assert_eq!(actual.ip().to_string(), "127.0.0.1");
        assert_ne!(
            actual.port(),
            0,
            "ephemeral port must be resolved: {actual}"
        );
    }

    #[test]
    fn ipv6_loopback_is_allowed_while_routable_ipv4_is_not() {
        let gateway = bind("[::1]:0").expect("IPv6 loopback must be accepted");
        let actual = gateway
            .local_addr()
            .expect("listener must report an address");
        assert!(actual.is_ipv6(), "{actual}");
        assert!(actual.ip().is_loopback(), "{actual}");

        let refused = bind("172.16.0.5:9000")
            .err()
            .expect("routable IPv4 must be refused");
        assert_eq!(refused.kind(), std::io::ErrorKind::InvalidInput);
    }
}

// ---------------------------------------------------------------------------
// packages/gateway/src/lib/network-scan.ts -> src/network_scan.rs
// ---------------------------------------------------------------------------
mod network_scan_ts {
    use jait_gateway::network_scan::{
        LocalIpv4Interface, build_subnet_candidates, get_local_subnets, normalize_ips,
        normalize_subnet_prefix,
    };

    #[test]
    fn normalize_subnet_prefix_accepts_cidr_full_address_and_bare_prefix() {
        assert_eq!(
            normalize_subnet_prefix("192.168.1.5/24").as_deref(),
            Some("192.168.1")
        );
        assert_eq!(
            normalize_subnet_prefix("  192.168.1.5  ").as_deref(),
            Some("192.168.1")
        );
        assert_eq!(normalize_subnet_prefix("10.0.7").as_deref(), Some("10.0.7"));
        assert_eq!(
            normalize_subnet_prefix("172.16.4.0/24").as_deref(),
            Some("172.16.4")
        );

        // Out-of-range octets and wrong CIDR widths are rejected outright.
        assert_eq!(normalize_subnet_prefix("999.1.1.1"), None);
        assert_eq!(normalize_subnet_prefix("192.168.1.5/16"), None);
        assert_eq!(normalize_subnet_prefix("192.168.256"), None);
        assert_eq!(normalize_subnet_prefix("not-a-subnet"), None);
        assert_eq!(normalize_subnet_prefix(""), None);
    }

    #[test]
    fn normalize_ips_trims_filters_and_dedupes_preserving_order() {
        let input: Vec<String> = [
            " 10.0.0.2 ",
            "10.0.0.2",
            "bad",
            "",
            "10.0.0.10",
            "10.0.0.256",
            " 192.168.1.1",
        ]
        .iter()
        .map(|value| (*value).to_string())
        .collect();
        assert_eq!(
            normalize_ips(&input),
            vec!["10.0.0.2", "10.0.0.10", "192.168.1.1"]
        );
        assert!(normalize_ips(&[]).is_empty());
    }

    #[test]
    fn get_local_subnets_skips_internal_and_link_local_interfaces() {
        let interfaces = vec![
            LocalIpv4Interface {
                address: "192.168.1.42".into(),
                internal: false,
            },
            LocalIpv4Interface {
                address: "192.168.1.99".into(),
                internal: false,
            },
            LocalIpv4Interface {
                address: "127.0.0.1".into(),
                internal: true,
            },
            LocalIpv4Interface {
                address: "169.254.3.4".into(),
                internal: false,
            },
            LocalIpv4Interface {
                address: "10.20.30.40".into(),
                internal: false,
            },
        ];
        // /24 prefixes, first-seen order, deduplicated; internal and link-local dropped.
        assert_eq!(
            get_local_subnets(&interfaces),
            vec!["192.168.1", "10.20.30"]
        );
        assert!(get_local_subnets(&[]).is_empty());
    }

    #[test]
    fn build_subnet_candidates_sweeps_hosts_then_appends_local_addresses() {
        let candidates = build_subnet_candidates(&["192.168.1".to_string()], &[]);
        assert_eq!(
            candidates.len(),
            254,
            "1..=254 hosts, network/broadcast excluded"
        );
        assert_eq!(candidates.first().map(String::as_str), Some("192.168.1.1"));
        assert_eq!(candidates.last().map(String::as_str), Some("192.168.1.254"));

        let interfaces = vec![
            LocalIpv4Interface {
                address: "10.20.30.40".into(),
                internal: false,
            },
            LocalIpv4Interface {
                address: "192.168.1.7".into(),
                internal: false,
            },
            LocalIpv4Interface {
                address: "127.0.0.1".into(),
                internal: true,
            },
            LocalIpv4Interface {
                address: "169.254.1.1".into(),
                internal: false,
            },
        ];
        let with_locals = build_subnet_candidates(&["192.168.1".to_string()], &interfaces);
        assert_eq!(
            with_locals.len(),
            255,
            "only the routable local address is appended"
        );
        assert_eq!(with_locals.last().map(String::as_str), Some("10.20.30.40"));
        assert!(
            !with_locals.iter().any(|ip| ip == "127.0.0.1"),
            "internal ifaces skipped"
        );
        assert!(
            !with_locals.iter().any(|ip| ip == "169.254.1.1"),
            "link-local ifaces skipped"
        );
        assert_eq!(
            with_locals.iter().filter(|ip| *ip == "192.168.1.7").count(),
            1,
            "already-swept local address is not duplicated"
        );
    }
}
