use serde_json::{Value, json};

/// Absent and foreign resources deliberately return the same response.
pub fn assert_ownership(
    owner: Option<Option<&str>>,
    user_id: &str,
    error_message: &str,
) -> Result<(), (u16, Value)> {
    if owner == Some(Some(user_id)) {
        Ok(())
    } else {
        Err((404, json!({"error": error_message})))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn owner_sees_resource() {
        assert!(assert_ownership(Some(Some("user-1")), "user-1", "Not found").is_ok());
    }

    #[test]
    fn foreign_and_missing_resources_share_the_not_found_response() {
        let expected = Err((404, json!({"error": "Not found"})));
        assert_eq!(
            assert_ownership(Some(Some("user-2")), "user-1", "Not found"),
            expected
        );
        assert_eq!(assert_ownership(Some(None), "user-1", "Not found"), expected);
        assert_eq!(assert_ownership(None, "user-1", "Not found"), expected);
    }
}
