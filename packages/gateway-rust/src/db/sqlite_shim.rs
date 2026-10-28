//! Native port of `packages/gateway/src/db/sqlite-shim.ts`.
//!
//! The TypeScript original is a runtime-agnostic SQLite shim. It picks a driver in a fixed
//! priority order (`bun:sqlite` → `node:sqlite` → `better-sqlite3`), adapts the chosen handle
//! to the better-sqlite3 surface drizzle expects (`db.transaction(fn)` with
//! `.deferred()`/`.immediate()`/`.exclusive()`, `stmt.raw(...)`, `stmt.columns()`), records
//! the backend it loaded in the module-level `sqliteBackend` export, and finally wraps the
//! handle in a drizzle-orm instance.
//!
//! ## Host boundary
//!
//! Everything the TS original does through `await import(...)` and `new Database(...)` is
//! external I/O and lives behind [`SqliteShimHost`] / [`SqliteDriver`]; the engine itself
//! lives behind [`RawDatabase`] and [`RawStatement`]. Nothing in this module links a SQLite
//! engine — the logic that *is* native here is the part the TS file actually implements:
//!
//! * driver selection order, the progressively-updated `sqliteBackend` value (it is set
//!   before the constructor runs, so a constructor failure leaves the previous value in
//!   place) and the exact "no backend" error message;
//! * the `node:sqlite` compatibility wrapper: the transaction shim (`BEGIN <MODE>` /
//!   `COMMIT`, `ROLLBACK` on failure with rollback errors swallowed so the original error is
//!   rethrown) and the `stmt.raw()` result-mode shim (`Object.values(row)`, skipped for empty
//!   result sets and for `get()` misses);
//! * the drizzle wiring: `extractTablesRelationalConfig(schema, createTableRelationsHelpers)`
//!   → `schemaConfig { fullSchema, schema, tableNamesMap }`, the session/database
//!   construction and `db.$client = rawDb`.
//!
//! The TS functions are `async`, but every `await` in them is a dynamic `import(...)`; a
//! native binary links its engine statically, so there is no await point left to model and
//! the ports here are synchronous. (The crate's `HostFuture` idiom is therefore not needed —
//! this shim never yields.)
//!
//! Behaviour preserved literally, including the quirks:
//!
//! * the `bun:sqlite` branch is *not* wrapped in `try`/`catch` in the original, so a load or
//!   constructor failure surfaces as [`OpenError::Driver`] instead of the friendly message;
//! * `node:sqlite` and `better-sqlite3` failures — including constructor failures — are
//!   swallowed by `catch {}` and fall through to the next candidate;
//! * `stmt.raw(enabled?)` treats anything except an explicit `false` as "enable";
//! * raw mode rewrites rows only when the result set is non-empty (`all`) / present (`get`).

use std::cell::Cell;
use std::fmt;

use crate::db::schema::{namespace_order, relational_config, Table, TableRelationalConfig};

// ── Minimal engine surface (the host side of the boundary) ───────────────────

/// A SQLite value crossing the boundary. Mirrors the JS value domain the shim passes
/// through untouched.
#[derive(Debug, Clone, PartialEq)]
pub enum Value {
    /// JS `null`.
    Null,
    /// JS `number` with an integral value.
    Integer(i64),
    /// JS `number` with a fractional value.
    Real(f64),
    /// JS `string`.
    Text(String),
    /// JS `Buffer`/`Uint8Array` (BLOB).
    Blob(Vec<u8>),
}

/// One result row as an ordered map: JS objects preserve insertion order for string keys, and
/// the drivers insert them in engine column order, which is what `Object.values(row)` (the
/// raw-mode mapping) relies on.
pub type Row = Vec<(String, Value)>;

/// `Object.values(row)` for a ported [`Row`].
pub fn row_values(row: Row) -> Vec<Value> {
    row.into_iter().map(|(_, value)| value).collect()
}

/// An error raised by the SQLite engine (or by the driver loader).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EngineError {
    message: String,
}

impl EngineError {
    /// Wrap a driver/engine error message.
    pub fn new(message: impl Into<String>) -> Self {
        EngineError {
            message: message.into(),
        }
    }

    /// The engine-provided message.
    pub fn message(&self) -> &str {
        &self.message
    }
}

impl fmt::Display for EngineError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for EngineError {}

/// better-sqlite3's `RunResult`, which `stmt.run(...)` returns.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct RunResult {
    /// `changes`.
    pub changes: i64,
    /// `lastInsertRowid`.
    pub last_insert_rowid: i64,
}

/// A prepared statement on the engine side (`stmt` in the TS original).
pub trait RawStatement: Send {
    /// `stmt.all(...params)`.
    fn all(&self, params: &[Value]) -> Result<Vec<Row>, EngineError>;
    /// `stmt.get(...params)`.
    fn get(&self, params: &[Value]) -> Result<Option<Row>, EngineError>;
    /// `stmt.run(...params)`.
    fn run(&self, params: &[Value]) -> Result<RunResult, EngineError>;
    /// `stmt.columns()` (better-sqlite3 / node:sqlite) or the `stmt.columns` getter
    /// (bun:sqlite). `None` means "this backend exposes no column metadata", which the shim
    /// turns into `[]`. The getter-vs-method difference is resolved here, inside the driver.
    fn columns(&self) -> Option<Vec<String>>;
    /// `stmt.raw(enabled)`; returns `false` when the backend has no `raw()` (node:sqlite).
    fn set_raw(&self, enabled: bool) -> bool;
}

/// An open database handle on the engine side (`db` in the TS original).
pub trait RawDatabase: Send + Sync {
    /// `db.exec(sql)`.
    fn exec(&self, sql: &str) -> Result<(), EngineError>;
    /// `db.prepare(sql)`.
    fn prepare(&self, sql: &str) -> Result<Box<dyn RawStatement>, EngineError>;
    /// `db.close()`.
    fn close(&self) -> Result<(), EngineError>;
    /// Whether the handle already provides the better-sqlite3 `db.transaction(fn)` API
    /// (`bun:sqlite` and `better-sqlite3` do; `node:sqlite` does not, hence the wrapper).
    fn native_transaction(&self) -> bool;
}

/// A loaded driver package (`bun:sqlite`, `node:sqlite`, `better-sqlite3`).
pub trait SqliteDriver: Send + Sync {
    /// `new Database(path)` / `new DatabaseSync(path)`. The driver decides which of the two
    /// API shapes it returns; the shim only needs [`RawDatabase`].
    fn open(&self, path: &str) -> Result<Box<dyn RawDatabase>, EngineError>;
}

