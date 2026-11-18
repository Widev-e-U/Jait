//! Five-field cron syntax accepted by the gateway minute matcher.
use crate::text::{js_trim, js_whitespace};
fn digits(s: &str) -> bool {
    !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit())
}
fn number(s: &str) -> f64 {
    s.parse::<f64>().unwrap_or(f64::INFINITY)
}
pub fn is_valid_cron_expression(cron: &str) -> bool {
    if cron.encode_utf16().count() > 256 {
        return false;
    }
    let fields = js_trim(cron)
        .split(js_whitespace)
        .filter(|v| !v.is_empty())
        .collect::<Vec<_>>();
    let bounds = [(0, 59), (0, 23), (1, 31), (1, 12), (0, 6)];
    fields.len() == 5
        && fields.iter().zip(bounds).all(|(field, (min, max))| {
            let in_range =
                |v: &str| digits(v) && number(v) >= min as f64 && number(v) <= max as f64;
            if *field == "*" {
                return true;
            }
            if let Some(step) = field.strip_prefix("*/")
                && digits(step)
            {
                let step = number(step);
                return step > 0.0 && step <= 9_007_199_254_740_991.0;
            }
            if field.contains(',') {
                return field.split(',').all(in_range);
            }
            if let Some((a, b)) = field.split_once('-') {
                return in_range(a) && in_range(b) && number(a) <= number(b);
            }
            in_range(field)
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_wildcards_steps_lists_ranges_and_plain_fields() {
        assert!(is_valid_cron_expression("* * * * *"));
        assert!(is_valid_cron_expression("*/5 0 1 1 0"));
        assert!(is_valid_cron_expression("1,2,3 0-6 1-28 1-12 0-6"));
        assert!(is_valid_cron_expression(" 0  12  31  12  6 "));
    }

    #[test]
    fn rejects_wrong_field_counts() {
        assert!(!is_valid_cron_expression(""));
        assert!(!is_valid_cron_expression("* * * *"));
        assert!(!is_valid_cron_expression("* * * * * *"));
    }

    #[test]
    fn rejects_out_of_range_and_malformed_fields() {
        assert!(!is_valid_cron_expression("60 * * * *"));
        assert!(!is_valid_cron_expression("* 24 * * *"));
        assert!(!is_valid_cron_expression("* * 0 * *"));
        assert!(!is_valid_cron_expression("* * * 13 *"));
        assert!(!is_valid_cron_expression("* * * * 7"));
        assert!(!is_valid_cron_expression("5-1 * * * *"));
        assert!(!is_valid_cron_expression("*/0 * * * *"));
        assert!(!is_valid_cron_expression("*/ * * * *"));
        assert!(!is_valid_cron_expression("abc * * * *"));
        assert!(!is_valid_cron_expression("1,,2 * * * *"));
    }

    #[test]
    fn rejects_over_long_expressions() {
        assert!(!is_valid_cron_expression(&"*".repeat(257)));
    }
}
