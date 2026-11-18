//! Exact serialized tool contracts, including UTF-16 surrogate clipping.
#[path = "../src/internal_driver.rs"]
mod internal_driver;
use jait_gateway::tools::skill_discovery::{
    InstalledSkill, SkillLookup, SystemSkillFileReader, metadata, read_tool,
    search_installed_skills, search_tool,
};
use serde_json::{Value, json};
use std::path::PathBuf;
fn skill(id: &str, name: &str, description: &str) -> Value {
    json!({"id":id,"name":name,"description":description,"enabled":true,"filePath":"unused"})
}
fn search(skills: Vec<Value>, query: &str, limit: Option<f64>) -> Value {
    json!({"op":"nativeskilldiscovery.search","skills":skills,"query":query,"limit":limit})
}
struct Registry(Vec<InstalledSkill>);
impl SkillLookup for Registry {
    fn list_enabled(&self) -> Vec<InstalledSkill> {
        self.0.iter().filter(|s| s.enabled).cloned().collect()
    }
    fn get(&self, id: &str) -> Option<InstalledSkill> {
        self.0.iter().find(|s| s.id == id).cloned()
    }
}
fn compare(calls: Vec<Value>) {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let expected = internal_driver::call(
        &root,
        &root.join(".jait/artifacts/gateway-rust/skill-discovery"),
        json!({"version":1,"calls":calls}),
        &|| false,
    )
    .unwrap();
    let actual: Vec<_> = calls
        .iter()
        .map(|c| {
            if c["op"] == "nativeskilldiscovery.metadata" {
                return metadata().clone();
            }
            let input: Vec<InstalledSkill> = serde_json::from_value(c["skills"].clone()).unwrap();
            let limit = match c["limitKind"].as_str() {
                Some("nan") => Some(f64::NAN),
                Some("infinity") => Some(f64::INFINITY),
                Some("negative-infinity") => Some(f64::NEG_INFINITY),
                _ => c["limit"].as_f64(),
            };
            let text = if c["op"] == "nativeskilldiscovery.search" {
                serde_json::to_string(&search_installed_skills(
                    &input,
                    c["query"].as_str().unwrap(),
                    limit,
                ))
                .unwrap()
            } else {
                // Actual source registry keeps first insertion position when replacing an ID.
                let mut unique: Vec<InstalledSkill> = vec![];
                for s in input {
                    if let Some(previous) = unique.iter_mut().find(|v| v.id == s.id) {
                        *previous = s;
                    } else {
                        unique.push(s);
                    }
                }
                let registry = Registry(unique);
                match c["tool"].as_str().unwrap() {
                    "skills.search" => serde_json::to_string(&search_tool(
                        &registry,
                        c["input"]["query"].as_str().unwrap(),
                        limit,
                    ))
                    .unwrap(),
                    "skills.read" => serde_json::to_string(&read_tool(
                        &registry,
                        c["input"]["id"].as_str().unwrap(),
                        &SystemSkillFileReader,
                    ))
                    .unwrap(),
                    _ => panic!("unknown tool"),
                }
            };
            json!(text)
        })
        .collect();
    assert_eq!(json!(actual), expected, "calls={calls:?}");
}
#[test]
fn complete_tool_metadata_matches_source() {
    compare(vec![json!({"op":"nativeskilldiscovery.metadata"})]);
}
#[test]
fn exact_ids_names_and_disabled_skills() {
    let mut disabled = skill("hidden", "Networking", "network network");
    disabled["enabled"] = json!(false);
    let skills = vec![
        skill("aaa", "token", "network"),
        skill("zzz", "network", ""),
        skill("word", "Word", "network"),
        skill("network", "Title", ""),
        skill("name", "NETWORK", ""),
        disabled,
    ];
    compare(
        ["network", " /NETWORK ", "word", "missing", "", "  "]
            .into_iter()
            .map(|q| search(skills.clone(), q, None))
            .collect(),
    );
}
#[test]
fn token_scoring_counts_repetitions_and_uses_substrings() {
    let skills = vec![
        skill("a", "Alpha", "network networking"),
        skill("b", "Beta", "network security"),
        skill("c", "Gamma", "security"),
        skill("d", "Delta", "shell script"),
    ];
    compare(
        [
            "network security",
            "net net security",
            "-network/security-",
            "script",
            "//network",
            "😀",
        ]
        .into_iter()
        .map(|q| search(skills.clone(), q, Some(10.0)))
        .collect(),
    );
}
#[test]
fn unicode_letters_numbers_and_contextual_lowercase() {
    let skills = vec![
        skill("greek", "ΟΣ", "Greek Σ ΟΣ"),
        skill("turkish", "İSTANBUL", "dotted I"),
        skill("unicode", "数字 １２３ Ⅷ", "中文 réseau"),
        skill("emoji", "😀", "symbol"),
    ];
    compare(
        [
            "ος",
            "Σ",
            "οσ",
            "İstanbul",
            "i\u{307}stanbul",
            "中文",
            "数字",
            "１２３",
            "Ⅷ",
            "réseau",
            "😀",
        ]
        .into_iter()
        .map(|q| search(skills.clone(), q, None))
        .collect(),
    );
}
#[test]
fn limit_floor_clamp_zero_default_and_nonfinite_values() {
    let skills: Vec<_> = (0..14)
        .map(|n| skill(&format!("id{n}"), "word", ""))
        .collect();
    let mut calls: Vec<_> = [
        None,
        Some(-100.0),
        Some(-0.1),
        Some(-0.0),
        Some(0.1),
        Some(0.9),
        Some(1.9),
        Some(5.7),
        Some(10.0),
        Some(1e20),
    ]
    .into_iter()
    .map(|n| search(skills.clone(), "word", n))
    .collect();
    for kind in ["nan", "infinity", "negative-infinity"] {
        let mut c = search(skills.clone(), "word", None);
        c["limitKind"] = json!(kind);
        calls.push(c);
    }
    compare(calls);
}
#[test]
fn clipping_is_exact_at_180_utf16_units_including_lone_surrogates() {
    compare(
        [179, 180, 181]
            .into_iter()
            .map(|n| {
                let description = format!("{}😀é", "x".repeat(n));
                search(vec![skill("test", "test", &description)], "test", None)
            })
            .collect(),
    );
}
#[test]
fn locale_ties_are_stable_and_pure_function_keeps_duplicate_ids() {
    let skills = vec![
        skill("z", "word", ""),
        skill("é", "word", "first"),
        skill("e\u{301}", "word", "second"),
        skill("a", "word", ""),
        skill("A", "word", ""),
        skill("é", "word", "third"),
    ];
    compare(vec![search(skills, "word", Some(10.0))]);
}
#[test]
fn registry_search_replaces_duplicate_id_and_returns_tool_message() {
    let mut disabled = skill("hidden", "word", "disabled");
    disabled["enabled"] = json!(false);
    compare(vec![
        json!({"op":"nativeskilldiscovery.tool","tool":"skills.search","input":{"query":"word"},"skills":[skill("a","word","old"),disabled,skill("a","word","replacement"),skill("b","word","other")],"limit":3}),
    ]);
}
#[test]
fn registry_read_resolves_only_enabled_ids_and_handles_real_utf8_files() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let work = root
        .join(".jait/artifacts/gateway-rust/skill-discovery-files")
        .join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(&work).unwrap();
    let path = work.join("operator's $(skill).md");
    std::fs::write(
        &path,
        b"\xef\xbb\xbf# Guide\r\nUntrusted <instructions> \xf0\x28\x8c\x28",
    )
    .unwrap();
    let mut registered = skill("installed", "Installed", "description");
    registered["filePath"] = json!(path);
    let mut disabled = registered.clone();
    disabled["id"] = json!("disabled");
    disabled["enabled"] = json!(false);
    let mut missing = registered.clone();
    missing["id"] = json!("missing-file");
    missing["filePath"] = json!(work.join("missing"));
    let mut directory = registered.clone();
    directory["id"] = json!("directory");
    directory["filePath"] = json!(work);
    let ids = [
        "installed".to_string(),
        "disabled".into(),
        "missing-file".into(),
        "directory".into(),
        "../installed".into(),
        path.to_str().unwrap().to_string(),
        "__proto__".into(),
    ];
    compare(ids.into_iter().map(|id|json!({"op":"nativeskilldiscovery.tool","tool":"skills.read","input":{"id":id},"skills":[registered,disabled,missing,directory]})).collect());
}
#[test]
fn loaded_base_directory_preserves_registry_path_spelling() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap();
    let work = root
        .join(".jait/artifacts/gateway-rust/skill-path-spelling")
        .join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(work.join("inner")).unwrap();
    std::fs::write(work.join("SKILL.md"), "content").unwrap();
    compare([format!("{}//SKILL.md",work.display()),format!("{}/inner/../SKILL.md",work.display())].into_iter().map(|path| {
        let mut s=skill("installed","Installed","");s["filePath"]=json!(path);
        json!({"op":"nativeskilldiscovery.tool","tool":"skills.read","input":{"id":"installed"},"skills":[s]})
    }).collect());
}
