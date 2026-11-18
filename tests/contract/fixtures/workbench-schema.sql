CREATE TABLE security_scopes(id TEXT PRIMARY KEY,operator_id TEXT,created_at TEXT,data TEXT);
CREATE TABLE security_assessment_runs(id TEXT PRIMARY KEY,operator_id TEXT,started_at TEXT,data TEXT);
CREATE TABLE security_check_runs(id TEXT PRIMARY KEY,operator_id TEXT,scope_id TEXT,started_at TEXT,data TEXT);
CREATE TABLE security_findings(id TEXT PRIMARY KEY,operator_id TEXT,scope_id TEXT,updated_at TEXT,data TEXT);
CREATE TABLE security_artifacts(id TEXT PRIMARY KEY,run_id TEXT,operator_id TEXT,sha256 TEXT,content_type TEXT,raw TEXT);
