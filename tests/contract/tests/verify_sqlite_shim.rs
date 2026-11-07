//! Contract harness: `packages/gateway/src/db/sqlite-shim.ts`
//!          -> `packages/gateway-rust/src/db/sqlite_shim.rs`.
//!
//! Every expectation below is transcribed from the TypeScript module, not from the
//! `#[cfg(test)] mod tests` block that already lives inside the Rust file:
//!
//!   * `lines 50-54`  `export let sqliteBackend: "bun:sqlite" | "node:sqlite" | "better-sqlite3"
//!                     = "better-sqlite3";`  -> the export's value domain and initial value.
//!   * `lines 149-178` `openRawSqlite`:
//!       - Bun branch: `await import("bun:sqlite")` sits *outside* any `try`, assigns
//!         `sqliteBackend = "bun:sqlite"`, and returns `new Database(path)` untouched.
//!       - Node branch: `try { const { DatabaseSync } = await import("node:sqlite");
//!         sqliteBackend = "node:sqlite"; return wrapNodeSqlite(new DatabaseSync(path)); } catch {}`
//!         -> the status is written *before* the constructor runs, and the constructor's
//!         failure is swallowed.
//!       - Last resort: `better-sqlite3`, status assigned before `new Database(path)`, raw
//!         handle returned, and a failing import becomes the no-backend `Error` whose text is
//!         the concatenation at lines 173-176.
//!   * `line 86`       `await db.exec(`BEGIN ${mode}`)` for `DEFERRED | IMMEDIATE | EXCLUSIVE`.
//!
//! The native module takes all of this behind the `SqliteShimHost` boundary, so the fake host
//! below records exactly the observable decisions the TS module makes: which module imports are
//! attempted, in what order, whether the constructor throws, and what the exported status holds
//! at each point.

use std::sync::{Arc, Mutex};

use jait_gateway::db::sqlite_shim::{
    Backend, BackendStatus, DrizzleAdapter, DrizzleDatabase, DrizzleSchemaConfig, EngineError,
    NO_BACKEND_ERROR, OpenError, OpenedDatabase, QueryRows, RawDatabase, RawStatement, Row,
    RunResult, SqliteDatabase, SqliteDriver, SqliteShimHost, TransactionError, TransactionMode,
    Value, open_raw_sqlite,
};

// ── TypeScript source of truth ───────────────────────────────────────────────

/// `export let sqliteBackend: "bun:sqlite" | "node:sqlite" | "better-sqlite3"`.
const TS_BACKEND_NAMES: [&str; 3] = ["bun:sqlite", "node:sqlite", "better-sqlite3"];

/// The initialiser on that export declaration.
const TS_INITIAL_BACKEND: &str = "better-sqlite3";

/// `throw new Error("No SQLite backend available. ..." + "...")`, verbatim.
const TS_NO_BACKEND_MESSAGE: &str = "No SQLite backend available. Jait requires Node.js 22.5+ \
     (which includes node:sqlite) or Bun. If you're on an older Node version, install \
     better-sqlite3 manually: npm install better-sqlite3";

// ── Fake host: records the decisions the TS module makes ───────────────────

type Log = Arc<Mutex<Vec<String>>>;

struct FakeStatement {
    log: Log,
}

impl RawStatement for FakeStatement {
    fn all(&self, _params: &[Value]) -> Result<Vec<Row>, EngineError> {
        // The TS guards read the result length only, so an empty set covers those paths.
        Ok(Vec::new())
    }
    fn get(&self, _params: &[Value]) -> Result<Option<Row>, EngineError> {
        Ok(None)
    }
    fn run(&self, _params: &[Value]) -> Result<RunResult, EngineError> {
        unimplemented!("harness never writes")
    }
    fn columns(&self) -> Option<Vec<String>> {
        // `node:sqlite`'s `StatementSync` has no `columns()`; the wrapper falls back to `[]`.
        None
    }
    fn set_raw(&self, enabled: bool) -> bool {
        self.log.lock().unwrap().push(format!("raw:{enabled}"));
        enabled
    }
}

struct FakeDatabase {
    log: Log,
    tag: &'static str,
    behaviour: Behaviour,
}

