//! Subscription snapshots on the shared bounded SQLite worker. Raw payloads never
//! leave this service; public snapshots project only documented usage fields.
use super::provider_reset_windows::{
    ResetSnapshot, ResetWindowInput, derive_ollama_reset_window, parse_ollama_reset_source,
};
use crate::db::worker::{DatabaseWorker, OperationError};
use chrono::{DateTime, SecondsFormat, Utc};
use rusqlite::{Connection, OptionalExtension, params};
use serde_json::{Value, json};
use std::{
    collections::HashSet,
    sync::{Arc, Mutex},
};

pub type UsageWarning = Arc<dyn Fn(&str, &str, &str) + Send + Sync>;
#[derive(Clone)]
pub struct ProviderUsageService {
    db: DatabaseWorker,
    warned: Arc<Mutex<HashSet<(String, String)>>>,
    warning: Option<UsageWarning>,
}
fn now() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}
fn epoch(value: &Value) -> Value {
    value
        .as_f64()
        .and_then(|v| DateTime::from_timestamp_millis((v * 1000.).trunc() as i64))
        .map(|v| json!(v.to_rfc3339_opts(SecondsFormat::Millis, true)))
        .unwrap_or(Value::Null)
}
fn status(util: f64, exhausted: bool) -> &'static str {
    if util >= 1. || exhausted {
        "rejected"
    } else if util >= 0.9 {
        "allowed_warning"
    } else {
        "allowed"
    }
}
// Provider payloads may contain arbitrary metadata. Persist/project only the
// documented quota fields; credentials or unknown diagnostic fields are excluded.
fn fields(value: &Value, names: &[&str]) -> Value {
    let Some(object) = value.as_object() else {
        return Value::Null;
    };
    Value::Object(
        names
            .iter()
            .filter_map(|name| {
                object
                    .get(*name)
                    .map(|value| ((*name).into(), value.clone()))
            })
            .collect(),
    )
}
fn reset_credits(value: &Value) -> Value {
    let mut projected = fields(value, &["availableCount", "credits"]);
    if let Some(credits) = value["credits"].as_array() {
        projected["credits"] = Value::Array(
            credits
                .iter()
                .map(|credit| {
                    fields(
                        credit,
                        &[
                            "id",
                            "resetType",
                            "status",
                            "grantedAt",
                            "expiresAt",
                            "title",
                            "description",
                        ],
                    )
                })
                .collect(),
        );
    }
    projected
}
// Column-by-column insert mirroring the TS `save` helper's arity.
#[allow(clippy::too_many_arguments)]
fn save(
    db: &Connection,
    id: &str,
    kind: &str,
    provider: &str,
    state: Value,
    util: Value,
    reset: Value,
    overage: bool,
    raw: Value,
) -> Result<(), OperationError> {
    db.execute("INSERT INTO provider_usage(account_id,rate_limit_type,provider_type,status,utilization,resets_at,is_using_overage,raw_json,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9) ON CONFLICT(account_id,rate_limit_type) DO UPDATE SET provider_type=excluded.provider_type,status=excluded.status,utilization=excluded.utilization,resets_at=excluded.resets_at,is_using_overage=excluded.is_using_overage,raw_json=excluded.raw_json,updated_at=excluded.updated_at",params![id,kind,provider,state.as_str(),util.as_f64(),reset.as_str(),overage,raw.to_string(),now()])?;
    Ok(())
}
impl ProviderUsageService {
    pub fn new(db: DatabaseWorker, warning: Option<UsageWarning>) -> Self {
        Self {
            db,
            warned: Default::default(),
            warning,
        }
    }
    pub async fn record_claude_rate_limit(
        &self,
        id: String,
        provider: String,
        info: Value,
    ) -> Result<(), String> {
        let info = fields(
            &info,
            &[
                "rateLimitType",
                "status",
                "utilization",
                "resetsAt",
                "isUsingOverage",
            ],
        );
        let kind = info["rateLimitType"]
            .as_str()
            .unwrap_or("unknown")
            .to_string();
        let util = info["utilization"].as_f64();
        let near = matches!(
            info["status"].as_str(),
            Some("allowed_warning" | "rejected")
        ) || util.is_some_and(|v| v >= 0.9);
        let (account, window) = (id.clone(), kind.clone());
        self.db
            .run(move |db| {
                save(
                    db,
                    &id,
                    &kind,
                    &provider,
                    info["status"].clone(),
                    json!(util),
                    epoch(&info["resetsAt"]),
                    info["isUsingOverage"].as_bool().unwrap_or(false),
                    info,
                )?;
                Ok(())
            })
            .await
            .map_err(|e| e.to_string())?;
        let notify = {
            let mut warned = self
                .warned
                .lock()
                .map_err(|_| "Usage warning state unavailable")?;
            if near {
                warned.insert((account, window.clone()))
            } else {
                warned.remove(&(account, window.clone()));
                false
            }
        };
        if notify && let Some(warning) = &self.warning {
            let label = match window.as_str() {
                "five_hour" => "session limit",
                "seven_day" => "weekly limit",
                "seven_day_opus" => "Opus weekly limit",
                "seven_day_sonnet" => "Sonnet weekly limit",
                "overage" => "extra usage",
                _ => &window,
            };
            let detail = util
                .map(|v| format!("at {}%", (v * 100.).round()))
                .unwrap_or_else(|| "near its limit".into());
            warning(
                "Approaching usage limit",
                &format!("Claude Code's {label} is {detail}."),
                "/settings?tab=usage",
            );
        }
        Ok(())
    }
    pub async fn record_codex_rate_limits(
        &self,
        id: String,
        response: Value,
    ) -> Result<(), String> {
        let response =
            super::provider_quota_fetchers::normalize_codex_rate_limits(&response)?.into_owned();
        self.db.run(move|db|{
 let tx=db.unchecked_transaction()?; let limits=&response["rateLimits"];
 let exhausted=response["ordinaryUsageAllowed"]==false || limits["spendControlReached"]==true || limits["rateLimitReachedType"]=="workspace_member_credits_depleted";
 for name in ["primary","secondary"] {let w=&limits[name]; if w.is_null(){continue;}
 let kind=match w["windowDurationMins"].as_f64(){Some(300.)=>"five_hour",Some(10080.)=>"seven_day",_=>name};
 let utilization=(w["usedPercent"].as_f64().unwrap_or(0.)/100.).clamp(0.,1.);
 save(&tx,&id,kind,"codex",json!(status(utilization,exhausted)),json!(utilization),epoch(&w["resetsAt"]),false,json!({"planType":limits["planType"],"ordinaryUsageAllowed":response["ordinaryUsageAllowed"],"windowDurationMins":w["windowDurationMins"],"resetSource":if w["resetsAt"].is_number(){json!("provider-reported")}else{Value::Null},"credits":limits["credits"],"resetCredits":response["rateLimitResetCredits"],"rateLimitReachedType":limits["rateLimitReachedType"],"spendControlReached":limits["spendControlReached"]}))?;
 }tx.commit()?;Ok(()) }).await.map_err(|e|e.to_string())
    }
    pub async fn record_opencode_go_usage(
        &self,
        id: String,
        response: Value,
    ) -> Result<(), String> {
        self.db.run(move|db|{let tx=db.unchecked_transaction()?;
 for (name,kind,minutes) in [("rolling","five_hour",Some(300)),("weekly","seven_day",Some(10080)),("monthly","monthly",None)] {
 let w=&response["usage"][name]; let percent=w["percent"].as_f64().ok_or("Invalid OpenCode Go usage")?;
 save(&tx,&id,kind,"opencode-go",json!(if w["status"]=="rate-limited"{"rejected"}else if percent>=90.{"allowed_warning"}else{"allowed"}),json!(percent/100.),w["resetsAt"].clone(),false,json!({"planType":"Go","windowDurationMins":minutes,"resetSource":if w["resetsAt"].as_str().is_some_and(|s|!s.is_empty()){json!("provider-reported")}else{Value::Null}}))?;
 }tx.commit()?;Ok(())}).await.map_err(|e|e.to_string())
    }
    pub async fn record_ollama_usage(
        &self,
        id: String,
        response: Value,
        plan: Option<String>,
        label: Option<String>,
    ) -> Result<(), String> {
        self.db.run(move|db|{
 let quota=super::provider_quota_fetchers::is_ollama_quota_usage_response(&response);
 if !quota {if response.get("totals").is_some(){save(db,&id,"request_activity","ollama",Value::Null,Value::Null,Value::Null,false,json!({"planType":plan,"accountLabel":label,"requestCount":response["totals"]["request_count"],"usagePeriod":{"from":response["from"],"until":response["until"],"range":response["range"]}}))?;}return Ok(());}
 let tx=db.unchecked_transaction()?;
 tx.execute("DELETE FROM provider_usage WHERE account_id=?1 AND rate_limit_type='request_activity'",[&id])?;
 for (name,kind,minutes) in [("session","five_hour",300.),("weekly","seven_day",10080.),("monthly","monthly",43200.)] {
 let limit=&response["limits"][name]; if limit.is_null(){continue;}
 let utilization=limit["usage"].as_f64().unwrap_or(0.).clamp(0.,1.);
 let old=tx.query_row("SELECT utilization,resets_at,raw_json,updated_at FROM provider_usage WHERE account_id=?1 AND rate_limit_type=?2",params![id,kind],|r|Ok((r.get::<_,Option<f64>>(0)?,r.get::<_,Option<String>>(1)?,r.get::<_,String>(2)?,r.get::<_,String>(3)?))).optional()?;
 let previous=old.map(|(utilization,resets_at,raw,updated)|{let raw:Value=serde_json::from_str(&raw).unwrap_or_default();ResetSnapshot{utilization,resets_at,source:parse_ollama_reset_source(&raw["resetSource"]),observed_at:Some(updated)}});
 let reset=derive_ollama_reset_window(ResetWindowInput{window_duration_mins:minutes,now_ms:Utc::now().timestamp_millis(),utilization:Some(utilization),previous:previous.as_ref(),anchor_iso:response["activity"]["period"]["starting_at"].as_str()})?;
 let settings=response["source"]=="settings";
 let models=limit["models"].as_array().map(|a|a.iter().map(|m|json!({"name":m["name"],"requestCount":m["request_count"]})).collect::<Vec<_>>()).unwrap_or_default();
 save(&tx,&id,kind,"ollama",json!(status(utilization,false)),json!(utilization),if settings{limit["resetsAt"].clone()}else{json!(reset.resets_at)},false,json!({"planType":plan,"windowDurationMins":minutes,"accountLabel":label,"windowStartAt":reset.window_start_at,"resetSource":if settings{if limit["resetsAt"].as_str().is_some_and(|s|!s.is_empty()){json!("provider-reported")}else{Value::Null}}else{json!(reset.source.as_str())},"models":models,"activityCost":response["activity"]["cost"]}))?;
 }tx.commit()?;Ok(())}).await.map_err(|e|e.to_string())
    }
    /// Owner is authenticated by the caller; SQL independently checks ownership.
    pub async fn list_for_user(
        &self,
        user: String,
        account_ids: Vec<String>,
    ) -> Result<Vec<Value>, String> {
        self.db.run(move|db|{
 let mut stmt=db.prepare("SELECT u.account_id,u.rate_limit_type,u.provider_type,u.status,u.utilization,u.resets_at,u.is_using_overage,u.raw_json,u.updated_at FROM provider_usage u JOIN provider_accounts a ON a.id=u.account_id WHERE a.user_id=?1")?;
 let rows=stmt.query_map([user],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?,r.get::<_,Option<String>>(3)?,r.get::<_,Option<f64>>(4)?,r.get::<_,Option<String>>(5)?,r.get::<_,bool>(6)?,r.get::<_,String>(7)?,r.get::<_,String>(8)?)))?.collect::<Result<Vec<_>,_>>()?;
 let rows=rows.into_iter().filter(|r|account_ids.contains(&r.0)).collect::<Vec<_>>();
 let activity=rows.iter().filter(|r|r.2=="ollama"&&r.1=="request_activity").map(|r|r.0.clone()).collect::<HashSet<_>>();
 Ok(rows.into_iter().map(|(id,kind,provider,state,util,reset,overage,raw,updated)|{
 let raw:Value=serde_json::from_str(&raw).unwrap_or_default();
 let models=raw["models"].as_array().map(|a|a.iter().filter(|m|m["name"].is_string()&&m["requestCount"].is_number()).map(|m|fields(m,&["name","requestCount"])).collect::<Vec<_>>()).unwrap_or_default();
 json!({"accountId":id,"rateLimitType":kind,"providerType":provider,"status":state,"utilization":util,"resetsAt":reset,"isUsingOverage":overage,"updatedAt":updated,
 "planType":raw["planType"].as_str(),"windowDurationMins":raw["windowDurationMins"].as_f64(),"resetSource":parse_ollama_reset_source(&raw["resetSource"]).map(|s|s.as_str()),"credits":fields(&raw["credits"],&["hasCredits","unlimited","balance"]),"resetCredits":reset_credits(&raw["resetCredits"]),"models":models,"quotaRefreshMissing":provider=="ollama"&&kind!="request_activity"&&activity.contains(&id),"requestCount":raw["requestCount"].as_f64(),"usagePeriod":fields(&raw["usagePeriod"],&["from","until","range"]),"activityCost":raw["activityCost"].as_str(),"accountLabel":raw["accountLabel"].as_str()})
 }).collect())
 }).await.map_err(|e|e.to_string())
    }
}

