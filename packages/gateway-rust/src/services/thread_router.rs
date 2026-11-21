//! Pure native routing policy. Recommendations carry no execution authority.
//! Data tables retain reference wording; time is supplied by the session owner.
use crate::text::js_trim;
use regress::Regex;
use serde::{Deserialize, Serialize};
use std::{collections::HashSet, sync::LazyLock};

#[derive(Clone, Debug, Deserialize)]
struct Signal {
    intent: String,
    pattern: String,
    weight: f64,
}
#[derive(Clone, Debug, Deserialize)]
struct Phase {
    name: String,
    steps: Vec<String>,
}
#[derive(Deserialize)]
struct Data {
    signals: Vec<Signal>,
    common: Vec<Phase>,
    phases: std::collections::HashMap<String, Vec<Phase>>,
    fallback: Vec<Phase>,
    generic: HashSet<String>,
}
static DATA: LazyLock<Data> = LazyLock::new(|| {
    serde_json::from_str(include_str!("thread-router-data.json")).expect("static routing data")
});
static SIGNALS: LazyLock<Vec<Regex>> =
    LazyLock::new(|| DATA.signals.iter().map(|s| re(&s.pattern, "i")).collect());
fn re(pattern: &str, flags: &str) -> Regex {
    Regex::with_flags(pattern, flags).expect("static router pattern")
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RoutingSkill {
    pub id: String,
    pub name: String,
    pub description: String,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoutingPlan {
    pub intent: String,
    pub reason: String,
    pub suggested_skill_ids: Vec<String>,
    pub topology: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subtasks: Option<Vec<String>>,
    pub routed_at: String,
}
/// Ties retain signal insertion order, including the coding/planning `spec` tie.
pub fn classify_intent(message: &str) -> (String, f64) {
    let mut best = "general";
    let mut best_score = 0.0_f64;
    let mut total = 0.0_f64;
    for (signal, regex) in DATA.signals.iter().zip(SIGNALS.iter()) {
        let score = regex.find_iter(message).count() as f64 * signal.weight;
        total += score;
        if score > best_score {
            best_score = score;
            best = &signal.intent;
        }
    }
    (
        best.into(),
        if total == 0.0 {
            0.3
        } else {
            (best_score / total.max(1.0)).min(1.0)
        },
    )
}
fn skill_slug(value: &str) -> String {
    static SPACE: LazyLock<Regex> = LazyLock::new(|| re(r"[\s_]+", ""));
    let lower = value.to_lowercase();
    let value = js_trim(&lower);
    let mut out = String::new();
    let mut end = 0;
    for m in SPACE.find_iter(value) {
        out.push_str(&value[end..m.start()]);
        out.push('-');
        end = m.end();
    }
    out.push_str(&value[end..]);
    out.retain(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');
    out
}
pub fn match_explicit_skill_invocations(message: &str, skills: &[RoutingSkill]) -> Vec<String> {
    static TOKENS: LazyLock<Regex> = LazyLock::new(|| re(r"(?:^|\s)/([a-z0-9][a-z0-9-]*)", "i"));
    let tokens: HashSet<String> = TOKENS
        .find_iter(message)
        .filter_map(|m| m.group(1).map(|r| message[r].to_lowercase()))
        .collect();
    skills
        .iter()
        .filter(|s| {
            tokens.contains(&s.id.to_lowercase())
                || tokens.contains(&skill_slug(&s.id))
                || tokens.contains(&skill_slug(&s.name))
        })
        .map(|s| s.id.clone())
        .collect()
}
fn skill_words(text: &str) -> HashSet<String> {
    static WORDS: LazyLock<Regex> = LazyLock::new(|| re("[a-z0-9]+", ""));
    let lower = text.to_lowercase();
    WORDS
        .find_iter(&lower)
        .map(|m| {
            let word = &lower[m.range()];
            if word.len() > 4 && word.ends_with('s') {
                word[..word.len() - 1].to_owned()
            } else {
                word.to_owned()
            }
        })
        .filter(|w| w.len() > 2 && !DATA.generic.contains(w))
        .collect()
}
/// Minimum keyword score for routing recommendations.
pub const MIN_AUTO_SKILL_SCORE: usize = 2;
/// Stricter keyword score for loading a skill into a chat turn when System One is unavailable.
pub const MIN_TURN_SKILL_SCORE: usize = 4;
/// System One relevance a candidate skill needs before it is loaded into a chat turn.
pub const TURN_SKILL_MIN_RELEVANCE: f64 = 0.7;
/// Most keyword/System One selected skills loaded into one chat turn (explicit `/skill-id` is extra).
pub const TURN_SKILL_MAX: usize = 2;

pub fn match_skills(message: &str, skills: &[RoutingSkill]) -> Vec<String> {
    match_skills_with_min(message, skills, MIN_AUTO_SKILL_SCORE)
}

/// Non-explicit skills sharing any keyword with the message: the shortlist System One judges.
pub fn turn_skill_shortlist(message: &str, skills: &[RoutingSkill]) -> Vec<String> {
    let explicit = match_explicit_skill_invocations(message, skills);
    skills
        .iter()
        .filter(|skill| !explicit.contains(&skill.id))
        .filter(|skill| {
            match_skills_with_min(message, std::slice::from_ref(skill), 1).contains(&skill.id)
        })
        .map(|skill| skill.id.clone())
        .collect()
}

/// Skills to load for a chat turn. `system_one_ranked` is `None` when System One is not
/// configured (strict keyword score), otherwise the shortlist after System One relevance
/// filtering in rank order. Explicit `/skill-id` invocations always come first.
pub fn select_turn_skills(
    message: &str,
    skills: &[RoutingSkill],
    system_one_ranked: Option<&[String]>,
) -> Vec<String> {
    let Some(ranked) = system_one_ranked else {
        return match_skills_with_min(message, skills, MIN_TURN_SKILL_SCORE);
    };
    let mut chosen = match_explicit_skill_invocations(message, skills);
    chosen.extend(ranked.iter().take(TURN_SKILL_MAX).cloned());
    skills
        .iter()
        .filter(|skill| chosen.contains(&skill.id))
        .map(|skill| skill.id.clone())
        .collect()
}

pub fn match_skills_with_min(
    message: &str,
    skills: &[RoutingSkill],
    min_score: usize,
) -> Vec<String> {
    static PATHS: LazyLock<Regex> =
        LazyLock::new(|| re(r"\S*[/\\]\S+|\b\S+\.(?:txt|json|jsonl|ts|js|mjs|md)\b", ""));
    let mut explicit = match_explicit_skill_invocations(message, skills);
    let mut clean = String::new();
    let mut end = 0;
    for m in PATHS.find_iter(message) {
        clean.push_str(&message[end..m.start()]);
        clean.push(' ');
        end = m.end();
    }
    clean.push_str(&message[end..]);
    let words = skill_words(&clean);
    let mut scored = Vec::new();
    for skill in skills {
        if explicit.contains(&skill.id) {
            continue;
        }
        let names = skill_words(&skill.name);
        let descriptions = skill_words(&skill.description);
        let score = descriptions
            .intersection(&words)
            .filter(|w| !names.contains(*w))
            .count()
            + 2 * names.intersection(&words).count();
        if score >= min_score {
            scored.push((skill.id.clone(), score));
        }
    }
    scored.sort_by_key(|skill| std::cmp::Reverse(skill.1));
    explicit.extend(scored.into_iter().take(2).map(|s| s.0));
    explicit
}
fn topology(message: &str, intent: &str) -> (String, Option<Vec<String>>) {
    static LIST: LazyLock<Regex> = LazyLock::new(|| re(r"^\s*(?:\d+[.)]\s|-\s|\*\s|•\s)", ""));
    static CONJUNCTION: LazyLock<Regex> =
        LazyLock::new(|| re(r"\b(and|also|plus|additionally)\b", "i"));
    let items: Vec<String> = message
        .split('\n')
        .filter_map(|line| {
            LIST.find(line)
                .map(|m| js_trim(&line[m.end()..]).to_owned())
        })
        .collect();
    if items.len() >= 3 && matches!(intent, "coding" | "planning") {
        return ("delegated".into(), Some(items));
    }
    if intent == "coding"
        && message.encode_utf16().count() > 300
        && CONJUNCTION.find(message).is_some()
    {
        return ("delegated".into(), None);
    }
    ("single".into(), None)
}
/// `routed_at` must be the owner's ISO wall-clock sample. Repository strategy is
/// intentionally unused in the reference. This function performs no effects.
pub fn route_thread(
    message: &str,
    skills: &[RoutingSkill],
    pinned: &[String],
    delegation: bool,
    routed_at: String,
) -> RoutingPlan {
    let (intent, _) = classify_intent(message);
    let mut ids = Vec::new();
    for id in pinned {
        if !ids.contains(id) {
            ids.push(id.clone());
        }
    }
    let pinned_ids = ids.clone();
    ids.extend(
        match_skills(message, skills)
            .into_iter()
            .filter(|id| !pinned_ids.contains(id)),
    );
    let (topology, subtasks) = if delegation {
        ("single".into(), None)
    } else {
        topology(message, &intent)
    };
    let label = match intent.as_str() {
        "coding" => "code implementation",
        "debugging" => "debugging/troubleshooting",
        "research" => "research/investigation",
        "review" => "code review/assessment",
        "planning" => "planning/architecture",
        "devops" => "DevOps/infrastructure",
        "data" => "data processing",
        _ => "general task",
    };
    let mut reason = format!("Classified as {label}.");
    let names: Vec<&str> = ids
        .iter()
        .filter_map(|id| skills.iter().find(|s| &s.id == id))
        .map(|s| s.name.as_str())
        .filter(|s| !s.is_empty())
        .take(3)
        .collect();
    if !names.is_empty() {
        reason.push_str(&format!(" Auto-activated skills: {}.", names.join(", ")));
    }
    if topology == "delegated" {
        reason.push_str(" Task has separable subtasks — helper threads recommended.");
    }
    RoutingPlan {
        intent,
        reason,
        suggested_skill_ids: ids,
        topology,
        subtasks,
        routed_at,
    }
}
pub fn format_routing_plan_for_prompt(plan: &RoutingPlan, message_length: Option<usize>) -> String {
    let mut lines = vec![
        "<orchestration>".into(),
        format!("Classification: {} — {}", plan.intent, plan.reason),
    ];
    if message_length.unwrap_or(0) < 200 && plan.topology != "delegated" {
        lines.extend(["", "This looks like a straightforward task. Proceed directly — read the relevant code, make the change, and verify it compiles.", "</orchestration>"].map(str::to_owned));
        return lines.join("\n");
    }
    lines.extend(["", "You MUST follow this problem-solving process:", ""].map(str::to_owned));
    let phases = DATA
        .common
        .iter()
        .chain(DATA.phases.get(&plan.intent).unwrap_or(&DATA.fallback));
    for (index, phase) in phases.enumerate() {
        lines.push(format!("Phase {}: {}", index + 1, phase.name));
        lines.extend(phase.steps.iter().map(|step| format!("  - {step}")));
        lines.push(String::new());
    }
    if plan.topology == "delegated"
        && let Some(subtasks) = &plan.subtasks
        && !subtasks.is_empty()
    {
        lines.push("Identified subtasks for parallel execution:".into());
        lines.extend(subtasks.iter().map(|task| format!("  - {task}")));
        lines.extend(
            [
                "",
                "Use thread.control create_many to spawn helper threads for independent subtasks.",
                "Each helper should be kind: delegation so it auto-completes after one turn.",
                "",
            ]
            .map(str::to_owned),
        );
    }
    lines.extend(
        [
            "IMPORTANT: Do NOT skip phases. Show your reasoning at each phase before proceeding.",
            "</orchestration>",
        ]
        .map(str::to_owned),
    );
    lines.join("\n")
}
#[cfg(test)]
mod tests {
    use super::*;
    fn skill(id: &str, name: &str, description: &str) -> RoutingSkill {
        RoutingSkill {
            id: id.into(),
            name: name.into(),
            description: description.into(),
        }
    }
    #[test]
    fn weighted_intent_and_no_signal() {
        assert_eq!(classify_intent("hello"), ("general".into(), 0.3));
        assert_eq!(classify_intent("fix bug and create feature").0, "debugging");
        assert_eq!(classify_intent("spec").0, "planning");
        assert_eq!(classify_intent("éfixé").0, "debugging");
    }
    #[test]
    fn explicit_skills_require_boundary_and_preserve_registry_order() {
        let skills = vec![
            skill("a", "Alpha Skill", ""),
            skill("b", "Beta", ""),
            skill("c", "Gamma", ""),
        ];
        assert_eq!(
            match_explicit_skill_invocations(
                "/b /ALPHA-SKILL https://x/c dir/c\u{feff}/c",
                &skills
            ),
            vec!["a", "b", "c"]
        );
        assert!(match_explicit_skill_invocations("https://x/b dir/b", &skills).is_empty());
    }
    #[test]
    fn generic_words_and_paths_do_not_activate_apps() {
        let skills = vec![
            skill("notes", "Notes", "read write files tasks work"),
            skill("calendar", "Calendar", "scheduling meeting agendas"),
        ];
        assert!(match_skills("continue unfinished work notes/notes.md", &skills).is_empty());
        assert_eq!(
            match_skills("scheduling agendas", &skills),
            vec!["calendar"]
        );
    }
    fn turn_skills() -> Vec<RoutingSkill> {
        vec![
            skill("charts", "Chart Maker", "draw plots"),
            skill("research", "Deep Research", "compare options"),
            skill("pin", "Pin", "pin pin pin"),
        ]
    }
    #[test]
    fn turn_keyword_threshold_is_stricter_than_routing() {
        let skills = turn_skills();
        // One name word scores 2: enough to route, not enough to load into a turn.
        assert_eq!(match_skills("chart", &skills), vec!["charts"]);
        assert!(match_skills_with_min("chart", &skills, MIN_TURN_SKILL_SCORE).is_empty());
        assert!(select_turn_skills("chart", &skills, None).is_empty());
        // Two name words score 4.
        assert_eq!(
            select_turn_skills("chart maker", &skills, None),
            vec!["charts"]
        );
        // Repeated description words never count as extra evidence.
        assert!(select_turn_skills("pin", &skills, None).is_empty());
    }
    #[test]
    fn turn_explicit_invocation_always_loads() {
        let skills = turn_skills();
        assert_eq!(
            select_turn_skills("/deep-research hi", &skills, None),
            vec!["research"]
        );
        assert_eq!(
            select_turn_skills("/deep-research hi", &skills, Some(&[])),
            vec!["research"]
        );
    }
    #[test]
    fn turn_shortlist_excludes_explicit_and_unrelated_skills() {
        let skills = turn_skills();
        assert_eq!(
            turn_skill_shortlist("draw a chart", &skills),
            vec!["charts"]
        );
        assert!(turn_skill_shortlist("hello there", &skills).is_empty());
        assert!(turn_skill_shortlist("/charts chart", &skills).is_empty());
    }
    #[test]
    fn turn_system_one_selection_is_bounded_and_registry_ordered() {
        let skills = vec![
            skill("a", "Alpha", ""),
            skill("b", "Beta", ""),
            skill("c", "Gamma", ""),
            skill("d", "Delta", ""),
        ];
        let ranked: Vec<String> = ["c", "a", "b"].map(String::from).into();
        // Top TURN_SKILL_MAX ranked skills load; explicit `/d` is additional.
        assert_eq!(
            select_turn_skills("/d go", &skills, Some(&ranked)),
            vec!["a", "c", "d"]
        );
        // System One rejected everything: nothing loads, and no keyword fallback applies.
        assert!(select_turn_skills("Alpha Beta", &skills, Some(&[])).is_empty());
    }
    #[test]
    fn auto_selection_is_stable_bounded_and_pins_are_first() {
        let skills = vec![
            skill("a", "Alpha", ""),
            skill("b", "Alpha", ""),
            skill("c", "Alpha", ""),
        ];
        let p = route_thread(
            "Alpha",
            &skills,
            &["z".into(), "z".into(), "b".into()],
            false,
            "now".into(),
        );
        assert_eq!(p.suggested_skill_ids, vec!["z", "b", "a"]);
    }
    #[test]
    fn helper_threads_cannot_redelegate() {
        let m = "implement\n1. first\n2. second\n3. third";
        let p = route_thread(m, &[], &[], false, "now".into());
        assert_eq!(p.topology, "delegated");
        assert_eq!(
            p.subtasks,
            Some(vec!["first".into(), "second".into(), "third".into()])
        );
        let p = route_thread(m, &[], &[], true, "now".into());
        assert_eq!(p.topology, "single");
        assert!(p.subtasks.is_none());
    }
    #[test]
    fn utf16_threshold_and_prompt_phases() {
        let m = format!("implement and {}", "😀".repeat(145));
        let p = route_thread(&m, &[], &[], false, "now".into());
        assert_eq!(p.topology, "delegated");
        let out = format_routing_plan_for_prompt(&p, Some(301));
        assert!(out.contains("Phase 1: ANALYZE"));
        assert!(out.contains("Phase 2: PLAN"));
        let p = route_thread("hello", &[], &[], false, "now".into());
        assert!(!format_routing_plan_for_prompt(&p, None).contains("Phase 1:"));
        assert!(format_routing_plan_for_prompt(&p, Some(200)).contains("Phase 2: EXECUTE"));
    }
}
