//! Consumer-level contract tests for the native Rust `tools` cluster.
//!
//! Every assertion below is derived from the TypeScript reference in
//! `packages/gateway/src/tools/<component>.ts` (returned shapes, ordering,
//! defaults, limits and refusal cases), not from the Rust implementation's
//! output.

use serde_json::json;

// ---------------------------------------------------------------------------
// packages/gateway/src/tools/terminal-tools.ts
// ---------------------------------------------------------------------------
mod terminal_tools {
    use super::json;
    use jait_gateway::tools::terminal_tools::*;

    /// TS `TRUNCATION_MARKER` text, 22 chars.
    const MARKER: &str = "\n…(middle truncated)…\n";

    #[test]
    fn constants_match_typescript_limits() {
        assert_eq!(MAX_TERMINAL_TOOL_OUTPUT_CHARS, 16_000);
        assert_eq!(MAX_TERMINAL_TOOL_LINE_CHARS, 2_000);
        assert_eq!(DEFAULT_COMMAND_TIMEOUT_MS, 3_600_000);
        assert_eq!(MAX_COMMAND_TIMEOUT_MS, 86_400_000);
        assert_eq!(DEFAULT_COMMAND_YIELD_MS, 10_000);
        assert_eq!(MARKER.chars().count(), 22);
    }

    #[test]
    fn truncate_middle_keeps_balanced_head_and_tail() {
        // 1000 chars, cycled "abcdefghij".
        let output = "abcdefghij".repeat(100);
        let out = truncate_middle_chars(&output, 100);

        // retained = 100 - 22 = 78 -> head 39, tail 39.
        let head = format!("{}{}", "abcdefghij".repeat(3), "abcdefghi");
        let tail = format!("{}{}", "bcdefghij", "abcdefghij".repeat(3));
        assert_eq!(head.chars().count(), 39);
        assert_eq!(tail.chars().count(), 39);
        assert_eq!(out, format!("{head}{MARKER}{tail}"));
        assert_eq!(out.chars().count(), 100);
    }

    #[test]
    fn truncate_middle_identity_and_zero_and_marker_boundaries() {
        let thirty = "012345678901234567890123456789"; // 30 chars
        // len <= max: untouched.
        assert_eq!(truncate_middle_chars(thirty, 30), thirty);
        assert_eq!(truncate_middle_chars(thirty, 31), thirty);
        // max == 0 -> empty.
        assert_eq!(truncate_middle_chars(thirty, 0), "");
        // max <= marker length -> plain prefix, no marker.
        assert_eq!(truncate_middle_chars(thirty, 5), "01234");
        assert_eq!(truncate_middle_chars(thirty, 22), &thirty[..22]);
        // max = marker + 1 -> head 1 char, empty tail.
        assert_eq!(
            truncate_middle_chars(thirty, 23),
            format!("0{MARKER}")
        );
    }

    #[test]
    fn truncate_middle_counts_chars_not_bytes() {
        let wide = "日本語あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほ"; // 33 chars
        assert_eq!(wide.chars().count(), 33);
        assert_eq!(wide.len(), 99); // 3 bytes per ideograph
        // max <= marker length -> plain prefix of N chars, no panic on multibyte.
        assert_eq!(truncate_middle_chars(wide, 4), "日本語あ");
        // len(33) <= max -> untouched.
        assert_eq!(truncate_middle_chars(wide, 33), wide);
        // max 28 -> retained 6, head 3 chars, tail 3 chars (char-based, not byte).
        assert_eq!(
            truncate_middle_chars(wide, 28),
            format!("日本語{MARKER}ふへほ")
        );
    }

    #[test]
    fn collapse_long_lines_truncates_with_head_tail_and_elision_count() {
        let long = "a".repeat(3_000);
        let out = collapse_long_terminal_lines(&long, 2_000, "");
        // head 700, tail 200, elided 3000-700-200 = 2100.
        assert_eq!(
            out,
            format!(
                "{}{}{}",
                "a".repeat(700),
                "…(line truncated: 2100 chars elided)…",
                "a".repeat(200)
            )
        );
        assert!(out.chars().count() < 3_000);
    }