/// Host port for every external operation of the TS module: dynamic module loading, engine
/// construction, and building the drizzle-orm database object.
///
/// Returning `None` from a `load_*` method corresponds to the `await import(...)` throwing;
/// an `Err` from [`SqliteDriver::open`] corresponds to the driver constructor throwing. Both
/// are swallowed by the `catch {}` blocks in the original except on the Bun path.
pub trait SqliteShimHost: Send + Sync {
    /// `typeof globalThis.Bun !== "undefined"`.
    fn is_bun(&self) -> bool;
    /// `await import("bun:sqlite")`.
    fn load_bun_sqlite(&self) -> Option<Box<dyn SqliteDriver>>;
    /// `await import("node:sqlite")`.
    fn load_node_sqlite(&self) -> Option<Box<dyn SqliteDriver>>;
    /// `await import("better-sqlite3")`.
    fn load_better_sqlite3(&self) -> Option<Box<dyn SqliteDriver>>;

    /// The drizzle-orm construction the shim cannot do natively: `drizzle(rawDb, { schema })`
    /// on Bun, otherwise `new BetterSQLiteSession(...)` +
    /// `new BaseSQLiteDatabase("sync", dialect, session, schemaConfig)` with
    /// `SQLiteSyncDialect` and the extracted [`DrizzleSchemaConfig`].
    fn create_drizzle(
        &self,
        client: &dyn DatabaseClient,
        adapter: DrizzleAdapter,
        config: &DrizzleSchemaConfig,
    ) -> Result<Box<dyn DrizzleDatabase>, EngineError>;
}

/// Opaque handle to the drizzle instance built by the host. The query-builder methods stay on
/// the host side of the boundary because drizzle-orm has no native equivalent here.
pub trait DrizzleDatabase: Send + Sync {}

// ── Which backend was actually loaded ────────────────────────────────────────

/// The `sqliteBackend` export's value domain.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Backend {
    /// `"bun:sqlite"`.
    BunSqlite,
    /// `"node:sqlite"`.
    NodeSqlite,
    /// `"better-sqlite3"` — also the initial value of the module-level export.
    BetterSqlite3,
}

impl Backend {
    /// The string the TS module exports (`sqliteBackend`).
    pub const fn name(self) -> &'static str {
        match self {
            Backend::BunSqlite => "bun:sqlite",
            Backend::NodeSqlite => "node:sqlite",
            Backend::BetterSqlite3 => "better-sqlite3",
        }
    }
}

/// The module-level `export let sqliteBackend`, kept as an explicit value so the port has no
/// global mutable state. [`BackendStatus::new`] starts at `BetterSqlite3`, exactly like the
/// TS declaration.
#[derive(Debug)]
pub struct BackendStatus {
    current: Cell<Backend>,
}

impl BackendStatus {
    /// A status value holding the module's initial `"better-sqlite3"`.
    pub fn new() -> Self {
        BackendStatus {
            current: Cell::new(Backend::BetterSqlite3),
        }
    }

    /// The current `sqliteBackend` value.
    pub fn get(&self) -> Backend {
        self.current.get()
    }

    /// The current `sqliteBackend` as the exported string.
    pub fn name(&self) -> &'static str {
        self.current.get().name()
    }

    fn set(&self, backend: Backend) {
        self.current.set(backend);
    }
}

impl Default for BackendStatus {
    fn default() -> Self {
        BackendStatus::new()
    }
}

/// The exact message the original throws when no backend could be loaded.
pub const NO_BACKEND_ERROR: &str = "No SQLite backend available. Jait requires Node.js 22.5+ (which includes node:sqlite) or Bun. If you're on an older Node version, install better-sqlite3 manually: npm install better-sqlite3";

/// Why `openRawSqlite` rejected.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OpenError {
    /// The `bun:sqlite` import or constructor threw. The original does not catch this branch,
    /// so the driver error escapes instead of the friendly message.
    Driver(EngineError),
    /// Every candidate failed after the `catch {}` blocks: the original's `new Error(...)`
    /// with [`NO_BACKEND_ERROR`].
    NoBackend,
}

impl fmt::Display for OpenError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            OpenError::Driver(error) => write!(formatter, "{error}"),
            OpenError::NoBackend => formatter.write_str(NO_BACKEND_ERROR),
        }
    }
}

impl std::error::Error for OpenError {}

// ── The `SqliteDatabase` surface ────────────────────────────────────────────

/// The raw-mode result of `stmt.all(...)`: the driver's row objects, or — after
/// `stmt.raw()` — the same rows mapped through `Object.values`.
#[derive(Debug, Clone, PartialEq)]
pub enum QueryRows {
    /// Objects mode (default), i.e. the rows as ordered maps.
    Objects(Vec<Row>),
    /// Raw mode: `rows.map(row => Object.values(row))`.
    Values(Vec<Vec<Value>>),
}

impl QueryRows {
    /// Number of rows, regardless of mode.
    pub fn len(&self) -> usize {
        match self {
            QueryRows::Objects(rows) => rows.len(),
            QueryRows::Values(rows) => rows.len(),
        }
    }

    /// `true` when no rows came back.
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// The rows in objects mode, if the statement is not in raw mode (or the result was
    /// empty, which the shim never rewrites).
    pub fn as_objects(&self) -> Option<&[Row]> {
        match self {
            QueryRows::Objects(rows) => Some(rows),
            QueryRows::Values(_) => None,
        }
    }

    /// The rows in raw mode, if the shim rewrote them.
    pub fn as_values(&self) -> Option<&[Vec<Value>]> {
        match self {
            QueryRows::Objects(_) => None,
            QueryRows::Values(rows) => Some(rows),
        }
    }
}

/// The result of `stmt.get(...)`: one row object, or its `Object.values` form in raw mode.
#[derive(Debug, Clone, PartialEq)]
pub enum QueryRow {
    /// Objects mode.
    Object(Row),
    /// Raw mode.
    Values(Vec<Value>),
}

impl QueryRow {
    /// The row as an ordered map, when not in raw mode.
    pub fn as_object(&self) -> Option<&Row> {
        match self {
            QueryRow::Object(row) => Some(row),
            QueryRow::Values(_) => None,
        }
    }
}

/// How a transaction is started: `BEGIN <MODE>`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TransactionMode {
    /// `deferred`.
    Deferred,
    /// `immediate`.
    Immediate,
    /// `exclusive`.
    Exclusive,
}

impl TransactionMode {
    /// The mode keyword interpolated into `BEGIN ${mode}`.
    pub const fn sql(self) -> &'static str {
        match self {
            TransactionMode::Deferred => "DEFERRED",
            TransactionMode::Immediate => "IMMEDIATE",
            TransactionMode::Exclusive => "EXCLUSIVE",
        }
    }
}

