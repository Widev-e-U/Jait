//! ECMAScript-compatible millisecond UTC timestamps and an injectable wall clock.
use std::sync::Arc;
pub type Clock = Arc<dyn Fn() -> i64 + Send + Sync>;
pub fn default_clock() -> Clock {
    Arc::new(|| chrono::Utc::now().timestamp_millis())
}
pub fn iso(ms: i64) -> Result<String, String> {
    // ECMAScript TimeClip includes years outside chrono's representable range.
    if ms.unsigned_abs() > 8_640_000_000_000_000 {
        return Err("Invalid time value".into());
    }
    let days = ms.div_euclid(86_400_000);
    let time = ms.rem_euclid(86_400_000);
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let day_of_era = z - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let mut year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_index = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_index + 2) / 5 + 1;
    let month = month_index + if month_index < 10 { 3 } else { -9 };
    year += i64::from(month <= 2);
    let year = if (0..=9999).contains(&year) {
        format!("{year:04}")
    } else {
        format!("{year:+07}")
    };
    Ok(format!(
        "{year}-{month:02}-{day:02}T{:02}:{:02}:{:02}.{:03}Z",
        time / 3_600_000,
        time / 60_000 % 60,
        time / 1000 % 60,
        time % 1000
    ))
}