impl RawDatabase for FakeDatabase {
    fn exec(&self, sql: &str) -> Result<(), EngineError> {
        self.log
            .lock()
            .unwrap()
            .push(format!("exec:{}:{sql}", self.tag));
        let failing = match sql {
            "COMMIT" => self.behaviour.fail_commit,
            "ROLLBACK" => self.behaviour.fail_rollback,
            sql if sql.starts_with("BEGIN") => self.behaviour.fail_begin,
            _ => false,
        };
        if failing {
            return Err(EngineError::new(format!("{sql} refused by fake backend")));
        }
        Ok(())
    }
    fn prepare(&self, _sql: &str) -> Result<Box<dyn RawStatement>, EngineError> {
        Ok(Box::new(FakeStatement {
            log: self.log.clone(),
        }))
    }
    fn close(&self) -> Result<(), EngineError> {
        Ok(())
    }
    fn native_transaction(&self) -> bool {
        // `bun:sqlite` and `better-sqlite3` expose `db.transaction(fn)` natively; the
        // `node:sqlite` handle has no such member and is wrapped by `wrapNodeSqlite` instead.
        self.tag != "node:sqlite"
    }
}

struct FakeDriver {
    log: Log,
    tag: &'static str,
    constructor_ok: bool,
    behaviour: Behaviour,
}

impl SqliteDriver for FakeDriver {
    fn open(&self, path: &str) -> Result<Box<dyn RawDatabase>, EngineError> {
        self.log
            .lock()
            .unwrap()
            .push(format!("open:{}:{path}", self.tag));
        if self.constructor_ok {
            Ok(Box::new(FakeDatabase {
                log: self.log.clone(),
                tag: self.tag,
                behaviour: self.behaviour,
            }))
        } else {
            Err(EngineError::new(format!("{} constructor threw", self.tag)))
        }
    }
}

struct FakeDrizzle;

impl DrizzleDatabase for FakeDrizzle {}

#[derive(Clone, Copy)]
struct Behaviour {
    bun_import: bool,
    bun_constructor_ok: bool,
    node_import: bool,
    node_constructor_ok: bool,
    better_import: bool,
    better_constructor_ok: bool,
    /// Make `COMMIT` fail, as a backend would when the transaction cannot be committed.
    fail_commit: bool,
    /// Make `ROLLBACK` fail, as a backend does when no transaction is active.
    fail_rollback: bool,
    /// Make `BEGIN <mode>` fail, as a backend does when a transaction is already open.
    fail_begin: bool,
}

impl Behaviour {
    /// Every `await import(...)` and every constructor succeeds.
    const fn all_ok() -> Self {
        Behaviour {
            bun_import: true,
            bun_constructor_ok: true,
            node_import: true,
            node_constructor_ok: true,
            better_import: true,
            better_constructor_ok: true,
            fail_commit: false,
            fail_rollback: false,
            fail_begin: false,
        }
    }
}

struct FakeHost {
    log: Log,
    is_bun: bool,
    behaviour: Behaviour,
}

impl FakeHost {
    fn new(is_bun: bool, behaviour: Behaviour) -> Self {
        FakeHost {
            log: Arc::new(Mutex::new(Vec::new())),
            is_bun,
            behaviour,
        }
    }

    fn calls(&self) -> Vec<String> {
        self.log.lock().unwrap().clone()
    }

    fn attempted(&self, tag: &str) -> bool {
        let prefix = format!("load:{tag}");
        self.calls().iter().any(|call| call.starts_with(&prefix))
    }

    fn driver(
        &self,
        tag: &'static str,
        importable: bool,
        constructor_ok: bool,
    ) -> Option<Box<dyn SqliteDriver>> {
        let mut log = self.log.lock().unwrap();
        if !importable {
            log.push(format!("load:{tag}:threw"));
            return None;
        }
        log.push(format!("load:{tag}"));
        Some(Box::new(FakeDriver {
            log: self.log.clone(),
            tag,
            constructor_ok,
            behaviour: self.behaviour,
        }))
    }
}

impl SqliteShimHost for FakeHost {
    fn is_bun(&self) -> bool {
        self.is_bun
    }

    fn load_bun_sqlite(&self) -> Option<Box<dyn SqliteDriver>> {
        self.driver(
            "bun:sqlite",
            self.behaviour.bun_import,
            self.behaviour.bun_constructor_ok,
        )
    }

