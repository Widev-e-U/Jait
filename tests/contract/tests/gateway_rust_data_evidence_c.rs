//! Contract tests for the native WhatsApp inbound normalisation and the native
//! SQLite/drizzle data layer.
//!
//! References:
//!   packages/gateway/src/channels/whatsapp/{messages,jid}.ts  (message -> InboundMessage)
//!   packages/gateway/src/db/{schema,migrations,sqlite-shim,index}.ts
//! Native:
//!   packages/gateway-rust/src/integrations/whatsapp.rs
//!   packages/gateway-rust/src/db/{schema,migrations,sqlite_shim,mod}.rs
//!
//! No network, no credentials: every case is a pure mapping/validation call or a
//! throw-away on-disk SQLite database under the OS temp dir.

use std::collections::HashSet;

use jait_gateway::integrations::whatsapp::{
    MessageKey, WhatsAppMessage, bare_jid, extract_text, message_to_inbound,
};
use serde_json::{Value, json};

fn message(
    key: MessageKey,
    push_name: Option<&str>,
    message: Value,
    ts: Option<f64>,
) -> WhatsAppMessage {
    WhatsAppMessage {
        key,
        push_name: push_name.map(str::to_owned),
        message,
        timestamp_seconds: ts,
    }
}

fn key(remote_jid: Option<&str>, from_me: bool, participant: Option<&str>) -> MessageKey {
    MessageKey {
        remote_jid: remote_jid.map(str::to_owned),
        from_me,
        participant: participant.map(str::to_owned),
        id: Some("3EB0".into()),
    }
}

mod whatsapp {
    use super::*;

    #[test]
    fn bare_jid_strips_device_suffix_and_server() {
        // TS `bareJid` splits on "@" then ":": the device id never leaks through.
        assert_eq!(
            bare_jid(Some("15551234567:12@s.whatsapp.net")),
            "15551234567"
        );
        assert_eq!(bare_jid(Some("15551234567@s.whatsapp.net")), "15551234567");
        assert_eq!(bare_jid(Some("1203630@g.us")), "1203630");
        // Boundary: no server part at all, and the absent-jid case.
        assert_eq!(bare_jid(Some("15551234567")), "15551234567");
        assert_eq!(bare_jid(None), "");
        assert_eq!(bare_jid(Some("")), "");
    }

    #[test]
    fn extract_text_walks_wrappers_and_preserves_long_text() {
        // Plain conversation text is returned verbatim, whitespace preserved.
        assert_eq!(
            extract_text(&json!({"conversation": "  hi there \n"})),
            "  hi there \n"
        );
        // Extended text, then image/video captions.
        assert_eq!(
            extract_text(&json!({"extendedTextMessage": {"text": "extended"}})),
            "extended"
        );
        assert_eq!(
            extract_text(&json!({"imageMessage": {"caption": "cap"}, "conversation": ""})),
            "cap"
        );
        // Ephemeral and view-once wrappers are unwrapped.
        assert_eq!(
            extract_text(&json!({"ephemeralMessage": {"message": {"conversation": "gone"}}})),
            "gone"
        );
        assert_eq!(
            extract_text(
                &json!({"viewOnceMessage": {"message": {"extendedTextMessage": {"text": "once"}}}})
            ),
            "once"
        );
        // The TypeScript extractor returns long text without truncation.
        let at_limit = "a".repeat(65_536);
        let over_limit = "a".repeat(65_537);
        assert_eq!(
            extract_text(&json!({"conversation": at_limit})).len(),
            65_536
        );
        assert_eq!(
            extract_text(&json!({"conversation": over_limit})).len(),
            65_537
        );
        // Error/refusal: no known text carrier.
        assert_eq!(extract_text(&json!({"stickerMessage": {"url": "x"}})), "");
        assert_eq!(extract_text(&Value::Null), "");
    }

