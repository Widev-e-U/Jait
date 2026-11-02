//! Code-graph indexing lifecycle and authorized file/runner composition.
//! The caller authorizes projectRoot/dataRoot and process execution before use.
//! Worker-backed storage keeps SQLite off asynchronous executor threads.
use super::{
    engine::{ExecRequest, Executor, GraphError, path_join},
    graph::{self, ParsedGraph},
    graphrag::{GraphSnapshot, write_graph_rag_export_with_clock},
    runner::{GraphifyRunner, RunResult, check_cancelled},
    store::IndexStore,
};
use crate::{
    execution::process_runner::ProcessCancellation,
    text::js_trim,
    time::{Clock, default_clock},
};
use futures_util::{
    FutureExt,
    future::{BoxFuture, Shared},
};
use rusqlite::Connection;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, HashMap},
    path::Path,
    sync::{Arc, Mutex},
};

#[derive(Clone)]
pub struct BuildRequest {
    pub project_root: String,
    pub output_dir: String,
    pub signal: Option<ProcessCancellation>,
}
pub type Build =
    Arc<dyn Fn(BuildRequest) -> BoxFuture<'static, Result<RunResult, GraphError>> + Send + Sync>;
pub type Revision = Arc<dyn Fn(String) -> BoxFuture<'static, Option<String>> + Send + Sync>;
type BuildFuture = Shared<BoxFuture<'static, Result<Value, GraphError>>>;
enum IndexDatabase {
    Legacy(Arc<Mutex<Connection>>),
    Worker(crate::db::worker::DatabaseWorker),
}
pub struct CodeGraphService {
    db: IndexDatabase,
    pub data_root: String,
    pub home: String,
    pub clock: Clock,
    pub build: Build,
    pub revision: Revision,
    active: Mutex<HashMap<(Option<String>, String), BuildFuture>>,
    // Held by the blocking writer itself so dropping its caller cannot unlock early.
    export_lock: Arc<tokio::sync::Mutex<()>>,
}
// Cleanup runs even if the build task unwinds, matching the reference's
// finally block and allowing a later request to retry the same graph.
struct ActiveBuildGuard {
    service: Arc<CodeGraphService>,
    key: (Option<String>, String),
}
impl Drop for ActiveBuildGuard {
    fn drop(&mut self) {
        if let Ok(mut active) = self.service.active.lock() {
            active.remove(&self.key);
        }
    }
}
impl CodeGraphService {
    pub fn new(
        db: Arc<Mutex<Connection>>,
        data_root: String,
        home: String,
        build: Build,
        revision: Revision,
    ) -> Self {
        Self {
            db: IndexDatabase::Legacy(db),
            data_root,
            home,
            clock: default_clock(),
            build,
            revision,
            active: Mutex::new(HashMap::new()),
            export_lock: Arc::new(tokio::sync::Mutex::new(())),
        }
    }
    /// Share the runtime's bounded SQLite worker; the caller retains lifecycle ownership.
    pub fn with_worker(
        db: crate::db::worker::DatabaseWorker,
        data_root: String,
        home: String,
        build: Build,
        revision: Revision,
    ) -> Self {
        Self {
            db: IndexDatabase::Worker(db),
            data_root,
            home,
            clock: default_clock(),
            build,
            revision,
            active: Mutex::new(HashMap::new()),
            export_lock: Arc::new(tokio::sync::Mutex::new(())),
        }
    }
    /// Construct only after authorizing the supplied runner and revision executor.
    pub fn runner_build(runner: GraphifyRunner) -> Build {
        Arc::new(move |request| {
            let runner = runner.clone();
            Box::pin(async move {
                runner
                    .build(&request.project_root, &request.output_dir, request.signal)
                    .await
            })
        })
    }
    /// Bounded argv-only git reads over an already-authorized executor/environment.
    pub fn revision_executor(execute: Executor, env: BTreeMap<String, String>) -> Revision {
        Arc::new(move |root| {
            let execute = execute.clone();
            let env = env.clone();
            Box::pin(async move {
                let request = |args: Vec<String>| ExecRequest {
                    command: "git".into(),
                    args,
                    cwd: None,
                    env: env.clone(),
                    signal: None,
                };
                let (head, status) = tokio::join!(
                    execute(request(vec![
                        "-C".into(),
                        root.clone(),
                        "rev-parse".into(),
                        "HEAD".into()
                    ])),
                    execute(request(vec![
                        "-C".into(),
                        root,
                        "status".into(),
                        "--porcelain".into()
                    ]))
                );
                match (head, status) {
                    (Ok(head), Ok(status)) => Some(format!(
                        "{}{}",
                        js_trim(&head.stdout),
                        if status.stdout.is_empty() {
                            ""
                        } else {
                            ":dirty"
                        }
                    )),
                    _ => None,
                }
            })
        })
    }
    pub fn normalize_project_root(&self, root: &str) -> Result<String, GraphError> {
        let root = js_trim(root);
        if root.is_empty() {
            return Err(GraphError::error("projectRoot is required"));
        }
        if !Path::new(root).is_absolute() {
            return Err(GraphError::error("projectRoot must be absolute"));
        }
        let root = path_join(&[root]);
        if root == "/" || root == self.home {
            return Err(GraphError::error(format!(
                "Refusing to index \"{root}\": not a project directory — graphify would attempt to extract your entire home directory. Open Jait inside a repository and retry."
            )));
        }
        Ok(root)
    }
    pub fn output_directory(&self, root: &str, user: Option<&str>) -> String {
        // Version and length-delimit both fields; an absent (or empty) owner is
        // distinct from every nonempty owner, including the literal "system".
        let mut digest = Sha256::new();
        digest.update(b"jait-code-graph-v2\0");
        match user.filter(|owner| !owner.is_empty()) {
            Some(owner) => {
                digest.update([1]);
                digest.update((owner.len() as u64).to_be_bytes());
                digest.update(owner.as_bytes());
            }
            None => digest.update([0]),
        }
        digest.update((root.len() as u64).to_be_bytes());
        digest.update(root.as_bytes());
        let key = hex::encode(digest.finalize());
        path_join(&[&self.data_root, "v2", &key[..24], "graphify"])
    }
    pub async fn get_index(&self, root: &str, user: Option<&str>) -> Result<Value, GraphError> {
        let root = self.normalize_project_root(root)?;
        let user = user.map(str::to_owned);
        let clock = self.clock.clone();
        match &self.db {
            IndexDatabase::Legacy(db) => {
                let db = db
                    .lock()
                    .map_err(|_| GraphError::error("Code graph database lock poisoned"))?;
                IndexStore {
                    db: &db,
                    clock: &clock,
                }
                .get(&root, user.as_deref())
            }
            IndexDatabase::Worker(db) => db
                .run(move |db| Ok(IndexStore { db, clock: &clock }.get(&root, user.as_deref())))
                .await
                .map_err(|e| GraphError::error(e.to_string()))?,
        }
    }
    pub(super) async fn save(
        &self,
        root: &str,
        user: Option<&str>,
        patch: Value,
    ) -> Result<Value, GraphError> {
        let root = root.to_owned();
        let user = user.map(str::to_owned);
        let clock = self.clock.clone();
        match &self.db {
            IndexDatabase::Legacy(db) => {
                let db = db
                    .lock()
                    .map_err(|_| GraphError::error("Code graph database lock poisoned"))?;
                IndexStore {
                    db: &db,
                    clock: &clock,
                }
                .save(&root, user.as_deref(), &patch)
            }
            IndexDatabase::Worker(db) => db
                .run(move |db| {
                    Ok(IndexStore { db, clock: &clock }.save(&root, user.as_deref(), &patch))
                })
                .await
                .map_err(|e| GraphError::error(e.to_string()))?,
        }
    }
    // This is a lexical admission check, not a symlink-safe filesystem boundary.
    // Legacy paths cannot prove their owner; require a fresh v2 build instead.
    fn check_graph_path(
        &self,
        root: &str,
        user: Option<&str>,
        path: &str,
    ) -> Result<(), GraphError> {
        let root = self.normalize_project_root(root)?;
        let output = self.output_directory(&root, user);
        if path != path_join(&[&output, "graph.json"])
            && path != path_join(&[&output, "graphify-out", "graph.json"])
        {
            return Err(GraphError::error(
                "Code graph path is outside the current owner namespace; reindex required",
            ));
        }
        Ok(())
    }
    async fn read_graph(
        &self,
        root: &str,
        user: Option<&str>,
        index: &Value,
    ) -> Result<ParsedGraph, GraphError> {
        let path = index["graphPath"].as_str().filter(|s| !s.is_empty());
        if index["status"] != "ready" || path.is_none() {
            return Err(GraphError::error(
                index["error"]
                    .as_str()
                    .filter(|s| !s.is_empty())
                    .unwrap_or("Code graph has not been indexed"),
            ));
        }
        self.check_graph_path(root, user, path.unwrap())?;
        self.read_path(path.unwrap()).await
    }
    async fn read_path(&self, path: &str) -> Result<ParsedGraph, GraphError> {
        let content = read_graph_file(path).await?;
        Self::parse_content(&content)
    }
    fn parse_content(content: &[u8]) -> Result<ParsedGraph, GraphError> {
        let text = String::from_utf8_lossy(content);
        let document = crate::contracts::json_diagnostic::parse(&text).map_err(|e| GraphError {
            name: "SyntaxError".into(),
            ..GraphError::error(e.to_string())
        })?;
        let raw: Value = serde_json::from_str(&document.stringify())
            .map_err(|e| GraphError::error(e.to_string()))?;
        Ok(graph::parse_graph(&raw))
    }
    pub async fn index(
        self: &Arc<Self>,
        root: &str,
        user: Option<String>,
        repository: Option<String>,
        signal: Option<ProcessCancellation>,
    ) -> Result<Value, GraphError> {
        let root = self.normalize_project_root(root)?;
        let key = (user.clone().filter(|value| !value.is_empty()), root.clone());
        let task = {
            let mut active = self
                .active
                .lock()
                .map_err(|_| GraphError::error("Code graph build lock poisoned"))?;
            if let Some(task) = active.get(&key) {
                task.clone()
            } else {
                let service = self.clone();
                let key2 = key.clone();
                // The task keeps working when one subscribing request is dropped.
                let task = tokio::spawn(async move {
                    let _guard = ActiveBuildGuard {
                        service: service.clone(),
                        key: key2,
                    };
                    service
                        .run_index(&root, user.as_deref(), repository.as_deref(), signal)
                        .await
                });
                let future =
                    async move { task.await.map_err(|e| GraphError::error(e.to_string()))? }
                        .boxed()
                        .shared();
                active.insert(key, future.clone());
                future
            }
        };
        task.await
    }
    async fn run_index(
        &self,
        root: &str,
        user: Option<&str>,
        repository: Option<&str>,
        signal: Option<ProcessCancellation>,
    ) -> Result<Value, GraphError> {
        check_cancelled(&signal)?;
        let output = self.output_directory(root, user);
        tokio::fs::create_dir_all(&output)
            .await
            .map_err(|e| GraphError::io(e, "mkdir", &output))?;
        check_cancelled(&signal)?;
        self.save(
            root,
            user,
            json!({"status":"building","repositoryId":repository,"error":null}),
        )
        .await?;
        let result: Result<Value, GraphError>=async {
            let result=(self.build)(BuildRequest {project_root:root.into(),output_dir:output.clone(),signal}).await?;
            self.check_graph_path(root, user, &result.graph_path)?;
            if !Path::new(&result.graph_path).exists() {
                return Err(GraphError::error(format!("Graphify completed without producing {}",result.graph_path)));
            }
            let content=read_graph_file(&result.graph_path).await?;
            let parsed=Self::parse_content(&content)?;
            let version=hex::encode(Sha256::digest(String::from_utf8_lossy(&content).as_bytes()));
            let revision=(self.revision)(root.into()).await;
            self.save(root,user,json!({"repositoryId":repository,"status":"ready","graphPath":result.graph_path,"graphVersion":version,"sourceRevision":revision,"graphifyVersion":result.version,"stats":parsed.stats,"graphRagStatus":"not-prepared","graphRagPath":null,"error":null})).await
        }.await;
        if let Err(error) = &result {
            self.save(
                root,
                user,
                json!({"repositoryId":repository,"status":"error","error":error.message}),
            )
            .await?;
        }
        result
    }
    pub async fn snapshot(
        &self,
        root: &str,
        user: Option<&str>,
        max_nodes: Option<f64>,
    ) -> Result<Value, GraphError> {
        let index = self.get_index(root, user).await?;
        let graph = self.read_graph(root, user, &index).await?;
        Ok(graph::snapshot(&graph, &index, max_nodes))
    }
    pub async fn query(
        &self,
        root: &str,
        user: Option<&str>,
        params: &Value,
    ) -> Result<Value, GraphError> {
        let text = js_trim(params["query"].as_str().unwrap_or(""));
        if text.is_empty() {
            return Err(GraphError::error("query is required"));
        }
        let index = self.get_index(root, user).await?;
        let graph = self.read_graph(root, user, &index).await?;
        graph::query(
            &graph,
            &index,
            text,
            params["mode"].as_str(),
            params["maxNodes"].as_f64(),
            params["maxDepth"].as_f64(),
        )
        .map_err(GraphError::error)
    }
    pub async fn shortest_path(
        &self,
        root: &str,
        user: Option<&str>,
        source: &str,
        target: &str,
        max_depth: Option<f64>,
    ) -> Result<Value, GraphError> {
        let index = self.get_index(root, user).await?;
        let graph = self.read_graph(root, user, &index).await?;
        Ok(graph::shortest_path(&graph, source, target, max_depth))
    }
    pub async fn prepare_graph_rag(
        &self,
        root: &str,
        user: Option<&str>,
    ) -> Result<Value, GraphError> {
        let root = self.normalize_project_root(root)?;
        let current = self.get_index(&root, user).await?;
        let graph_path = current["graphPath"].as_str().filter(|s| !s.is_empty());
        if current["status"] != "ready" || graph_path.is_none() {
            return Err(GraphError::error(
                current["error"]
                    .as_str()
                    .filter(|s| !s.is_empty())
                    .unwrap_or("Code graph has not been indexed"),
            ));
        }
        self.check_graph_path(&root, user, graph_path.unwrap())?;
        self.save(
            &root,
            user,
            json!({"status":"ready","graphRagStatus":"preparing","error":null}),
        )
        .await?;
        let directory = path_join(&[
            Path::new(graph_path.unwrap())
                .parent()
                .unwrap_or_else(|| Path::new("/"))
                .to_str()
                .unwrap(),
            "..",
            "graphrag",
        ]);
        let result: Result<Value, GraphError>=async {
            let snapshot=self.snapshot(&root,user,Some(10000.0)).await?;
            let snapshot:GraphSnapshot=serde_json::from_value(snapshot).map_err(|e|GraphError::error(e.to_string()))?;
            let clock=self.clock.clone();let output=directory.clone();
            let manifest=run_serialized_export(self.export_lock.clone(), move || {
                write_graph_rag_export_with_clock(&snapshot,Path::new(&output),&clock)
            }).await
                .map_err(|e|GraphError::error(e.to_string()))?.map_err(|e|GraphError::error(e.to_string()))?;
            let index=self.save(&root,user,json!({"status":"ready","graphRagStatus":"prepared","graphRagPath":path_join(&[&directory,"manifest.json"]),"error":null})).await?;
            Ok(json!({"index":index,"manifest":manifest}))
        }.await;
        if let Err(error) = &result {
            self.save(
                &root,
                user,
                json!({"status":"ready","graphRagStatus":"error","error":error.message}),
            )
            .await?;
        }
        result
    }
}