    fn load_node_sqlite(&self) -> Option<Box<dyn SqliteDriver>> {
        self.driver(
            "node:sqlite",
            self.behaviour.node_import,
            self.behaviour.node_constructor_ok,
        )
    }

    fn load_better_sqlite3(&self) -> Option<Box<dyn SqliteDriver>> {
        self.driver(
            "better-sqlite3",
            self.behaviour.better_import,
            self.behaviour.better_constructor_ok,
        )
    }

    fn create_drizzle(
        &self,
        _client: &dyn DatabaseClientLike,
        _adapter: DrizzleAdapter,
        _config: &DrizzleSchemaConfig,
    ) -> Result<Box<dyn DrizzleDatabase>, EngineError> {
        Ok(Box::new(FakeDrizzle))
    }
}

// `DatabaseClient` is re-exported under the same name the trait lives in.
use jait_gateway::db::sqlite_shim::DatabaseClient as DatabaseClientLike;

fn open(host: &FakeHost, status: &BackendStatus) -> Result<OpenedDatabase, OpenError> {
    open_raw_sqlite(host, ":memory:", status)
}

// ── Tests ───────────────────────────────────────────────────────────────────

/// TS lines 50-54: the `sqliteBackend` export starts at `"better-sqlite3"`.
#[test]
fn initial_export_value_matches_typescript() {
    let status = BackendStatus::new();
    assert_eq!(status.name(), TS_INITIAL_BACKEND);
    assert_eq!(status.get(), Backend::BetterSqlite3);
}

/// TS line 50: the export's declared value domain is exactly those three strings.
#[test]
fn backend_name_domain_matches_typescript_union() {
    assert_eq!(Backend::BunSqlite.name(), TS_BACKEND_NAMES[0]);
    assert_eq!(Backend::NodeSqlite.name(), TS_BACKEND_NAMES[1]);
    assert_eq!(Backend::BetterSqlite3.name(), TS_BACKEND_NAMES[2]);
}

/// TS lines 149-153: on Bun the module imports `bun:sqlite`, assigns the status and returns
/// `new Database(path)` — no `wrapNodeSqlite`, and the Node/better-sqlite3 branches are never
/// reached because the Bun branch returns.
#[test]
fn bun_returns_the_raw_handle_and_skips_the_fallbacks() {
    let host = FakeHost::new(true, Behaviour::all_ok());
    let status = BackendStatus::new();

    let opened = open(&host, &status).expect("the Bun branch must open the database");

    assert_eq!(opened.backend, Backend::BunSqlite);
    assert_eq!(opened.backend_name(), TS_BACKEND_NAMES[0]);
    assert_eq!(status.name(), TS_BACKEND_NAMES[0]);
    assert!(
        !opened.db.is_wrapped(),
        "TS returns `new Database(path)` on Bun, not `wrapNodeSqlite(...)`"
    );
    assert!(
        !host.attempted("node:sqlite"),
        "the Bun branch returns before the node:sqlite import"
    );
    assert!(
        !host.attempted("better-sqlite3"),
        "the Bun branch returns before the better-sqlite3 import"
    );
}

/// TS lines 150-153: the `bun:sqlite` import is *outside* the `try`/`catch` blocks, so its
/// failure surfaces as an engine error rather than the no-backend `Error`, and the exported
/// status keeps its initial value because the assignment never runs.
#[test]
fn bun_import_failure_is_not_converted_to_no_backend() {
    let host = FakeHost::new(
        true,
        Behaviour {
            bun_import: false,
            ..Behaviour::all_ok()
        },
    );
    let status = BackendStatus::new();

    let error = open(&host, &status).expect_err("an uncaught bun:sqlite import must fail the open");

    assert!(
        matches!(error, OpenError::Driver(_)),
        "expected the engine error from the failed import, got {error}"
    );
    assert_eq!(status.name(), TS_INITIAL_BACKEND);
    assert!(!host.attempted("node:sqlite"));
    assert!(!host.attempted("better-sqlite3"));
}

/// TS lines 158-162: on Node the module prefers `node:sqlite`, wraps the handle with
/// `wrapNodeSqlite(...)`, and never touches `better-sqlite3`.
#[test]
fn node_is_preferred_and_its_handle_is_wrapped() {
    let host = FakeHost::new(false, Behaviour::all_ok());
    let status = BackendStatus::new();

    let opened = open(&host, &status).expect("node:sqlite must be used when it imports");

    assert_eq!(opened.backend, Backend::NodeSqlite);
    assert_eq!(status.name(), TS_BACKEND_NAMES[1]);
    assert!(
        opened.db.is_wrapped(),
        "TS returns `wrapNodeSqlite(new DatabaseSync(path))`"
    );
    assert!(
        !host.attempted("better-sqlite3"),
        "node:sqlite returning skips the better-sqlite3 branch entirely"
    );
}

