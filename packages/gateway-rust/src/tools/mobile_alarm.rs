//! Phone-alarm tool adapter. Scheduling requires an explicit authenticated host port.
use crate::services::subscription_usage_fetchers::js_date_parse;
use crate::{
    text::js_trim,
    time::{Clock, default_clock, iso},
};
use futures_util::future::BoxFuture;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::sync::{Arc, LazyLock};

#[derive(Clone, Debug, Deserialize)]
pub struct MobileAlarmInput {
    pub at: String,
    pub title: Option<String>,
    pub body: Option<String>,
    pub id: Option<String>,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MobileAlarmContext {
    pub user_id: Option<String>,
    pub action_id: String,
}
#[derive(Clone, Debug, Serialize)]
pub struct AlarmSchedule {
    pub id: String,
    pub at: i64,
    pub title: String,
    pub body: String,
}
/// Device counts are nonnegative integers from the native push service boundary.
pub type ScheduleAlarm =
    Arc<dyn Fn(String, AlarmSchedule) -> BoxFuture<'static, Result<u32, String>> + Send + Sync>;
pub struct MobileAlarmTool {
    pub clock: Clock,
    pub schedule_alarm: ScheduleAlarm,
}
impl MobileAlarmTool {
    pub fn new(schedule_alarm: ScheduleAlarm) -> Self {
        Self {
            clock: default_clock(),
            schedule_alarm,
        }
    }
    pub fn metadata(&self) -> &'static Value {
        metadata()
    }
    pub async fn execute(
        &self,
        input: MobileAlarmInput,
        context: MobileAlarmContext,
    ) -> Result<Value, String> {
        let Some(user) = context.user_id.filter(|s| !s.is_empty()) else {
            return Ok(json!({"ok":false,"message":"A signed-in user is required"}));
        };
        let Some(at) = js_date_parse(&input.at).filter(|at| *at > (self.clock)()) else {
            return Ok(json!({"ok":false,"message":"at must be a future ISO-8601 timestamp"}));
        };
        let alarm = AlarmSchedule {
            id: nonempty(input.id.as_deref())
                .unwrap_or(&context.action_id)
                .to_string(),
            at,
            title: nonempty(input.title.as_deref())
                .unwrap_or("Jait wake-up alarm")
                .to_string(),
            body: nonempty(input.body.as_deref())
                .unwrap_or("Good morning. Open Jait for your daily briefing.")
                .to_string(),
        };
        let devices = (self.schedule_alarm)(user, alarm).await?;
        Ok(if devices > 0 {
            json!({"ok":true,"message":format!("Alarm sent to {devices} Android device(s)"),"data":{"at":iso(at)?,"devices":devices}})
        } else {
            json!({"ok":false,"message":"No configured Android push device is available"})
        })
    }
}
fn nonempty(value: Option<&str>) -> Option<&str> {
    value.map(js_trim).filter(|s| !s.is_empty())
}
pub fn metadata() -> &'static Value {
    static DATA: LazyLock<Value> = LazyLock::new(|| {
        serde_json::from_str(include_str!("mobile-alarm-metadata.json"))
            .expect("mobile alarm metadata")
    });
    &DATA
}
