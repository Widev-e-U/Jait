//! One process-wide assessment execution owner shared by native adapters.
use std::sync::Mutex;
static OWNER: Mutex<Option<String>> = Mutex::new(None);
pub struct AssessmentRelease {
    id: String,
}
pub fn claim_assessment_execution(id: &str) -> Result<AssessmentRelease, &'static str> {
    let mut owner = OWNER.lock().unwrap_or_else(|e| e.into_inner());
    if owner.as_ref().is_some_and(|s| !s.is_empty()) {
        return Err("A security assessment is already running on this gateway");
    }
    *owner = Some(id.into());
    Ok(AssessmentRelease { id: id.into() })
}
impl AssessmentRelease {
    /// Explicit, repeatable reference-compatible release. Hold through all adapter I/O.
    pub fn release(&self) {
        let mut owner = OWNER.lock().unwrap_or_else(|e| e.into_inner());
        if owner.as_deref() == Some(&self.id) {
            *owner = None;
        }
    }
}