/// TS lines 159-165: `sqliteBackend = "node:sqlite"` is assigned *before*
/// `new DatabaseSync(path)` runs. If that constructor throws, the `catch {}` swallows it and the
/// import falls through, so the status is already `"node:sqlite"` when the last resort runs and
/// fails — and the thrown error is the no-backend one.
#[test]
fn status_is_assigned_before_the_node_constructor_runs() {
    let host = FakeHost::new(
        false,
        Behaviour {
            node_constructor_ok: false,
            better_import: false,
            ..Behaviour::all_ok()
        },
    );
    let status = BackendStatus::new();

    let error = open(&host, &status).expect_err("no backend can be constructed here");

    assert!(
        matches!(error, OpenError::NoBackend),
        "both available backends failed, so the no-backend error is expected, got {error}"
    );
    assert_eq!(
        status.name(),
        TS_BACKEND_NAMES[1],
        "the status was written before the failing constructor and is not rolled back"
    );
    assert!(
        host.attempted("better-sqlite3"),
        "a throwing node:sqlite constructor must fall through to better-sqlite3"
    );
}

/// TS lines 167-180: `better-sqlite3` is the last resort, its handle is returned raw, and its
/// status assignment precedes the constructor.
#[test]
fn better_sqlite3_is_the_last_resort_and_returns_a_raw_handle() {
    let host = FakeHost::new(
        false,
        Behaviour {
            node_import: false,
            ..Behaviour::all_ok()
        },
    );
    let status = BackendStatus::new();

    let opened = open(&host, &status).expect("better-sqlite3 is used when node:sqlite is absent");

    assert_eq!(opened.backend, Backend::BetterSqlite3);
    assert_eq!(status.name(), TS_BACKEND_NAMES[2]);
    assert!(
        !opened.db.is_wrapped(),
        "TS returns `new Database(path)` from the better-sqlite3 branch"
    );
    assert!(host.attempted("node:sqlite"));
}

/// TS lines 173-178: the no-backend `Error` message is the concatenation of those two string
/// literals, so the native constant and its rendering must match byte for byte.
#[test]
fn no_backend_message_matches_typescript_bytes() {
    assert_eq!(NO_BACKEND_ERROR, TS_NO_BACKEND_MESSAGE);
    assert_eq!(
        OpenError::NoBackend.to_string(),
        TS_NO_BACKEND_MESSAGE,
        "the surfaced message is the TS `Error` message"
    );

    let host = FakeHost::new(
        false,
        Behaviour {
            bun_import: false,
            node_import: false,
            better_import: false,
            ..Behaviour::all_ok()
        },
    );
    let status = BackendStatus::new();
    let error = open(&host, &status).expect_err("no backend is importable");
    assert_eq!(error.to_string(), TS_NO_BACKEND_MESSAGE);
    assert_eq!(status.name(), TS_INITIAL_BACKEND);
}

/// TS line 86: `await db.exec(`BEGIN ${mode}`)` — the mode keyword is the raw enum-ish string.
#[test]
fn transaction_modes_match_the_typescript_interpolation() {
    assert_eq!(TransactionMode::Deferred.sql(), "DEFERRED");
    assert_eq!(TransactionMode::Immediate.sql(), "IMMEDIATE");
    assert_eq!(TransactionMode::Exclusive.sql(), "EXCLUSIVE");
}

// ── `wrapNodeSqlite` surface (TS lines 60-145) ───────────────────────────────
//
// `node:sqlite`'s `DatabaseSync` has no `transaction()` helper, so the TS module wraps it:
//
//     transaction(mode = "DEFERRED") {
//       return fn => { db.exec(`BEGIN ${mode}`); try { const r = fn(); db.exec("COMMIT"); return r; }
//                      catch (e) { db.exec("ROLLBACK"); throw e; } };
//     }
//     prepare(sql) { const stmt = db.prepare(sql); let rawMode = false;
//       return { raw(enabled) { rawMode = enabled !== false; stmt.setReadBigInts?.(...); ... },
//                columns() { return stmt.columns ? stmt.columns().map(c => c.name) : []; },
//                all(...) { const rows = stmt.all(...); return rows.length === 0 ? [] : ... },
//                get(...) { const row = stmt.get(...); ... } }; }
//
// The two modes are distinguished by `native_transaction()`: `bun:sqlite` and
// `better-sqlite3` already expose `transaction()`, so their handles are returned untouched and
// `raw()` is forwarded to the native statement instead of being shimmed locally.

