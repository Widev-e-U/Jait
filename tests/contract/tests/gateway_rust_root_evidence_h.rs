//! Parity evidence for `mergeEntries` in `packages/gateway/src/lib/network-scan.ts`
//! (reference `existing.mac ?? entry.mac`, first MAC wins) against
//! `packages/gateway-rust/src/network_scan.rs::merge_entries`.
//!
//! History: the port originally overwrote the MAC with every later non-null
//! value, which diverged from the reference when two rows for one IP both carried
//! a MAC. The port now matches the reference; these tests lock that in.

use jait_gateway::network_scan::{merge_entries, HostEntry};

fn entry(ip: &str, mac: Option<&str>, responsive: bool) -> HostEntry {
    HostEntry {
        ip: ip.into(),
        mac: mac.map(str::to_string),
        responsive,
    }
}

#[test]
fn merge_entries_keeps_the_first_mac_and_ors_responsiveness() {
    // Mirrors the reference test "merges entries by IP, keeping the first MAC
    // and OR-ing responsiveness".
    let rows = vec![
        entry("192.168.1.1", Some("00:11:22:33:44:55"), true),
        entry("192.168.1.1", None, false),
        entry("192.168.1.2", None, false),
    ];

    assert_eq!(
        merge_entries(&rows),
        vec![
            entry("192.168.1.1", Some("00:11:22:33:44:55"), true),
            entry("192.168.1.2", None, false),
        ]
    );
}

#[test]
fn merge_entries_fills_a_missing_mac_from_a_later_row() {
    // Mirrors "fills in a missing MAC from a later entry".
    let rows = vec![
        entry("192.168.1.1", None, true),
        entry("192.168.1.1", Some("00:11:22:33:44:55"), false),
    ];

    assert_eq!(
        merge_entries(&rows),
        vec![entry("192.168.1.1", Some("00:11:22:33:44:55"), true)]
    );
}

#[test]
fn merge_entries_never_lets_a_later_mac_replace_the_first() {
    // The `??`-style precedence: with two known MACs the *first* wins, even
    // though the later row is more responsive.
    let rows = vec![
        entry("10.0.0.9", None, false),
        entry("10.0.0.9", Some("11:22:33:44:55:66"), true),
        entry("10.0.0.9", Some("99:99:99:99:99:99"), false),
        entry("10.0.0.9", Some("aa:bb:cc:dd:ee:ff"), true),
    ];

    let merged = merge_entries(&rows);

    assert_eq!(merged.len(), 1);
    assert_eq!(merged[0].mac.as_deref(), Some("11:22:33:44:55:66"));
    assert!(merged[0].responsive, "responsiveness is OR-ed across rows");
}

#[test]
fn merge_entries_preserves_first_seen_order_and_distinct_ips() {
    let rows = vec![
        entry("192.168.1.30", Some("00:00:00:00:00:30"), false),
        entry("192.168.1.10", None, true),
        entry("192.168.1.30", None, true),
        entry("192.168.1.20", Some("00:00:00:00:00:20"), false),
    ];

    assert_eq!(
        merge_entries(&rows),
        vec![
            entry("192.168.1.30", Some("00:00:00:00:00:30"), true),
            entry("192.168.1.10", None, true),
            entry("192.168.1.20", Some("00:00:00:00:00:20"), false),
        ]
    );
    assert!(merge_entries(&[]).is_empty());
}
