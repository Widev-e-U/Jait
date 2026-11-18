//! Consumer-level contract tests for migrated TS gateway services, exercising the
//! native Rust implementations in `jait-gateway` against semantics read from
//! `packages/gateway/src/services/*.ts`.

use serde_json::{Value, json};

mod thread_router {
    use super::*;
    use jait_gateway::services::thread_router::{
        RoutingPlan, RoutingSkill, classify_intent, format_routing_plan_for_prompt, match_skills,
        route_thread,
    };

    fn skill(id: &str, name: &str, description: &str) -> RoutingSkill {
        RoutingSkill {
            id: id.into(),
            name: name.into(),
            description: description.into(),
        }
    }

    // TS: classifyIntent scores SIGNALS (regex weight per intent) and returns
    // [bestIntent, Math.min(score/total, 1)]; ties resolve to the earlier signal
    // because the update is strictly `score > bestScore`, and an all-zero scan
    // returns ["general", 0.3].
    #[test]
    fn classify_intent_matches_signal_weights() {
        // debugging: "fix" (1.2) + "crash" (1.2) = 2.4 of total 2.4 -> confidence 1.0
        assert_eq!(
            classify_intent("fix the crash"),
            ("debugging".into(), 1.0),
            "debugging keywords must win outright"
        );
        // coding "add" = 1.0 and data "chart" = 1.0 tie; SIGNALS order puts
        // coding before data, so coding is kept and confidence is 1.0/2.0.
        assert_eq!(
            classify_intent("add a chart"),
            ("coding".into(), 0.5),
            "equal scores keep the earlier signal"
        );
        assert_eq!(
            classify_intent("hello there"),
            ("general".into(), 0.3),
            "no signals -> general with the fixed 0.3 confidence"
        );
    }

    #[test]
    fn classify_intent_ignores_embedded_substrings() {
        // Word-boundary regexes must not fire on substrings ("crashed" != \bcrash\b).
        assert_eq!(classify_intent("crashed").0, "general");
        // Confidence is capped at 1 even when a single intent repeats.
        let (intent, confidence) = classify_intent("crash crash crash crash");
        assert_eq!(intent, "debugging");
        assert_eq!(confidence, 1.0);
    }

    // TS: matchSkills puts explicit `/skill-name` invocations first, scrubs file
    // paths, scores description word overlap (+2 per name word), keeps score>=2
    // and appends at most the top 2 auto matches.
    #[test]
    fn match_skills_explicit_invocations_precede_auto_matches() {
        let skills = vec![
            skill("s-hi", "Kubernetes Deploy", "deploy kubernetes clusters"),
            skill("s-mid", "Deploy Clusters", "deploy clusters"),
            skill("b-two", "Release Notes", "release notes drafting"),
        ];
        let matched = match_skills("/b-two deploy kubernetes clusters", &skills);
        assert_eq!(
            matched,
            vec!["b-two".to_string(), "s-hi".to_string(), "s-mid".to_string()],
            "explicit id first, then auto matches ordered by score"
        );
    }

    #[test]
    fn match_skills_caps_auto_matches_at_two() {
        let skills = vec![
            skill("s-hi", "Kubernetes Deploy", "deploy kubernetes clusters"),
            skill("s-mid", "Deploy Clusters", "deploy clusters"),
            skill("s-low", "Notes Here", "deploy clusters"),
        ];
        // s-hi: 2 name hits*2 + 1 description hit = 5
        // s-mid: 2 name hits*2 + 0 description hits = 4
        // s-low: 0 name hits + 2 description hits = 2
        let matched = match_skills("deploy kubernetes clusters", &skills);
        assert_eq!(matched, vec!["s-hi".to_string(), "s-mid".to_string()]);
        assert!(
            !matched.contains(&"s-low".to_string()),
            "third best auto match must be dropped by the take(2) cap"
        );
    }

    #[test]
    fn match_skills_scrubs_paths_and_requires_threshold() {
        let skills = vec![skill("reader", "Config Reader", "read config json app")];
        // Paths are stripped before scoring, so nothing reaches the score>=2 bar.
        assert!(match_skills("read /home/user/app.ts please", &skills).is_empty());
        // The same words without a path do reach the threshold (3 hits).
        assert_eq!(
            match_skills("read config json app", &skills),
            vec!["reader".to_string()]
        );
    }