/// Run a complete native transaction as one bounded database-worker job.
///
/// The callback and commit stay on the worker's connection. Queued work is skipped
/// if its caller is cancelled; once dispatched it finishes even if the caller drops
/// the future. A body error or panic drops the transaction and rolls it back before
/// the worker admits another job. This adapter does not construct a Drizzle client.
pub async fn worker_transaction<T, F>(
    worker: &crate::db::worker::DatabaseWorker,
    mode: TransactionMode,
    body: F,
) -> Result<T, crate::db::worker::DatabaseError>
where
    T: Send + 'static,
    F: FnOnce(&rusqlite::Transaction<'_>) -> Result<T, crate::db::worker::OperationError>
        + Send
        + 'static,
{
    worker
        .run(move |connection| {
            let behavior = match mode {
                TransactionMode::Deferred => rusqlite::TransactionBehavior::Deferred,
                TransactionMode::Immediate => rusqlite::TransactionBehavior::Immediate,
                TransactionMode::Exclusive => rusqlite::TransactionBehavior::Exclusive,
            };
            let transaction = rusqlite::Transaction::new_unchecked(connection, behavior)?;
            let result = body(&transaction)?;
            transaction.commit()?;
            Ok(result)
        })
        .await
}

/// Why a transaction body failed. The original rethrows the callback's error unchanged after
/// a best-effort `ROLLBACK`; a failing `BEGIN` is outside the `try` and therefore escapes
/// directly.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TransactionError<E> {
    /// `db.exec("BEGIN ...")` failed (not caught in the original).
    Begin(EngineError),
    /// The body returned an error; it is rethrown as-is after `ROLLBACK`.
    Body(E),
}

impl<E: fmt::Display> fmt::Display for TransactionError<E> {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            TransactionError::Begin(error) => write!(formatter, "{error}"),
            TransactionError::Body(error) => write!(formatter, "{error}"),
        }
    }
}

/// A prepared statement after the shim's adaptation: `.raw(...)` handling and a `columns()`
/// fallback.
pub struct SqliteStatement {
    inner: Box<dyn RawStatement>,
    /// The wrapper's `rawMode` closure variable. `Cell` because `.raw()` is `&self` in JS.
    raw_mode: Cell<bool>,
    /// `true` when the shim installed its own `raw()`/`columns()` (the `node:sqlite` wrapper);
    /// otherwise the engine owns both and the shim forwards.
    shimmed: bool,
}

impl fmt::Debug for SqliteStatement {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("SqliteStatement")
            .field("raw_mode", &self.raw_mode.get())
            .field("shimmed", &self.shimmed)
            .finish()
    }
}

impl SqliteStatement {
    fn new(inner: Box<dyn RawStatement>, shimmed: bool) -> Self {
        SqliteStatement {
            inner,
            raw_mode: Cell::new(false),
            shimmed,
        }
    }

    /// `stmt.raw(enabled?)`: `rawMode = enabled !== false`, and the statement itself is
    /// returned so calls chain. Backends with a native `raw()` are toggled directly; the
    /// `node:sqlite` wrapper tracks the flag in the shim instead.
    pub fn raw(&self, enabled: Option<bool>) -> &Self {
        let want_raw = enabled != Some(false);
        self.raw_mode.set(want_raw);
        if !self.shimmed {
            self.inner.set_raw(want_raw);
        }
        self
    }

    /// Whether the statement is in raw (array) result mode.
    pub fn is_raw(&self) -> bool {
        self.raw_mode.get()
    }

    /// `stmt.all(...params)`. Raw mode maps non-empty result sets through `Object.values`;
    /// empty result sets are returned untouched (the `rows.length === 0` guard).
    pub fn all(&self, params: &[Value]) -> Result<QueryRows, EngineError> {
        let rows = self.inner.all(params)?;
        if !self.raw_mode.get() || rows.is_empty() {
            return Ok(QueryRows::Objects(rows));
        }
        Ok(QueryRows::Values(rows.into_iter().map(row_values).collect()))
    }

    /// `stmt.get(...params)`. Raw mode maps a present row through `Object.values`; a miss
    /// stays a miss (`!row` guard).
    pub fn get(&self, params: &[Value]) -> Result<Option<QueryRow>, EngineError> {
        let row = self.inner.get(params)?;
        match row {
            Some(row) if self.raw_mode.get() => Ok(Some(QueryRow::Values(row_values(row)))),
            Some(row) => Ok(Some(QueryRow::Object(row))),
            None => Ok(None),
        }
    }

    /// `stmt.run(...params)`, passed straight through.
    pub fn run(&self, params: &[Value]) -> Result<RunResult, EngineError> {
        self.inner.run(params)
    }

    /// `stmt.columns()`: forwarded when the backend exposes metadata, `[]` otherwise — the
    /// wrapper's `typeof meta === "function" ? meta.call(stmt) : []` fallback.
    pub fn columns(&self) -> Vec<String> {
        self.inner.columns().unwrap_or_default()
    }
}

/// An open database handle adapted to the surface drizzle expects.
pub struct SqliteDatabase {
    raw: Box<dyn RawDatabase>,
    backend: Backend,
    /// `true` for the `node:sqlite` compatibility wrapper (`wrapNodeSqlite`).
    wrapped: bool,
}

impl fmt::Debug for SqliteDatabase {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("SqliteDatabase")
            .field("backend", &self.backend)
            .field("wrapped", &self.wrapped)
            .finish()
    }
}

impl SqliteDatabase {
    /// Adapt a handle that already provides the better-sqlite3 surface (`bun:sqlite`,
    /// `better-sqlite3`): no wrapping, `raw()` and `transaction()` go to the engine.
    pub fn new(raw: Box<dyn RawDatabase>, backend: Backend) -> Self {
        SqliteDatabase {
            raw,
            backend,
            wrapped: false,
        }
    }

    /// `wrapNodeSqlite(rawDb)`: add the missing better-sqlite3 surface to a `node:sqlite`
    /// handle.
    pub fn wrap_node_sqlite(raw: Box<dyn RawDatabase>) -> Self {
        SqliteDatabase {
            raw,
            backend: Backend::NodeSqlite,
            wrapped: true,
        }
    }

    /// The backend this handle came from (`sqliteBackend` at open time).
    pub fn backend(&self) -> Backend {
        self.backend
    }

    /// `true` when this is the `node:sqlite` compatibility wrapper.
    pub fn is_wrapped(&self) -> bool {
        self.wrapped
    }

    /// `db.exec(sql)`.
    pub fn exec(&self, sql: &str) -> Result<(), EngineError> {
        self.raw.exec(sql)
    }

    /// `db.prepare(sql)`.
    pub fn prepare(&self, sql: &str) -> Result<SqliteStatement, EngineError> {
        self.raw
            .prepare(sql)
            .map(|statement| SqliteStatement::new(statement, self.wrapped))
    }

    /// `db.close()`.
    pub fn close(&self) -> Result<(), EngineError> {
        self.raw.close()
    }

    /// `db.transaction(fn)`: the object of three run functions the original returns.
    pub fn transaction(&self) -> Transaction<'_> {
        Transaction { db: self }
    }
}

impl DatabaseClient for SqliteDatabase {
    fn exec(&self, sql: &str) -> Result<(), EngineError> {
        SqliteDatabase::exec(self, sql)
    }

    fn prepare(&self, sql: &str) -> Result<SqliteStatement, EngineError> {
        SqliteDatabase::prepare(self, sql)
    }

    fn close(&self) -> Result<(), EngineError> {
        SqliteDatabase::close(self)
    }

    fn transaction(&self) -> Transaction<'_> {
        SqliteDatabase::transaction(self)
    }
}

