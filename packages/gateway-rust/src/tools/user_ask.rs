//! Structured user.ask adapter over the real native pending-question service.
use crate::{
    services::input_requests::{QuestionInput, UserQuestionService, WaitOutcome},
    text::js_trim,
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::sync::LazyLock;

pub fn metadata() -> &'static Value {
    static DEFINITION: LazyLock<Value> = LazyLock::new(|| {
        serde_json::from_str(include_str!("user-ask-metadata.json"))
            .expect("embedded user.ask definition")
    });
    &DEFINITION
}
#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AskContext {
    pub session_id: String,
    pub user_id: Option<String>,
    #[serde(default)]
    pub requested_by: Option<String>,
}
#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserAskInput {
    #[serde(default)]
    pub request_id: Option<String>,
    pub title: Option<String>,
    pub attention: Option<String>,
    #[serde(default)]
    pub questions: Vec<AskQuestion>,
}
#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AskQuestion {
    pub id: String,
    pub header: String,
    pub question: String,
    pub multi_select: Option<bool>,
    pub allow_freeform_input: Option<bool>,
    pub options: Option<Vec<AskOption>>,
}
#[derive(Clone, Default, Deserialize)]
pub struct AskOption {
    pub label: String,
    pub description: Option<String>,
    pub recommended: Option<bool>,
}
fn normalize(question: AskQuestion) -> Value {
    let mut result = json!({"id":js_trim(&question.id),"header":js_trim(&question.header),"question":js_trim(&question.question),
        "multiSelect":question.multi_select==Some(true),"allowFreeformInput":question.allow_freeform_input!=Some(false)});
    if let Some(options) = question.options {
        result["options"] = Value::Array(
            options
                .into_iter()
                .filter_map(|option| {
                    let label = js_trim(&option.label);
                    if label.is_empty() {
                        return None;
                    }
                    let mut result =
                        json!({"label":label,"recommended":option.recommended==Some(true)});
                    if let Some(description) = option
                        .description
                        .as_deref()
                        .map(js_trim)
                        .filter(|s| !s.is_empty())
                    {
                        result["description"] = json!(description);
                    }
                    Some(result)
                })
                .collect(),
        );
    }
    result
}
// A dropped direct tool call must not leave an unanswerable prompt behind.
// Resumable MCP calls deliberately retain their request across waits instead.
struct DirectQuestionGuard {
    service: UserQuestionService,
    id: String,
    user_id: Option<String>,
}
impl Drop for DirectQuestionGuard {
    fn drop(&mut self) {
        self.service.cancel(&self.id, self.user_id.as_deref());
    }
}

pub async fn execute(
    service: &UserQuestionService,
    input: UserAskInput,
    context: &AskContext,
) -> Value {
    // `if (input.requestId)`: an empty string is falsy and starts a new request.
    if let Some(request_id) = input.request_id.as_deref().filter(|id| !id.is_empty()) {
        if input.questions.is_empty() {
            return wait_for_answer(service, request_id, context).await;
        }
        return json!({"ok":false,"message":"Resume with only requestId; do not supply new questions."});
    }
    let questions: Vec<_> = input.questions.into_iter().map(normalize).collect();
    if questions.is_empty() {
        return json!({"ok":false,"message":"At least one question is required."});
    }
    if questions.iter().any(|q| {
        ["id", "header", "question"]
            .iter()
            .any(|k| q[k].as_str().unwrap().is_empty())
    }) {
        return json!({"ok":false,"message":"Each question requires id, header, and question."});
    }
    let mut seen = vec![];
    let mut duplicates = vec![];
    for question in &questions {
        let id = question["id"].as_str().unwrap();
        if seen.contains(&id) && !duplicates.contains(&id) {
            duplicates.push(id);
        }
        seen.push(id);
    }
    if !duplicates.is_empty() {
        return json!({"ok":false,"message":format!("Duplicate question id(s): {}",duplicates.join(", "))});
    }
    let request = QuestionInput {
        session_id: context.session_id.clone(),
        user_id: context.user_id.clone(),
        requested_by: Some("user.ask".into()),
        title: input.title,
        attention: input.attention,
        questions,
    };
    if context.requested_by.as_deref() == Some("mcp-client") {
        let request_id = service.start_resumable(request);
        return wait_for_answer(service, &request_id, context).await;
    }
    let handle = service.ask(request);
    let _guard = DirectQuestionGuard {
        service: service.clone(),
        id: handle.id.clone(),
        user_id: context.user_id.clone(),
    };
    match handle.result.await {
        Ok(Some(result)) => {
            json!({"ok":true,"message":"User answered the question request.","data":result})
        }
        _ => json!({"ok":false,"message":"The user did not answer the question request."}),
    }
}