    #[test]
    fn collapse_long_lines_boundaries_and_multiline_join() {
        let exact = "b".repeat(2_000);
        // line length == max -> untouched.
        assert_eq!(collapse_long_terminal_lines(&exact, 2_000, ""), exact);
        // max_line_chars == 0 -> untouched (documented early return).
        assert_eq!(collapse_long_terminal_lines("xyz", 0, ""), "xyz");
        // short lines preserved verbatim inside a multi-line payload.
        let payload = format!("{exact}\nshort\ntail");
        assert_eq!(collapse_long_terminal_lines(&payload, 2_000, ""), payload);
        // one over the limit collapses; elided = 2001 - 700 - 200.
        let over = "c".repeat(2_001);
        let out = collapse_long_terminal_lines(&over, 2_000, "|END");
        assert_eq!(
            out,
            format!(
                "{}{}{}",
                "c".repeat(700),
                "…(line truncated: 1101 chars elided)…|END",
                "c".repeat(200)
            )
        );
    }

    #[test]
    fn measure_output_counts_lines_and_longest_line() {
        assert_eq!(measure_terminal_output("a\nbb"), (4, 2, 2));
        assert_eq!(measure_terminal_output("abc"), (3, 1, 3));
        assert_eq!(measure_terminal_output(""), (0, 1, 0));
        // trailing newline opens a final empty line, as in the TS reducer.
        assert_eq!(measure_terminal_output("abc\n"), (4, 2, 3));
    }

    #[test]
    fn describe_output_flood_is_none_at_or_below_thresholds() {
        // total <= 60_000 and longest <= 5_000 -> no warning.
        assert_eq!(describe_terminal_output_flood(60_000, 10, 100), None);
        assert_eq!(describe_terminal_output_flood(8_000, 2, 5_000), None);
        assert_eq!(describe_terminal_output_flood(0, 1, 0), None);
    }

    #[test]
    fn describe_output_flood_reports_counts_with_thousands_separators() {
        let msg = describe_terminal_output_flood(60_001, 1_234, 100).unwrap();
        assert_eq!(
            msg,
            "output flood (60,001 chars, 1,234 lines) — scope the command with paths, --include/--exclude, or head/tail"
        );
        let long_line = describe_terminal_output_flood(100, 1, 5_001).unwrap();
        assert_eq!(
            long_line,
            "output flood (100 chars, 1 lines, longest line 5,001 chars) — that is a generated/minified or single-line file; narrow the command (paths, --include/--exclude, per-file head) or use the search/read tools instead of dumping it"
        );
    }

    #[test]
    fn resolve_command_timeout_defaults_clamps_and_ceils() {
        assert_eq!(resolve_command_timeout_ms(None), 3_600_000);
        assert_eq!(resolve_command_timeout_ms(Some(&json!(1_500))), 1_500);
        // non-integer requests round up.
        assert_eq!(resolve_command_timeout_ms(Some(&json!(1_000.4))), 1_001);
        // zero / negative / non-numeric fall back to the default.
        assert_eq!(resolve_command_timeout_ms(Some(&json!(0))), 3_600_000);
        assert_eq!(resolve_command_timeout_ms(Some(&json!(-5))), 3_600_000);
        assert_eq!(resolve_command_timeout_ms(Some(&json!("9000"))), 3_600_000);
        // capped at one day.
        assert_eq!(
            resolve_command_timeout_ms(Some(&json!(86_400_001u64))),
            86_400_000
        );
    }

    #[test]
    fn resolve_command_yield_defaults_and_clamps_to_timeout() {
        assert_eq!(resolve_command_yield_ms(None, 3_600_000), 10_000);
        // requested yield may not exceed the command timeout.
        assert_eq!(resolve_command_yield_ms(Some(&json!(50_000)), 5_000), 5_000);
        // yield is always >= 1 ms.
        assert_eq!(resolve_command_yield_ms(Some(&json!(0)), 10_000), 1);
        assert_eq!(resolve_command_yield_ms(Some(&json!(-3)), 10_000), 1);
        // non-numeric -> default, then clamped by a small timeout.
        assert_eq!(resolve_command_yield_ms(Some(&json!("soon")), 10_000), 10_000);
        assert_eq!(resolve_command_yield_ms(None, 500), 500);
    }