/// The `SqliteDatabase` surface drizzle's session calls back into (`rawDb` in the original).
pub trait DatabaseClient: Send + Sync {
    /// `db.exec(sql)`.
    fn exec(&self, sql: &str) -> Result<(), EngineError>;
    /// `db.prepare(sql)`.
    fn prepare(&self, sql: &str) -> Result<SqliteStatement, EngineError>;
    /// `db.close()`.
    fn close(&self) -> Result<(), EngineError>;
    /// `db.transaction(fn)`.
    fn transaction(&self) -> Transaction<'_>;
}

/// The object `db.transaction(fn)` returns: `deferred`, `immediate`, `exclusive`.
pub struct Transaction<'a> {
    db: &'a SqliteDatabase,
}

impl<'a> Transaction<'a> {
    /// `transaction(fn).deferred(...)`.
    pub fn deferred<T, E, F>(&self, body: F) -> Result<T, TransactionError<E>>
    where
        F: FnOnce(&SqliteDatabase) -> Result<T, E>,
    {
        self.run(TransactionMode::Deferred, body)
    }

    /// `transaction(fn).immediate(...)`.
    pub fn immediate<T, E, F>(&self, body: F) -> Result<T, TransactionError<E>>
    where
        F: FnOnce(&SqliteDatabase) -> Result<T, E>,
    {
        self.run(TransactionMode::Immediate, body)
    }

    /// `transaction(fn).exclusive(...)`.
    pub fn exclusive<T, E, F>(&self, body: F) -> Result<T, TransactionError<E>>
    where
        F: FnOnce(&SqliteDatabase) -> Result<T, E>,
    {
        self.run(TransactionMode::Exclusive, body)
    }

    /// `BEGIN <MODE>`; run the body; `COMMIT`. Any body error triggers a best-effort
    /// `ROLLBACK` whose own failure is swallowed, then the original error is rethrown. A
    /// failing `BEGIN` escapes on its own, as in the original.
    ///
    /// The body receives the client handle (the original passes drizzle's transaction wrapper,
    /// which is a drizzle-level object and therefore does not exist below this boundary).
    fn run<T, E, F>(&self, mode: TransactionMode, body: F) -> Result<T, TransactionError<E>>
    where
        F: FnOnce(&SqliteDatabase) -> Result<T, E>,
    {
        self.db
            .exec(&format!("BEGIN {}", mode.sql()))
            .map_err(TransactionError::Begin)?;
        match body(self.db) {
            Ok(value) => {
                if let Err(error) = self.db.exec("COMMIT") {
                    let _ = self.db.exec("ROLLBACK");
                    return Err(TransactionError::Begin(error));
                }
                Ok(value)
            }
            Err(error) => {
                // Rollback failure (e.g. no active transaction) is ignored on purpose: the
                // original surfaces the body error, not the rollback error.
                let _ = self.db.exec("ROLLBACK");
                Err(TransactionError::Body(error))
            }
        }
    }
}

// ── Factory: open a raw SQLite database ─────────────────────────────────────

/// `openRawSqlite`'s success value: the adapted handle plus the backend it came from.
#[derive(Debug)]
pub struct OpenedDatabase {
    /// The adapted handle.
    pub db: SqliteDatabase,
    /// The backend that was loaded (`sqliteBackend` after this call).
    pub backend: Backend,
}

impl OpenedDatabase {
    /// The `sqliteBackend` string for this open.
    pub fn backend_name(&self) -> &'static str {
        self.backend.name()
    }
}

/// `openRawSqlite(path)`: try `bun:sqlite` (Bun only), then `node:sqlite`, then
/// `better-sqlite3`, mutating `status` exactly where the original mutates its module-level
/// `sqliteBackend`.
///
/// The status is written *before* the driver constructor runs, so a failed construction still
/// leaves the attempted backend recorded — the original behaves the same way, and that value
/// is observable through the `sqliteBackend` export after the rejection.
pub fn open_raw_sqlite(
    host: &dyn SqliteShimHost,
    path: &str,
    status: &BackendStatus,
) -> Result<OpenedDatabase, OpenError> {
    if host.is_bun() {
        // `await import("bun:sqlite")` is not inside a try/catch in the original: a load or
        // constructor failure rejects openRawSqlite with the driver error.
        let driver = host.load_bun_sqlite().ok_or_else(|| {
            OpenError::Driver(EngineError::new("bun:sqlite module is unavailable"))
        })?;
        status.set(Backend::BunSqlite);
        let raw = driver.open(path).map_err(OpenError::Driver)?;
        return Ok(OpenedDatabase {
            db: SqliteDatabase::new(raw, Backend::BunSqlite),
            backend: Backend::BunSqlite,
        });
    }

    // Node.js path: prefer the built-in node:sqlite, falling back to better-sqlite3.
    if let Some(driver) = host.load_node_sqlite() {
        status.set(Backend::NodeSqlite);
        if let Ok(raw) = driver.open(path) {
            return Ok(OpenedDatabase {
                db: SqliteDatabase::wrap_node_sqlite(raw),
                backend: Backend::NodeSqlite,
            });
        }
        // Constructor threw: swallowed by the original's `catch {}`, keep looking.
    }

    // Last resort: better-sqlite3, if it happens to be installed.
    if let Some(driver) = host.load_better_sqlite3() {
        status.set(Backend::BetterSqlite3);
        if let Ok(raw) = driver.open(path) {
            return Ok(OpenedDatabase {
                db: SqliteDatabase::new(raw, Backend::BetterSqlite3),
                backend: Backend::BetterSqlite3,
            });
        }
    }

    Err(OpenError::NoBackend)
}

// ── Factory: wrap a raw handle with the Drizzle adapter ─────────────────────

/// Which drizzle adapter the instance was built with. The original picks it from `isBun`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DrizzleAdapter {
    /// `drizzle-orm/bun-sqlite` — `drizzle(rawDb, { schema })`.
    BunSqlite,
    /// `drizzle-orm/better-sqlite3/session` +
    /// `drizzle-orm/sqlite-core/db` — the non-Bun path that avoids the native-addon import.
    BetterSqlite3Session,
}

impl DrizzleAdapter {
    /// The module path the original imports for this adapter.
    pub const fn module(self) -> &'static str {
        match self {
            DrizzleAdapter::BunSqlite => "drizzle-orm/bun-sqlite",
            DrizzleAdapter::BetterSqlite3Session => "drizzle-orm/better-sqlite3/session",
        }
    }
}

/// `schemaConfig` as passed to `BetterSQLiteSession`/`BaseSQLiteDatabase`, i.e. the result of
/// `extractTablesRelationalConfig(schema, createTableRelationsHelpers)` plus `fullSchema`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DrizzleSchemaConfig {
    /// `fullSchema: schema` — the schema namespace, in namespace order.
    pub full_schema: Vec<&'static Table>,
    /// `schema: tablesConfig.tables`.
    pub schema: Vec<TableRelationalConfig>,
    /// `tableNamesMap: tablesConfig.tableNamesMap`.
    pub table_names_map: Vec<(&'static str, &'static str)>,
}

