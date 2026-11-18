//! Explicitly mounted authenticated secret input and encrypted-secret storage API.
use super::auth::{self, AuthState, response};
use crate::{
    services::{
        input_requests::SecretInputService,
        user_secrets::{SaveSecretParams, UserSecretService},
    },
    text::js_trim,
};
use axum::{
    Router,
    extract::{Request, State},
    http::Method,
    response::Response,
    routing::{delete, get, post},
};
use serde_json::{Value, json};

#[derive(Clone)]
pub struct SecretRoutes {
    pub auth: AuthState,
    pub secret_input: SecretInputService,
    pub user_secrets: Option<UserSecretService>,
}

impl SecretRoutes {
    pub fn router(self) -> Router {
        Router::new()
            .route("/api/secrets/requests", get(handle))
            .route("/api/secrets/requests/{id}/submit", post(handle))
            .route("/api/secrets/requests/{id}/cancel", post(handle))
            .route("/api/secrets", get(handle).post(handle))
            .route("/api/secrets/{id}", delete(handle))
            .with_state(self)
    }
}

fn single_query_param(query: &str, name: &str) -> Option<String> {
    let values = url::form_urlencoded::parse(query.as_bytes())
        .filter(|(key, _)| key == name)
        .map(|(_, value)| value.into_owned())
        .collect::<Vec<_>>();
    (values.len() == 1).then(|| values[0].clone())
}

async fn handle(State(state): State<SecretRoutes>, request: Request) -> Response {
    let headers = request.headers().clone();
    let user = match auth::require_user(&state.auth, &headers).await {
        Ok(user) => user,
        Err(error) => return *error,
    };
    let path = request.uri().path().to_string();
    let method = request.method().clone();
    let query = request.uri().query().unwrap_or("").to_string();
    let body = match auth::parse_body(request.into_body(), &headers).await {
        Ok(value) => value,
        Err(result) => return *result,
    };

    if method == Method::GET && path == "/api/secrets/requests" {
        let session = single_query_param(&query, "sessionId");
        return response(
            200,
            json!({"requests": state.secret_input.list_pending(session.as_deref(), Some(&user.id))}),
        );
    }

    if path.starts_with("/api/secrets/requests/") {
        let remainder = path.trim_start_matches("/api/secrets/requests/");
        let (id, operation) = remainder.rsplit_once('/').expect("matched route");
        let id = percent_encoding::percent_decode_str(id)
            .decode_utf8_lossy()
            .into_owned();
        if operation == "submit" {
            let value = body["value"].as_str().unwrap_or("").to_string();
            if value.is_empty() {
                return response(400, json!({"error": "Secret value is required"}));
            }
            if body["remember"].as_bool() == Some(true)
                && let Some(secrets) = &state.user_secrets
            {
                let pending = state.secret_input.list_pending(None, Some(&user.id));
                if let Some(request) = pending.iter().find(|entry| entry.id == id)
                    && request.details.get("rememberable").and_then(Value::as_bool) == Some(true)
                    && let Some(secret_type) = request
                        .details
                        .get("secretType")
                        .and_then(Value::as_str)
                        .map(str::to_string)
                    && let Some(secret_key) = request
                        .details
                        .get("secretKey")
                        .and_then(Value::as_str)
                        .map(str::to_string)
                {
                    let label = request
                        .details
                        .get("rememberLabel")
                        .and_then(Value::as_str)
                        .filter(|value| !value.is_empty())
                        .or_else(|| {
                            request
                                .details
                                .get("prompt")
                                .and_then(Value::as_str)
                                .filter(|value| !value.is_empty())
                        })
                        .map(String::from)
                        .unwrap_or_else(|| request.title.clone());
                    let secrets = secrets.clone();
                    let owner = user.id.clone();
                    let value = value.clone();
                    let result = state
                        .auth
                        .with_database(move |db| {
                            secrets
                                .save(
                                    db,
                                    SaveSecretParams {
                                        user_id: Some(owner),
                                        r#type: secret_type,
                                        key: secret_key,
                                        label,
                                        value,
                                    },
                                )
                                .map(|_| ())
                        })
                        .await;
                    if let Err(error) = result {
                        return auth::database_failure(&error);
                    }
                }
            }
            let ok = state.secret_input.submit(&id, value, Some(&user.id));
            return if ok {
                response(200, json!({"ok": true}))
            } else {
                response(404, json!({"error": "Secret request not found"}))
            };
        }
        let ok = state.secret_input.cancel(&id, Some(&user.id));
        return if ok {
            response(200, json!({"ok": true}))
        } else {
            response(404, json!({"error": "Secret request not found"}))
        };
    }

    let Some(secrets) = &state.user_secrets else {
        return response(503, json!({"error": "Secret store is unavailable"}));
    };

    if method == Method::GET && path == "/api/secrets" {
        let type_filter = single_query_param(&query, "type")
            .map(|value| js_trim(&value).to_string())
            .filter(|value| !value.is_empty());
        let secrets = secrets.clone();
        let owner = user.id.clone();
        return match state
            .auth
            .with_database(move |db| {
                secrets
                    .list(db, Some(&owner), type_filter.as_deref())
                    .map_err(|error| Box::new(error) as auth::Error)
            })
            .await
        {
            Ok(list) => response(200, json!({"secrets": list})),
            Err(error) => auth::database_failure(&error),
        };
    }

    if method == Method::POST && path == "/api/secrets" {
        let type_filter = body["type"].as_str().unwrap_or("").to_string();
        let key = body["key"].as_str().unwrap_or("").to_string();
        let label = body["label"].as_str().unwrap_or("").to_string();
        let value = body["value"].as_str().unwrap_or("").to_string();
        if type_filter.is_empty() || key.is_empty() || label.is_empty() || value.is_empty() {
            return response(
                400,
                json!({"error": "type, key, label, and value are required"}),
            );
        }
        let secrets = secrets.clone();
        let owner = user.id.clone();
        return match state
            .auth
            .with_database(move |db| {
                secrets.save(
                    db,
                    SaveSecretParams {
                        user_id: Some(owner),
                        r#type: type_filter,
                        key,
                        label,
                        value,
                    },
                )
            })
            .await
        {
            Ok(secret) => response(201, json!({"secret": secret})),
            Err(error) => auth::database_failure(&error),
        };
    }

    if method == Method::DELETE && path.starts_with("/api/secrets/") {
        let id = path.trim_start_matches("/api/secrets/");
        let id = percent_encoding::percent_decode_str(id)
            .decode_utf8_lossy()
            .into_owned();
        let secrets = secrets.clone();
        let owner = user.id.clone();
        return match state
            .auth
            .with_database(move |db| {
                secrets
                    .delete(db, &id, Some(&owner))
                    .map_err(|error| Box::new(error) as auth::Error)
            })
            .await
        {
            Ok(true) => response(200, json!({"ok": true})),
            Ok(false) => response(404, json!({"error": "Secret not found"})),
            Err(error) => auth::database_failure(&error),
        };
    }

    response(404, json!({"error": "Not Found"}))
}