    // TS: routeThread de-dupes pinned ids (new Set), classifies, detects topology
    // (delegation short-circuits to "single"), and composes the reason string.
    #[test]
    fn route_thread_dedups_pinned_skills_and_builds_reason() {
        let skills = vec![skill("docs-writer", "Docs Writer", "writes documentation")];
        let plan = route_thread(
            "fix the crash",
            &skills,
            &["docs-writer".to_string(), "docs-writer".to_string()],
            false,
            "2024-05-01T10:00:00.000Z".to_string(),
        );
        assert_eq!(plan.intent, "debugging");
        assert_eq!(plan.suggested_skill_ids, vec!["docs-writer".to_string()]);
        assert_eq!(
            plan.reason,
            "Classified as debugging/troubleshooting. Auto-activated skills: Docs Writer."
        );
        assert_eq!(plan.topology, "single");
        assert_eq!(plan.subtasks, None);
        assert_eq!(plan.routed_at, "2024-05-01T10:00:00.000Z");
    }

    #[test]
    fn route_thread_delegates_three_item_lists_for_coding() {
        let skills: Vec<RoutingSkill> = vec![];
        let message = "write the parser\n- tokenize input\n- build the AST\n- emit code";
        let plan = route_thread(
            message,
            &skills,
            &[],
            false,
            "2024-05-01T10:00:00.000Z".to_string(),
        );
        assert_eq!(plan.intent, "coding");
        assert_eq!(plan.topology, "delegated");
        assert_eq!(
            plan.subtasks,
            Some(vec![
                "tokenize input".to_string(),
                "build the AST".to_string(),
                "emit code".to_string()
            ])
        );
        assert_eq!(
            plan.reason,
            "Classified as code implementation. Task has separable subtasks — helper threads recommended."
        );
    }

    #[test]
    fn route_thread_keeps_two_item_lists_single_and_honours_delegation_flag() {
        let skills: Vec<RoutingSkill> = vec![];
        let two_items = "write the parser\n- tokenize input\n- build the AST";
        let plan = route_thread(two_items, &skills, &[], false, "t0".to_string());
        assert_eq!(plan.topology, "single");
        assert_eq!(plan.subtasks, None);

        // An explicit delegation request forces single-threaded planning.
        let forced = route_thread(
            "write the parser\n- tokenize input\n- build the AST\n- emit code",
            &skills,
            &[],
            true,
            "t0".to_string(),
        );
        assert_eq!(forced.topology, "single");
        assert_eq!(forced.subtasks, None);
        assert_eq!(forced.reason, "Classified as code implementation.");
    }

    // TS: formatRoutingPlanForPrompt short-circuits short non-delegated plans and
    // otherwise emits the full phase list.
    #[test]
    fn format_routing_plan_short_circuits_short_messages() {
        let plan = RoutingPlan {
            intent: "coding".into(),
            reason: "Classified as code implementation.".into(),
            suggested_skill_ids: vec![],
            topology: "single".into(),
            subtasks: None,
            routed_at: "t0".into(),
        };
        assert_eq!(
            format_routing_plan_for_prompt(&plan, Some(10)),
            "<orchestration>\nClassification: coding — Classified as code implementation.\n\n\
This looks like a straightforward task. Proceed directly — read the relevant code, make the change, and verify it compiles.\n\
</orchestration>"
        );
        let long = format_routing_plan_for_prompt(&plan, Some(500));
        assert!(long.contains("You MUST follow this problem-solving process:"));
        assert!(long.contains("Phase 1: "));
        assert!(!long.contains("This looks like a straightforward task"));
    }
}

mod preview_runner {
    use super::*;
    use jait_gateway::services::preview_runner::{
        PackageManager, ProjectSnapshot, detect_framework, detect_package_manager,
        detect_preview_command, normalize_target_url, resolve_preview_project,
    };
    use std::collections::HashSet;
    use std::path::PathBuf;

    fn snapshot(root: &str, package: Option<Value>, files: &[&str]) -> ProjectSnapshot {
        ProjectSnapshot {
            root: PathBuf::from(root),
            package,
            files: files
                .iter()
                .map(|f| (*f).to_string())
                .collect::<HashSet<_>>(),
            ancestor_locks: vec![],
            applications: vec![],
        }
    }

