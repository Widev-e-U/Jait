use jait_gateway::db::apply_migrations_through;
use rusqlite::Connection;

#[test]
fn upgrade_from_75_preserves_rows_and_enforces_new_unique_keys() {
    let db = Connection::open_in_memory().unwrap();
    db.execute_batch("CREATE TABLE _migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL); CREATE TABLE existing_data (value TEXT); INSERT INTO existing_data VALUES ('preserved');").unwrap();
    for id in 1..=75 {
        db.execute(
            "INSERT INTO _migrations VALUES (?1, 'previous', 'now')",
            [id],
        )
        .unwrap();
    }
    apply_migrations_through(&db, 77).unwrap();
    apply_migrations_through(&db, 77).unwrap();
    let applied: Vec<(u32, String)> = db
        .prepare("SELECT id, name FROM _migrations WHERE id >= 76 ORDER BY id")
        .unwrap()
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap();
    assert_eq!(
        applied,
        vec![
            (76, "browser_workflows".into()),
            (77, "github_intake_observation".into())
        ]
    );
    let preserved: String = db
        .query_row("SELECT value FROM existing_data", [], |r| r.get(0))
        .unwrap();
    assert_eq!(preserved, "preserved");
    db.execute_batch("INSERT INTO github_intake_policies VALUES ('a','user','agent','{}','now'); INSERT INTO github_intake_decisions VALUES ('a','user','agent','delivery','push','created','repo','sender','accept','reason','now');").unwrap();
    assert!(
        db.execute(
            "INSERT INTO github_intake_policies VALUES ('b','user','agent','{}','now')",
            []
        )
        .is_err()
    );
    assert!(db.execute("INSERT INTO github_intake_decisions VALUES ('b','user','agent','delivery','push','created','repo','sender','accept','reason','now')", []).is_err());
    let tables: i64 = db.query_row("SELECT count(*) FROM sqlite_schema WHERE type='table' AND name IN ('browser_workflows','browser_workflow_runs','github_intake_policies','github_intake_decisions')", [], |r| r.get(0)).unwrap();
    assert_eq!(tables, 4);
}