impl DrizzleSchemaConfig {
    /// Build the config from the ported schema. The Bun adapter derives this internally from
    /// `{ schema }` via the same pure function, so handing it over explicitly is equivalent.
    pub fn from_schema() -> Self {
        let tables = relational_config();
        DrizzleSchemaConfig {
            full_schema: namespace_order(),
            schema: tables.tables,
            table_names_map: tables.table_names_map,
        }
    }

    /// `schemaConfig.schema[name]`.
    pub fn table(&self, ts_name: &str) -> Option<&TableRelationalConfig> {
        self.schema.iter().find(|table| table.ts_name == ts_name)
    }

    /// `schemaConfig.tableNamesMap[dbName]`.
    pub fn ts_name_for_db_name(&self, db_name: &str) -> Option<&'static str> {
        self.table_names_map
            .iter()
            .find(|(name, _)| *name == db_name)
            .map(|(_, ts_name)| *ts_name)
    }
}

impl Default for DrizzleSchemaConfig {
    fn default() -> Self {
        DrizzleSchemaConfig::from_schema()
    }
}

/// `createDrizzle(rawDb)`'s value: the host-built instance plus the wiring the original
/// attaches to it (`db.$client`, the adapter, the schema config).
pub struct DrizzleConnection {
    /// `true` when the Bun adapter was used.
    pub adapter: DrizzleAdapter,
    /// The backend of the handle that was wrapped — what `db.$client` refers to
    /// (`db.$client === rawDb` in the original).
    pub client_backend: Backend,
    /// The config handed to the session/database constructor.
    pub config: DrizzleSchemaConfig,
    /// The drizzle instance built by the host.
    pub db: Box<dyn DrizzleDatabase>,
}

/// `createDrizzle(rawDb)`: on Bun, `drizzle(rawDb, { schema })`; otherwise the session +
/// `BaseSQLiteDatabase` construction that bypasses
/// `drizzle-orm/better-sqlite3/driver.js` (which top-level-imports the native addon), with
/// `db.$client` pointed at the raw handle.
pub fn create_drizzle(
    host: &dyn SqliteShimHost,
    client: &SqliteDatabase,
) -> Result<DrizzleConnection, EngineError> {
    let adapter = if host.is_bun() {
        DrizzleAdapter::BunSqlite
    } else {
        DrizzleAdapter::BetterSqlite3Session
    };
    let config = DrizzleSchemaConfig::from_schema();
    let db = host.create_drizzle(client, adapter, &config)?;
    Ok(DrizzleConnection {
        adapter,
        client_backend: client.backend(),
        config,
        db,
    })
}

impl std::fmt::Debug for DrizzleConnection {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        // `db` is a host-supplied drizzle instance (`dyn DrizzleDatabase`), which is not
        // necessarily `Debug`; the original prints it as an opaque object too.
        f.debug_struct("DrizzleConnection")
            .field("adapter", &self.adapter)
            .field("client_backend", &self.client_backend)
            .field("config", &self.config)
            .field("db", &"<dyn DrizzleDatabase>")
            .finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    // ── Fake engine ────────────────────────────────────────────────────────

    /// Records every `exec` the shim issues and replays scripted statement results.
    #[derive(Debug, Default)]
    struct FakeState {
        executed: Vec<String>,
        prepared: Vec<String>,
        closed: usize,
        /// Statements whose `exec` should fail (SQL prefix match).
        fail_exec: Vec<String>,
        rows: Vec<Row>,
        columns: Option<Vec<String>>,
        native_raw: bool,
        raw_calls: Vec<bool>,
    }

    struct FakeDb {
        state: Arc<Mutex<FakeState>>,
        native_transaction: bool,
    }

    impl FakeDb {
        fn new(state: Arc<Mutex<FakeState>>, native_transaction: bool) -> Self {
            FakeDb {
                state,
                native_transaction,
            }
        }
    }

    struct FakeStatement {
        state: Arc<Mutex<FakeState>>,
    }

    impl RawDatabase for FakeDb {
        fn exec(&self, sql: &str) -> Result<(), EngineError> {
            let mut state = self.state.lock().unwrap();
            state.executed.push(sql.to_string());
            if state
                .fail_exec
                .iter()
                .any(|prefix| sql.starts_with(prefix.as_str()))
            {
                return Err(EngineError::new(format!("exec failed: {sql}")));
            }
            Ok(())
        }

        fn prepare(&self, sql: &str) -> Result<Box<dyn RawStatement>, EngineError> {
            self.state.lock().unwrap().prepared.push(sql.to_string());
            Ok(Box::new(FakeStatement {
                state: Arc::clone(&self.state),
            }))
        }

        fn close(&self) -> Result<(), EngineError> {
            self.state.lock().unwrap().closed += 1;
            Ok(())
        }

        fn native_transaction(&self) -> bool {
            self.native_transaction
        }
    }

    impl RawStatement for FakeStatement {
        fn all(&self, _params: &[Value]) -> Result<Vec<Row>, EngineError> {
            Ok(self.state.lock().unwrap().rows.clone())
        }

        fn get(&self, _params: &[Value]) -> Result<Option<Row>, EngineError> {
            Ok(self.state.lock().unwrap().rows.first().cloned())
        }

        fn run(&self, _params: &[Value]) -> Result<RunResult, EngineError> {
            Ok(RunResult {
                changes: 1,
                last_insert_rowid: 7,
            })
        }

        fn columns(&self) -> Option<Vec<String>> {
            self.state.lock().unwrap().columns.clone()
        }

        fn set_raw(&self, enabled: bool) -> bool {
            let mut state = self.state.lock().unwrap();
            if !state.native_raw {
                return false;
            }
            state.raw_calls.push(enabled);
            true
        }
    }

    fn row(id: i64, name: &str) -> Row {
        vec![
            ("id".to_string(), Value::Integer(id)),
            ("name".to_string(), Value::Text(name.to_string())),
        ]
    }

    // ── Fake host ──────────────────────────────────────────────────────────

    struct FakeDriver {
        state: Arc<Mutex<FakeState>>,
        /// When set, `open()` fails (the driver constructor threw).
        fail_open: bool,
        native_transaction: bool,
    }

    impl SqliteDriver for FakeDriver {
        fn open(&self, _path: &str) -> Result<Box<dyn RawDatabase>, EngineError> {
            if self.fail_open {
                return Err(EngineError::new("constructor failed"));
            }
            Ok(Box::new(FakeDb::new(
                Arc::clone(&self.state),
                self.native_transaction,
            )))
        }
    }

    #[derive(Default)]
    struct FakeHost {
        is_bun: bool,
        bun: Option<(Arc<Mutex<FakeState>>, bool, bool)>,
        node: Option<(Arc<Mutex<FakeState>>, bool, bool)>,
        better: Option<(Arc<Mutex<FakeState>>, bool, bool)>,
        /// The `(adapter, table count, client backend)` the host observed.
        drizzle_calls: Mutex<Vec<(DrizzleAdapter, usize)>>,
        drizzle_error: Option<&'static str>,
    }

