//! Per-action trust state, with the reference's non-fatal persistence behavior.
//! Run this repository inside DatabaseWorker when called from async code.
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

#[derive(Clone, Default)]
pub(crate) struct TrustCache(Arc<Mutex<Vec<TrustState>>>);

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrustState {
    pub action_type: String,
    pub approved_count: i64,
    pub reverted_count: i64,
    pub current_level: u8,
}
pub struct TrustEngine<'a> {
    db: Option<&'a Connection>,
    // Preserve the insertion order of JavaScript Map in memory-only mode.
    cache: TrustCache,
}
fn from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<TrustState> {
    let level: f64 = row.get::<_, Option<f64>>(3)?.unwrap_or(0.0);
    Ok(TrustState {
        action_type: row.get(0)?,
        approved_count: row.get::<_, Option<i64>>(1)?.unwrap_or(0),
        reverted_count: row.get::<_, Option<i64>>(2)?.unwrap_or(0),
        current_level: if level >= 3.0 {
            3
        } else if level >= 2.0 {
            2
        } else if level >= 1.0 {
            1
        } else {
            0
        },
    })
}
impl<'a> TrustEngine<'a> {
    pub fn new(db: Option<&'a Connection>) -> Self {
        Self {
            db,
            cache: TrustCache::default(),
        }
    }
    /// Only the serialized worker shares caches between short-lived facades.
    pub(crate) fn with_cache(db: Option<&'a Connection>, cache: TrustCache) -> Self {
        Self { db, cache }
    }
    pub fn get_level(&mut self, action_type: &str) -> rusqlite::Result<u8> {
        Ok(self.get_state(action_type)?.current_level)
    }
    pub fn get_state(&mut self, action_type: &str) -> rusqlite::Result<TrustState> {
        if let Some(state) = self
            .cache
            .0
            .lock()
            .unwrap()
            .iter()
            .find(|s| s.action_type == action_type)
        {
            return Ok(state.clone());
        }
        let persisted=match self.db {
            Some(db)=>db.query_row("SELECT action_type,approved_count,reverted_count,current_level FROM trust_levels WHERE action_type=?", [action_type], from_row).optional()?,
            None=>None,
        };
        let state = persisted.unwrap_or_else(|| TrustState {
            action_type: action_type.into(),
            approved_count: 0,
            reverted_count: 0,
            current_level: 0,
        });
        self.cache.0.lock().unwrap().push(state.clone());
        Ok(state)
    }
    fn persist(&mut self, state: &TrustState) {
        {
            let mut cache = self.cache.0.lock().unwrap();
            if let Some(cached) = cache
                .iter_mut()
                .find(|s| s.action_type == state.action_type)
            {
                *cached = state.clone();
            } else {
                cache.push(state.clone());
            }
        }
        if let Some(db) = self.db {
            // The reference retains in-session state on persistence failure.
            let _ = (|| -> rusqlite::Result<()> {
                let exists = db
                    .query_row(
                        "SELECT action_type FROM trust_levels WHERE action_type=?",
                        [&state.action_type],
                        |r| r.get::<_, String>(0),
                    )
                    .optional()?
                    .is_some();
                if exists {
                    db.execute("UPDATE trust_levels SET approved_count=?,reverted_count=?,current_level=? WHERE action_type=?",params![state.approved_count,state.reverted_count,state.current_level,state.action_type])?;
                } else {
                    db.execute("INSERT INTO trust_levels(action_type,approved_count,reverted_count,current_level) VALUES(?,?,?,?)",params![state.action_type,state.approved_count,state.reverted_count,state.current_level])?;
                }
                Ok(())
            })();
        }
    }
    pub fn record_approval(&mut self, action_type: &str) -> rusqlite::Result<TrustState> {
        let mut state = self.get_state(action_type)?;
        state.approved_count += 1;
        let level = if state.approved_count >= 25 {
            3
        } else if state.approved_count >= 10 {
            2
        } else if state.approved_count >= 3 {
            1
        } else {
            0
        };
        state.current_level = state.current_level.max(level);
        self.persist(&state);
        Ok(state)
    }
    pub fn record_revert(&mut self, action_type: &str) -> rusqlite::Result<TrustState> {
        let mut state = self.get_state(action_type)?;
        state.reverted_count += 1;
        state.current_level = state.current_level.saturating_sub(1);
        self.persist(&state);
        Ok(state)
    }
    pub fn reset(&mut self, action_type: &str) -> TrustState {
        let state = TrustState {
            action_type: action_type.into(),
            approved_count: 0,
            reverted_count: 0,
            current_level: 0,
        };
        self.persist(&state);
        state
    }
    pub fn list_all(&self) -> rusqlite::Result<Vec<TrustState>> {
        match self.db {
            None=>Ok(self.cache.0.lock().unwrap().clone()),
            Some(db)=>db.prepare("SELECT action_type,approved_count,reverted_count,current_level FROM trust_levels")?.query_map([],from_row)?.collect(),
        }
    }
}