    // TS detectPackageManager: bun.lock/bun.lockb -> bun, pnpm-lock.yaml -> pnpm,
    // package-lock.json -> npm, otherwise npm; nearest scope wins.
    #[test]
    fn detect_package_manager_prefers_nearest_lockfile() {
        assert_eq!(
            detect_package_manager(&snapshot("/a", None, &["pnpm-lock.yaml", "bun.lockb"])),
            PackageManager::Bun
        );
        assert_eq!(
            detect_package_manager(&snapshot(
                "/a",
                None,
                &["package-lock.json", "pnpm-lock.yaml"]
            )),
            PackageManager::Pnpm
        );
        assert_eq!(
            detect_package_manager(&snapshot("/a", None, &["package-lock.json"])),
            PackageManager::Npm
        );
        assert_eq!(
            detect_package_manager(&snapshot("/a", None, &[])),
            PackageManager::Npm,
            "no lockfile falls back to npm"
        );
    }

    // TS detectFramework: hint beats config file beats dependency, and the
    // likelyPort is 5173 for vite, 4321 for astro, 3000 otherwise.
    #[test]
    fn detect_framework_orders_hint_config_and_dependencies() {
        let hinted = detect_framework(
            &snapshot("/a", Some(json!({"dependencies": {"astro": "^4"}})), &[]),
            Some("NextJS"),
        )
        .expect("hint nextjs must resolve");
        assert_eq!(hinted.name, "next");
        assert_eq!(hinted.dev_command, "npm exec -- next dev");
        assert_eq!(hinted.likely_port, 3000);

        let config = detect_framework(&snapshot("/a", None, &["astro.config.mjs"]), None)
            .expect("config file must resolve");
        assert_eq!(config.name, "astro");
        assert_eq!(config.likely_port, 4321);
        assert_eq!(config.dev_command, "npm exec -- astro dev");

        let dep = detect_framework(
            &snapshot("/a", Some(json!({"devDependencies": {"vite": "^5"}})), &[]),
            None,
        )
        .expect("dependency must resolve");
        assert_eq!(dep.name, "vite");
        assert_eq!(dep.likely_port, 5173);
        assert_eq!(dep.dev_command, "npm exec -- vite");

        assert_eq!(detect_framework(&snapshot("/a", None, &[]), None), None);
    }

    // TS detectPreviewCommand: requested command wins verbatim (trimmed), then
    // framework-specific exec, then preview/dev scripts, else throws.
    #[test]
    fn detect_preview_command_prefers_requested_and_framework_commands() {
        let vite = snapshot(
            "/a",
            Some(json!({"dependencies": {"vite": "^5"}, "scripts": {"dev": "vite"}})),
            &["bun.lock"],
        );
        assert_eq!(
            detect_preview_command(&vite, Some("  bun run custom  "), 5173, None).unwrap(),
            "bun run custom"
        );
        assert_eq!(
            detect_preview_command(&vite, None, 5173, None).unwrap(),
            "bun run vite --host 0.0.0.0 --port 5173"
        );
        assert_eq!(
            detect_preview_command(&vite, None, 4000, Some("vite")).unwrap(),
            "bun run vite --host 0.0.0.0 --port 4000"
        );
    }

    #[test]
    fn detect_preview_command_falls_back_to_scripts_and_errors() {
        let preview = snapshot("/a", Some(json!({"scripts": {"preview": "serve"}})), &[]);
        assert_eq!(
            detect_preview_command(&preview, None, 4173, None).unwrap(),
            "npm run preview -- --host 0.0.0.0 --port 4173"
        );
        let dev = snapshot("/a", Some(json!({"scripts": {"dev": "serve"}})), &[]);
        assert_eq!(
            detect_preview_command(&dev, None, 4173, None).unwrap(),
            "npm run dev"
        );
        assert_eq!(
            detect_preview_command(&snapshot("/a", None, &[]), None, 4173, None).unwrap_err(),
            "No package.json found and no preview command was provided."
        );
        assert_eq!(
            detect_preview_command(
                &snapshot("/a", Some(json!({"scripts": {"build": "tsc"}})), &[]),
                None,
                4173,
                None
            )
            .unwrap_err(),
            "Unable to detect a preview command. Provide one explicitly."
        );
    }