    fn driver(
        spec: &Option<(Arc<Mutex<FakeState>>, bool, bool)>,
    ) -> Option<Box<dyn SqliteDriver>> {
        spec.as_ref().map(|(state, fail_open, native_transaction)| {
            Box::new(FakeDriver {
                state: Arc::clone(state),
                fail_open: *fail_open,
                native_transaction: *native_transaction,
            }) as Box<dyn SqliteDriver>
        })
    }

    struct FakeDrizzle;
    impl DrizzleDatabase for FakeDrizzle {}

    impl SqliteShimHost for FakeHost {
        fn is_bun(&self) -> bool {
            self.is_bun
        }

        fn load_bun_sqlite(&self) -> Option<Box<dyn SqliteDriver>> {
            driver(&self.bun)
        }

        fn load_node_sqlite(&self) -> Option<Box<dyn SqliteDriver>> {
            driver(&self.node)
        }

        fn load_better_sqlite3(&self) -> Option<Box<dyn SqliteDriver>> {
            driver(&self.better)
        }

        fn create_drizzle(
            &self,
            client: &dyn DatabaseClient,
            adapter: DrizzleAdapter,
            config: &DrizzleSchemaConfig,
        ) -> Result<Box<dyn DrizzleDatabase>, EngineError> {
            assert!(client.exec("SELECT 1").is_ok(), "client is usable");
            self.drizzle_calls
                .lock()
                .unwrap()
                .push((adapter, config.schema.len()));
            match self.drizzle_error {
                Some(message) => Err(EngineError::new(message)),
                None => Ok(Box::new(FakeDrizzle)),
            }
        }
    }

    fn host_with(
        is_bun: bool,
        node: Option<(bool, bool)>,
        better: Option<(bool, bool)>,
    ) -> (FakeHost, Arc<Mutex<FakeState>>) {
        let state = Arc::new(Mutex::new(FakeState::default()));
        let wrap = |spec: Option<(bool, bool)>| {
            spec.map(|(fail_open, native_transaction)| {
                (Arc::clone(&state), fail_open, native_transaction)
            })
        };
        (
            FakeHost {
                is_bun,
                bun: None,
                node: wrap(node),
                better: wrap(better),
                ..FakeHost::default()
            },
            state,
        )
    }

    // ── Driver selection ───────────────────────────────────────────────────

    #[test]
    fn backend_names_and_initial_status_match_the_export() {
        assert_eq!(BackendStatus::new().name(), "better-sqlite3");
        assert_eq!(BackendStatus::new().get(), Backend::BetterSqlite3);
        assert_eq!(Backend::BunSqlite.name(), "bun:sqlite");
        assert_eq!(Backend::NodeSqlite.name(), "node:sqlite");
        assert_eq!(Backend::BetterSqlite3.name(), "better-sqlite3");
    }

    #[test]
    fn bun_runtime_uses_bun_sqlite_and_never_wraps() {
        let state = Arc::new(Mutex::new(FakeState::default()));
        let host = FakeHost {
            is_bun: true,
            bun: Some((Arc::clone(&state), false, true)),
            // node/better-sqlite3 must not even be consulted
            node: Some((Arc::clone(&state), false, false)),
            better: Some((Arc::clone(&state), false, false)),
            ..FakeHost::default()
        };
        let status = BackendStatus::new();
        let opened = open_raw_sqlite(&host, "test.db", &status).expect("opens");
        assert_eq!(opened.backend, Backend::BunSqlite);
        assert_eq!(opened.backend_name(), "bun:sqlite");
        assert_eq!(status.get(), Backend::BunSqlite);
        assert_eq!(opened.db.backend(), Backend::BunSqlite);
        assert!(!opened.db.is_wrapped());
        assert!(state.lock().unwrap().executed.is_empty());
    }

    #[test]
    fn bun_load_failure_is_not_swallowed() {
        // The Bun branch is outside try/catch in the original, so the driver error escapes
        // instead of the friendly "no backend" message.
        let host = FakeHost {
            is_bun: true,
            ..FakeHost::default()
        };
        let status = BackendStatus::new();
        let error = open_raw_sqlite(&host, "test.db", &status).expect_err("fails");
        assert!(matches!(error, OpenError::Driver(_)));
        assert_ne!(error.to_string(), NO_BACKEND_ERROR);
        assert_eq!(status.get(), Backend::BetterSqlite3, "untouched on load failure");
    }

    #[test]
    fn bun_constructor_failure_surfaces_as_driver_error() {
        let state = Arc::new(Mutex::new(FakeState::default()));
        let host = FakeHost {
            is_bun: true,
            bun: Some((Arc::clone(&state), true, true)),
            ..FakeHost::default()
        };
        let status = BackendStatus::new();
        let error = open_raw_sqlite(&host, "test.db", &status).expect_err("fails");
        assert_eq!(error, OpenError::Driver(EngineError::new("constructor failed")));
        // sqliteBackend was assigned before the constructor ran
        assert_eq!(status.get(), Backend::BunSqlite);
    }

    #[test]
    fn node_sqlite_is_preferred_and_wrapped() {
        let (host, state) = host_with(false, Some((false, false)), Some((false, true)));
        let status = BackendStatus::new();
        let opened = open_raw_sqlite(&host, "test.db", &status).expect("opens");
        assert_eq!(opened.backend, Backend::NodeSqlite);
        assert_eq!(status.get(), Backend::NodeSqlite);
        assert!(opened.db.is_wrapped());
        // the wrapper never forwards raw() to engines without it
        let statement = opened.db.prepare("SELECT 1").expect("prepared");
        statement.raw(None);
        assert!(statement.is_raw());
        assert!(state.lock().unwrap().raw_calls.is_empty());
        assert_eq!(state.lock().unwrap().prepared, vec!["SELECT 1"]);
    }

    #[test]
    fn node_constructor_failure_falls_back_to_better_sqlite3() {
        let (host, _state) = host_with(false, Some((true, false)), Some((false, true)));
        let status = BackendStatus::new();
        let opened = open_raw_sqlite(&host, "test.db", &status).expect("opens");
        assert_eq!(opened.backend, Backend::BetterSqlite3);
        assert_eq!(status.get(), Backend::BetterSqlite3);
        assert!(!opened.db.is_wrapped());
    }

    #[test]
    fn no_backend_reports_the_exact_message_and_keeps_the_last_attempt() {
        let (host, _state) = host_with(false, Some((true, false)), None);
        let status = BackendStatus::new();
        let error = open_raw_sqlite(&host, "test.db", &status).expect_err("fails");
        assert_eq!(error, OpenError::NoBackend);
        assert_eq!(
            error.to_string(),
            "No SQLite backend available. Jait requires Node.js 22.5+ (which includes node:sqlite) or Bun. If you're on an older Node version, install better-sqlite3 manually: npm install better-sqlite3"
        );
        assert_eq!(error.to_string(), NO_BACKEND_ERROR);
        // node:sqlite was recorded before its constructor threw, and better-sqlite3 never
        // loaded, so the export keeps the attempted value.
        assert_eq!(status.name(), "node:sqlite");
    }