fn wrapped(tag: &'static str, behaviour: Behaviour) -> (SqliteDatabase, Log) {
    let log: Log = Arc::new(Mutex::new(Vec::new()));
    let db = SqliteDatabase::wrap_node_sqlite(Box::new(FakeDatabase {
        log: log.clone(),
        tag,
        behaviour,
    }));
    (db, log)
}

fn unwrapped(tag: &'static str) -> (SqliteDatabase, Log) {
    let backend = if tag == "bun:sqlite" {
        Backend::BunSqlite
    } else {
        Backend::BetterSqlite3
    };
    let log: Log = Arc::new(Mutex::new(Vec::new()));
    let db = SqliteDatabase::new(
        Box::new(FakeDatabase {
            log: log.clone(),
            tag,
            behaviour: Behaviour::all_ok(),
        }),
        backend,
    );
    (db, log)
}

fn calls(log: &Log) -> Vec<String> {
    log.lock().unwrap().clone()
}

/// `Transaction::run` is private; the public surface is the three named modes.
fn run_transaction<T>(
    db: &SqliteDatabase,
    mode: TransactionMode,
    body: impl FnOnce(&SqliteDatabase) -> Result<T, EngineError>,
) -> Result<T, TransactionError<EngineError>> {
    match mode {
        TransactionMode::Deferred => db.transaction().deferred(body),
        TransactionMode::Immediate => db.transaction().immediate(body),
        TransactionMode::Exclusive => db.transaction().exclusive(body),
    }
}

/// `openRawSqlite` writes `sqliteBackend = "node:sqlite"` before wrapping the handle.
#[test]
fn wrapped_handle_preserves_the_node_backend_identity() {
    let (db, _log) = wrapped("node:sqlite", Behaviour::all_ok());
    assert!(db.is_wrapped(), "node:sqlite handles are shimmed");
    assert_eq!(db.backend(), Backend::NodeSqlite);
    assert_eq!(db.backend().name(), "node:sqlite");
}

/// `bun:sqlite` and `better-sqlite3` handles are returned as-is, not wrapped.
#[test]
fn native_handles_are_returned_unwrapped() {
    for (tag, expected) in [
        ("bun:sqlite", Backend::BunSqlite),
        ("better-sqlite3", Backend::BetterSqlite3),
    ] {
        let (db, _log) = unwrapped(tag);
        assert!(!db.is_wrapped(), "{tag} exposes transaction() natively");
        assert_eq!(db.backend(), expected);
        assert_eq!(db.backend().name(), tag);
    }
}

/// TS: `db.exec("BEGIN DEFERRED")` … `db.exec("COMMIT")`, value returned unchanged.
#[test]
fn transaction_runs_begin_then_commit_and_returns_the_body_value() {
    let (db, log) = wrapped("node:sqlite", Behaviour::all_ok());
    let outcome = run_transaction(&db, TransactionMode::Deferred, |_| Ok::<_, EngineError>(7));
    assert_eq!(outcome.unwrap(), 7);
    assert_eq!(
        calls(&log),
        vec![
            "exec:node:sqlite:BEGIN DEFERRED".to_string(),
            "exec:node:sqlite:COMMIT".to_string(),
        ]
    );
}

/// TS line 86 is `BEGIN ${mode}`; the immediate/exclusive keywords reach the backend verbatim.
#[test]
fn transaction_mode_keyword_reaches_the_backend() {
    for (mode, expected) in [
        (TransactionMode::Immediate, "BEGIN IMMEDIATE"),
        (TransactionMode::Exclusive, "BEGIN EXCLUSIVE"),
    ] {
        let (db, log) = wrapped("node:sqlite", Behaviour::all_ok());
        run_transaction(&db, mode, |_| Ok::<_, EngineError>(())).unwrap();
        let calls = calls(&log);
        let expected_call = format!("exec:node:sqlite:{expected}");
        assert_eq!(
            calls.first().map(String::as_str),
            Some(expected_call.as_str())
        );
        assert_eq!(
            calls.last().map(String::as_str),
            Some("exec:node:sqlite:COMMIT")
        );
    }
}