    #[test]
    fn message_maps_to_inbound_message_fields() {
        let inbound = message_to_inbound(
            &message(
                key(
                    Some("15551234567@s.whatsapp.net"),
                    false,
                    Some("999@s.whatsapp.net"),
                ),
                Some("Ann"),
                json!({"conversation": "hello"}),
                Some(1_710_000_000.5),
            ),
            &HashSet::new(),
            42,
        )
        .expect("inbound message");

        assert_eq!(inbound.channel_id, "whatsapp");
        assert_eq!(inbound.conversation_id, "15551234567@s.whatsapp.net");
        assert_eq!(inbound.sender_id, "999@s.whatsapp.net");
        assert_eq!(inbound.sender_name.as_deref(), Some("Ann"));
        assert_eq!(inbound.text, "hello");
        assert_eq!(inbound.timestamp, 1_710_000_000_500.0);
        assert!(!inbound.from_me);
        assert!(!inbound.is_self_chat);
    }

    #[test]
    fn message_defaults_participant_timestamp_and_self_chat() {
        // No participant => the conversation is the sender; no timestamp => `now`;
        // a bare jid present in the self set marks a self-chat.
        let self_bares: HashSet<String> = ["15551234567".to_owned()].into_iter().collect();
        let inbound = message_to_inbound(
            &message(
                key(Some("15551234567@s.whatsapp.net"), true, None),
                None,
                json!({"extendedTextMessage": {"text": "note to self"}}),
                None,
            ),
            &self_bares,
            1_700_000_000_000,
        )
        .expect("inbound message");

        assert_eq!(inbound.sender_id, "15551234567@s.whatsapp.net");
        assert_eq!(inbound.sender_name, None);
        assert_eq!(inbound.timestamp, 1_700_000_000_000.0);
        assert!(inbound.from_me);
        assert!(inbound.is_self_chat);
        // The wire form is the TS `InboundMessage`: camelCase keys, `senderName`
        // omitted entirely when absent.
        let wire = serde_json::to_value(&inbound).unwrap();
        let object = wire.as_object().expect("object");
        assert_eq!(object.len(), 7);
        assert_eq!(wire.get("senderName"), None);
        assert_eq!(
            wire.get("channelId").and_then(Value::as_str),
            Some("whatsapp")
        );
        assert_eq!(
            wire.get("conversationId").and_then(Value::as_str),
            Some("15551234567@s.whatsapp.net")
        );
        assert_eq!(
            wire.get("senderId").and_then(Value::as_str),
            Some("15551234567@s.whatsapp.net")
        );
        assert_eq!(
            wire.get("text").and_then(Value::as_str),
            Some("note to self")
        );
        assert_eq!(
            wire.get("timestamp").and_then(Value::as_f64),
            Some(1_700_000_000_000.0)
        );
        assert_eq!(wire.get("fromMe").and_then(Value::as_bool), Some(true));
        assert_eq!(wire.get("isSelfChat").and_then(Value::as_bool), Some(true));
    }

