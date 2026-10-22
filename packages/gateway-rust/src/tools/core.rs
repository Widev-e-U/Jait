//! Native core-tool factory exports. Engines/consent remain caller capabilities;
//! factories bind a single advertised operation to the reviewed native adapters.
use super::{
    core_agent::{AgentError, AgentTool, SpawnPort},
    core_io::{CoreIo, HostError, HostPort},
    core_jait::{CoreJait, CoreJaitContext, JaitResult},
    core_search::{SearchPort, SearchTool},
    session_todos::{SessionTodos, TodoItems, TodoResult},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::LazyLock;
pub type JaitToolDeps = CoreJait<Value>;
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum TodoStatus {
    NotStarted,
    InProgress,
    Completed,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TodoItem {
    pub id: serde_json::Number,
    pub title: String,
    pub status: TodoStatus,
}
macro_rules! io_tool {
    ($name:ident,$create:ident,$operation:ident,$output:ty,$key:literal) => {
        pub struct $name {
            inner: CoreIo<Value>,
        }
        pub fn $create(port: HostPort<Value>) -> $name {
            $name {
                inner: CoreIo::new(port),
            }
        }
        impl $name {
            pub fn definition(&self) -> &'static Value {
                super::core_io::metadata($key).expect("core tool metadata")
            }
            pub async fn execute(&self, input: &Value, context: &Value) -> $output {
                self.inner.$operation(input, context).await
            }
        }
    };
}
io_tool!(ReadTool, create_read_tool, read, Value, "read");
io_tool!(EditTool, create_edit_tool, edit, Value, "edit");
io_tool!(ExecuteTool,create_execute_tool,execute,Result<Value,HostError>,"execute");
io_tool!(WebTool,create_web_tool,web,Result<Value,HostError>,"web");
pub fn create_search_tool(port: SearchPort) -> SearchTool {
    SearchTool::new(port)
}
pub fn create_agent_tool(
    factory: impl FnOnce() -> Result<SpawnPort<Value>, AgentError>,
) -> Result<AgentTool<Value>, AgentError> {
    AgentTool::new(factory)
}
static TODOS: LazyLock<SessionTodos> = LazyLock::new(SessionTodos::default);
pub struct TodoTool;
pub fn create_todo_tool() -> TodoTool {
    TodoTool
}
pub fn get_session_todos(session: &str) -> TodoItems {
    TODOS.get(session)
}
pub fn clear_session_todos(session: &str) {
    TODOS.clear(session);
}
impl TodoTool {
    pub fn definition(&self) -> &'static Value {
        super::session_todos::metadata()
    }
    pub async fn execute(&self, input: &Value, context: &Value) -> TodoResult {
        TODOS.execute(input, context["sessionId"].as_str().unwrap_or(""))
    }
}
pub struct JaitTool {
    inner: JaitToolDeps,
}
pub fn create_jait_tool(deps: JaitToolDeps) -> JaitTool {
    JaitTool { inner: deps }
}
impl JaitTool {
    pub fn definition(&self) -> &'static Value {
        super::core_jait::metadata()
    }
    pub async fn execute(&self, input: &Value, context: &Value) -> JaitResult {
        let trusted = CoreJaitContext {
            user_id: context["userId"].as_str().map(str::to_string),
            session_id: context["sessionId"].as_str().unwrap_or("").into(),
            action_id: context["actionId"].as_str().unwrap_or("").into(),
        };
        self.inner.execute(input, &trusted, context).await
    }
}
impl SearchTool {
    pub fn definition(&self) -> &'static Value {
        super::core_search::metadata()
    }
}
impl AgentTool<Value> {
    pub fn definition(&self) -> &'static Value {
        super::core_agent::metadata()
    }
}
