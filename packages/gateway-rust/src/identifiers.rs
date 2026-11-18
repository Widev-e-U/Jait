//! Public action UUIDv7 helpers share the database identifier generator.
pub fn uuidv7() -> String {
    crate::db::identifiers::uuidv7().to_string()
}
pub fn new_action_id() -> String {
    uuidv7()
}