    // TS resolvePreviewProjectRoot: only workspace roots with a framework plus a
    // dev script are candidates; one wins, many is an error, none is the root.
    #[test]
    fn resolve_preview_project_selects_single_frontend_app() {
        let mut root = snapshot(
            "/repo",
            Some(json!({"workspaces": ["apps/*"], "scripts": {"dev": "turbo dev"}})),
            &[],
        );
        root.applications = vec![
            snapshot(
                "/repo/apps/web",
                Some(json!({"dependencies": {"vite": "^5"}, "scripts": {"dev": "vite"}})),
                &[],
            ),
            snapshot(
                "/repo/apps/api",
                Some(json!({"dependencies": {"express": "^4"}, "scripts": {"dev": "node ."}})),
                &[],
            ),
        ];
        let selected = resolve_preview_project(&root).expect("single app must resolve");
        assert_eq!(selected.root, PathBuf::from("/repo/apps/web"));
    }

    #[test]
    fn resolve_preview_project_reports_ambiguous_and_non_workspace_roots() {
        let mut root = snapshot(
            "/repo",
            Some(json!({"workspaces": ["apps/*"], "scripts": {"dev": "turbo dev"}})),
            &[],
        );
        root.applications = vec![
            snapshot(
                "/repo/apps/web",
                Some(json!({"dependencies": {"vite": "^5"}, "scripts": {"dev": "vite"}})),
                &[],
            ),
            snapshot(
                "/repo/apps/docs",
                Some(json!({"dependencies": {"next": "^14"}, "scripts": {"dev": "next dev"}})),
                &[],
            ),
        ];
        assert_eq!(
            resolve_preview_project(&root).unwrap_err(),
            "Multiple frontend apps found: /repo/apps/web, /repo/apps/docs. Set projectRoot to the app to preview."
        );
        // Workspaces without a framework at the root and no candidates -> root.
        root.applications.clear();
        assert_eq!(
            resolve_preview_project(&root).unwrap().root,
            PathBuf::from("/repo")
        );
        // A root that already has a framework never looks at apps/*.
        let standalone = snapshot("/solo", Some(json!({"dependencies": {"vite": "^5"}})), &[]);
        assert_eq!(
            resolve_preview_project(&standalone).unwrap().root,
            PathBuf::from("/solo")
        );
    }

    // TS normalizeTargetUrl: empty -> default URL with trailing slash, all digits
    // -> loopback port, host:port -> http scheme, fragment dropped.
    #[test]
    fn normalize_target_url_builds_loopback_and_schemeless_targets() {
        assert_eq!(
            normalize_target_url("", 4000).unwrap().as_str(),
            "http://127.0.0.1:4000/"
        );
        assert_eq!(
            normalize_target_url("5173", 4000).unwrap().as_str(),
            "http://127.0.0.1:5173/"
        );
        assert_eq!(
            normalize_target_url("localhost:5173", 4000)
                .unwrap()
                .as_str(),
            "http://localhost:5173/"
        );
        assert_eq!(
            normalize_target_url("http://localhost:5173/app#frag", 4000)
                .unwrap()
                .as_str(),
            "http://localhost:5173/app"
        );
    }

    // TS normalizeTargetUrl keeps an http(s) URL it cannot parse as loopback
    // fallback; the native helper instead reports the malformed target.
    #[test]
    fn normalize_target_url_rejects_malformed_input_and_keeps_paths() {
        assert_eq!(
            normalize_target_url("not a url", 4000).unwrap_err(),
            "Invalid preview URL"
        );
        assert_eq!(
            normalize_target_url("127.0.0.1:5173/app", 4000)
                .unwrap()
                .as_str(),
            "http://127.0.0.1:5173/app"
        );
    }
}

mod database_retention {
    use super::*;
    use chrono::{DateTime, Utc};
    use jait_gateway::db::worker::DatabaseWorker;
    use jait_gateway::services::database_retention::{
        DatabaseRetentionPolicy, DatabaseRetentionService,
    };
    use std::collections::BTreeMap;
    use std::num::NonZeroU16;

    fn service(policy: DatabaseRetentionPolicy) -> DatabaseRetentionService {
        let conn = rusqlite::Connection::open_in_memory().expect("in-memory db");
        let worker = DatabaseWorker::new(conn, NonZeroU16::new(2).unwrap()).expect("worker");
        DatabaseRetentionService::new(worker, policy)
    }

    fn at(value: &str) -> DateTime<Utc> {
        value.parse().expect("timestamp")
    }