/// TS: `catch (e) { db.exec("ROLLBACK"); throw e; }` — the *body's* error is what escapes.
#[test]
fn body_error_rolls_back_and_rethrows_the_body_error() {
    let (db, log) = wrapped("node:sqlite", Behaviour::all_ok());
    let outcome = run_transaction(&db, TransactionMode::Deferred, |_| {
        Err::<(), _>(EngineError::new("body exploded"))
    });
    match outcome {
        Err(TransactionError::Body(error)) => assert_eq!(error.to_string(), "body exploded"),
        Err(TransactionError::Begin(error)) => panic!("body error surfaced as BEGIN: {error}"),
        Ok(()) => panic!("the body's error must escape the transaction"),
    }
    assert_eq!(
        calls(&log),
        vec![
            "exec:node:sqlite:BEGIN DEFERRED".to_string(),
            "exec:node:sqlite:ROLLBACK".to_string(),
        ],
        "no COMMIT is attempted once the body throws"
    );
}

/// TS: the `ROLLBACK` in the `catch` block is unconditional, but `throw e` still wins, so a
/// backend whose `ROLLBACK` itself throws must not mask the body's error.
#[test]
fn failing_rollback_does_not_mask_the_body_error() {
    let (db, _log) = wrapped(
        "node:sqlite",
        Behaviour {
            fail_rollback: true,
            ..Behaviour::all_ok()
        },
    );
    let outcome = run_transaction(&db, TransactionMode::Deferred, |_| {
        Err::<(), _>(EngineError::new("body exploded"))
    });
    match outcome {
        Err(TransactionError::Body(error)) => assert_eq!(error.to_string(), "body exploded"),
        other => panic!("expected the body error to survive a failing ROLLBACK: {other:?}"),
    }
}

/// A `COMMIT` the backend refuses is not swallowed: the transaction fails and the handle is
/// rolled back.
#[test]
fn refused_commit_fails_the_transaction_and_rolls_back() {
    let (db, log) = wrapped(
        "node:sqlite",
        Behaviour {
            fail_commit: true,
            ..Behaviour::all_ok()
        },
    );
    let outcome = run_transaction(&db, TransactionMode::Deferred, |_| Ok::<_, EngineError>(()));
    let error = outcome.expect_err("a refused COMMIT must fail the transaction");
    assert!(
        error.to_string().contains("COMMIT refused by fake backend"),
        "the backend's commit error must be reported, got {error}"
    );
    let calls = calls(&log);
    assert_eq!(
        calls.first().map(String::as_str),
        Some("exec:node:sqlite:BEGIN DEFERRED")
    );
    assert!(
        calls.iter().any(|call| call == "exec:node:sqlite:COMMIT"),
        "COMMIT must be attempted: {calls:?}"
    );
    assert_eq!(
        calls.last().map(String::as_str),
        Some("exec:node:sqlite:ROLLBACK"),
        "a refused COMMIT must be followed by ROLLBACK: {calls:?}"
    );
}

/// TS: `db.exec(`BEGIN ${mode}`)` sits *outside* the `try`, so a failing `BEGIN` propagates
/// immediately and no `COMMIT`/`ROLLBACK` is attempted.
#[test]
fn failing_begin_propagates_before_any_commit_or_rollback() {
    let (db, log) = wrapped(
        "node:sqlite",
        Behaviour {
            fail_begin: true,
            ..Behaviour::all_ok()
        },
    );
    let outcome = run_transaction(
        &db,
        TransactionMode::Immediate,
        |_| Ok::<_, EngineError>(()),
    );
    match outcome {
        Err(TransactionError::Begin(error)) => {
            assert!(
                error
                    .to_string()
                    .contains("BEGIN IMMEDIATE refused by fake backend")
            );
        }
        other => panic!("expected the BEGIN failure to escape uncaught: {other:?}"),
    }
    assert_eq!(
        calls(&log),
        vec!["exec:node:sqlite:BEGIN IMMEDIATE".to_string()],
        "nothing else may be attempted after a failed BEGIN"
    );
}

