//! Shared ownership checks for HTTP, WebSocket input and output.
//! Store adapters perform blocking reads on the bounded worker.
use crate::services::sessions::{CreateSession, SessionService};
pub type AccessResult<T> = Result<T, String>;
pub trait SessionAccess {
    fn owned_session_exists(&self, session: &str, user: &str) -> AccessResult<bool>;
    fn create_execution_session(&self, user: &str, root: &str) -> AccessResult<String>;
}
impl SessionAccess for SessionService<'_> {
    fn owned_session_exists(&self, session: &str, user: &str) -> AccessResult<bool> {
        self.get(session, Some(user))
            .map(|v| v.is_some())
            .map_err(|e| e.to_string())
    }
    fn create_execution_session(&self, user: &str, root: &str) -> AccessResult<String> {
        self.create(CreateSession {
            user_id: Some(user.into()),
            project_path: Some(root.into()),
            name: Some("API tool session".into()),
            ..Default::default()
        })
        .map(|v| v.id)
        .map_err(|e| e.to_string())
    }
}
pub struct AccessSurface {
    pub session_id: Option<String>,
    pub owner: Option<String>,
}
pub struct AccessConsent {
    pub status: String,
    pub session_id: String,
}
pub trait SurfaceAccess {
    fn surface(&self, id: &str) -> AccessResult<Option<AccessSurface>>;
}
pub trait ConsentAccess {
    fn request(&self, id: &str) -> AccessResult<Option<AccessConsent>>;
}
pub trait ThreadAccess {
    fn owner(&self, id: &str) -> AccessResult<Option<String>>;
}
#[derive(Default)]
pub struct ControlAccess<'a> {
    pub sessions: Option<&'a dyn SessionAccess>,
    pub surfaces: Option<&'a dyn SurfaceAccess>,
    pub consent: Option<&'a dyn ConsentAccess>,
    pub threads: Option<&'a dyn ThreadAccess>,
}
impl ControlAccess<'_> {
    pub fn execution_session(&self, id: &str, user: &str, root: &str) -> AccessResult<String> {
        if id == "default"
            && let Some(sessions) = self.sessions
        {
            return sessions.create_execution_session(user, root);
        }
        Ok(id.into())
    }
    pub fn session(&self, id: &str, user: Option<&str>) -> AccessResult<bool> {
        let Some(user) = user.filter(|u| !u.is_empty()) else {
            return Ok(false);
        };
        if let Some(sessions) = self.sessions
            && sessions.owned_session_exists(id, user)?
        {
            return Ok(true);
        }
        match self.threads {
            Some(threads) => Ok(threads.owner(id)?.as_deref() == Some(user)),
            None => Ok(false),
        }
    }
    pub fn surface(&self, id: &str, user: Option<&str>) -> AccessResult<bool> {
        let Some(user) = user.filter(|u| !u.is_empty()) else {
            return Ok(false);
        };
        let Some(surfaces) = self.surfaces else {
            return Ok(false);
        };
        let Some(surface) = surfaces.surface(id)? else {
            return Ok(false);
        };
        match surface.owner.filter(|owner| !owner.is_empty()) {
            Some(owner) => Ok(owner == user),
            None => self.session(surface.session_id.as_deref().unwrap_or(""), Some(user)),
        }
    }
    pub fn consent_request(&self, id: &str, user: Option<&str>) -> AccessResult<bool> {
        let Some(consent) = self.consent else {
            return Ok(false);
        };
        let Some(request) = consent.request(id)? else {
            return Ok(false);
        };
        Ok(request.status == "pending" && self.session(&request.session_id, user)?)
    }
}