    // TS loadDatabaseRetentionPolicy: every knob is env-driven with a fixed
    // default, and `0`/garbage for a day count means "disabled" (null).
    #[test]
    fn policy_env_overrides_match_typescript_defaults() {
        let defaults = DatabaseRetentionPolicy::from_env(&BTreeMap::new());
        assert_eq!(defaults.context_flow_days, Some(90));
        assert_eq!(defaults.tool_detail_days, Some(90));
        assert_eq!(defaults.transient_activity_days, Some(14));
        assert_eq!(defaults.audit_payload_days, Some(90));
        assert_eq!(defaults.audit_row_days, None);
        assert_eq!(defaults.stale_session_days, Some(30));
        assert_eq!(defaults.batch_size, 100);
        assert_eq!(defaults.max_batches_per_run, 20);
        assert_eq!(defaults.initial_delay_ms, 300_000);
        assert_eq!(defaults.interval_ms, 86_400_000);
        assert!(defaults.enabled);
        assert!(defaults.search_index_cleanup_enabled);

        let mut env = BTreeMap::new();
        env.insert("JAIT_RETENTION_ENABLED".to_string(), "off".to_string());
        env.insert(
            "JAIT_SEARCH_INDEX_CLEANUP_ENABLED".to_string(),
            "yes".to_string(),
        );
        env.insert(
            "JAIT_RETENTION_CONTEXT_FLOW_DAYS".to_string(),
            "45".to_string(),
        );
        env.insert(
            "JAIT_RETENTION_TRANSIENT_ACTIVITY_DAYS".to_string(),
            "0".to_string(),
        );
        env.insert(
            "JAIT_RETENTION_AUDIT_ROW_DAYS".to_string(),
            "365".to_string(),
        );
        env.insert("JAIT_RETENTION_BATCH_SIZE".to_string(), "0".to_string());
        let custom = DatabaseRetentionPolicy::from_env(&env);
        assert!(!custom.enabled, "off disables retention");
        assert!(custom.search_index_cleanup_enabled);
        assert_eq!(custom.context_flow_days, Some(45));
        assert_eq!(
            custom.transient_activity_days, None,
            "0 days disables the tier instead of falling back to 14"
        );
        assert_eq!(custom.audit_row_days, Some(365));
        assert_eq!(custom.batch_size, 100, "0 is not a positive integer");
    }

    // TS buildRetentionPlan: each enabled day tier yields an ISO cutoff derived
    // from `now` minus N days; a disabled tier has no cutoff at all.
    #[test]
    fn plan_cutoffs_are_exact_and_skip_disabled_tiers() {
        let plan = service(DatabaseRetentionPolicy::default())
            .plan(at("2024-04-01T12:00:00Z"), None)
            .expect("plan");
        assert_eq!(
            plan.cutoffs["contextFlow"].as_deref(),
            Some("2024-01-02T12:00:00.000Z")
        );
        assert_eq!(
            plan.cutoffs["toolDetails"].as_deref(),
            Some("2024-01-02T12:00:00.000Z")
        );
        assert_eq!(
            plan.cutoffs["transientActivities"].as_deref(),
            Some("2024-03-18T12:00:00.000Z")
        );
        assert_eq!(
            plan.cutoffs["auditPayloads"].as_deref(),
            Some("2024-01-02T12:00:00.000Z")
        );
        assert_eq!(
            plan.cutoffs["staleSessions"].as_deref(),
            Some("2024-03-02T12:00:00.000Z")
        );
        assert_eq!(plan.cutoffs["auditRows"], None);
    }