/// TS shimmed `raw(enabled?)`: `rawMode = enabled !== false`, so the argument-less call turns
/// raw mode **on**, and the native statement is left alone (`node:sqlite` has no raw switch).
#[test]
fn wrapped_raw_mode_is_tracked_locally() {
    let (db, log) = wrapped("node:sqlite", Behaviour::all_ok());
    let statement = db.prepare("SELECT 1").unwrap();
    assert!(!statement.is_raw(), "raw mode starts disabled");

    assert!(
        statement.raw(None).is_raw(),
        "raw() with no argument enables it"
    );
    assert!(
        !statement.raw(Some(false)).is_raw(),
        "raw(false) disables it"
    );
    assert!(statement.raw(Some(true)).is_raw(), "raw(true) enables it");

    assert!(
        !calls(&log).iter().any(|call| call.starts_with("raw:")),
        "the shimmed statement never forwards set_raw: {:?}",
        calls(&log)
    );
}

/// TS: for `bun:sqlite`/`better-sqlite3` the wrapper is bypassed, so `raw(enabled)` is forwarded
/// to the native `setReadBigInts`-style switch and the returned value is the native one.
#[test]
fn native_raw_mode_is_forwarded_to_the_statement() {
    let (db, log) = unwrapped("better-sqlite3");
    let statement = db.prepare("SELECT 1").unwrap();
    assert!(!statement.is_raw(), "raw mode starts disabled");

    assert!(statement.raw(None).is_raw());
    assert!(!statement.raw(Some(false)).is_raw());
    assert!(statement.raw(Some(true)).is_raw());

    let forwarded: Vec<String> = calls(&log)
        .into_iter()
        .filter(|call| call.starts_with("raw:"))
        .collect();
    assert_eq!(
        forwarded,
        vec![
            "raw:true".to_string(),
            "raw:false".to_string(),
            "raw:true".to_string()
        ]
    );
}

/// TS: `columns() { return stmt.columns ? stmt.columns().map(c => c.name) : []; }` — a backend
/// without `columns()` yields the empty list, never an error.
#[test]
fn columns_without_a_native_implementation_is_an_empty_list() {
    let (db, _log) = wrapped("node:sqlite", Behaviour::all_ok());
    let statement = db.prepare("SELECT 1").unwrap();
    assert_eq!(statement.columns(), Vec::<String>::new());
}

/// TS (`sqlite-shim.ts:120`): `if (!rawMode || rows.length === 0) return rows;` — an empty
/// result set is handed back untouched, so it is the identical `[]` in both modes. JS cannot
/// distinguish "no rows as objects" from "no rows as arrays", so the port may only be required
/// to stay empty in raw mode, not to spell the emptiness with a particular variant.
#[test]
fn empty_results_are_the_same_in_both_modes() {
    let (db, _log) = wrapped("node:sqlite", Behaviour::all_ok());
    let statement = db.prepare("SELECT 1").unwrap();

    assert!(
        !statement.is_raw(),
        "fresh statements start in objects mode"
    );
    let objects_empty = match statement.all(&[]).unwrap() {
        QueryRows::Objects(rows) => rows.is_empty(),
        QueryRows::Values(rows) => rows.is_empty(),
    };
    assert!(objects_empty, "objects mode must return no rows");

    statement.raw(None);
    assert!(statement.is_raw(), "raw mode must actually be enabled");
    let raw_empty = match statement.all(&[]).unwrap() {
        QueryRows::Objects(rows) => rows.is_empty(),
        QueryRows::Values(rows) => rows.is_empty(),
    };
    assert!(raw_empty, "raw mode must also return no rows");

    assert!(statement.get(&[]).unwrap().is_none());
}

/// TS: `get()` returns the row itself in objects mode and `Object.values(row)` in raw mode; a
/// miss stays `undefined` and the guard makes it a miss in both modes.
#[test]
fn get_misses_stay_misses_in_both_modes() {
    let (db, _log) = wrapped("node:sqlite", Behaviour::all_ok());
    let statement = db.prepare("SELECT 1").unwrap();
    assert!(statement.get(&[]).unwrap().is_none());
    statement.raw(None);
    assert!(
        statement.get(&[]).unwrap().is_none(),
        "raw mode must not turn a miss into an empty row"
    );
}
