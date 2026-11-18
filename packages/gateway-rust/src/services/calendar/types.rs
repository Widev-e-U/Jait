//! Public calendar contracts. Optional account errors preserve missing versus null.
use serde::{Deserialize, Deserializer, Serialize, Serializer};

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub enum OptionalField<T> {
    #[default]
    Missing,
    Present(T),
}
impl<T> OptionalField<T> {
    pub fn is_missing(&self) -> bool {
        matches!(self, Self::Missing)
    }
}
impl<T: Serialize> Serialize for OptionalField<T> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            Self::Missing => serializer.serialize_unit(),
            Self::Present(value) => value.serialize(serializer),
        }
    }
}
impl<'de, T: Deserialize<'de>> Deserialize<'de> for OptionalField<T> {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        T::deserialize(deserializer).map(Self::Present)
    }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CalendarProvider {
    Google,
    Android,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CalendarAccountStatus {
    Connected,
    Error,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarAccount {
    pub id: String,
    pub user_id: Option<String>,
    pub provider: CalendarProvider,
    pub email: String,
    pub display_name: String,
    pub status: CalendarAccountStatus,
    #[serde(default, skip_serializing_if = "OptionalField::is_missing")]
    pub error: OptionalField<Option<String>>,
    pub created_at: String,
    pub updated_at: String,
}
fn js_number<S: Serializer>(value: &f64, serializer: S) -> Result<S::Ok, S::Error> {
    let text = if value.is_finite() {
        ryu_js::Buffer::new().format(*value).to_owned()
    } else {
        "null".into()
    };
    serde_json::value::RawValue::from_string(text)
        .unwrap()
        .serialize(serializer)
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarTokens {
    pub access_token: String,
    pub refresh_token: Option<String>,
    #[serde(serialize_with = "js_number")]
    pub expires_at: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scope: Option<String>,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub time_zone: String,
    pub primary: bool,
    pub selected: bool,
    pub access_role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarEvent {
    pub id: String,
    pub calendar_id: String,
    pub calendar_name: String,
    pub title: String,
    pub description: String,
    pub location: String,
    pub start: String,
    pub end: String,
    pub all_day: bool,
    pub status: String,
    pub organizer: String,
    pub attendees: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub html_link: Option<String>,
}
fn optional_number<S: Serializer>(value: &Option<f64>, serializer: S) -> Result<S::Ok, S::Error> {
    match value {
        Some(value) => js_number(value, serializer),
        None => serializer.serialize_none(),
    }
}
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListCalendarEventsOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub calendar_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub time_min: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub time_max: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub query: Option<String>,
    #[serde(
        skip_serializing_if = "Option::is_none",
        serialize_with = "optional_number"
    )]
    pub limit: Option<f64>,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceCalendarSnapshot {
    pub device_id: String,
    pub device_name: String,
    pub calendars: Vec<CalendarInfo>,
    pub events: Vec<CalendarEvent>,
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn account_error_keeps_all_three_wire_states() {
        let base = serde_json::json!({"id":"a","userId":null,"provider":"android","email":"","displayName":"Phone","status":"connected","createdAt":"t","updatedAt":"t"});
        for value in [
            None,
            Some(serde_json::Value::Null),
            Some(serde_json::json!("offline")),
        ] {
            let mut input = base.clone();
            if let Some(value) = value {
                input["error"] = value;
            }
            let account: CalendarAccount = serde_json::from_value(input.clone()).unwrap();
            assert_eq!(serde_json::to_value(account).unwrap(), input);
        }
    }
    #[test]
    fn invalid_union_values_fail_and_options_omit_absent_fields() {
        assert!(serde_json::from_str::<CalendarProvider>("\"outlook\"").is_err());
        assert!(serde_json::from_str::<CalendarAccountStatus>("\"connecting\"").is_err());
        assert_eq!(
            serde_json::to_value(ListCalendarEventsOptions::default()).unwrap(),
            serde_json::json!({})
        );
    }
}
