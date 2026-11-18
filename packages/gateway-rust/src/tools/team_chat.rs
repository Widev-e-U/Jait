//! Persistent team-chat tool adapter. The service port retains ownership,
//! attribution, independent goal verification and delivery policy. This adapter
//! neither starts workers nor supplies an implementation of TeamChatService.
use super::{
    core_io::HostError,
    core_jait::JaitPort,
    validate::{ToolInput, validate_tool_input},
};
use crate::services::calendar::{js_text, truthy};
use serde_json::{Value, json};
use std::sync::{Arc, LazyLock};

pub fn metadata() -> &'static Value {
    static DATA: LazyLock<Value> =
        LazyLock::new(|| serde_json::from_str(include_str!("team-chat-metadata.json")).unwrap());
    &DATA
}
fn fail(message: impl Into<String>) -> Value {
    json!({"ok":false,"message":message.into()})
}
fn success(message: Value, data: Value) -> Value {
    json!({"ok":true,"message":message,"data":data})
}
fn nullish(value: Option<&Value>) -> Option<Value> {
    value.filter(|v| !v.is_null()).cloned()
}
fn fields(input: &Value, keys: &[&str]) -> Value {
    let mut out = json!({});
    for key in keys {
        if let Some(v) = input.get(*key) {
            out[*key] = v.clone();
        }
    }
    out
}
/// The retry-key factory belongs to the embedding runtime (normally UUIDv7).
/// Injection keeps entropy and clock policy outside the tool adapter.
pub struct TeamChat<C> {
    pub service: JaitPort<C>,
    pub retry_key: Arc<dyn Fn() -> String + Send + Sync>,
}
impl<C: Send + Sync> TeamChat<C> {
    pub async fn execute(&self, input: &Value, context: &Value, host: &C) -> Value {
        if !truthy(&context["userId"]) {
            return fail("Authenticated user required.");
        }
        // Validation is outside the TypeScript try/catch. The fixed schema cannot
        // throw; its coercions are observable by the service boundary.
        let input = {
            let mut validated = ToolInput::new(input);
            let validation = validate_tool_input(&metadata()["parameters"], &mut validated)
                .expect("static team chat schema");
            if !validation.valid {
                return fail(format!(
                    "Input validation failed: {}",
                    validation
                        .errors
                        .iter()
                        .map(|s| String::from_utf16_lossy(&s.0))
                        .collect::<Vec<_>>()
                        .join("; ")
                ));
            }
            validated.value()
        };
        match self.execute_inner(&input, context, host).await {
            Ok(value) => value,
            Err(HostError::Error(message)) => fail(message),
            Err(HostError::Thrown(_)) => fail("Unable to update team chat."),
        }
    }
    async fn call(&self, method: &str, args: Vec<Value>, host: &C) -> Result<Value, HostError> {
        Ok((self.service)(method, args, host)
            .await?
            .unwrap_or(Value::Null))
    }
    async fn execute_inner(
        &self,
        input: &Value,
        context: &Value,
        host: &C,
    ) -> Result<Value, HostError> {
        let owner = context["userId"].clone();
        let session = context["sessionId"].clone();
        if input["action"] == "list" {
            let rooms = self.call("list", vec![owner], host).await?;
            return Ok(success(
                json!("Persistent team rooms."),
                json!({"rooms":rooms}),
            ));
        }
        let work = self
            .call("workForSession", vec![owner.clone(), session.clone()], host)
            .await?;
        let room_id = if let Some(id) =
            nullish(input.get("roomId")).or_else(|| nullish(work.get("roomId")))
        {
            id
        } else if truthy(&input["agentId"]) {
            self.call(
                "ensureRoom",
                vec![owner.clone(), input["agentId"].clone(), session.clone()],
                host,
            )
            .await?["id"]
                .clone()
        } else {
            Value::Null
        };
        if !truthy(&room_id) {
            return Ok(fail("Choose a roomId from action=list or provide agentId."));
        }
        let room = self
            .call("get", vec![owner.clone(), room_id.clone()], host)
            .await?;
        if input["action"] == "get" {
            let members = self
                .call("roomMembers", vec![owner.clone(), room["id"].clone()], host)
                .await?;
            let messages = self
                .call("history", vec![owner.clone(), room_id.clone()], host)
                .await?;
            let deliveries = self.call("deliveries", vec![owner, room_id], host).await?;
            return Ok(success(
                room["name"].clone(),
                json!({"room":room,"members":members,"messages":messages,"deliveries":deliveries}),
            ));
        }
        let sender = self
            .call(
                "sender",
                vec![owner.clone(), session.clone(), room_id.clone()],
                host,
            )
            .await?;
        if input["action"] == "goal" {
            let updated = self
                .call(
                    "setGoal",
                    vec![
                        owner,
                        room_id,
                        nullish(input.get("content")).unwrap_or(json!("")),
                        nullish(input.get("criteria")).unwrap_or(json!([])),
                        sender,
                    ],
                    host,
                )
                .await?;
            return Ok(success(
                json!("Team goal recorded."),
                json!({"room":updated}),
            ));
        }
        if input["action"] == "complete" {
            let updated = self
                .call(
                    "completeGoal",
                    vec![
                        owner,
                        room_id,
                        nullish(input.get("evidence")).unwrap_or(json!([])),
                        sender,
                    ],
                    host,
                )
                .await?;
            return Ok(success(
                json!("Team goal completed with verification."),
                json!({"room":updated}),
            ));
        }
        if input["action"] != "send" {
            return Ok(fail("Unknown team chat action."));
        }
        if input["content"]
            .as_str()
            .is_none_or(|s| crate::text::js_trim(s).is_empty())
        {
            return Ok(fail("Message content is required."));
        }
        if sender["kind"] == "chat" {
            self.call(
                "ensureRoom",
                vec![owner.clone(), room["rootAgentId"].clone(), session.clone()],
                host,
            )
            .await?;
        }
        let mut options = fields(input, &["content", "recipientIds", "targetSessionId"]);
        options["sender"] = sender.clone();
        if sender["kind"] == "chat" {
            options["kind"] = json!("relay");
        } else if let Some(kind) = input.get("kind") {
            options["kind"] = kind.clone();
        }
        options["clientKey"] = nullish(input.get("clientKey"))
            .or_else(|| nullish(context.get("actionId")))
            .unwrap_or_else(|| json!((self.retry_key)()));
        if let Some(id) = work.get("messageId") {
            options["parentMessageId"] = id.clone();
        }
        if truthy(&work) {
            options["workSessionId"] = session.clone();
        }
        let thread = self
            .call("threadById", vec![owner.clone(), session], host)
            .await?;
        if let Some(id) = thread.get("id") {
            options["workThreadId"] = id.clone();
        }
        let message = self
            .call(
                "postRouted",
                vec![owner.clone(), room_id.clone(), options],
                host,
            )
            .await?;
        let deliveries = self.call("deliveries", vec![owner, room_id], host).await?;
        let deliveries = deliveries
            .as_array()
            .ok_or_else(|| HostError::Error("Invalid team deliveries".into()))?
            .iter()
            .filter(|delivery| delivery["messageId"] == message["id"])
            .cloned()
            .collect::<Vec<_>>();
        Ok(success(
            json!(format!("Posted to {}.", js_text(&room["name"]))),
            json!({"room":room,"message":message,"deliveries":deliveries,"pageLinks":[{"pageId":"agents","title":room["name"],"href":"/agents"}]}),
        ))
    }
}
