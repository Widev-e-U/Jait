use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

/// Exact UUIDv7 layout used by the TypeScript gateway, including 48-bit truncation.
pub fn uuidv7_from_parts(timestamp_ms: u64, mut random: [u8; 16]) -> Uuid {
    random[..6].copy_from_slice(&timestamp_ms.to_be_bytes()[2..]);
    random[6] = (random[6] & 0x0f) | 0x70;
    random[8] = (random[8] & 0x3f) | 0x80;
    Uuid::from_bytes(random)
}
pub fn uuidv7() -> Uuid {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    uuidv7_from_parts(timestamp, *Uuid::new_v4().as_bytes())
}
pub fn new_action_id() -> Uuid {
    uuidv7()
}
