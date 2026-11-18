#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::tools::{core_io::HostError, persona_agents::*};
use serde_json::{Value, json};
use std::path::PathBuf;
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}
fn reference(call: Value) -> Value {
    internal_driver::call(
        &root(),
        &root()
            .join(".jait/artifacts/gateway-rust/persona-tools/contracts")
            .join(uuid::Uuid::new_v4().to_string()),
        json!({"version":1,"calls":[call]}),
        &|| false,
    )
    .unwrap()[0]
        .clone()
}
struct ScriptedPort {
    steps: Vec<Value>,
    events: Vec<Value>,
    cursor: usize,
}
impl ScriptedPort {
    fn call(&mut self, name: &str, args: Value) -> Result<Value, HostError> {
        self.events.push(json!({"name":name,"args":args}));
        let step = &self.steps[self.cursor];
        self.cursor += 1;
        assert_eq!(step["name"], name, "unexpected native port call");
        if let Some(v) = step.get("error") {
            Err(HostError::Error(v.as_str().unwrap().into()))
        } else if let Some(v) = step.get("thrown") {
            Err(HostError::Thrown(v.clone()))
        } else {
            Ok(step["value"].clone())
        }
    }
}
impl PersonaPort for ScriptedPort {
    fn list(&mut self, user: &str) -> Result<Value, HostError> {
        self.call("listPersonaAgents", json!([user]))
    }
    fn get(&mut self, id: &str, user: &str) -> Result<Value, HostError> {
        self.call("getPersonaAgent", json!([id, user]))
    }
    fn delete(&mut self, id: &str, user: &str) -> Result<(), HostError> {
        self.call("deletePersonaAgent", json!([id, user]))
            .map(|_| ())
    }
    fn save(&mut self, user: &str, profile: Value) -> Result<Value, HostError> {
        self.call("savePersonaAgent", json!([user, profile]))
    }
    fn provider_available(&mut self, provider: &str, user: &str) -> Result<bool, HostError> {
        self.call("providerAvailable", json!([provider, user]))
            .map(|v| v.as_bool().unwrap())
    }
}
fn compare(cases: Vec<Value>) {
    for batch in cases.chunks(4) {
        let expected = reference(json!({"op":"nativepersonatools.run","cases":batch}));
        let mut actual = vec![];
        for case in batch {
            let mut port = ScriptedPort {
                steps: case["steps"].as_array().unwrap().clone(),
                events: vec![],
                cursor: 0,
            };
            let result = execute_with_id(
                &mut port,
                case["inspect"].as_bool().unwrap_or(false),
                &case["input"],
                case["user"].as_str(),
                || "019f0000-0000-7000-8000-000000000001".into(),
            );
            let mut out = match result {
                Ok(result) => json!({"ok":true,"result":result}),
                Err(HostError::Error(message)) => {
                    json!({"ok":false,"error":{"kind":"Error","message":message}})
                }
                Err(HostError::Thrown(value)) => {
                    json!({"ok":false,"error":{"kind":"Thrown","value":value}})
                }
            };
            out["events"] = json!(port.events);
            out["consumed"] = json!(port.cursor);
            actual.push(out);
        }
        assert_eq!(json!(actual), expected, "cases: {batch:?}");
    }
}
fn step(name: &str, value: Value) -> Value {
    json!({"name":name,"value":value})
}
fn case(input: Value, steps: Vec<Value>) -> Value {
    json!({"user":"owner","input":input,"steps":steps})
}
fn base() -> Value {
    json!({"id":"a","name":"Developer","role":"Engineer","persona":"Keep changes reviewed","avatar":"Nova","providerId":"codex","model":null,"reportsToId":null,"repositoryIds":["repo"],"skillIds":["coding"],"usesAllSkills":true,"allowedTools":["file.read"],"requiresApproval":true,"paused":false,"schedule":{"kind":"adaptive","rules":""},"notificationChannels":[],"notificationEvents":["task_done","blocked","question"],"tasks":[]})
}
#[test]
fn factory_metadata_consent_and_inspection_match() {
    assert_eq!(
        metadata(),
        &reference(json!({"op":"nativepersonatools.metadata"}))
    );
    assert_eq!(metadata()[0]["defaultConsentLevel"], "once");
    assert_eq!(metadata()[1]["risk"], "low");
}
#[test]
fn authentication_inspection_scope_id_bounds_and_foreign_profiles_match() {
    let mut cases = vec![];
    for user in [Value::Null, json!(""), json!("owner")] {
        cases.push(json!({"user":user,"input":{"action":"list"},"steps":if user=="owner"{vec![step("listPersonaAgents",json!([base()]))]}else{vec![]}}));
        cases.push(
            json!({"user":user,"inspect":true,"input":{"action":"delete","id":"a"},"steps":[]}),
        );
    }
    for id in ["".into(), "x".repeat(101), "😀".repeat(51)] {
        cases.push(case(json!({"action":"get","id":id}), vec![]));
    }
    for action in ["get", "update", "delete"] {
        cases.push(case(
            json!({"action":action,"id":"foreign","profile":{"name":"stolen"}}),
            vec![step("getPersonaAgent", Value::Null)],
        ));
    }
    cases.push(json!({"inspect":true,"user":"owner","input":{"action":"get","id":"a"},"steps":[step("getPersonaAgent",base())]}));
    compare(cases);
}
#[test]
fn create_defaults_identity_provider_and_save_merge_match() {
    let mut p = base();
    p["name"] = json!("Lead");
    let rich = json!({"id":"untrusted","name":"Lead","providerId":"codex","role":"Manager","model":null,"reportsToId":"boss","usesAllSkills":false,"schedule":{"kind":"cron","cron":"0 * * * *","discard":true},"tasks":[{"id":"task","name":"","prompt":"review","cron":"","jobId":"job","repositoryId":"repo","discard":"nested"}],"opaque":{"keep":true}});
    compare(vec![
        case(
            json!({"action":"create","profile":{"name":"Developer","providerId":"codex"}}),
            vec![
                step("providerAvailable", json!(true)),
                step("savePersonaAgent", base()),
            ],
        ),
        case(
            json!({"action":"create","id":"a","profile":rich}),
            vec![
                step("getPersonaAgent", base()),
                step("providerAvailable", json!(true)),
                step("savePersonaAgent", p.clone()),
            ],
        ),
        case(
            json!({"action":"create","profile":{"name":"X","providerId":"unavailable"}}),
            vec![step("providerAvailable", json!(false))],
        ),
        case(
            json!({"action":"update","id":"a","profile":{"paused":true,"reportsToId":null}}),
            vec![
                step("getPersonaAgent", base()),
                step("providerAvailable", json!(true)),
                step("savePersonaAgent", p),
            ],
        ),
    ]);
}
#[test]
fn profile_required_nested_validation_and_error_precedence_match() {
    let mut cases = vec![];
    for profile in [
        Value::Null,
        json!([]),
        json!(false),
        json!(0),
        json!({}),
        json!({"schedule":{"kind":"cron","cron":""}}),
        json!({"notificationEvents":["arbitrary"]}),
        json!({"tasks":[{"id":"t","name":"x","cron":"* * * * *"}]}),
        json!({"role":false,"model":false,"repositoryIds":[3,null],"reportsToId":""}),
    ] {
        cases.push(case(
            json!({"action":"update","id":"a","profile":profile}),
            vec![step("getPersonaAgent", base())],
        ));
    }
    // An empty patch is valid, preserving every existing field.
    cases[4]["steps"] = json!([
        step("getPersonaAgent", base()),
        step("providerAvailable", json!(true)),
        step("savePersonaAgent", base())
    ]);
    cases.push(case(json!({"action":"create","profile":{}}), vec![]));
    compare(cases);
}
#[test]
fn service_failures_preserve_catch_boundary_and_delete_owner_dispatch() {
    let mut cases = vec![case(
        json!({"action":"delete","id":"a"}),
        vec![
            step("getPersonaAgent", base()),
            step("deletePersonaAgent", Value::Null),
        ],
    )];
    for thrown in [
        json!({"error":"storage failed"}),
        json!({"thrown":{"message":"untrusted"}}),
        json!({"thrown":"literal"}),
    ] {
        for (input, mut steps, name) in [
            (json!({"action":"list"}), vec![], "listPersonaAgents"),
            (json!({"action":"get","id":"a"}), vec![], "getPersonaAgent"),
            (
                json!({"action":"delete","id":"a"}),
                vec![step("getPersonaAgent", base())],
                "deletePersonaAgent",
            ),
            (
                json!({"action":"create","profile":{"name":"X","providerId":"codex"}}),
                vec![],
                "providerAvailable",
            ),
            (
                json!({"action":"update","id":"a","profile":{"paused":true}}),
                vec![
                    step("getPersonaAgent", base()),
                    step("providerAvailable", json!(true)),
                ],
                "savePersonaAgent",
            ),
        ] {
            let mut error = thrown.clone();
            error["name"] = json!(name);
            steps.push(error);
            cases.push(case(input, steps));
        }
    }
    compare(cases);
}
fn compare_profiles(profiles: Vec<Value>) {
    for profile in profiles {
        let expected = reference(json!({"op":"nativepersonatools.parse","profiles":[profile]}));
        let actual = match parse_profile(&profile) {
            Ok(v) => json!({"ok":v}),
            Err(error) => json!({"error":error}),
        };
        assert_eq!(actual, expected[0]);
    }
}
#[test]
fn shared_schema_all_fields_wrong_types_and_nested_stripping_match() {
    let mut values = vec![base(), Value::Null, json!({})];
    let mut prototype = base();
    prototype["__proto__"] = json!({"injected":true});
    values.push(prototype);
    for (key, _) in base().as_object().unwrap() {
        for invalid in [Value::Null, json!(7), json!({})] {
            let mut p = base();
            p[key] = invalid;
            values.push(p);
        }
    }
    let mut extra = base();
    extra["opaque"] = json!({"kept":[1,true]});
    extra["schedule"]["discard"] = json!(1);
    extra["tasks"] = json!([{"id":"t","name":"","prompt":"","cron":"","discard":true}]);
    values.push(extra);
    compare_profiles(values);
}
#[test]
fn shared_schema_utf16_array_limits_and_large_profile_refinement_match() {
    let mut values = vec![];
    for (key, max) in [
        ("id", 100),
        ("name", 200),
        ("role", 200),
        ("reportsToId", 100),
        ("persona", 10_000),
        ("avatar", 40),
        ("providerId", 100),
        ("model", 200),
    ] {
        for len in [max / 2, max / 2 + 1] {
            let mut p = base();
            p[key] = json!("😀".repeat(len));
            values.push(p);
        }
    }
    for key in [
        "repositoryIds",
        "skillIds",
        "allowedTools",
        "notificationChannels",
    ] {
        let mut p = base();
        p[key] = json!(vec!["x"; 101]);
        values.push(p);
        let mut p = base();
        p[key] = json!(["x".repeat(201)]);
        values.push(p);
    }
    let mut p = base();
    p["notificationEvents"] = json!(["task_done", "blocked", "question", "task_done"]);
    values.push(p);
    for size in [29_000, 29_999] {
        let mut p = base();
        p["extra"] = json!("x".repeat(size));
        values.push(p);
    }
    compare_profiles(values);
}
#[test]
fn native_default_identity_is_v7_and_not_input_controlled() {
    let mut port = ScriptedPort {
        steps: vec![
            step("providerAvailable", json!(true)),
            step("savePersonaAgent", base()),
        ],
        events: vec![],
        cursor: 0,
    };
    execute(
        &mut port,
        false,
        &json!({"action":"create","profile":{"name":"X","providerId":"codex","id":"attacker"}}),
        Some("owner"),
    )
    .unwrap();
    let id = port.events[1]["args"][1]["id"].as_str().unwrap();
    let uuid = uuid::Uuid::parse_str(id).unwrap();
    assert_eq!(uuid.get_version_num(), 7);
    assert_ne!(id, "attacker");
}
