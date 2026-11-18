//! Five-field scheduling uses UTC by default and named IANA zones when supplied.
use super::cron::is_valid_cron_expression;
use crate::{
    text::{js_trim, js_whitespace},
    time::iso,
};
use chrono::TimeZone;
use std::{
    collections::BTreeMap,
    sync::{LazyLock, Mutex},
};
#[path = "tzdata_2025b.rs"]
mod tzdata_2025b;
pub const TIME_ZONE_DATA_VERSION: &str = tzdata_2025b::VERSION;
pub(crate) fn named_zone(zone: &str) -> Option<jiff::tz::TimeZone> {
    static CACHE: LazyLock<Mutex<BTreeMap<&'static str, jiff::tz::TimeZone>>> =
        LazyLock::new(|| Mutex::new(BTreeMap::new()));
    let &(name, start, size) = tzdata_2025b::INDEX
        .iter()
        .find(|(name, _, _)| name.eq_ignore_ascii_case(zone))?;
    let mut cache = CACHE.lock().ok()?;
    if let Some(zone) = cache.get(name) {
        return Some(zone.clone());
    }
    let timezone =
        jiff::tz::TimeZone::tzif(name, tzdata_2025b::DATA.get(start..start + size)?).ok()?;
    cache.insert(name, timezone.clone());
    Some(timezone)
}
struct Parts {
    minute: u32,
    hour: u32,
    day: u32,
    month: u32,
    weekday: u32,
}
fn utc_parts(ms: i64) -> Option<(Parts, i32)> {
    let formatted = iso(ms).ok()?;
    let (date, _) = formatted.split_once('T')?;
    let mut parts = date.rsplitn(3, '-');
    let day: u32 = parts.next()?.parse().ok()?;
    let month: u32 = parts.next()?.parse().ok()?;
    let year: i32 = parts.next()?.parse().ok()?;
    Some((
        Parts {
            minute: ms.div_euclid(60_000).rem_euclid(60) as u32,
            hour: ms.div_euclid(3_600_000).rem_euclid(24) as u32,
            day,
            month,
            weekday: (ms.div_euclid(86_400_000) + 4).rem_euclid(7) as u32,
        },
        year,
    ))
}
fn zoned_parts(ms: i64, zone: &str) -> Option<Parts> {
    let (utc, year) = utc_parts(ms)?;
    // Zone recurrence rules repeat over the Gregorian 400-year cycle. Before
    // the first recorded transition, zone data uses its initial historical offset.
    // Choose representative years only outside Jiff's civil year range.
    let represented = if year > 9998 {
        9200 + year.rem_euclid(400)
    } else if year < -9998 {
        -9600 + year.rem_euclid(400)
    } else {
        year
    };
    let date = chrono::Utc
        .with_ymd_and_hms(represented, utc.month, utc.day, utc.hour, utc.minute, 0)
        .single()?;
    let time = jiff::Timestamp::from_millisecond(date.timestamp_millis()).ok()?;
    let timezone = if zone.starts_with(['+', '-']) {
        let sign = if zone.starts_with('-') { -1 } else { 1 };
        let text = &zone[1..];
        if !text
            .bytes()
            .all(|byte| byte.is_ascii_digit() || byte == b':')
        {
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
            .all(|c| c.is_ascii_digit())
        {
            return None;
        }
        let hours: i32 = hours.parse().ok()?;
        let minutes: i32 = minutes.parse().ok()?;
        if hours > 23 || minutes > 59 {
            return None;
        }
        jiff::tz::TimeZone::fixed(
            jiff::tz::Offset::from_seconds(sign * (hours * 3600 + minutes * 60)).ok()?,
        )
    } else {
        named_zone(zone)?
    };
    if timezone.is_unknown() {
        return None;
    }
    let local = time.to_zoned(timezone);
    Some(Parts {
        minute: local.minute() as u32,
        hour: local.hour() as u32,
        day: local.day() as u32,
        month: local.month() as u32,
        weekday: local.weekday().to_sunday_zero_offset() as u32,
    })
}
fn matches(field: &str, value: u32) -> bool {
    if field == "*" {
        return true;
    }
    let number = |s: &str| s.parse::<f64>().unwrap_or(f64::NAN);
    let value = value as f64;
    if let Some(step) = field.strip_prefix("*/") {
        return value % number(step) == 0.0;
    }
    if field.contains(',') {
        return field.split(',').any(|n| number(n) == value);
    }
    if let Some((start, end)) = field.split_once('-') {
        return value >= number(start) && value <= number(end);
    }
    number(field) == value
}
/// None represents an invalid JavaScript Date. Wildcard-only UTC matching is
/// retained because the source never compares its NaN date fields in that case.
pub fn matches_cron_minute(cron: &str, date_ms: Option<i64>, zone: Option<&str>) -> bool {
    if !is_valid_cron_expression(cron) {
        return false;
    }
    let fields: Vec<_> = js_trim(cron)
        .split(js_whitespace)
        .filter(|v| !v.is_empty())
        .collect();
    let zone = zone.filter(|s| !s.is_empty());
    let Some(ms) = date_ms.filter(|v| v.unsigned_abs() <= 8_640_000_000_000_000) else {
        return zone.is_none() && fields.iter().all(|v| *v == "*");
    };
    let local = match zone {
        None => utc_parts(ms).map(|v| v.0),
        Some(zone) => zoned_parts(ms, zone),
    };
    let Some(local) = local else { return false };
    fields
        .into_iter()
        .zip([
            local.minute,
            local.hour,
            local.day,
            local.month,
            local.weekday,
        ])
        .all(|(f, v)| matches(f, v))
}
