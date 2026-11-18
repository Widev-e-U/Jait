//! Authenticated authority carried into a local registry owner.
//!
//! This is only a context adapter. Constructing it does not authorize an effect;
//! dispatch must still pass through the consent executor and a supervised owner.
use super::registry::RegistryContext;
use crate::security::consent_executor::ToolExecutionContext;
use serde_json::json;

/// Keeps cancellation and authenticated identity together across registry dispatch.
/// Model-provided tool input must never be used to construct this value.
#[derive(Clone)]
pub struct RegistryAuthority {
    execution: ToolExecutionContext,
}

impl RegistryAuthority {
    pub(crate) fn from_execution(execution: &ToolExecutionContext) -> RegistryContext<Self> {
        RegistryContext {
            fields: json!({
                "sessionId": execution.session_id,
                "actionId": execution.action_id,
            }),
            capabilities: Self {
                execution: execution.clone(),
            },
        }
    }

    pub fn execution(&self) -> &ToolExecutionContext {
        &self.execution
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        execution::process_runner::ProcessCancellation,
        security::consent_executor::{ExecutionOrigin, RuntimeMode},
    };
    use std::path::PathBuf;

    #[test]
    fn authority_preserves_authenticated_context_and_shared_cancellation() {
        let cancellation = ProcessCancellation::default();
        let execution = ToolExecutionContext {
            user_id: "user".into(),
            session_id: "session".into(),
            action_id: "action".into(),
            project_root: PathBuf::from("/project"),
            origin: ExecutionOrigin::Scheduler,
            runtime_mode: RuntimeMode::Guarded,
            cancellation: cancellation.clone(),
            on_output: None,
        };
        let context = RegistryAuthority::from_execution(&execution);
        assert_eq!(
            context.fields,
            json!({"sessionId": "session", "actionId": "action"})
        );
        assert_eq!(context.capabilities.execution().user_id, "user");
        assert_eq!(
            context.capabilities.execution().project_root,
            PathBuf::from("/project")
        );
        assert_eq!(
            context.capabilities.execution().origin,
            ExecutionOrigin::Scheduler
        );
        cancellation.cancel();
        assert!(context.capabilities.execution().cancellation.is_cancelled());
    }
}