    // TS step order is fixed and the search-index sweep always runs first, but
    // it reserves 10 batches so the table sweeps are never starved.
    #[test]
    fn plan_orders_steps_and_reserves_batches_for_search_cleanup() {
        let mut policy = DatabaseRetentionPolicy::default();
        policy.max_batches_per_run = 3;
        let plan = service(policy.clone())
            .plan(at("2024-04-01T12:00:00Z"), None)
            .unwrap();
        assert_eq!(plan.steps[0].candidate, "unsearchableFtsRows");
        assert_eq!(
            plan.steps[0].max_batches, 1,
            "3 - 10 saturates at the floor of 1 batch"
        );
        assert_eq!(plan.max_batches, 3);
        // Oversized-payload compaction probes one row at a time, bounded to two
        // batches so a huge payload cannot monopolise the run.
        assert_eq!(plan.steps[1].candidate, "oversizedContextFlows");
        assert_eq!(
            (plan.steps[1].batch_size, plan.steps[1].max_batches),
            (1, 2)
        );
        assert_eq!(plan.steps[2].candidate, "agedContextFlows");
        assert_eq!(
            (plan.steps[2].batch_size, plan.steps[2].max_batches),
            (1, 1),
            "aged-tier compaction rewrites one row per batch for exactly one batch"
        );
        assert!(!plan.steps.iter().any(|s| s.candidate.contains("auditRows")));
        // 90-day tiers: oversized sweep + aged sweep (+1 activity tier).
        let aged: Vec<&str> = plan
            .steps
            .iter()
            .filter(|s| s.cutoff.is_some())
            .map(|s| s.candidate.as_str())
            .collect();
        assert_eq!(
            aged,
            vec![
                "agedContextFlows",
                "agedToolCalls",
                "agedActivityPayloads",
                "transientActivities",
                "auditPayloads",
                "staleSessions"
            ]
        );
        assert_eq!(
            plan.steps[0].batch_size, 100,
            "search sweep honours batch size"
        );
    }

    // A disabled policy keeps only the (still enabled) search-index sweep, and
    // disabling both yields a no-op plan; batch size is clamped to 1000.
    #[test]
    fn plan_respects_disabled_policy_and_clamps_batch_size() {
        let mut policy = DatabaseRetentionPolicy::default();
        policy.enabled = false;
        policy.batch_size = 5_000;
        let plan = service(policy.clone())
            .plan(at("2024-04-01T12:00:00Z"), None)
            .unwrap();
        assert_eq!(plan.steps.len(), 1);
        assert_eq!(plan.steps[0].candidate, "unsearchableFtsRows");
        assert_eq!(plan.max_batches, 20);
        assert_eq!(
            plan.steps[0].max_batches, 20,
            "a disabled policy reserves no batches for the sweeps"
        );
        assert_eq!(plan.steps[0].batch_size, 1_000, "batch size clamps to 1000");

        policy.search_index_cleanup_enabled = false;
        let empty = service(policy)
            .plan(at("2024-04-01T12:00:00Z"), None)
            .unwrap();
        assert!(empty.steps.is_empty());
    }
}

mod primary_link {
    use super::*;
    use jait_gateway::services::primary_link::{
        FsPlatform, credential_path, detect_platform, encode_uri_component, redact_token, to_ws_url,
    };
    use std::path::{Path, PathBuf};

    // TS toWsUrl: https->wss, http->ws, bare host gets ws://, trailing slashes
    // are stripped and a truthy token is appended percent-encoded.
    #[test]
    fn to_ws_url_rewrites_schemes_and_appends_encoded_token() {
        assert_eq!(
            to_ws_url("https://gw.example.com/", None),
            "wss://gw.example.com"
        );
        assert_eq!(
            to_ws_url(" HTTP://gw.local:8787/// ", None),
            "ws://gw.local:8787"
        );
        assert_eq!(to_ws_url("gw.local:8787", None), "ws://gw.local:8787");
        assert_eq!(to_ws_url("wss://gw/edge/", None), "wss://gw/edge");
        assert_eq!(
            to_ws_url("https://gw.example.com/", Some("a b&c")),
            "wss://gw.example.com?token=a%20b%26c"
        );
        assert_eq!(
            to_ws_url("https://gw.example.com", Some("")),
            "wss://gw.example.com",
            "empty token is falsy in TS and adds no query"
        );
    }

    // TS connect(): `url.replace(/token=[^&]+/, "token=***")` — first hit only,
    // and an empty token value is left alone.
    #[test]
    fn redact_token_masks_only_the_first_token_value() {
        assert_eq!(
            redact_token("wss://gw?token=secret123&node=7"),
            "wss://gw?token=***&node=7"
        );
        assert_eq!(
            redact_token("wss://gw?token=a&token=b"),
            "wss://gw?token=***&token=b"
        );
        assert_eq!(redact_token("wss://gw?node=7"), "wss://gw?node=7");
        assert_eq!(redact_token("wss://gw?token="), "wss://gw?token=");
    }

