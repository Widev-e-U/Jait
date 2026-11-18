//! Ollama reset windows reconstructed from observed rollovers and UTC grids.
use chrono::{DateTime, Datelike, NaiveDate, Utc};
use serde_json::Value;

pub const OLLAMA_SESSION_MINS: f64 = 300.0;
pub const OLLAMA_WEEK_MINS: f64 = 10_080.0;
pub const OLLAMA_MONTH_MINS: f64 = 43_200.0;
const MINUTE_MS: f64 = 60_000.0;
const DAY_MS: i64 = 86_400_000;
const MAX_STEPS: f64 = 500.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResetSource {
    ProviderReported,
    Observed,
    WindowBoundary,
    WindowGrid,
}
impl ResetSource {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::ProviderReported => "provider-reported",
            Self::Observed => "observed",
            Self::WindowBoundary => "window-boundary",
            Self::WindowGrid => "window-grid",
        }
    }
}
pub fn parse_ollama_reset_source(value: &Value) -> Option<ResetSource> {
    match value.as_str()? {
        "provider-reported" => Some(ResetSource::ProviderReported),
        "observed" => Some(ResetSource::Observed),
        "window-boundary" => Some(ResetSource::WindowBoundary),
        "window-grid" => Some(ResetSource::WindowGrid),
        _ => None,
    }
}
pub fn describe_ollama_reset_source(source: Option<ResetSource>) -> &'static str {
    match source {
        Some(ResetSource::Observed) => "Confirmed by an observed usage reset",
        Some(ResetSource::WindowBoundary) => "Continued from the previous reset deadline",
        Some(ResetSource::WindowGrid) => "Estimated from Ollama's usage window boundaries",
        _ => "Derived from Ollama's usage window boundaries",
    }
}
#[derive(Debug, Default)]
pub struct ResetSnapshot {
    pub utilization: Option<f64>,
    pub resets_at: Option<String>,
    pub source: Option<ResetSource>,
    pub observed_at: Option<String>,
}
pub struct ResetWindowInput<'a> {
    pub window_duration_mins: f64,
    pub now_ms: i64,
    pub utilization: Option<f64>,
    pub previous: Option<&'a ResetSnapshot>,
    pub anchor_iso: Option<&'a str>,
}
#[derive(Debug, PartialEq, Eq)]
pub struct ResetWindow {
    pub window_start_at: String,
    pub resets_at: String,
    pub source: ResetSource,
}
/// Parse ISO timestamps/date-only values. Locale-dependent legacy Date strings
/// are intentionally outside this native adapter's input contract.
pub fn parse_iso(value: &str) -> Option<i64> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|d| d.timestamp_millis())
        .or_else(|| {
            NaiveDate::parse_from_str(value, "%Y-%m-%d")
                .ok()
                .and_then(|d| d.and_hms_opt(0, 0, 0))
                .map(|d| d.and_utc().timestamp_millis())
        })
}
fn date(ms: i64) -> Result<DateTime<Utc>, String> {
    DateTime::from_timestamp_millis(ms).ok_or_else(|| "Invalid time value".into())
}
fn clipped(ms: f64) -> Result<i64, String> {
    if !ms.is_finite() || ms.abs() > 8_640_000_000_000_000.0 {
        return Err("Invalid time value".into());
    }
    Ok(ms.trunc() as i64)
}
// Date.UTC treats years 0 through 99 as 1900 through 1999.
fn utc_ms(year: i32, month: u32, day: u32) -> Result<i64, String> {
    let year = if (0..=99).contains(&year) {
        year + 1900
    } else {
        year
    };
    NaiveDate::from_ymd_opt(year, month, day)
        .and_then(|d| d.and_hms_opt(0, 0, 0))
        .map(|d| d.and_utc().timestamp_millis())
        .ok_or_else(|| "Invalid time value".into())
}
fn month_start_after(start: i64, months: i32) -> Result<i64, String> {
    let d = date(start)?;
    let index = d.year() * 12 + d.month0() as i32 + months;
    utc_ms(index.div_euclid(12), index.rem_euclid(12) as u32 + 1, 1)
}
fn next_boundary(start: i64, duration: f64, now: i64) -> Result<i64, String> {
    if duration >= OLLAMA_MONTH_MINS {
        for months in 1..=500 {
            let candidate = month_start_after(start, months)?;
            if candidate > now {
                return Ok(candidate);
            }
        }
        return month_start_after(start, 501);
    }
    let step = duration.max(1.0) * MINUTE_MS;
    let steps = (((now as f64 - start as f64) / step).floor() + 1.0).clamp(1.0, MAX_STEPS);
    clipped(start as f64 + steps * step)
}
fn previous_grid_point(reference: i64, duration: f64, now: i64) -> Result<i64, String> {
    if reference <= now {
        return Ok(reference);
    }
    if duration >= OLLAMA_MONTH_MINS {
        let d = date(now)?;
        return utc_ms(d.year(), d.month(), 1);
    }
    let step = duration.max(1.0) * MINUTE_MS;
    let steps = ((reference as f64 - now as f64) / step)
        .ceil()
        .clamp(1.0, MAX_STEPS);
    clipped(reference as f64 - steps * step)
}
fn grid_start(duration: f64, now: i64, anchor: Option<i64>) -> Result<i64, String> {
    let d = date(now)?;
    if duration >= OLLAMA_MONTH_MINS {
        return utc_ms(d.year(), d.month(), 1);
    }
    if duration == OLLAMA_WEEK_MINS {
        if let Some(anchor) = anchor {
            let weeks = ((now as f64 - anchor as f64) / (7 * DAY_MS) as f64)
                .floor()
                .clamp(0.0, MAX_STEPS);
            return clipped(anchor as f64 + weeks * (7 * DAY_MS) as f64);
        }
        return Ok(utc_ms(d.year(), d.month(), d.day())?
            - i64::from(
                date(utc_ms(d.year(), d.month(), d.day())?)?
                    .weekday()
                    .num_days_from_monday(),
            ) * DAY_MS);
    }
    let midnight = utc_ms(d.year(), d.month(), d.day())?;
    let step = duration.max(1.0) * MINUTE_MS;
    if step >= DAY_MS as f64 {
        return Ok(midnight);
    }
    clipped(midnight as f64 + ((now as f64 - midnight as f64) / step).floor() * step)
}
pub fn derive_ollama_reset_window(input: ResetWindowInput<'_>) -> Result<ResetWindow, String> {
    let now = input.now_ms;
    date(now)?;
    if !input.window_duration_mins.is_finite() {
        return Err("Invalid time value".into());
    }
    let duration = if input.window_duration_mins >= OLLAMA_MONTH_MINS {
        OLLAMA_MONTH_MINS
    } else {
        input.window_duration_mins.max(1.0)
    };
    let previous = input.previous;
    let previous_reset = previous
        .and_then(|p| p.resets_at.as_deref())
        .and_then(parse_iso);
    let previous_source = previous.and_then(|p| p.source);
    let evidence = matches!(
        previous_source,
        Some(ResetSource::Observed | ResetSource::WindowBoundary)
    );
    let (start, reset, source) = if previous
        .and_then(|p| p.utilization)
        .zip(input.utilization)
        .is_some_and(|(old, current)| current < old - 0.005)
    {
        let lower = previous
            .and_then(|p| p.observed_at.as_deref())
            .and_then(parse_iso);
        let snapped = previous_reset
            .map(|r| previous_grid_point(r, duration, now))
            .transpose()?;
        let boundary = snapped
            .filter(|s| lower.is_none_or(|l| *s > l))
            .unwrap_or(now);
        (
            boundary,
            next_boundary(boundary, duration, now)?,
            ResetSource::Observed,
        )
    } else if let Some(reset) = previous_reset.filter(|r| *r <= now) {
        (
            reset,
            next_boundary(reset, duration, now)?,
            if evidence {
                ResetSource::WindowBoundary
            } else {
                ResetSource::WindowGrid
            },
        )
    } else if let Some(reset) = previous_reset.filter(|_| evidence) {
        (
            clipped(reset as f64 - duration * MINUTE_MS)?,
            reset,
            previous_source.unwrap(),
        )
    } else {
        let start = grid_start(duration, now, input.anchor_iso.and_then(parse_iso))?;
        (
            start,
            next_boundary(start, duration, now)?,
            ResetSource::WindowGrid,
        )
    };
    Ok(ResetWindow {
        window_start_at: crate::time::iso(start)?,
        resets_at: crate::time::iso(reset)?,
        source,
    })
}