    #[test]
    fn message_refusals_match_reference_guards() {
        let empty = HashSet::new();
        // Status broadcasts are never inbound messages.
        assert!(
            message_to_inbound(
                &message(
                    key(Some("status@broadcast"), false, None),
                    None,
                    json!({"conversation": "x"}),
                    Some(1.0)
                ),
                &empty,
                0
            )
            .is_none()
        );
        // Missing / oversized conversation id.
        assert!(
            message_to_inbound(
                &message(
                    key(None, false, None),
                    None,
                    json!({"conversation": "x"}),
                    Some(1.0)
                ),
                &empty,
                0
            )
            .is_none()
        );
        let long_jid = format!("{}@s.whatsapp.net", "1".repeat(1024));
        assert!(
            message_to_inbound(
                &message(
                    key(Some(&long_jid), false, None),
                    None,
                    json!({"conversation": "x"}),
                    Some(1.0)
                ),
                &empty,
                0
            )
            .is_none()
        );
        // Whitespace-only text (js_trim) and a non-text payload.
        assert!(
            message_to_inbound(
                &message(
                    key(Some("1@s.whatsapp.net"), false, None),
                    None,
                    json!({"conversation": " \n\t\u{feff}"}),
                    Some(1.0)
                ),
                &empty,
                0
            )
            .is_none()
        );
        // push_name boundary: exactly 1024 bytes is accepted, 1025 is refused.
        let ok_name = "a".repeat(1024);
        assert!(
            message_to_inbound(
                &message(
                    key(Some("1@s.whatsapp.net"), false, None),
                    Some(&ok_name),
                    json!({"conversation": "x"}),
                    Some(1.0)
                ),
                &empty,
                0
            )
            .is_some()
        );
        let bad_name = "a".repeat(1025);
        assert!(
            message_to_inbound(
                &message(
                    key(Some("1@s.whatsapp.net"), false, None),
                    Some(&bad_name),
                    json!({"conversation": "x"}),
                    Some(1.0)
                ),
                &empty,
                0
            )
            .is_none()
        );
        // Oversized raw payload (> 262_144 serialised bytes).
        let huge = json!({"conversation": "x", "imageMessage": {"caption": "a".repeat(262_200)}});
        assert!(
            message_to_inbound(
                &message(
                    key(Some("1@s.whatsapp.net"), false, None),
                    None,
                    huge,
                    Some(1.0)
                ),
                &empty,
                0
            )
            .is_none()
        );
    }
}

mod db {
    use jait_gateway::db::schema::{
        TABLES, namespace_order, relational_config, table_by_name, table_by_var,
    };
    use jait_gateway::db::sqlite_shim::{
        Backend, BackendStatus, DrizzleSchemaConfig, NO_BACKEND_ERROR, TransactionMode,
    };
    use jait_gateway::db::{
        apply_migrations_through, migrate_database, migration_inventory, open_database,
        schema_version, verify_schema,
    };
    use std::path::PathBuf;

