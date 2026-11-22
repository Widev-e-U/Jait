use jait_gateway::db::apply_migrations_through;
use rusqlite::Connection;

#[test]
fn upgrade_from_77_adds_sharing_and_orchestration_schema_idempotently() {
    let db = Connection::open_in_memory().unwrap();
    apply_migrations_through(&db, 77).unwrap();
    db.execute_batch(
        "CREATE TABLE preserved_data (value TEXT); INSERT INTO preserved_data VALUES ('kept');",
    )
    .unwrap();
    apply_migrations_through(&db, 81).unwrap();
    apply_migrations_through(&db, 81).unwrap();
    let preserved: String = db
        .query_row("SELECT value FROM preserved_data", [], |r| r.get(0))
        .unwrap();
    assert_eq!(preserved, "kept");
    let tables: i64 = db.query_row("SELECT count(*) FROM sqlite_schema WHERE type='table' AND name IN ('project_members','orchestration_runs','orchestration_task_runs','orchestration_attempts')", [], |r| r.get(0)).unwrap();
    assert_eq!(tables, 4);
    db.execute(
        "INSERT INTO project_members VALUES ('project','user','now')",
        [],
    )
    .unwrap();
    assert!(
        db.execute(
            "INSERT INTO project_members VALUES ('project','user','later')",
            []
        )
        .is_err()
    );
    for (table, column) in [
        ("sessions", "shared_with_project"),
        ("messages", "author_user_id"),
        ("user_settings", "navigation_order"),
    ] {
        let exists: i64 = db
            .query_row(
                &format!("SELECT count(*) FROM pragma_table_info('{table}') WHERE name=?1"),
                [column],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(exists, 1, "{table}.{column}");
    }
    let default_value: String = db
        .query_row(
            "SELECT dflt_value FROM pragma_table_info('sessions') WHERE name='shared_with_project'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(default_value, "0");
}