    // TS credentialPath: sha256(primaryGateway) hex, first 24 chars, under
    // <state>/node-pairings/<key>.json.
    #[test]
    fn credential_path_hashes_the_gateway_url() {
        assert_eq!(
            credential_path(Path::new("/state"), "https://gw.example.com"),
            PathBuf::from("/state/node-pairings/fe7165f82036c7b243781ea4.json")
        );
        assert_eq!(
            credential_path(Path::new("/state"), "gw.local:8787"),
            PathBuf::from("/state/node-pairings/723b5db72d36fb1fff07b600.json")
        );
    }

    // TS encodeURIComponent leaves the unreserved set untouched and upper-cases
    // the percent escapes of everything else (UTF-8 aware).
    #[test]
    fn encode_uri_component_matches_javascript() {
        assert_eq!(encode_uri_component("a b&c/d?é"), "a%20b%26c%2Fd%3F%C3%A9");
        assert_eq!(encode_uri_component("AZaz09-_.!~*'()"), "AZaz09-_.!~*'()");
    }

    // TS detectPlatform maps process.platform into the three supported ids.
    #[test]
    fn detect_platform_maps_node_platform_names() {
        assert_eq!(detect_platform("win32").as_str(), "windows");
        assert_eq!(detect_platform("darwin").as_str(), "macos");
        assert_eq!(detect_platform("linux").as_str(), "linux");
        assert_eq!(
            detect_platform("freebsd").as_str(),
            "linux",
            "unknown platforms fall back to linux"
        );
        assert!(matches!(detect_platform("win32"), FsPlatform::Windows));
    }
}

mod disk_janitor {
    use super::*;
    use jait_gateway::services::disk_janitor::DiskJanitorPolicy;
    use std::collections::BTreeMap;

    const DAY: u64 = 86_400_000;

    fn env(pairs: &[(&str, &str)]) -> BTreeMap<String, String> {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect()
    }

    // TS loadDiskJanitorPolicy defaults: 2d worktree grace, 1d orphan grace,
    // branches preserved, 3d scratch, 1d sandbox disks, 2min then every 6h.
    #[test]
    fn policy_defaults_are_the_typescript_constants() {
        let policy = DiskJanitorPolicy::from_env(&BTreeMap::new());
        assert!(policy.enabled);
        assert!(policy.preserve_branches);
        assert_eq!(policy.worktree_grace_ms, 2 * DAY);
        assert_eq!(policy.orphan_worktree_grace_ms, DAY);
        assert_eq!(policy.temp_scratch_max_age_ms, 3 * DAY);
        assert_eq!(policy.sandbox_storage_max_age_ms, DAY);
        assert_eq!(policy.initial_delay_ms, 120_000);
        assert_eq!(policy.interval_ms, 21_600_000);
    }

    // Every knob is env-driven: booleans flip, day counts multiply by DAY_MS.
    #[test]
    fn policy_env_overrides_scale_days_into_milliseconds() {
        let policy = DiskJanitorPolicy::from_env(&env(&[
            ("JAIT_DISK_JANITOR_ENABLED", "false"),
            ("JAIT_JANITOR_PRESERVE_BRANCHES", "0"),
            ("JAIT_JANITOR_WORKTREE_GRACE_DAYS", "5"),
            ("JAIT_JANITOR_ORPHAN_WORKTREE_GRACE_DAYS", "3"),
            ("JAIT_JANITOR_TEMP_SCRATCH_DAYS", "10"),
            ("JAIT_JANITOR_SANDBOX_STORAGE_DAYS", "2"),
            ("JAIT_JANITOR_INITIAL_DELAY_MS", "1500"),
            ("JAIT_JANITOR_INTERVAL_MS", "60000"),
        ]));
        assert!(!policy.enabled);
        assert!(!policy.preserve_branches);
        assert_eq!(policy.worktree_grace_ms, 5 * DAY);
        assert_eq!(policy.orphan_worktree_grace_ms, 3 * DAY);
        assert_eq!(policy.temp_scratch_max_age_ms, 10 * DAY);
        assert_eq!(policy.sandbox_storage_max_age_ms, 2 * DAY);
        assert_eq!(policy.initial_delay_ms, 1_500);
        assert_eq!(policy.interval_ms, 60_000);
    }