/// One resumable wait. Pending keeps the request addressable so MCP clients can
/// call `user.ask` with only the requestId until the user answers or cancels.
async fn wait_for_answer(
    service: &UserQuestionService,
    request_id: &str,
    context: &AskContext,
) -> Value {
    match service
        .wait_for_answer(request_id, &context.session_id, context.user_id.as_deref())
        .await
    {
        WaitOutcome::Missing => json!({
            "ok":false,
            "message":"Question request not found for this user and session."
        }),
        WaitOutcome::Pending => json!({
            "ok":true,
            "message":"Waiting for the user. Call user.ask again with only this requestId until answered or cancelled. The question has no expiry; do not proceed without the answer.",
            "data":{"status":"pending","requestId":request_id}
        }),
        WaitOutcome::Answered(Some(result)) => json!({
            "ok":true,
            "message":"User answered the question request.",
            "data":result
        }),
        WaitOutcome::Answered(None) => json!({
            "ok":false,
            "message":"The user cancelled the question request."
        }),
    }
}

#[cfg(test)]
mod cancellation_tests {
    use super::*;

    #[tokio::test]
    async fn shared_service_rejects_other_user_and_delivers_answer() {
        let service = UserQuestionService::default();
        let tool_service = service.clone();
        let task = tokio::spawn(async move {
            execute(
                &tool_service,
                UserAskInput {
                    questions: vec![AskQuestion {
                        id: "q".into(),
                        header: "Question".into(),
                        question: "Proceed?".into(),
                        ..Default::default()
                    }],
                    ..Default::default()
                },
                &AskContext {
                    session_id: "session".into(),
                    user_id: Some("owner".into()),
                    ..Default::default()
                },
            )
            .await
        });
        tokio::task::yield_now().await;
        assert!(
            service
                .list_pending(Some("session"), Some("other"))
                .is_empty()
        );
        let pending = service.list_pending(Some("session"), Some("owner"));
        assert_eq!(pending.len(), 1);
        let answer = json!({"answers": {"q": {"selected": ["yes"]}}});
        assert!(!service.submit(&pending[0].id, answer.clone(), Some("other")));
        assert!(service.submit(&pending[0].id, answer.clone(), Some("owner")));
        let result = task.await.unwrap();
        assert_eq!(result["ok"], true);
        assert_eq!(result["data"], answer);
        assert!(
            service
                .list_pending(Some("session"), Some("owner"))
                .is_empty()
        );
    }

    #[tokio::test]
    async fn dropping_direct_call_removes_pending_question() {
        let service = UserQuestionService::default();
        let task_service = service.clone();
        let task = tokio::spawn(async move {
            execute(
                &task_service,
                UserAskInput {
                    questions: vec![AskQuestion {
                        id: "q".into(),
                        header: "Question".into(),
                        question: "Proceed?".into(),
                        ..Default::default()
                    }],
                    ..Default::default()
                },
                &AskContext {
                    session_id: "session".into(),
                    user_id: Some("owner".into()),
                    ..Default::default()
                },
            )
            .await
        });
        tokio::task::yield_now().await;
        assert_eq!(
            service.list_pending(Some("session"), Some("owner")).len(),
            1
        );
        task.abort();
        assert!(task.await.unwrap_err().is_cancelled());
        assert!(
            service
                .list_pending(Some("session"), Some("owner"))
                .is_empty()
        );
    }
}