#[cfg(test)]
mod orchestration_tests {
    use super::*;
    #[tokio::test]
    async fn provider_orchestration_partial_quota_update_rolls_back() {
        use std::num::NonZeroU16;
        let connection = Connection::open_in_memory().unwrap();
        connection.execute_batch("CREATE TABLE provider_usage (
            account_id TEXT, rate_limit_type TEXT, provider_type TEXT, status TEXT,
            utilization REAL, resets_at TEXT, is_using_overage INTEGER, raw_json TEXT,
            updated_at TEXT, UNIQUE(account_id,rate_limit_type));
            INSERT INTO provider_usage VALUES('a','five_hour','opencode-go','allowed',0.1,NULL,0,'{}','old');
            INSERT INTO provider_usage VALUES('other','five_hour','opencode-go','allowed',0.2,NULL,0,'{}','old');").unwrap();
        let db = DatabaseWorker::new(connection, NonZeroU16::new(4).unwrap()).unwrap();
        let service = ProviderUsageService::new(db.clone(), None);
        // The first window overwrites the saved row before the missing second
        // window is encountered. Failure must roll the first update back too.
        assert!(
            service
                .record_opencode_go_usage(
                    "a".into(),
                    json!({"usage":{
                        "rolling":{"percent":95,"status":"rate-limited"}
                    }})
                )
                .await
                .is_err()
        );
        let snapshot = || {
            |db: &Connection| {
                let mut query = db.prepare("SELECT account_id,utilization,updated_at FROM provider_usage ORDER BY account_id")?;
                Ok(query
                    .query_map([], |r| {
                        Ok((
                            r.get::<_, String>(0)?,
                            r.get::<_, f64>(1)?,
                            r.get::<_, String>(2)?,
                        ))
                    })?
                    .collect::<Result<Vec<_>, _>>()?)
            }
        };
        let expected: Vec<(String, f64, String)> = vec![
            ("a".into(), 0.1, "old".into()),
            ("other".into(), 0.2, "old".into()),
        ];
        assert_eq!(db.run(snapshot()).await.unwrap(), expected);
        // Also fail in SQLite after a valid first window, rather than relying
        // only on input validation to exercise transaction rollback.
        db.run(|db| { db.execute_batch("CREATE TRIGGER reject_weekly BEFORE INSERT ON provider_usage WHEN NEW.rate_limit_type='seven_day' BEGIN SELECT RAISE(ABORT,'test failure'); END;")?; Ok(()) }).await.unwrap();
        assert!(
            service
                .record_opencode_go_usage(
                    "a".into(),
                    json!({"usage":{
                        "rolling":{"percent":95},"weekly":{"percent":80},"monthly":{"percent":60}
                    }})
                )
                .await
                .is_err()
        );
        assert_eq!(db.run(snapshot()).await.unwrap(), expected);
        db.shutdown().await.unwrap();
    }
    #[test]
    fn provider_orchestration_quota_projection_excludes_unknown_metadata() {
        let projected = reset_credits(&json!({"availableCount":1,"secret":"private",
            "credits":[{"id":"credit","status":"available","secret":"private"}]}));
        assert_eq!(
            projected,
            json!({"availableCount":1,"credits":[{"id":"credit","status":"available"}]})
        );
        assert_eq!(fields(&Value::Null, &["balance"]), Value::Null);
    }
}