    // TS parseDaysMs/parsePositiveInteger only accept strictly positive ints;
    // "0" and garbage fall back to the defaults instead of disabling cleanup.
    #[test]
    fn policy_rejects_non_positive_and_junk_overrides() {
        let policy = DiskJanitorPolicy::from_env(&env(&[
            ("JAIT_JANITOR_WORKTREE_GRACE_DAYS", "0"),
            ("JAIT_JANITOR_TEMP_SCRATCH_DAYS", "not-a-number"),
            ("JAIT_JANITOR_INITIAL_DELAY_MS", "0"),
            ("JAIT_JANITOR_INTERVAL_MS", "-5"),
        ]));
        assert_eq!(policy.worktree_grace_ms, 2 * DAY);
        assert_eq!(policy.temp_scratch_max_age_ms, 3 * DAY);
        assert_eq!(policy.initial_delay_ms, 120_000);
        assert_eq!(policy.interval_ms, 21_600_000);
        assert!(policy.enabled, "an invalid knob never disables the janitor");
    }
}

mod mobile_push {
    use super::*;
    use jait_gateway::services::mobile_push::{
        FirebaseServiceAccount, PushRegistration, attention_revoke_targets,
    };

    fn reg(device: &str) -> PushRegistration {
        PushRegistration {
            device_id: device.to_string(),
            user_id: "u1".to_string(),
            token: format!("tok-{device}"),
        }
    }

    // TS attentionRevokeTargets: the resolving device already dismissed its own
    // card locally, so it must never be re-targeted; everything else is kept in
    // order and an unknown/null resolver keeps every registration.
    #[test]
    fn attention_revoke_targets_skips_the_resolving_device() {
        let all = vec![reg("dev-1"), reg("dev-2"), reg("dev-3")];
        let targets = attention_revoke_targets(all.clone(), Some("dev-2"));
        let ids: Vec<&str> = targets.iter().map(|r| r.device_id.as_str()).collect();
        assert_eq!(ids, vec!["dev-1", "dev-3"]);

        let untouched = attention_revoke_targets(all.clone(), None);
        assert_eq!(untouched.len(), 3);

        let unknown = attention_revoke_targets(all, Some("dev-9"));
        let ids: Vec<&str> = unknown.iter().map(|r| r.device_id.as_str()).collect();
        assert_eq!(ids, vec!["dev-1", "dev-2", "dev-3"]);
    }

    // TS loadServiceAccount: JSON is camelCase, all three fields required, and
    // the whole value is trimmed before parsing; blanks are "not configured".
    #[test]
    fn firebase_service_account_requires_every_field() {
        // TS reads the Firebase snake_case keys (project_id, client_email, private_key).
        let raw = r#"{"project_id":"proj","client_email":"svc@proj.iam.gserviceaccount.com","private_key":"-----BEGIN PRIVATE KEY-----x"}"#;
        let account = FirebaseServiceAccount::from_environment_value(Some(raw)).expect("parsed");
        assert_eq!(account.project_id, "proj");
        assert_eq!(account.client_email, "svc@proj.iam.gserviceaccount.com");
        assert_eq!(account.private_key, "-----BEGIN PRIVATE KEY-----x");

        assert!(FirebaseServiceAccount::from_environment_value(None).is_none());
        assert!(FirebaseServiceAccount::from_environment_value(Some("   ")).is_none());
        assert!(
            FirebaseServiceAccount::from_environment_value(Some(
                r#"{"project_id":"proj","client_email":"svc@proj","private_key":""}"#
            ))
            .is_none(),
            "an empty private key means Firebase is unconfigured"
        );
        assert!(
            FirebaseServiceAccount::from_environment_value(Some(r#"{"project_id":"proj"}"#))
                .is_none(),
            "partial service accounts are rejected outright"
        );
    }

    #[test]
    fn firebase_service_account_trims_padding_and_requires_snake_case_keys() {
        let padded = "\n  {\"project_id\":\"p\",\"client_email\":\"e\",\"private_key\":\"k\"}  \n";
        assert!(FirebaseServiceAccount::from_environment_value(Some(padded)).is_some());
        assert!(
            FirebaseServiceAccount::from_environment_value(Some(
                r#"{"projectId":"p","clientEmail":"e","privateKey":"k"}"#
            ))
            .is_none(),
            "camelCase keys are not what Firebase ships, so TS would see missing fields"
        );
        assert!(FirebaseServiceAccount::from_environment_value(Some("not json")).is_none());
    }
}
