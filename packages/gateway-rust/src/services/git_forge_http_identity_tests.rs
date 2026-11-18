use super::*;

#[test]
fn identity_ids_accept_provider_scalars_and_reject_nested_response_data() {
    assert_eq!(
        identity_account_id(&json!({"id": 42})),
        Ok(Some("42".into()))
    );
    assert_eq!(
        identity_account_id(&json!({"uuid": "{abc}"})),
        Ok(Some("{abc}".into()))
    );
    assert_eq!(identity_account_id(&json!({"id": null})), Ok(None));
    for value in [
        json!({"secret-token": "echo"}),
        json!([1]),
        json!(true),
        json!(-1),
        json!(1.5),
        json!(""),
    ] {
        assert_eq!(
            identity_account_id(&json!({"id": value})),
            Err(HttpForgeError::MalformedResponse)
        );
    }
}
