//! Wire DTOs, event envelopes and versioned protocol schemas belong here.
//! Preserve missing/null fields, naming and error envelopes from shared TS contracts.
//! No transport, storage or execution dependencies. Domain contracts remain unported.

pub mod bounded_json;

pub mod ecmascript_json;

pub mod js_number;

pub mod json_diagnostic;

pub mod lenient_base64;