    #[test]
    fn truncate_terminal_tool_output_collapses_lines_before_middle_truncation() {
        // 100 chars stays byte-identical.
        let small = "x".repeat(100);
        assert_eq!(truncate_terminal_tool_output(&small, 16_000), small);

        let wide = "a".repeat(20_000);
        let out = truncate_terminal_tool_output(&wide, 16_000);
        // Collapsed first (700 head + marker + 200 tail = 1_000ish chars)...
        assert!(out.starts_with(&"a".repeat(700)));
        assert!(out.contains("…(line truncated: 19100 chars elided)…"));
        assert!(out.ends_with(&"a".repeat(200)));
        // ...and is far below the tool limit, so no middle marker.
        assert!(!out.contains(MARKER));
        assert!(out.chars().count() < 16_000);
    }
}

// ---------------------------------------------------------------------------
// packages/gateway/src/tools/ssh-tools.ts
// ---------------------------------------------------------------------------
mod ssh_tools {
    use jait_gateway::tools::ssh_tools::*;

    #[test]
    fn js_trim_matches_javascript_whitespace_set() {
        // JavaScript trim() strips the BOM and NBSP; Rust trim() does not.
        assert_eq!(js_trim("\u{feff} x \u{feff}"), "x");
        assert_eq!(js_trim("\u{a0}hi\u{a0}"), "hi");
        assert_eq!(js_trim("\t\n plain \r\n"), "plain");
        assert_eq!(js_trim(""), "");
    }

    #[test]
    fn shell_single_quote_escapes_embedded_quotes() {
        assert_eq!(shell_single_quote("abc"), "'abc'");
        assert_eq!(shell_single_quote(""), "''");
        assert_eq!(shell_single_quote("it's"), r"'it'\''s'");
        assert_eq!(shell_single_quote("two 'x' here"), r"'two '\''x'\'' here'");
    }

    #[test]
    fn build_sudo_command_includes_user_only_when_present() {
        assert_eq!(
            build_sudo_command("id", "__JAIT_SUDO__", None),
            "sudo -S -k -p '__JAIT_SUDO__' -- sh -lc 'id'"
        );
        assert_eq!(
            build_sudo_command("id -u", "__JAIT_SUDO__", Some("bob")),
            "sudo -S -k -p '__JAIT_SUDO__' -u 'bob' -- sh -lc 'id -u'"
        );
        // whitespace-only user is trimmed away (JS `??` + trim semantics).
        assert_eq!(
            build_sudo_command("id", "__JAIT_SUDO__", Some("   ")),
            "sudo -S -k -p '__JAIT_SUDO__' -- sh -lc 'id'"
        );
        // user is shell-quoted and trimmed.
        assert_eq!(
            build_sudo_command("id", "M", Some("  a b  ")),
            "sudo -S -k -p 'M' -u 'a b' -- sh -lc 'id'"
        );
    }

    #[test]
    fn strip_ansi_removes_csi_and_osc_sequences() {
        assert_eq!(strip_ansi("\u{1b}[31mred\u{1b}[0m"), "red");
        assert_eq!(strip_ansi("\u{1b}[1;32mok\u{1b}[m!"), "ok!");
        assert_eq!(strip_ansi("\u{1b}]0;window title\u{7}body"), "body");
        assert_eq!(strip_ansi("\u{1b}]8;;http://x\u{1b}\\link"), "link");
        assert_eq!(strip_ansi("plain"), "plain");
        // A lone ESC that is not a CSI/OSC introducer is preserved.
        assert_eq!(strip_ansi("a\u{1b}b"), "a\u{1b}b");
    }

    #[test]
    fn clean_output_drops_echoed_command_marker_and_carriage_returns() {
        assert_eq!(clean_output("echo hi\nresult", "echo hi", None), "result");
        assert_eq!(clean_output("out\r\n__DONE__\n", "run", Some("__DONE__")), "out");
        // empty after cleaning -> the TS sentinel, not an empty string.
        assert_eq!(clean_output("", "", None), "(no output)");
        assert_eq!(clean_output("echo hi", "echo hi", None), "(no output)");
        // ANSI colouring is removed before matching the echoed line.
        assert_eq!(
            clean_output("\u{1b}[33mls\u{1b}[0m\nfile.txt", " ls ", None),
            "file.txt"
        );
    }