    #[test]
    fn missing_node_sqlite_goes_straight_to_better_sqlite3() {
        let (host, _state) = host_with(false, None, Some((false, true)));
        let status = BackendStatus::new();
        let opened = open_raw_sqlite(&host, "test.db", &status).expect("opens");
        assert_eq!(opened.backend, Backend::BetterSqlite3);
        assert_eq!(status.name(), "better-sqlite3");
    }

    // ── Statement surface ──────────────────────────────────────────────────

    #[test]
    fn raw_mode_maps_rows_to_values_only_when_non_empty() {
        let state = Arc::new(Mutex::new(FakeState {
            rows: vec![row(1, "alpha"), row(2, "beta")],
            ..FakeState::default()
        }));
        let db = SqliteDatabase::wrap_node_sqlite(Box::new(FakeDb::new(
            Arc::clone(&state),
            false,
        )));
        let statement = db.prepare("SELECT id, name FROM t").expect("prepared");

        assert!(!statement.is_raw());
        let objects = statement.all(&[]).expect("all");
        assert_eq!(objects.len(), 2);
        assert_eq!(objects.as_objects().expect("objects")[0], row(1, "alpha"));
        assert!(objects.as_values().is_none());

        // `raw()` with no argument enables raw mode
        statement.raw(None);
        let values = statement.all(&[]).expect("all");
        assert_eq!(
            values.as_values().expect("values"),
            &vec![
                vec![Value::Integer(1), Value::Text("alpha".into())],
                vec![Value::Integer(2), Value::Text("beta".into())],
            ]
        );

        // get() maps a present row and passes a miss through
        assert_eq!(
            statement.get(&[]).expect("get"),
            Some(QueryRow::Values(vec![
                Value::Integer(1),
                Value::Text("alpha".into())
            ]))
        );
        state.lock().unwrap().rows.clear();
        // TS: `if (!rawMode || rows.length === 0) return rows;` — an empty result set is
        // returned unmapped even while raw mode is on. TS hands back a bare `[]` that carries
        // no shape tag; the Rust port keeps the objects flavour because no `Object.values`
        // mapping ran, so `as_values()` is None here.
        assert_eq!(
            statement.all(&[]).expect("all").as_objects(),
            Some(&[][..]),
            "empty result sets are never rewritten"
        );
        assert!(statement.all(&[]).expect("all").as_values().is_none());
        assert_eq!(statement.get(&[]).expect("get"), None);

        // explicit false disables raw mode again
        statement.raw(Some(false));
        assert!(!statement.is_raw());
        assert_eq!(
            statement.all(&[]).expect("all").as_objects(),
            Some(&[][..])
        );
    }

    #[test]
    fn better_sqlite3_statements_forward_raw_to_the_engine() {
        let state = Arc::new(Mutex::new(FakeState {
            rows: vec![row(1, "alpha")],
            native_raw: true,
            ..FakeState::default()
        }));
        let db = SqliteDatabase::new(
            Box::new(FakeDb::new(Arc::clone(&state), true)),
            Backend::BetterSqlite3,
        );
        let statement = db.prepare("SELECT 1").expect("prepared");
        statement.raw(Some(true));
        assert_eq!(state.lock().unwrap().raw_calls, vec![true]);
        // `enabled !== false`, so `Some(true)` and `None` both enable
        statement.raw(None);
        assert_eq!(state.lock().unwrap().raw_calls, vec![true, true]);
        statement.raw(Some(false));
        assert_eq!(state.lock().unwrap().raw_calls, vec![true, true, false]);
        assert_eq!(
            statement.run(&[]).expect("run"),
            RunResult {
                changes: 1,
                last_insert_rowid: 7
            }
        );
    }

    #[test]
    fn columns_falls_back_to_an_empty_list() {
        let state = Arc::new(Mutex::new(FakeState::default()));
        let db = SqliteDatabase::wrap_node_sqlite(Box::new(FakeDb::new(
            Arc::clone(&state),
            false,
        )));
        let statement = db.prepare("SELECT 1").expect("prepared");
        assert!(statement.columns().is_empty());

        state.lock().unwrap().columns = Some(vec!["id".to_string(), "name".to_string()]);
        assert_eq!(statement.columns(), vec!["id".to_string(), "name".to_string()]);
    }

    // ── Transactions ──────────────────────────────────────────────────────

    #[test]
    fn transaction_shim_commits_and_rolls_back() {
        let state = Arc::new(Mutex::new(FakeState::default()));
        let db = SqliteDatabase::wrap_node_sqlite(Box::new(FakeDb::new(
            Arc::clone(&state),
            false,
        )));

        let committed = db
            .transaction()
            .deferred(|_tx| Ok::<i32, String>(41 + 1))
            .expect("commits");
        assert_eq!(committed, 42);
        assert_eq!(
            state.lock().unwrap().executed,
            vec!["BEGIN DEFERRED", "COMMIT"]
        );

        state.lock().unwrap().executed.clear();
        let failed = db
            .transaction()
            .immediate(|_tx| Err::<(), String>("boom".to_string()))
            .expect_err("rolls back");
        assert_eq!(failed, TransactionError::Body("boom".to_string()));
        assert_eq!(
            state.lock().unwrap().executed,
            vec!["BEGIN IMMEDIATE", "ROLLBACK"]
        );

        state.lock().unwrap().executed.clear();
        db.transaction()
            .exclusive(|_tx| Ok::<(), String>(()))
            .expect("commits");
        assert_eq!(
            state.lock().unwrap().executed,
            vec!["BEGIN EXCLUSIVE", "COMMIT"]
        );
    }

