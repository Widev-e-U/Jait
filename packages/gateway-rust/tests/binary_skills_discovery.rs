//! Startup skill discovery through the composed gateway executable.
use serde_json::{Value, json};
use std::{
    io::{BufRead, BufReader},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::mpsc,
    time::Duration,
};

struct Gateway {
    child: Child,
    root: PathBuf,
    base: String,
}
impl Drop for Gateway {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        let _ = std::fs::remove_dir_all(&self.root);
    }
}

#[tokio::test]
async fn discovers_sibling_openclaw_skills_after_project_skills() {
    check_discovery("directory").await;
}

#[cfg(unix)]
#[tokio::test]
async fn ignores_symlinked_sibling_components() {
    check_discovery("openclaw-symlink").await;
    check_discovery("skills-symlink").await;
}

async fn check_discovery(layout: &str) {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../.jait/artifacts/binary-skills-tests")
        .join(uuid::Uuid::new_v4().to_string());
    let project = root.join("project");
    let project_skill = project.join(".jait/skills/example");
    let target = root.join("target");
    let sibling_skill = if layout == "directory" {
        root.join("openclaw/skills/example")
    } else {
        target.join("skills/example")
    };
    std::fs::create_dir_all(&project_skill).unwrap();
    std::fs::create_dir_all(&sibling_skill).unwrap();
    #[cfg(unix)]
    match layout {
        "openclaw-symlink" => std::os::unix::fs::symlink(&target, root.join("openclaw")).unwrap(),
        "skills-symlink" => {
            std::fs::create_dir(root.join("openclaw")).unwrap();
            std::os::unix::fs::symlink(target.join("skills"), root.join("openclaw/skills"))
                .unwrap();
        }
        _ => {}
    }
    std::fs::write(
        project_skill.join("SKILL.md"),
        "---\nname: Project skill\ndescription: Project description\n---\n",
    )
    .unwrap();
    std::fs::write(
        sibling_skill.join("SKILL.md"),
        "---\nname: OpenClaw skill\ndescription: Sibling description\n---\n",
    )
    .unwrap();
    let root = root.canonicalize().unwrap();
    let project = project.canonicalize().unwrap();
    let mut child = Command::new(env!("CARGO_BIN_EXE_jait-gateway"))
        .env_clear()
        .env("HOME", &root)
        .env("JAIT_RUST_APPLICATION", "1")
        .env("JAIT_RUST_PORT", "0")
        .env("JAIT_RUST_PROJECT_ROOT", &project)
        .env("JAIT_RUST_DB", root.join("gateway.sqlite"))
        .env("JWT_SECRET", "isolated-binary-skills-test-secret")
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .unwrap();
    let stdout = child.stdout.take().unwrap();
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if let Ok(value) = serde_json::from_str::<Value>(&line)
                && value["event"] == "gateway.ready"
            {
                let _ = tx.send(value["address"].as_str().unwrap_or("").to_owned());
                return;
            }
        }
    });
    let address = match rx.recv_timeout(Duration::from_secs(30)) {
        Ok(address) => address,
        Err(error) => {
            let _ = child.kill();
            let _ = child.wait();
            panic!("gateway failed to become ready: {error}");
        }
    };
    assert!(address.starts_with("127.0.0.1:"));
    let gateway = Gateway {
        child,
        root,
        base: format!("http://{address}"),
    };
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .unwrap();
    let register = client
        .post(format!("{}/api/auth/register", gateway.base))
        .json(&json!({"username":"owner","password":"owner-pass-123"}))
        .send()
        .await
        .unwrap();
    assert_eq!(register.status(), 200);
    let token = register.json::<Value>().await.unwrap()["access_token"]
        .as_str()
        .unwrap()
        .to_owned();
    let response = client
        .get(format!("{}/api/skills", gateway.base))
        .bearer_auth(token)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let skills = response.json::<Value>().await.unwrap();
    let skill = skills
        .as_array()
        .unwrap()
        .iter()
        .find(|skill| skill["id"] == "example")
        .unwrap();
    if layout == "directory" {
        assert_eq!(skill["name"], "OpenClaw skill");
        assert_eq!(skill["source"], "bundled");
    } else {
        assert_eq!(skill["name"], "Project skill");
        assert_eq!(skill["source"], "project");
    }
}
