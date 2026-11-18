#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::tools::calendar::{Backend, CalendarTools, ToolError, metadata};
use serde_json::{Value, json};
use std::{
    fs,
    path::PathBuf,
    sync::{Arc, Mutex},
};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn reference(call: Value) -> Value {
    let path = root()
        .join(".jait/artifacts/gateway-rust/calendar-tools")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&path).unwrap();
    internal_driver::call(&root(), &path, json!({"version":1,"calls":[call]}), &|| {
        false
    })
    .unwrap()[0]
        .clone()
}
async fn compare(steps: Value) {
    let current = Arc::new(Mutex::new(Value::Null));
    let calls = Arc::new(Mutex::new(vec![]));
    let backend: Backend = {
        let (c, r) = (current.clone(), calls.clone());
        Arc::new(move |request| {
            r.lock().unwrap().push(request);
            let s = c.lock().unwrap().clone();
            Box::pin(async move {
                if let Some(e) = s["error"].as_str() {
                    Err(ToolError::Message(e.into()))
                } else if s["nonError"] == true {
                    Err(ToolError::NonError)
                } else {
                    Ok(s["result"].clone())
                }
            })
        })
    };
    let tools = CalendarTools::with_backend(backend);
    let mut results = vec![];
    for s in steps.as_array().unwrap() {
        *current.lock().unwrap() = s.clone();
        results.push(
            tools
                .execute(s["name"].as_str().unwrap(), &s["input"], s["user"].as_str())
                .await,
        );
    }
    assert_eq!(
        json!({"results":results,"calls":*calls.lock().unwrap()}),
        reference(json!({"op":"nativecalendartools.execute","steps":steps}))
    );
}
fn account() -> Value {
    json!({"id":"a","email":"a@example.test","provider":"android","userId":"owner","status":"connected","secret":"must not leak in projection"})
}
#[test]
fn tool_metadata_parameters_risk_category_and_order_match() {
    assert_eq!(
        *metadata(),
        reference(json!({"op":"nativecalendartools.metadata"}))
    );
}
#[tokio::test]
async fn calendar_lines_empty_primary_selection_and_twenty_item_preview() {
    let mut steps = vec![
        json!({"name":"calendar_list","input":null,"result":{"account":account(),"calendars":[]}}),
    ];
    for n in [1, 20, 21, 25] {
        let calendars:Vec<_>=(0..n).map(|i|json!({"id":format!("{i}"),"name":format!("Calendar {i} 😀"),"timeZone":if i%2==0{"Europe/Vienna"}else{"UTC"},"primary":i==0,"selected":i%3==0})).collect();
        steps.push(json!({"name":"calendar_list","user":"owner","input":{"accountId":" a ","userId":"foreign"},"result":{"account":account(),"calendars":calendars}}));
    }
    compare(json!(steps)).await;
}
#[tokio::test]
async fn events_format_times_all_day_locations_limits_and_scope_forwarding() {
    let events:Vec<_>=(0..23).map(|i|json!({"id":i,"start":if i%2==0{"2026-10-19T10:15:59.999+02:00"}else{"2026-10-20"},"title":format!("Event {i}"),"calendarName":"Work 😀","location":if i%3==0{"Office"}else{""}})).collect();
    compare(json!([
 {"name":"calendar_events","user":"owner","input":{"accountId":"a","calendarId":"c","timeMin":"start","timeMax":"end","query":" query ","limit":3.5,"unrelated":123},"result":{"account":account(),"events":events}},
 {"name":"calendar_events","user":"","input":{},"result":{"account":account(),"events":[]}},
 {"name":"calendar_events","input":null,"result":{"account":account(),"events":[{"start":"2026-10-19","title":"","calendarName":"Private","location":null}]}},
 {"name":"calendar_events","input":{"calendarId":null,"query":null,"limit":0},"result":{"account":account(),"events":[]}}
 ])).await;
}
#[tokio::test]
async fn service_errors_and_non_error_rejections_match() {
    let mut steps = vec![];
    for name in ["calendar_list", "calendar_events"] {
        for error in ["No account", "", "upstream 😀"] {
            steps.push(json!({"name":name,"input":{},"error":error}));
        }
        steps.push(json!({"name":name,"input":null,"nonError":true}));
    }
    compare(json!(steps)).await;
}
#[tokio::test]
async fn actual_calendar_service_connector_scopes_device_accounts() {
    use jait_gateway::{
        db::{self, worker::DatabaseWorker},
        services::{
            calendar::{Transport, service::CalendarService},
            user_secrets::UserSecretService,
        },
    };
    use std::num::NonZeroU16;
    let db = db::open_database(std::path::Path::new(":memory:")).unwrap();
    db::migrate_database(&db).unwrap();
    db.execute_batch("INSERT INTO users(id,username,password_hash,created_at,updated_at)VALUES('owner','alice','fixture','old','old');").unwrap();
    let worker = DatabaseWorker::new(db, NonZeroU16::new(32).unwrap()).unwrap();
    let http: Transport =
        Arc::new(|_| Box::pin(async { panic!("device accounts must not contact a provider") }));
    let service = Arc::new(CalendarService::new(
        worker,
        UserSecretService::new("fixture"),
        http,
    ));
    let account = service
        .sync_device_calendar(
            Some("owner"),
            &json!({"deviceId":"phone","calendars":[],"events":[]}),
        )
        .await
        .unwrap();
    let tools = CalendarTools::new(service.clone());
    assert_eq!(
        tools
            .execute(
                "calendar_list",
                &json!({"accountId":account["id"]}),
                Some("owner")
            )
            .await["ok"],
        true
    );
    assert_eq!(
        tools
            .execute(
                "calendar_events",
                &json!({"accountId":account["id"],"userId":"owner"}),
                Some("other")
            )
            .await["ok"],
        false
    );
    service.shutdown().await.unwrap();
}
