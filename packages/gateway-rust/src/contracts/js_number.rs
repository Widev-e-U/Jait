//! ECMAScript number JSON text. Non-finite numbers serialize as null; decoding
//! that lossy wire form yields NaN. Missing optional fields remain distinct.
use serde::{Deserialize, Deserializer, Serialize, Serializer, de::Error};
pub fn serialize<S: Serializer>(value: &f64, serializer: S) -> Result<S::Ok, S::Error> {
    let text = if value.is_finite() {
        ryu_js::Buffer::new().format(*value).to_owned()
    } else {
        "null".into()
    };
    serde_json::value::RawValue::from_string(text)
        .map_err(serde::ser::Error::custom)?
        .serialize(serializer)
}
pub fn deserialize<'de, D: Deserializer<'de>>(deserializer: D) -> Result<f64, D::Error> {
    match serde_json::Value::deserialize(deserializer)? {
        serde_json::Value::Number(n) => n
            .as_f64()
            .ok_or_else(|| D::Error::custom("number outside f64 range")),
        serde_json::Value::Null => Ok(f64::NAN),
        _ => Err(D::Error::custom("expected JavaScript number JSON")),
    }
}
pub mod optional {
    use super::*;
    pub fn serialize<S: Serializer>(value: &Option<f64>, serializer: S) -> Result<S::Ok, S::Error> {
        match value {
            Some(value) => super::serialize(value, serializer),
            None => serializer.serialize_none(),
        }
    }
    pub fn deserialize<'de, D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Option<f64>, D::Error> {
        super::deserialize(deserializer).map(Some)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[derive(Serialize, Deserialize)]
    struct Record {
        #[serde(with = "super")]
        required: f64,
        #[serde(
            default,
            skip_serializing_if = "Option::is_none",
            with = "super::optional"
        )]
        optional: Option<f64>,
    }
    #[test]
    fn nonfinite_wire_numbers_and_missing_optional_values_remain_distinct() {
        let missing: Record = serde_json::from_str(r#"{"required":null}"#).unwrap();
        assert!(missing.required.is_nan());
        assert!(missing.optional.is_none());
        let null: Record = serde_json::from_str(r#"{"required":null,"optional":null}"#).unwrap();
        assert!(null.optional.unwrap().is_nan());
        assert_eq!(
            serde_json::to_string(&missing).unwrap(),
            r#"{"required":null}"#
        );
        assert_eq!(
            serde_json::to_string(&null).unwrap(),
            r#"{"required":null,"optional":null}"#
        );
        for (value, expected) in [
            (-0.0, "0"),
            (1.0, "1"),
            (1e21, "1e+21"),
            (1e-7, "1e-7"),
            (f64::INFINITY, "null"),
            (f64::NEG_INFINITY, "null"),
            (f64::NAN, "null"),
        ] {
            assert_eq!(
                serde_json::to_string(&Record {
                    required: value,
                    optional: None
                })
                .unwrap(),
                format!(r#"{{"required":{expected}}}"#)
            );
        }
        for input in [
            r#"{"required":"1"}"#,
            r#"{"required":false}"#,
            r#"{"required":[]}"#,
            r#"{"required":{}}"#,
        ] {
            assert!(serde_json::from_str::<Record>(input).is_err());
        }
    }
}