    #[test]
    fn rollback_failures_do_not_mask_the_body_error() {
        let state = Arc::new(Mutex::new(FakeState {
            fail_exec: vec!["ROLLBACK".to_string()],
            ..FakeState::default()
        }));
        let db = SqliteDatabase::wrap_node_sqlite(Box::new(FakeDb::new(
            Arc::clone(&state),
            false,
        )));
        let error = db
            .transaction()
            .deferred(|_tx| Err::<(), &'static str>("original"))
            .expect_err("fails");
        assert_eq!(error, TransactionError::Body("original"));
        assert_eq!(
            state.lock().unwrap().executed,
            vec!["BEGIN DEFERRED", "ROLLBACK"]
        );
    }

    #[tokio::test]
    async fn worker_transaction_rolls_back_errors_and_finishes_after_cancellation() {
        use crate::db::worker::DatabaseWorker;
        use std::num::NonZeroU16;
        use std::time::Duration;

        let connection = rusqlite::Connection::open_in_memory().unwrap();
        connection.execute_batch("CREATE TABLE counter(value INTEGER); INSERT INTO counter VALUES(0)").unwrap();
        let worker = DatabaseWorker::new(connection, NonZeroU16::new(4).unwrap()).unwrap();

        let failure = worker_transaction(&worker, TransactionMode::Immediate, |tx| {
            tx.execute("UPDATE counter SET value = 99", [])?;
            Err::<(), _>(std::io::Error::other("body failed").into())
        }).await;
        assert!(matches!(failure, Err(crate::db::worker::DatabaseError::Operation(_))));
        let value = worker.run(|db| Ok(db.query_row("SELECT value FROM counter", [], |row| row.get::<_, i64>(0))?)).await.unwrap();
        assert_eq!(value, 0);

        let (entered, started) = tokio::sync::oneshot::channel();
        let (release, wait) = std::sync::mpsc::channel();
        let active = worker.clone();
        let task = tokio::spawn(async move {
            worker_transaction(&active, TransactionMode::Immediate, move |tx| {
                tx.execute("UPDATE counter SET value = 7", [])?;
                let _ = entered.send(());
                wait.recv_timeout(Duration::from_secs(5))?;
                Ok(())
            }).await
        });
        tokio::time::timeout(Duration::from_secs(5), started).await.unwrap().unwrap();
        task.abort();
        let _ = task.await;
        release.send(()).unwrap();
        let value = worker.run(|db| Ok(db.query_row("SELECT value FROM counter", [], |row| row.get::<_, i64>(0))?)).await.unwrap();
        assert_eq!(value, 7, "the next job sees the finished transaction");
        worker.shutdown().await.unwrap();
    }

    #[test]
    fn commit_failure_rolls_back_and_preserves_original_error() {
        let state = Arc::new(Mutex::new(FakeState {
            fail_exec: vec!["COMMIT".to_string(), "ROLLBACK".to_string()],
            ..FakeState::default()
        }));
        let db = SqliteDatabase::wrap_node_sqlite(Box::new(FakeDb::new(
            Arc::clone(&state),
            false,
        )));
        let error = db
            .transaction()
            .deferred(|_tx| Ok::<(), &'static str>(()))
            .expect_err("commit fails");
        assert_eq!(
            error,
            TransactionError::Begin(EngineError::new("exec failed: COMMIT"))
        );
        assert_eq!(
            state.lock().unwrap().executed,
            vec!["BEGIN DEFERRED", "COMMIT", "ROLLBACK"]
        );
    }

    #[test]
    fn begin_failures_escape_without_running_the_body() {
        let state = Arc::new(Mutex::new(FakeState {
            fail_exec: vec!["BEGIN".to_string()],
            ..FakeState::default()
        }));
        let db = SqliteDatabase::wrap_node_sqlite(Box::new(FakeDb::new(
            Arc::clone(&state),
            false,
        )));
        let mut ran = false;
        let error = db
            .transaction()
            .deferred(|_tx| {
                ran = true;
                Ok::<(), &'static str>(())
            })
            .expect_err("fails");
        assert_eq!(
            error,
            TransactionError::Begin(EngineError::new("exec failed: BEGIN DEFERRED"))
        );
        assert!(!ran);
        assert_eq!(
            state.lock().unwrap().executed,
            vec!["BEGIN DEFERRED"],
            "no rollback and no commit"
        );
    }

    #[test]
    fn exec_prepare_and_close_pass_through() {
        let state = Arc::new(Mutex::new(FakeState::default()));
        let db = SqliteDatabase::new(
            Box::new(FakeDb::new(Arc::clone(&state), true)),
            Backend::BetterSqlite3,
        );
        db.exec("PRAGMA journal_mode = WAL").expect("exec");
        db.prepare("SELECT 1").expect("prepare");
        db.close().expect("close");
        let state = state.lock().unwrap();
        assert_eq!(state.executed, vec!["PRAGMA journal_mode = WAL"]);
        assert_eq!(state.prepared, vec!["SELECT 1"]);
        assert_eq!(state.closed, 1);
    }

    // ── Drizzle wiring ────────────────────────────────────────────────────

    #[test]
    fn schema_config_is_the_extracted_relational_config() {
        let config = DrizzleSchemaConfig::from_schema();
        assert_eq!(config.full_schema.len(), 48);
        assert_eq!(config.schema.len(), 48);
        assert_eq!(config.table_names_map.len(), 48);
        assert_eq!(
            config.table("messageContextMetadata").map(|entry| entry.db_name),
            Some("message_context_metadata")
        );
        assert_eq!(
            config.ts_name_for_db_name("message_context_metadata"),
            Some("messageContextMetadata")
        );
        assert!(config.table("nope").is_none());
        assert_eq!(config, DrizzleSchemaConfig::default());
        assert_eq!(
            config.schema.first().map(|entry| entry.ts_name),
            Some("accountInvitations"),
            "namespace order, not source order"
        );
    }

    #[test]
    fn create_drizzle_uses_the_bun_adapter_under_bun() {
        let host = FakeHost {
            is_bun: true,
            ..FakeHost::default()
        };
        let db = SqliteDatabase::new(
            Box::new(FakeDb::new(Arc::new(Mutex::new(FakeState::default())), true)),
            Backend::BunSqlite,
        );
        let connection = create_drizzle(&host, &db).expect("drizzle");
        assert_eq!(connection.adapter, DrizzleAdapter::BunSqlite);
        assert_eq!(connection.adapter.module(), "drizzle-orm/bun-sqlite");
        assert_eq!(connection.client_backend, Backend::BunSqlite);
        assert_eq!(connection.config.schema.len(), 48);
        assert_eq!(
            host.drizzle_calls.lock().unwrap().clone(),
            vec![(DrizzleAdapter::BunSqlite, 48)]
        );
    }

    #[test]
    fn create_drizzle_uses_the_session_adapter_off_bun() {
        let (host, _state) = host_with(false, Some((false, false)), None);
        let status = BackendStatus::new();
        let opened = open_raw_sqlite(&host, "test.db", &status).expect("opens");
        let connection = create_drizzle(&host, &opened.db).expect("drizzle");
        assert_eq!(connection.adapter, DrizzleAdapter::BetterSqlite3Session);
        assert_eq!(
            connection.adapter.module(),
            "drizzle-orm/better-sqlite3/session"
        );
        // db.$client === rawDb
        assert_eq!(connection.client_backend, Backend::NodeSqlite);
        assert_eq!(
            host.drizzle_calls.lock().unwrap().clone(),
            vec![(DrizzleAdapter::BetterSqlite3Session, 48)]
        );
    }

    #[test]
    fn create_drizzle_surfaces_host_errors() {
        let host = FakeHost {
            is_bun: false,
            drizzle_error: Some("drizzle exploded"),
            ..FakeHost::default()
        };
        let db = SqliteDatabase::wrap_node_sqlite(Box::new(FakeDb::new(
            Arc::new(Mutex::new(FakeState::default())),
            false,
        )));
        let error = create_drizzle(&host, &db).expect_err("fails");
        assert_eq!(error, EngineError::new("drizzle exploded"));
    }
}
