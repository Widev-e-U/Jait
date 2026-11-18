//! Owned backend launch contract: argv is data and never passed to a shell.
use anyhow::{Context, Result, ensure};
use std::process::Command;

pub struct BackendCommand {
    program: String,
    arguments: Vec<String>,
    custom: bool,
}

impl BackendCommand {
    pub fn from_json(source: Option<&str>, bun: String) -> Result<Self> {
        if let Some(source) = source {
            ensure!(source.len() <= 64 * 1024, "backend argv exceeds 64 KiB");
            let mut argv: Vec<String> = serde_json::from_str(source)
                .context("JAIT_CONTRACT_BACKEND_ARGV must be a JSON string array")?;
            ensure!(
                !argv.is_empty() && argv.len() <= 64,
                "backend argv needs 1–64 entries"
            );
            ensure!(!argv[0].trim().is_empty(), "backend executable is empty");
            ensure!(
                argv.iter()
                    .all(|arg| !arg.contains('\0') && arg.len() <= 8192),
                "backend argument contains NUL or exceeds 8 KiB"
            );
            let program = argv.remove(0);
            return Ok(Self {
                program,
                arguments: argv,
                custom: true,
            });
        }
        let bootstrap = "import {main} from './src/index.ts'; import {writeFileSync} from 'node:fs'; await main({evaluation:true,onReady(port){writeFileSync(process.env.JAIT_CONTRACT_READY_FILE,String(port))}});";
        Ok(Self {
            program: bun,
            arguments: vec!["--no-env-file".into(), "--eval".into(), bootstrap.into()],
            custom: false,
        })
    }

    pub fn command(&self) -> Command {
        let mut command = Command::new(&self.program);
        command.args(&self.arguments);
        command
    }

    pub fn profile(&self) -> &'static str {
        if self.custom {
            "owned-command-argv"
        } else {
            "typescript-bun"
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn argv_preserves_metacharacters_as_literal_arguments() {
        let argv = BackendCommand::from_json(
            Some(r#"["fake-backend","--name","a; $(touch escaped)","line\nnext","with spaces"]"#),
            "bun".into(),
        )
        .unwrap();
        let command = argv.command();
        assert_eq!(command.get_program(), "fake-backend");
        let args: Vec<_> = command
            .get_args()
            .map(|arg| arg.to_str().unwrap())
            .collect();
        assert_eq!(
            args,
            ["--name", "a; $(touch escaped)", "line\nnext", "with spaces"]
        );
        assert_eq!(argv.profile(), "owned-command-argv");
    }

    #[test]
    fn malformed_or_unbounded_argv_is_rejected_before_spawn() {
        for source in [
            "[]",
            "{}",
            "null",
            r#"[1]"#,
            r#"[""]"#,
            r#"[" \t"]"#,
            r#"["backend","\u0000"]"#,
        ] {
            assert!(BackendCommand::from_json(Some(source), "bun".into()).is_err());
        }
        for argv in [vec!["backend"; 65], vec!["backend", &"x".repeat(8193)]] {
            assert!(
                BackendCommand::from_json(
                    Some(&serde_json::to_string(&argv).unwrap()),
                    "bun".into()
                )
                .is_err()
            );
        }
        assert!(BackendCommand::from_json(Some(&" ".repeat(65537)), "bun".into()).is_err());
    }

    #[test]
    fn default_adapter_keeps_existing_gateway_bootstrap() {
        let argv = BackendCommand::from_json(None, "fixture-bun".into()).unwrap();
        let command = argv.command();
        assert_eq!(command.get_program(), "fixture-bun");
        assert_eq!(argv.profile(), "typescript-bun");
        assert!(
            command
                .get_args()
                .any(|arg| arg.to_str().unwrap().contains("JAIT_CONTRACT_READY_FILE"))
        );
    }
}