    fn temp_db(tag: &str) -> PathBuf {
        let mut path = std::env::temp_dir();
        path.push(format!(
            "jait-contract-{tag}-{}-{}.sqlite",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let _ = std::fs::remove_file(&path);
        path
    }

    #[test]
    fn namespace_order_matches_declared_tables() {
        // TS: drizzle's namespace is every exported table, keyed by export name.
        let ordered = namespace_order();
        assert_eq!(ordered.len(), TABLES.len());
        let mut vars: Vec<&str> = ordered.iter().map(|table| table.var).collect();
        let mut sorted = vars.clone();
        sorted.sort_by(|a, b| a.as_bytes().cmp(b.as_bytes()));
        assert_eq!(vars, sorted, "namespace order is export-name sorted");
        vars.dedup();
        assert_eq!(vars.len(), TABLES.len(), "export names are unique");

        // Lookups accept the module export name, not the SQL name.
        for table in ordered {
            assert_eq!(table_by_var(table.var).map(|t| t.name), Some(table.name));
            assert_eq!(table_by_name(table.name).map(|t| t.var), Some(table.var));
            assert!(!table.columns.is_empty(), "{} has columns", table.name);
            for column in table.columns {
                assert!(!column.key.is_empty() && !column.name.is_empty());
            }
        }
        assert_eq!(
            table_by_name("sessions").map(|t| (t.var, t.name)),
            Some(("sessions", "sessions"))
        );
    }

    #[test]
    fn drizzle_schema_config_is_derived_from_the_schema() {
        let config = DrizzleSchemaConfig::from_schema();
        assert_eq!(config.full_schema.len(), TABLES.len());
        assert_eq!(config.schema.len(), TABLES.len());
        assert_eq!(config.table_names_map.len(), TABLES.len());

        // `schemaConfig.schema[name]` is keyed by tsName and carries dbName + pk.
        for table in &config.full_schema {
            let entry = config
                .table(table.var)
                .unwrap_or_else(|| panic!("missing {}", table.var));
            assert_eq!(entry.ts_name, table.var);
            assert_eq!(entry.db_name, table.name);
            assert_eq!(entry.columns.len(), table.columns.len());
            assert_eq!(config.ts_name_for_db_name(table.name), Some(table.var));
            for column in &entry.primary_key {
                assert!(table.columns.iter().any(|c| c.key == column.key));
            }
        }
        let relational = relational_config();
        assert_eq!(relational.tables.len(), TABLES.len());
        // Unknown names resolve to nothing (drizzle returns undefined).
        assert!(config.table("not_a_table").is_none());
        assert!(config.ts_name_for_db_name("not_a_table").is_none());
        assert!(table_by_var("notATable").is_none());
    }

    #[test]
    fn migration_inventory_is_sequential_and_named() {
        let inventory = migration_inventory();
        assert_eq!(inventory.len(), 77);
        let first = inventory
            .first()
            .map(|(id, name)| (*id as u64, name.to_string()));
        assert_eq!(first, Some((1, "baseline_schema".to_owned())));
        let last = inventory
            .last()
            .map(|(id, name)| (*id as u64, name.to_string()));
        assert_eq!(last, Some((77, "github_intake_observation".to_owned())));
        let third = inventory
            .get(2)
            .map(|(id, name)| (*id as u64, name.to_string()));
        assert_eq!(third, Some((3, "user_settings_disabled_tools".to_owned())));
        for (index, (id, name)) in inventory.iter().enumerate() {
            assert_eq!(*id as u64, index as u64 + 1, "ids are 1..=77 in order");
            assert!(!name.is_empty());
            assert!(
                name.chars()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_'),
                "{name} is a snake_case migration name"
            );
        }
    }

    #[test]
    fn migrate_from_empty_database_reaches_latest_version() {
        let path = temp_db("migrate");
        let connection = open_database(&path).expect("open empty database");
        // Fresh database: nothing applied yet.
        assert_eq!(schema_version(&connection), 0);
        migrate_database(&connection).expect("migrate");
        assert_eq!(schema_version(&connection), 77);
        verify_schema(&connection).expect("verify schema after full migration");
        // Idempotent: a second full migration is a no-op.
        migrate_database(&connection).expect("re-migrate");
        assert_eq!(schema_version(&connection), 77);
        drop(connection);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn apply_migrations_through_stops_at_the_requested_version() {
        let path = temp_db("partial");
        let connection = open_database(&path).expect("open empty database");
        apply_migrations_through(&connection, 3).expect("migrate through 3");
        assert_eq!(schema_version(&connection), 3);
        // Resuming finishes the remaining migrations.
        migrate_database(&connection).expect("finish migrations");
        assert_eq!(schema_version(&connection), 77);
        drop(connection);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn sqlite_backend_and_transaction_mode_wire_names() {
        assert_eq!(Backend::BunSqlite.name(), "bun:sqlite");
        assert_eq!(Backend::NodeSqlite.name(), "node:sqlite");
        assert_eq!(Backend::BetterSqlite3.name(), "better-sqlite3");
        // `export let sqliteBackend = "better-sqlite3"` is the module initial value.
        let status = BackendStatus::new();
        assert_eq!(status.get(), Backend::BetterSqlite3);
        assert_eq!(status.name(), "better-sqlite3");

        assert_eq!(TransactionMode::Deferred.sql(), "DEFERRED");
        assert_eq!(TransactionMode::Immediate.sql(), "IMMEDIATE");
        assert_eq!(TransactionMode::Exclusive.sql(), "EXCLUSIVE");

        assert!(NO_BACKEND_ERROR.starts_with("No SQLite backend available."));
        assert!(NO_BACKEND_ERROR.contains("node:sqlite"));
        assert!(NO_BACKEND_ERROR.contains("npm install better-sqlite3"));
    }

    #[test]
    fn open_database_creates_the_file_on_disk() {
        let path = temp_db("open");
        assert!(!path.exists());
        let connection = open_database(&path).expect("open");
        assert!(path.exists(), "open_database creates the database file");
        // A second handle on the same file works and still reports version 0.
        let again = open_database(&path).expect("reopen");
        assert_eq!(schema_version(&again), 0);
        drop(again);
        drop(connection);
        let _ = std::fs::remove_file(&path);
    }
}
