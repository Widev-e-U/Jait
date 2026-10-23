//! Code-graph indexing lifecycle and authorized file/runner composition.
//! The caller authorizes projectRoot/dataRoot and process execution before use.
//! Blocking SQLite access is short; no database lock crosses an await.
use super::{
    engine::{ExecRequest, Executor, GraphError, path_join},
    graph::{self, ParsedGraph},
    graphrag::{GraphSnapshot, write_graph_rag_export_with_clock},
    runner::{GraphifyRunner, RunResult},
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
pub struct CodeGraphService {
    pub db: Arc<Mutex<Connection>>,
    pub data_root: String,
    pub home: String,
    pub clock: Clock,
    pub build: Build,
    pub revision: Revision,
    active: Mutex<HashMap<String, BuildFuture>>,
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
            db,
            data_root,
            home,
            clock: default_clock(),
            build,
            revision,
            active: Mutex::new(HashMap::new()),
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
        let key = hex::encode(Sha256::digest(
            format!("{}\0{root}", user.unwrap_or("system")).as_bytes(),
        ));
        path_join(&[&self.data_root, &key[..24], "graphify"])
    }
    fn db_lock(&self) -> Result<std::sync::MutexGuard<'_, Connection>, GraphError> {
        self.db
            .lock()
            .map_err(|_| GraphError::error("Code graph database lock poisoned"))
    }
    pub fn get_index(&self, root: &str, user: Option<&str>) -> Result<Value, GraphError> {
        let root = self.normalize_project_root(root)?;
        IndexStore {
            db: &*self.db_lock()?,
            clock: &self.clock,
        }
        .get(&root, user)
    }
    fn save(&self, root: &str, user: Option<&str>, patch: Value) -> Result<Value, GraphError> {
        IndexStore {
            db: &*self.db_lock()?,
            clock: &self.clock,
        }
        .save(root, user, &patch)
    }
    async fn read_graph(&self, index: &Value) -> Result<ParsedGraph, GraphError> {
        let path = index["graphPath"].as_str().filter(|s| !s.is_empty());
        if index["status"] != "ready" || path.is_none() {
            return Err(GraphError::error(
                index["error"]
                    .as_str()
                    .filter(|s| !s.is_empty())
                    .unwrap_or("Code graph has not been indexed"),
            ));
        }
        self.read_path(path.unwrap()).await
    }
    async fn read_path(&self, path: &str) -> Result<ParsedGraph, GraphError> {
        let content = tokio::fs::read(path)
            .await
            .map_err(|e| GraphError::io(e, "open", path))?;
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
        let key = format!("{}:{root}", user.as_deref().unwrap_or("system"));
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
                    let result = service
                        .run_index(&root, user.as_deref(), repository.as_deref(), signal)
                        .await;
                    if let Ok(mut active) = service.active.lock() {
                        active.remove(&key2);
                    }
                    result
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
        let output = self.output_directory(root, user);
        tokio::fs::create_dir_all(&output)
            .await
            .map_err(|e| GraphError::io(e, "mkdir", &output))?;
        self.save(
            root,
            user,
            json!({"status":"building","repositoryId":repository,"error":null}),
        )?;
        let result: Result<Value, GraphError>=async {
            let result=(self.build)(BuildRequest {project_root:root.into(),output_dir:output,signal}).await?;
            if !Path::new(&result.graph_path).exists() {
                return Err(GraphError::error(format!("Graphify completed without producing {}",result.graph_path)));
            }
            let content=tokio::fs::read(&result.graph_path).await.map_err(|e|GraphError::io(e,"open",&result.graph_path))?;
            let parsed=Self::parse_content(&content)?;
            let version=hex::encode(Sha256::digest(String::from_utf8_lossy(&content).as_bytes()));
            let revision=(self.revision)(root.into()).await;
            self.save(root,user,json!({"repositoryId":repository,"status":"ready","graphPath":result.graph_path,"graphVersion":version,"sourceRevision":revision,"graphifyVersion":result.version,"stats":parsed.stats,"graphRagStatus":"not-prepared","graphRagPath":null,"error":null}))
        }.await;
        if let Err(error) = &result {
            self.save(
                root,
                user,
                json!({"repositoryId":repository,"status":"error","error":error.message}),
            )?;
        }
        result
    }
    pub async fn snapshot(
        &self,
        root: &str,
        user: Option<&str>,
        max_nodes: Option<f64>,
    ) -> Result<Value, GraphError> {
        let index = self.get_index(root, user)?;
        let graph = self.read_graph(&index).await?;
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
        let index = self.get_index(root, user)?;
        let graph = self.read_graph(&index).await?;
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
        let index = self.get_index(root, user)?;
        let graph = self.read_graph(&index).await?;
        Ok(graph::shortest_path(&graph, source, target, max_depth))
    }
    pub async fn prepare_graph_rag(
        &self,
        root: &str,
        user: Option<&str>,
    ) -> Result<Value, GraphError> {
        let root = self.normalize_project_root(root)?;
        let current = self.get_index(&root, user)?;
        let graph_path = current["graphPath"].as_str().filter(|s| !s.is_empty());
        if current["status"] != "ready" || graph_path.is_none() {
            return Err(GraphError::error(
                current["error"]
                    .as_str()
                    .filter(|s| !s.is_empty())
                    .unwrap_or("Code graph has not been indexed"),
            ));
        }
        self.save(
            &root,
            user,
            json!({"status":"ready","graphRagStatus":"preparing","error":null}),
        )?;
        let directory = path_join(&[
            Path::new(graph_path.unwrap())
                .parent()
                .unwrap()
                .to_str()
                .unwrap(),
            "..",
            "graphrag",
        ]);
        let result: Result<Value, GraphError>=async {
            let snapshot=self.snapshot(&root,user,Some(10000.0)).await?;
            let snapshot:GraphSnapshot=serde_json::from_value(snapshot).map_err(|e|GraphError::error(e.to_string()))?;
            let clock=self.clock.clone();let output=directory.clone();
            let manifest=tokio::task::spawn_blocking(move ||write_graph_rag_export_with_clock(&snapshot,Path::new(&output),&clock)).await
                .map_err(|e|GraphError::error(e.to_string()))?.map_err(|e|GraphError::error(e.to_string()))?;
            let index=self.save(&root,user,json!({"status":"ready","graphRagStatus":"prepared","graphRagPath":path_join(&[&directory,"manifest.json"]),"error":null}))?;
            Ok(json!({"index":index,"manifest":manifest}))
        }.await;
        if let Err(error) = &result {
            self.save(
                &root,
                user,
                json!({"status":"ready","graphRagStatus":"error","error":error.message}),
            )?;
        }
        result
    }
}
