//! Consent routes over the queue the settings chat's executor waits on.
//!
//! A user may only see and decide consents for sessions they own, and every decision is
//! written to the log. A failed ownership lookup denies access.
use crate::{
    routes::{
        auth::AuthState,
        consent::{ConsentAudit, ConsentOwnership, ConsentRoutes},
    },
    runtime::blocking::BlockingLane,
    security::consent_manager::ConsentManager,
    services::sessions::SessionService,
};
use std::{num::NonZeroU16, sync::Arc};

pub fn composed_consent_routes(auth: &AuthState, manager: ConsentManager) -> ConsentRoutes {
    let worker = auth.worker();
    let runtime = tokio::runtime::Handle::current();
    // Runs on the blocking lane, so waiting on the database worker cannot stall the runtime.
    let owns_session: ConsentOwnership = Arc::new(move |session, user| {
        let (session, user) = (session.to_owned(), user.to_owned());
        let worker = worker.clone();
        runtime
            .block_on(async move {
                worker
                    .run(move |db| {
                        Ok(SessionService::new(db)
                            .get(&session, Some(&user))?
                            .is_some())
                    })
                    .await
            })
            .map_err(|e| e.to_string())
    });
    let audit: ConsentAudit = Arc::new(|event| {
        eprintln!("consent audit: {event}");
        Ok(())
    });
    ConsentRoutes {
        auth: auth.clone(),
        manager,
        owns_session,
        audit,
        lane: BlockingLane::new(NonZeroU16::new(4).unwrap()),
        active_profile_name: None,
        permissions: Vec::new(),
    }
}
