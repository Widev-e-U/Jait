use super::{Request, Transport, field, items, js_text, nullish, truthy};
use crate::text::js_trim;
use serde_json::{Value, json};
const CALENDAR_API: &str = "https://www.googleapis.com/calendar/v3";
pub struct GoogleCalendarClient {
    transport: Transport,
}
impl GoogleCalendarClient {
    pub fn new(transport: Transport) -> Self {
        Self { transport }
    }
    async fn google_json(&self, url: String, token: &str) -> Result<Value, String> {
        let response = (self.transport)(Request {
            url,
            method: "GET".into(),
            headers: json!({"Authorization":format!("Bearer {token}")})
                .as_object()
                .unwrap()
                .clone(),
            body: None,
        })
        .await?;
        let data = response.data.unwrap_or_else(|_| json!({}));
        if !(200..300).contains(&response.status) {
            if data.is_null() {
                return Err("Invalid provider response shape".into());
            }
            let message = data["error"]
                .get("message")
                .filter(|v| truthy(v))
                .map(js_text)
                .unwrap_or_else(|| format!("Google Calendar request failed ({})", response.status));
            return Err(message);
        }
        Ok(data)
    }
    pub async fn get_profile_email(&self, token: &str) -> Result<Value, String> {
        let data = self
            .google_json(
                "https://www.googleapis.com/oauth2/v2/userinfo".into(),
                token,
            )
            .await?;
        if data.is_null() {
            return Err("Invalid provider response shape".into());
        }
        Ok(nullish(field(&data, "email"), json!("")))
    }
    pub async fn list_calendars(&self, token: &str) -> Result<Value, String> {
        let data = self
            .google_json(
                format!("{CALENDAR_API}/users/me/calendarList?maxResults=250"),
                token,
            )
            .await?;
        let mut values = vec![];
        for calendar in items(&data)? {
            if calendar.is_null() {
                return Err("Invalid provider response shape".into());
            }
            if !truthy(&calendar["id"]) || truthy(&calendar["hidden"]) {
                continue;
            }
            let name = field(calendar, "summary")
                .filter(|v| truthy(v))
                .or_else(|| field(calendar, "id").filter(|v| truthy(v)))
                .cloned()
                .unwrap_or(json!("Calendar"));
            let mut value = json!({"id":nullish(field(calendar,"id"),json!("")),"name":name,
                "description":nullish(field(calendar,"description"),json!("")),"timeZone":nullish(field(calendar,"timeZone"),json!("")),
                "primary":calendar["primary"]==true,"selected":calendar["selected"]!=false,
                "accessRole":nullish(field(calendar,"accessRole"),json!("reader"))});
            if let Some(color) = field(calendar, "backgroundColor") {
                value["color"] = color.clone();
            }
            values.push(value);
        }
        Ok(json!(values))
    }
    pub async fn list_events(
        &self,
        token: &str,
        calendar: &Value,
        options: &Value,
    ) -> Result<Value, String> {
        const COMPONENT: percent_encoding::AsciiSet = percent_encoding::NON_ALPHANUMERIC
            .remove(b'-')
            .remove(b'_')
            .remove(b'.')
            .remove(b'!')
            .remove(b'~')
            .remove(b'*')
            .remove(b'\'')
            .remove(b'(')
            .remove(b')');
        let id = calendar["id"]
            .as_str()
            .ok_or("calendar id must be a string")?;
        let encoded = percent_encoding::utf8_percent_encode(id, &COMPONENT);
        let mut url = url::Url::parse(&format!("{CALENDAR_API}/calendars/{encoded}/events"))
            .map_err(|e| e.to_string())?;
        {
            let mut query = url.query_pairs_mut();
            query.append_pair("timeMin", &js_text(&options["timeMin"]));
            query
                .append_pair("timeMax", &js_text(&options["timeMax"]))
                .append_pair("singleEvents", "true")
                .append_pair("orderBy", "startTime")
                .append_pair("maxResults", &js_text(&options["limit"]));
            if let Some(q) = options["query"]
                .as_str()
                .map(js_trim)
                .filter(|s| !s.is_empty())
            {
                query.append_pair("q", q);
            }
        }
        let data = self.google_json(url.to_string(), token).await?;
        let mut values = vec![];
        for event in items(&data)? {
            if event.is_null() {
                return Err("Invalid provider response shape".into());
            }
            if !truthy(&event["id"]) {
                continue;
            }
            let start = &event["start"];
            let end = &event["end"];
            let organizer = &event["organizer"];
            let organizer = field(organizer, "displayName")
                .filter(|v| truthy(v))
                .or_else(|| field(organizer, "email").filter(|v| truthy(v)))
                .cloned()
                .unwrap_or(json!(""));
            let attendees = match field(event, "attendees").filter(|v| !v.is_null()) {
                None => &[][..],
                Some(Value::Array(a)) => a.as_slice(),
                _ => return Err("Invalid provider response shape".into()),
            };
            let attendees = attendees
                .iter()
                .map(|a| {
                    if a.is_null() {
                        return Err("Invalid provider response shape".to_string());
                    }
                    let identity = field(a, "displayName")
                        .filter(|v| truthy(v))
                        .or_else(|| field(a, "email").filter(|v| truthy(v)))
                        .cloned()
                        .unwrap_or(json!("Unknown attendee"));
                    Ok(if truthy(&a["responseStatus"]) {
                        json!(format!(
                            "{} ({})",
                            js_text(&identity),
                            js_text(&a["responseStatus"])
                        ))
                    } else {
                        identity
                    })
                })
                .collect::<Result<Vec<_>, _>>()?;
            let mut value = json!({"id":nullish(field(event,"id"),json!("")),"calendarId":calendar["id"],"calendarName":calendar["name"],
                "title":field(event,"summary").filter(|v|truthy(v)).cloned().unwrap_or(json!("(No title)")),
                "description":nullish(field(event,"description"),json!("")),"location":nullish(field(event,"location"),json!("")),
                "start":nullish(field(start,"dateTime").filter(|v|!v.is_null()).or_else(||field(start,"date")),json!("")),
                "end":nullish(field(end,"dateTime").filter(|v|!v.is_null()).or_else(||field(end,"date")),json!("")),
                "allDay":truthy(&start["date"])&&!truthy(&start["dateTime"]),
                "status":nullish(field(event,"status"),json!("confirmed")),"organizer":organizer,"attendees":attendees});
            if let Some(link) = field(event, "htmlLink") {
                value["htmlLink"] = link.clone();
            }
            values.push(value);
        }
        Ok(json!(values))
    }
}