    #[test]
    fn clean_output_keeps_tail_of_oversized_output() {
        let huge = "a".repeat(200_000 + 1);
        let out = clean_output(&huge, "", None);
        assert!(out.starts_with("…(truncated)\n"));
        assert_eq!(out.chars().count(), "…(truncated)\n".chars().count() + 200_000);
        // exactly at the limit is not truncated.
        let at_limit = "a".repeat(200_000);
        assert_eq!(clean_output(&at_limit, "", None), at_limit);
    }

    #[test]
    fn clean_session_output_cuts_at_marker_and_filters_probe_lines() {
        // TS cuts at the FIRST marker occurrence, which can be inside the echoed
        // printf probe itself, then drops echoed command lines.
        let raw = "line1\nprintf '__JAIT_DONE__'\n__JAIT_DONE__42\njunk after marker";
        assert_eq!(
            clean_session_command_output(raw, "printf '__JAIT_DONE__'", "__JAIT_DONE__"),
            "line1\nprintf '"
        );
        // echoed command lines are filtered, marker line and trailing junk dropped.
        assert_eq!(
            clean_session_command_output("ls -la\nfile1\nfile2\n__M__1", "ls -la", "__M__"),
            "file1\nfile2"
        );
        // CR removal + trailing-space trimming.
        assert_eq!(
            clean_session_command_output("a \r\nb\r\n__M__0", "run", "__M__"),
            "a\nb"
        );
        // nothing but the marker -> the TS sentinel.
        assert_eq!(clean_session_command_output("__M__1", "run", "__M__"), "(no output)");
        assert_eq!(clean_session_command_output("", "", "__M__"), "(no output)");
    }

    #[test]
    fn validate_target_part_reports_required_and_illegal_characters() {
        assert_eq!(
            validate_target_part("", "host"),
            Some("host is required".to_string())
        );
        assert_eq!(
            validate_target_part("   ", "username"),
            Some("username is required".to_string())
        );
        for bad in ["bad host", "a@b", "quo'te", "dbl\"quote"] {
            assert_eq!(
                validate_target_part(bad, "host"),
                Some("host cannot contain whitespace, quotes, or @".to_string()),
                "input {bad:?} must be rejected"
            );
        }
        assert_eq!(validate_target_part("ok-host_1.example.com", "host"), None);
        assert_eq!(validate_target_part("bob", "username"), None);
    }

    #[test]
    fn build_ssh_args_matches_openssh_vector_for_key_auth() {
        let args = build_ssh_args("example.com", "bob", 22, None, true, None);
        assert_eq!(
            args,
            vec![
                "-p",
                "22",
                "-o",
                "StrictHostKeyChecking=yes",
                "-o",
                "LogLevel=ERROR",
                "-o",
                "NumberOfPasswordPrompts=1",
                "-o",
                "BatchMode=yes",
                "bob@example.com",
            ]
        );
    }

    #[test]
    fn build_ssh_args_adds_known_hosts_override_and_password_auth() {
        // strict_host_key_checking=false inserts UserKnownHostsFile right after it.
        let relaxed = build_ssh_args("h", "u", 2222, None, false, Some("uptime"));
        assert_eq!(
            relaxed,
            vec![
                "-p",
                "2222",
                "-o",
                "StrictHostKeyChecking=no",
                "-o",
                "UserKnownHostsFile=/dev/null",
                "-o",
                "LogLevel=ERROR",
                "-o",
                "NumberOfPasswordPrompts=1",
                "-o",
                "BatchMode=yes",
                "u@h",
                "uptime",
            ]
        );
        // password auth prepends the two auth overrides and flips BatchMode.
        let with_password = build_ssh_args("h", "u", 22, Some("s3cret"), true, Some("id"));
        assert_eq!(
            with_password,
            vec![
                "-o",
                "PreferredAuthentications=password,keyboard-interactive",
                "-o",
                "PubkeyAuthentication=no",
                "-p",
                "22",
                "-o",
                "StrictHostKeyChecking=yes",
                "-o",
                "LogLevel=ERROR",
                "-o",
                "NumberOfPasswordPrompts=1",
                "-o",
                "BatchMode=no",
                "u@h",
                "id",
            ]
        );
    }

    #[test]
    fn password_secret_key_is_username_host_port() {
        assert_eq!(
            ssh_password_secret_key("bob", "example.com", 2222),
            "bob@example.com:2222"
        );
        assert_eq!(ssh_password_secret_key("root", "10.0.0.5", 22), "root@10.0.0.5:22");
    }
}