// The blocking operation owns the guard: aborting its async caller must not
// permit another writer to enter before the detached blocking work finishes.
async fn run_serialized_export<T: Send + 'static>(
    lock: Arc<tokio::sync::Mutex<()>>,
    work: impl FnOnce() -> T + Send + 'static,
) -> Result<T, tokio::task::JoinError> {
    let guard = lock.lock_owned().await;
    tokio::task::spawn_blocking(move || {
        let _guard = guard;
        work()
    }).await
}

#[cfg(test)]
mod export_serialization_tests {
    use super::run_serialized_export;
    use std::sync::{Arc, mpsc};

    #[tokio::test]
    async fn cancelled_caller_does_not_unlock_running_writer() {
        let lock = Arc::new(tokio::sync::Mutex::new(()));
        let (started_tx, started_rx) = tokio::sync::oneshot::channel();
        let (release_tx, release_rx) = mpsc::channel();
        let first_lock = lock.clone();
        let first = tokio::spawn(async move {
            run_serialized_export(first_lock, move || {
                started_tx.send(()).unwrap();
                release_rx.recv().unwrap();
            }).await
        });
        started_rx.await.unwrap();
        first.abort();
        assert!(first.await.unwrap_err().is_cancelled());
        assert!(lock.try_lock().is_err(), "detached writer must retain the lock");

        let second_lock = lock.clone();
        let second = tokio::spawn(async move {
            run_serialized_export(second_lock, || 42).await.unwrap()
        });
        release_tx.send(()).unwrap();
        assert_eq!(tokio::time::timeout(std::time::Duration::from_secs(5), second).await.unwrap().unwrap(), 42);
    }
}

