//! Observe-only GitHub intake storage. The host authenticates tenant operations
//! and verifies webhook signatures before invoking this unmounted adapter.
//! SQLite schema and unique indexes must be installed by gateway migrations.
use crate::{
    db::{
        identifiers::uuidv7,
        worker::{DatabaseWorker, OperationError},
    },
    routes::agent_github_apps::{GithubIntakeOperation, GithubIntakePort},
    tools::core_io::HostError,
};
use rusqlite::{Connection, OptionalExtension, Transaction, TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{io, sync::Arc};

#[derive(Clone, Debug, Deserialize, Serialize)]
struct Rule {
    repository: String,
    sender: String,
    event: String,
    action: String,
}

fn invalid(message: &str) -> OperationError {
    io::Error::new(io::ErrorKind::InvalidInput, message.to_owned()).into()
}
fn valid_name(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 100
        && s.bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'.' | b'-'))
}
fn rules(value: &Value) -> Result<Vec<Rule>, OperationError> {
    let input = value
        .as_array()
        .filter(|a| a.len() <= 20)
        .ok_or_else(|| invalid("Expected at most 20 rules"))?;
    input
        .iter()
        .map(|item| {
            let obj = item.as_object().ok_or_else(|| invalid("Invalid rule"))?;
            let field = |k| obj.get(k).and_then(Value::as_str).unwrap_or("");
            let repo = field("repository");
            let mut parts = repo.split('/');
            let valid_repo = parts.next().is_some_and(valid_name)
                && parts.next().is_some_and(valid_name)
                && parts.next().is_none();
            let sender = field("sender");
            let event = field("event");
            let action = field("action");
            if !valid_repo
                || !valid_name(sender.strip_suffix("[bot]").unwrap_or(sender))
                || !matches!(
                    event,
                    "issues"
                        | "issue_comment"
                        | "pull_request"
                        | "pull_request_review"
                        | "check_run"
                        | "workflow_run"
                )
                || !valid_name(action)
            {
                return Err(invalid(
                    "Rules require an exact repository, sender, event and action",
                ));
            }
            Ok(Rule {
                repository: repo.into(),
                sender: sender.into(),
                event: event.into(),
                action: action.into(),
            })
        })
        .collect()
}
fn timestamp() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}
fn require_tenant(user: &str, agent: &str) -> Result<(), OperationError> {
    if user.is_empty() || agent.is_empty() {
        return Err(invalid("Missing intake owner"));
    }
    Ok(())
}
fn read_rules(db: &Connection, user: &str, agent: &str) -> Result<Vec<Rule>, OperationError> {
    require_tenant(user, agent)?;
    let stored: Option<String> = db
        .query_row(
            "SELECT rules FROM github_intake_policies WHERE user_id=?1 AND agent_id=?2",
            params![user, agent],
            |r| r.get(0),
        )
        .optional()?;
    match stored {
        None => Ok(Vec::new()),
        Some(raw) => rules(&serde_json::from_str(&raw)?),
    }
}
fn save(db: &Connection, user: &str, agent: &str, value: &Value) -> Result<(), OperationError> {
    require_tenant(user, agent)?;
    let clean = rules(value)?;
    db.execute("INSERT INTO github_intake_policies (id,user_id,agent_id,rules,updated_at) VALUES (?1,?2,?3,?4,?5) ON CONFLICT(user_id,agent_id) DO UPDATE SET rules=excluded.rules,updated_at=excluded.updated_at", params![uuidv7().to_string(),user,agent,serde_json::to_string(&clean)?,timestamp()])?;
    Ok(())
}
fn get(db: &Connection, user: &str, agent: &str) -> Result<Value, OperationError> {
    let rules = read_rules(db, user, agent)?;
    let mut query = db.prepare("SELECT id,user_id,agent_id,delivery_id,event,action,repository,sender,result,reason,created_at FROM github_intake_decisions WHERE user_id=?1 AND agent_id=?2 ORDER BY created_at DESC LIMIT 100")?;
    let decisions = query.query_map(params![user,agent], |r| Ok(json!({
        "id":r.get::<_,String>(0)?, "userId":r.get::<_,String>(1)?, "agentId":r.get::<_,String>(2)?, "deliveryId":r.get::<_,String>(3)?,
        "event":r.get::<_,String>(4)?, "action":r.get::<_,String>(5)?, "repository":r.get::<_,String>(6)?, "sender":r.get::<_,String>(7)?,
        "result":r.get::<_,String>(8)?, "reason":r.get::<_,String>(9)?, "createdAt":r.get::<_,String>(10)?
    })))?.collect::<Result<Vec<_>,_>>()?;
    Ok(json!({"rules":rules,"decisions":decisions}))
}
// Keep track of a split surrogate for matching: the stored Rust string cannot
// represent the unpaired UTF-16 unit produced by JavaScript's slice.
fn bounded(v: Option<&Value>) -> (String, bool) {
    let mut result = String::new();
    let mut units = 0;
    for c in v.and_then(Value::as_str).unwrap_or("").chars() {
        let next = units + c.len_utf16();
        if next > 201 {
            return (result, units < 201);
        }
        result.push(c);
        units = next;
    }
    (result, false)
}
fn receive(db: &Connection, input: &Value) -> Result<(), OperationError> {
    let string = |key| input.get(key).and_then(Value::as_str).unwrap_or("");
    let user = string("userId");
    let agent = string("agentId");
    let delivery = string("deliveryId");
    require_tenant(user, agent)?;
    if delivery.is_empty()
        || delivery.len() > 128
        || !delivery
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-')
    {
        return Err(invalid("Missing or invalid delivery id"));
    }
    let payload = input.get("payload").and_then(Value::as_object);
    let (repository, repository_split) = bounded(
        payload
            .and_then(|p| p.get("repository"))
            .and_then(|r| r.get("full_name")),
    );
    let (sender, sender_split) = bounded(
        payload
            .and_then(|p| p.get("sender"))
            .and_then(|r| r.get("login")),
    );
    let (event, event_split) = bounded(input.get("event"));
    let (action, action_split) = bounded(payload.and_then(|p| p.get("action")));
    // The policy read and idempotent insert are one transaction even with other connections.
    let tx = Transaction::new_unchecked(db, TransactionBehavior::Immediate)?;
    let matched = read_rules(&tx, user, agent)?.iter().any(|r| {
        !repository_split
            && !sender_split
            && !event_split
            && !action_split
            && r.repository.to_lowercase() == repository.to_lowercase()
            && r.sender.to_lowercase() == sender.to_lowercase()
            && r.event == event
            && r.action == action
    });
    let (result, reason) = if matched {
        (
            "would_accept",
            "An exact rule matched; observe mode does not start work.",
        )
    } else {
        ("ignored", "No exact rule matched.")
    };
    tx.execute("INSERT INTO github_intake_decisions (id,user_id,agent_id,delivery_id,event,action,repository,sender,result,reason,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11) ON CONFLICT(user_id,agent_id,delivery_id) DO NOTHING", params![uuidv7().to_string(),user,agent,delivery,event,action,repository,sender,result,reason,timestamp()])?;
    tx.commit()?;
    Ok(())
}
/// Adapter supplies bounded DB admission; only connect it to authenticated routes
/// and verified webhook dispatch. A cancelled admitted SQL job may still commit.
pub fn github_intake_port(db: DatabaseWorker) -> GithubIntakePort {
    Arc::new(move |operation| {
        let db = db.clone();
        Box::pin(async move {
            db.run(move |connection| match operation {
                GithubIntakeOperation::Get { user, agent } => get(connection, &user, &agent),
                GithubIntakeOperation::Save { user, agent, rules } => {
                    save(connection, &user, &agent, &rules)?;
                    Ok(Value::Null)
                }
                GithubIntakeOperation::Receive { event } => {
                    receive(connection, &event)?;
                    Ok(Value::Null)
                }
            })
            .await
            .map_err(|e| {
                HostError::Error(match e {
                    crate::db::worker::DatabaseError::Operation(inner) => inner.to_string(),
                    other => other.to_string(),
                })
            })
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn db() -> Connection {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch("CREATE TABLE github_intake_policies(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,agent_id TEXT NOT NULL,rules TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(user_id,agent_id)); CREATE TABLE github_intake_decisions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,agent_id TEXT NOT NULL,delivery_id TEXT NOT NULL,event TEXT NOT NULL,action TEXT NOT NULL,repository TEXT NOT NULL,sender TEXT NOT NULL,result TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(user_id,agent_id,delivery_id));").unwrap();
        db
    }
    fn rule() -> Value {
        json!([{"repository":"Owner/Repo","sender":"robot[bot]","event":"issues","action":"opened","extra":true}])
    }
    fn delivery(user: &str, agent: &str, id: &str) -> Value {
        json!({"userId":user,"agentId":agent,"deliveryId":id,"event":"issues","payload":{"action":"opened","repository":{"full_name":"owner/repo"},"sender":{"login":"ROBOT[bot]"}}})
    }
    #[test]
    fn bounded_validation_and_exact_fields() {
        assert_eq!(
            serde_json::to_value(rules(&rule()).unwrap()).unwrap()[0]
                .as_object()
                .unwrap()
                .len(),
            4
        );
        assert!(
            rules(&json!([{"repository":"a/*","sender":"x","event":"issues","action":"opened"}]))
                .is_err()
        );
        assert!(rules(&json!(vec![Value::Null; 21])).is_err());
        assert!(rules(&json!([null])).is_err());
    }
    #[test]
    fn utf16_boundary_does_not_match_a_split_surrogate() {
        let db = db();
        let repo_200 = format!("{}/{}", "a".repeat(100), "b".repeat(99));
        let repo_201 = format!("{}b", repo_200);
        for (id, rule_repo, payload_repo, expected) in [
            ("exact-200", &repo_200, repo_200.clone(), "would_accept"),
            ("split", &repo_200, format!("{repo_200}😀"), "ignored"),
            ("extra-ascii", &repo_200, format!("{repo_200}c"), "ignored"),
            ("exact-201", &repo_201, repo_201.clone(), "would_accept"),
            (
                "after-201",
                &repo_201,
                format!("{repo_201}😀"),
                "would_accept",
            ),
        ] {
            save(&db, "u", "a", &json!([{ "repository": rule_repo, "sender": "robot[bot]", "event": "issues", "action": "opened" }])).unwrap();
            let mut input = delivery("u", "a", id);
            input["payload"]["repository"]["full_name"] = json!(payload_repo);
            receive(&db, &input).unwrap();
            let result: String = db
                .query_row(
                    "SELECT result FROM github_intake_decisions WHERE delivery_id=?1",
                    [id],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(result, expected, "{id}");
        }
    }
    #[test]
    fn durable_idempotence_isolated_by_user_and_agent() {
        let db = db();
        save(&db, "u", "a", &rule()).unwrap();
        receive(&db, &delivery("u", "a", "delivery-1")).unwrap();
        save(&db, "u", "a", &json!([])).unwrap();
        receive(&db, &delivery("u", "a", "delivery-1")).unwrap();
        receive(&db, &delivery("u", "b", "delivery-1")).unwrap();
        receive(&db, &delivery("v", "a", "delivery-1")).unwrap();
        assert_eq!(
            get(&db, "u", "a").unwrap()["decisions"][0]["result"],
            "would_accept"
        );
        assert_eq!(
            get(&db, "u", "a").unwrap()["decisions"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            get(&db, "u", "b").unwrap()["decisions"][0]["result"],
            "ignored"
        );
        assert_eq!(
            get(&db, "v", "a").unwrap()["decisions"][0]["result"],
            "ignored"
        );
        assert!(receive(&db, &delivery("u", "a", "bad/id")).is_err());
    }
    #[test]
    fn decisions_and_deduplication_survive_reopen() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../.jait/artifacts/github-intake-tests");
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join(format!("{}.sqlite", uuidv7()));
        {
            let connection = Connection::open(&path).unwrap();
            connection.execute_batch("CREATE TABLE github_intake_policies(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,agent_id TEXT NOT NULL,rules TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(user_id,agent_id)); CREATE TABLE github_intake_decisions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,agent_id TEXT NOT NULL,delivery_id TEXT NOT NULL,event TEXT NOT NULL,action TEXT NOT NULL,repository TEXT NOT NULL,sender TEXT NOT NULL,result TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(user_id,agent_id,delivery_id));").unwrap();
            save(&connection, "u", "a", &rule()).unwrap();
            receive(&connection, &delivery("u", "a", "delivery-1")).unwrap();
        }
        {
            let connection = Connection::open(&path).unwrap();
            receive(&connection, &delivery("u", "a", "delivery-1")).unwrap();
            let result = get(&connection, "u", "a").unwrap();
            assert_eq!(result["decisions"].as_array().unwrap().len(), 1);
            assert_eq!(result["decisions"][0]["result"], "would_accept");
        }
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn concurrent_connections_insert_one_decision_per_delivery() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../.jait/artifacts/github-intake-tests");
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join(format!("{}.sqlite", uuidv7()));
        {
            let connection = Connection::open(&path).unwrap();
            connection.execute_batch("CREATE TABLE github_intake_policies(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,agent_id TEXT NOT NULL,rules TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(user_id,agent_id)); CREATE TABLE github_intake_decisions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,agent_id TEXT NOT NULL,delivery_id TEXT NOT NULL,event TEXT NOT NULL,action TEXT NOT NULL,repository TEXT NOT NULL,sender TEXT NOT NULL,result TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(user_id,agent_id,delivery_id));").unwrap();
            save(&connection, "u", "a", &rule()).unwrap();
        }
        let barrier = Arc::new(std::sync::Barrier::new(8));
        let workers: Vec<_> = (0..8)
            .map(|_| {
                let path = path.clone();
                let barrier = barrier.clone();
                std::thread::spawn(move || {
                    let connection = Connection::open(path).unwrap();
                    connection
                        .busy_timeout(std::time::Duration::from_secs(5))
                        .unwrap();
                    barrier.wait();
                    receive(&connection, &delivery("u", "a", "same-delivery"))
                        .map_err(|e| e.to_string())
                })
            })
            .collect();
        for worker in workers {
            worker.join().unwrap().unwrap();
        }
        {
            let connection = Connection::open(&path).unwrap();
            let result = get(&connection, "u", "a").unwrap();
            assert_eq!(result["decisions"].as_array().unwrap().len(), 1);
            assert_eq!(result["decisions"][0]["result"], "would_accept");
        }
        std::fs::remove_file(path).unwrap();
    }

    #[tokio::test]
    async fn adapter_dispatches_on_bounded_worker() {
        let worker = DatabaseWorker::new(db(), std::num::NonZeroU16::new(4).unwrap()).unwrap();
        let port = github_intake_port(worker.clone());
        port(GithubIntakeOperation::Save {
            user: "u".into(),
            agent: "a".into(),
            rules: rule(),
        })
        .await
        .unwrap();
        port(GithubIntakeOperation::Receive {
            event: delivery("u", "a", "d-1"),
        })
        .await
        .unwrap();
        let result = port(GithubIntakeOperation::Get {
            user: "u".into(),
            agent: "a".into(),
        })
        .await
        .unwrap();
        assert_eq!(result["decisions"][0]["result"], "would_accept");
        worker.shutdown().await.unwrap();
    }
}
