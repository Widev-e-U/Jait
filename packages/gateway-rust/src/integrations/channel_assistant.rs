//! Channel assistant presentation using native constants and pinned reference timezone rules.
use chrono::TimeZone;
use serde::Deserialize;
use std::sync::LazyLock;
#[derive(Deserialize)]
struct Constants {
    tools: Vec<String>,
    note: String,
}
static CONSTANTS: LazyLock<Constants> = LazyLock::new(|| {
    serde_json::from_str(include_str!("channel-assistant-metadata.json"))
        .expect("embedded channel constants")
});
pub fn activated_tools() -> &'static [String] {
    &CONSTANTS.tools
}
pub fn assistant_note() -> &'static str {
    &CONSTANTS.note
}
pub fn host_time_zone<E>(resolver: impl FnOnce() -> Result<Option<String>, E>) -> String {
    resolver()
        .ok()
        .flatten()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "UTC".into())
}
pub struct ChannelTurnContext<'a> {
    pub channel_id: &'a str,
    pub channel_label: &'a str,
    pub conversation_id: &'a str,
    pub model: Option<&'a str>,
    pub time_zone: &'a str,
    pub now_ms: Option<i64>,
}
fn zone(zone: &str) -> Option<jiff::tz::TimeZone> {
    if !zone.starts_with(['+', '-']) {
        return crate::scheduler::minute::named_zone(zone);
    }
    let sign = if zone.starts_with('-') { -1 } else { 1 };
    let text = &zone[1..];
    // Offset grammar is ASCII; reject before slicing byte positions so malformed
    // Unicode zones take the ISO fallback rather than panicking.
    if !text.is_ascii() {
        return None;
    }
    let (hours, minutes) = if let Some((h, m)) = text.split_once(':') {
        if h.len() != 2 || m.len() != 2 {
            return None;
        }
        (h, m)
    } else if text.len() == 2 {
        (text, "00")
    } else if text.len() == 4 {
        (&text[..2], &text[2..])
    } else {
        return None;
    };
    if !hours
        .bytes()
        .chain(minutes.bytes())
        .all(|b| b.is_ascii_digit())
    {
        return None;
    }
    let h: i32 = hours.parse().ok()?;
    let m: i32 = minutes.parse().ok()?;
    if h > 23 || m > 59 {
        return None;
    }
    Some(jiff::tz::TimeZone::fixed(
        jiff::tz::Offset::from_seconds(sign * (h * 3600 + m * 60)).ok()?,
    ))
}
fn local_format(ms: i64, zone_name: &str, iso: &str) -> Option<String> {
    let (date, clock) = iso.split_once('T')?;
    let mut fields = date.rsplitn(3, '-');
    let day: u32 = fields.next()?.parse().ok()?;
    let month: u32 = fields.next()?.parse().ok()?;
    let year: i32 = fields.next()?.parse().ok()?;
    let represented = if year > 9998 {
        9200 + year.rem_euclid(400)
    } else if year < -9998 {
        -9600 + year.rem_euclid(400)
    } else {
        year
    };
    let hour = clock.get(0..2)?.parse().ok()?;
    let minute = clock.get(3..5)?.parse().ok()?;
    let second = clock.get(6..8)?.parse().ok()?;
    let date = chrono::Utc
        .with_ymd_and_hms(represented, month, day, hour, minute, second)
        .single()?;
    let timestamp =
        jiff::Timestamp::from_millisecond(date.timestamp_millis() + ms.rem_euclid(1000)).ok()?;
    let zone = zone(zone_name)?;
    if zone.is_unknown() {
        return None;
    }
    let local = timestamp.to_zoned(zone);
    let year = year + i32::from(local.year()) - represented;
    let year = if year <= 0 { 1 - year } else { year };
    let day_name = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
        [local.weekday().to_sunday_zero_offset() as usize];
    Some(format!(
        "{day_name}, {:02}/{:02}/{year}, {:02}:{:02}",
        local.day(),
        local.month(),
        local.hour(),
        local.minute()
    ))
}
pub fn format_local_time(ms: Option<i64>, time_zone: &str) -> Result<String, String> {
    let ms = ms.ok_or("Invalid Date")?;
    let iso = crate::time::iso(ms).map_err(|_| "Invalid Date".to_string())?;
    Ok(local_format(ms, time_zone, &iso).unwrap_or(iso))
}
pub fn build_context_block(ctx: &ChannelTurnContext<'_>) -> Result<String, String> {
    let local = format_local_time(ctx.now_ms, ctx.time_zone)?;
    let utc = crate::time::iso(ctx.now_ms.ok_or("Invalid Date")?)?;
    let model = ctx
        .model
        .filter(|s| !s.is_empty())
        .unwrap_or("gateway default");
    Ok([
        "<channel_context>".to_string(),
        format!("channel: {} (id: {})", ctx.channel_label, ctx.channel_id),
        format!("conversationId: {}", ctx.conversation_id),
        format!("localTime: {local} ({})", ctx.time_zone),
        format!("utcTime: {utc}"),
        format!("model: {model}"),
        "</channel_context>".into(),
        "".into(),
        "Schedule anything the user asks for against localTime, and deliver it back to".into(),
        "this channelId/conversationId — that is the chat they are writing from.".into(),
    ]
    .join("\n"))
}