// Open each component without following symlinks. The caller still must pin and
// authorize the data root and supervise graph generation and export separately.
async fn read_graph_file(path: &str) -> Result<Vec<u8>, GraphError> {
    let owned = path.to_owned();
    let display = owned.clone();
    tokio::task::spawn_blocking(move || read_graph_file_sync(Path::new(&owned)))
        .await
        .map_err(|e| GraphError::error(e.to_string()))?
        .map_err(|e| GraphError::io(e, "open", &display))
}

#[cfg(unix)]
fn read_graph_file_sync(path: &Path) -> std::io::Result<Vec<u8>> {
    use std::{
        ffi::CString,
        io::Read,
        os::{
            fd::{AsRawFd, FromRawFd},
            unix::ffi::OsStrExt,
        },
        path::Component,
    };
    if !path.is_absolute() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "absolute graph path required",
        ));
    }
    let mut parts = path.components();
    if parts.next() != Some(Component::RootDir) {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "invalid graph path",
        ));
    }
    let parts: Vec<_> = parts.collect();
    if parts.is_empty() || parts.iter().any(|c| !matches!(c, Component::Normal(_))) {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "invalid graph path",
        ));
    }
    let mut current = std::fs::File::open("/")?;
    for (i, part) in parts.iter().enumerate() {
        let Component::Normal(name) = part else {
            unreachable!()
        };
        let name = CString::new(name.as_bytes())
            .map_err(|_| std::io::Error::new(std::io::ErrorKind::InvalidInput, "NUL in path"))?;
        let flags = libc::O_RDONLY
            | libc::O_CLOEXEC
            | libc::O_NOFOLLOW
            | if i + 1 < parts.len() {
                libc::O_DIRECTORY
            } else {
                libc::O_NONBLOCK
            };
        let fd = unsafe { libc::openat(current.as_raw_fd(), name.as_ptr(), flags) };
        if fd < 0 {
            return Err(std::io::Error::last_os_error());
        }
        current = unsafe { std::fs::File::from_raw_fd(fd) };
    }
    const MAX_GRAPH_BYTES: u64 = 64 * 1024 * 1024;
    let metadata = current.metadata()?;
    if !metadata.is_file() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "graph is not a regular file",
        ));
    }
    if metadata.len() > MAX_GRAPH_BYTES {
        return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "graph exceeds 64 MiB limit"));
    }
    let mut contents = Vec::new();
    // The file can grow after metadata was read, so enforce the limit on reads too.
    current.take(MAX_GRAPH_BYTES + 1).read_to_end(&mut contents)?;
    if contents.len() as u64 > MAX_GRAPH_BYTES {
        return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "graph exceeds 64 MiB limit"));
    }
    Ok(contents)
}
#[cfg(not(unix))]
fn read_graph_file_sync(_: &Path) -> std::io::Result<Vec<u8>> {
    Err(std::io::Error::new(
        std::io::ErrorKind::Unsupported,
        "secure graph reads unsupported on this platform",
    ))
}

