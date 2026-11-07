//! Differential contract against the live TypeScript thread router.
//! Requires Bun and the repository source tree; no network or persistent state.
use jait_gateway::services::thread_router::{
    RoutingSkill, format_routing_plan_for_prompt, match_explicit_skill_invocations, match_skills,
    route_thread,
};
use serde_json::{Value, json};
use std::{path::Path, process::Command};

const ROUTED_AT: &str = "2026-01-02T03:04:05.000Z";

#[test]
fn typescript_and_rust_thread_routing_contract() {
    let skills = vec![
        RoutingSkill { id: "debugging".into(), name: "Debugging".into(), description: "Diagnose crashes, errors, and broken behavior.".into() },
        RoutingSkill { id: "review".into(), name: "Code Review".into(), description: "Review code quality, errors, bugs, and maintainability.".into() },
        RoutingSkill { id: "security".into(), name: "Security Audit".into(), description: "Audit code for security errors, bugs, auth, and vulnerabilities.".into() },
        RoutingSkill { id: "deep-research".into(), name: "Deep Research".into(), description: "Compare options and synthesize findings.".into() },
        RoutingSkill { id: "apple-notes".into(), name: "Apple Notes".into(), description: "Create, view, edit, delete, search, move, or export Apple Notes via memo CLI on macOS.".into() },
    ];
    let long = format!("implement and {}", "😀".repeat(145));
    let cases = vec![
        ("hello", vec![], false, None),
        ("spec", vec![], false, Some(200)),
        ("fix bug and create feature", vec![], false, Some(199)),
        (
            "/deep-research review this broken security auth error for bugs",
            vec!["missing", "review", "review"],
            false,
            Some(200),
        ),
        (
            "https://example.test/apple-notes notes/apple-notes /CODE-REVIEW",
            vec![],
            false,
            None,
        ),
        (
            "Read notes/service.txt using Jait file tools. Write result.json and verify values from the file.",
            vec![],
            false,
            None,
        ),
        (
            "Search Apple Notes for my meeting notes",
            vec![],
            false,
            None,
        ),
        (
            "implement\n1. first\n2. second\n3. third",
            vec![],
            false,
            Some(10),
        ),
        (
            "implement\n1. first\n2. second\n3. third",
            vec![],
            true,
            Some(200),
        ),
        (long.as_str(), vec![], false, Some(301)),
    ];
    let inputs: Vec<Value> = cases
        .iter()
        .map(|(message, pinned, delegation, length)| {
            json!({
                "message": message, "pinned": pinned, "delegation": delegation, "length": length
            })
        })
        .collect();
    let script = r#"
import { routeThread, matchSkills, matchExplicitSkillInvocations, formatRoutingPlanForPrompt } from './packages/gateway/src/services/thread-router.ts';
const { cases, skills } = JSON.parse(process.argv[1]);
const result = cases.map(c => {
  const plan = routeThread({ message: c.message, availableSkills: skills, pinnedSkillIds: c.pinned, kind: c.delegation ? 'delegation' : 'delivery' });
  plan.routedAt = '2026-01-02T03:04:05.000Z';
  return { explicit: matchExplicitSkillInvocations(c.message, skills), matched: matchSkills(c.message, skills), plan, prompt: formatRoutingPlanForPrompt(plan, c.length ?? undefined) };
});
console.log(JSON.stringify(result));
"#;
    let root = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .parent()
        .unwrap();
    let output = Command::new("bun")
        .current_dir(root)
        .args([
            "-e",
            script,
            &json!({"cases": inputs, "skills": skills}).to_string(),
        ])
        .output()
        .expect("Bun is required for the TypeScript router contract");
    assert!(
        output.status.success(),
        "TypeScript oracle failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let expected: Vec<Value> =
        serde_json::from_slice(&output.stdout).expect("TypeScript oracle must return JSON");
    assert_eq!(expected.len(), cases.len());
    for (index, (message, pinned, delegation, length)) in cases.iter().enumerate() {
        let pinned: Vec<String> = pinned.iter().map(|s| (*s).to_owned()).collect();
        let plan = route_thread(message, &skills, &pinned, *delegation, ROUTED_AT.into());
        let actual = json!({
            "explicit": match_explicit_skill_invocations(message, &skills),
            "matched": match_skills(message, &skills),
            "prompt": format_routing_plan_for_prompt(&plan, *length),
            "plan": plan,
        });
        assert_eq!(
            actual, expected[index],
            "router mismatch for case {index}: {message:?}"
        );
    }
}