#[cfg(all(test, unix))]
mod secure_graph_read_tests {
    use super::read_graph_file_sync;
    use std::{fs, os::unix::fs::symlink, path::Path};

    #[test]
    fn rejects_oversized_graph_file() {
        let base = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../.jait/artifacts/gateway-rust/code-graph/read-boundary")
            .join(uuid::Uuid::new_v4().to_string());
        fs::create_dir_all(&base).unwrap();
        let base = fs::canonicalize(base).unwrap();
        let graph = base.join("graph.json");
        fs::File::create(&graph).unwrap().set_len(64 * 1024 * 1024 + 1).unwrap();
        assert_eq!(read_graph_file_sync(&graph).unwrap_err().kind(), std::io::ErrorKind::InvalidData);
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn rejects_non_regular_files_and_parent_traversal() {
        use std::{ffi::CString, os::unix::ffi::OsStrExt};
        let base = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../.jait/artifacts/gateway-rust/code-graph/read-boundary")
            .join(uuid::Uuid::new_v4().to_string());
        fs::create_dir_all(&base).unwrap();
        let base = fs::canonicalize(base).unwrap();
        fs::write(base.join("graph.json"), b"graph").unwrap();
        assert!(read_graph_file_sync(&base).is_err());
        assert!(read_graph_file_sync(&base.join("../graph.json")).is_err());
        let fifo = base.join("fifo");
        let name = CString::new(fifo.as_os_str().as_bytes()).unwrap();
        assert_eq!(unsafe { libc::mkfifo(name.as_ptr(), 0o600) }, 0);
        assert!(read_graph_file_sync(&fifo).is_err());
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn rejects_symlinks_in_graph_path() {
        let base = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../.jait/artifacts/gateway-rust/code-graph/read-boundary")
            .join(uuid::Uuid::new_v4().to_string());
        let actual = base.join("actual");
        fs::create_dir_all(&actual).unwrap();
        let base = fs::canonicalize(base).unwrap();
        let actual = base.join("actual");
        fs::write(actual.join("graph.json"), b"graph").unwrap();
        assert_eq!(
            read_graph_file_sync(&actual.join("graph.json")).unwrap(),
            b"graph"
        );
        symlink(actual.join("graph.json"), base.join("leaf.json")).unwrap();
        assert!(read_graph_file_sync(&base.join("leaf.json")).is_err());
        symlink(&actual, base.join("linked-directory")).unwrap();
        assert!(read_graph_file_sync(&base.join("linked-directory/graph.json")).is_err());
        fs::remove_dir_all(base).unwrap();
    }
}
