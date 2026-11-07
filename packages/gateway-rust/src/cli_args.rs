//! Side-effect-free argument selection for the gateway CLI. Command execution is separate.

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Flags {
    pub port: Option<String>,
    pub host: Option<String>,
    pub env_path: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Command {
    Help,
    StartHelp,
    UpdateHelp,
    Version,
    Foreground(Flags),
    ManagedStart(Flags),
    Status(Option<String>),
    Stop,
    Reset,
    Doctor(Flags),
    Update {
        version: String,
        port: Option<String>,
    },
    Daemon {
        command: String,
        flags: Flags,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ParseError {
    InvalidStartOption(String),
    UnknownUpdateOption(String),
    UnexpectedUpdateArgument(String),
    UnknownDaemonCommand(Option<String>),
    UnknownOption(String),
    UnknownCommand(String),
}

fn value(args: &[String], i: usize) -> Option<&str> {
    args.get(i + 1)
        .map(String::as_str)
        .filter(|v| !v.is_empty())
}

fn set_flag(flags: &mut Flags, key: &str, val: &str) {
    match key {
        "--port" => flags.port = Some(val.into()),
        "--host" => flags.host = Some(val.into()),
        "--env" => flags.env_path = Some(val.into()),
        _ => unreachable!(),
    }
}

fn is_flag(s: &str) -> bool {
    matches!(s, "--port" | "--host" | "--env")
}

fn subcommand_flags(args: &[String], start: usize) -> Flags {
    let mut flags = Flags::default();
    let mut i = start;
    while i < args.len() {
        if is_flag(&args[i])
            && let Some(v) = value(args, i)
        {
            set_flag(&mut flags, &args[i], v);
            i += 1;
        }
        i += 1;
    }
    flags
}

/// Parse arguments excluding the executable name, without executing any command.
pub fn parse(args: &[String]) -> Result<Command, ParseError> {
    let mut args = args.to_vec();
    match args.first().map(String::as_str) {
        Some("status") => return Ok(Command::Status(subcommand_flags(&args, 1).port)),
        Some("stop") => return Ok(Command::Stop),
        Some("reset") => return Ok(Command::Reset),
        Some("start") => {
            if args.iter().any(|a| a == "--help" || a == "-h") {
                return Ok(Command::StartHelp);
            }
            let mut i = 1;
            while i < args.len() {
                if is_flag(&args[i]) && value(&args, i).is_some_and(|v| !v.starts_with('-')) {
                    i += 2;
                } else if args[i] == "--foreground" {
                    i += 1;
                } else {
                    return Err(ParseError::InvalidStartOption(args[i].clone()));
                }
            }
            if let Some(i) = args.iter().position(|a| a == "--foreground") {
                args.remove(i);
                args.remove(0);
            } else {
                return Ok(Command::ManagedStart(subcommand_flags(&args, 1)));
            }
        }
        Some("update") => {
            let mut version = None;
            let mut port = None;
            let mut i = 1;
            while i < args.len() {
                let arg = &args[i];
                if arg == "--help" || arg == "-h" {
                    return Ok(Command::UpdateHelp);
                }
                if arg == "--port" && value(&args, i).is_some() {
                    port = value(&args, i).map(str::to_owned);
                    i += 1;
                } else if arg.starts_with('-') {
                    return Err(ParseError::UnknownUpdateOption(arg.clone()));
                } else if version.is_none() {
                    version = Some(arg.clone());
                } else {
                    return Err(ParseError::UnexpectedUpdateArgument(arg.clone()));
                }
                i += 1;
            }
            return Ok(Command::Update {
                version: version.unwrap_or_else(|| "latest".into()),
                port,
            });
        }
        Some("daemon") => {
            let command = args.get(1).cloned();
            if !matches!(
                command.as_deref(),
                Some("install" | "uninstall" | "start" | "stop" | "restart" | "status" | "logs")
            ) {
                return Err(ParseError::UnknownDaemonCommand(
                    command.filter(|s| !s.is_empty()),
                ));
            }
            return Ok(Command::Daemon {
                command: command.unwrap(),
                flags: subcommand_flags(&args, 2),
            });
        }
        _ => {}
    }
    let doctor = args.first().is_some_and(|s| s == "doctor");
    let mut flags = if doctor {
        subcommand_flags(&args, 1)
    } else {
        Flags::default()
    };
    let mut i = 0;
    while i < args.len() {
        let arg = &args[i];
        if arg == "--help" || arg == "-h" {
            return Ok(Command::Help);
        }
        if arg == "--version" || arg == "-v" {
            return Ok(Command::Version);
        }
        if is_flag(arg) && value(&args, i).is_some() {
            set_flag(&mut flags, arg, value(&args, i).unwrap());
            i += 1;
        } else if arg.starts_with('-') {
            return Err(ParseError::UnknownOption(arg.clone()));
        } else if !(doctor && i == 0 && arg == "doctor") {
            return Err(ParseError::UnknownCommand(arg.clone()));
        }
        i += 1;
    }
    Ok(if doctor {
        Command::Doctor(flags)
    } else {
        Command::Foreground(flags)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn p(a: &[&str]) -> Result<Command, ParseError> {
        parse(&a.iter().map(|v| (*v).into()).collect::<Vec<_>>())
    }
    #[test]
    fn selection_and_flag_consumption_follow_reference() {
        assert_eq!(p(&[]), Ok(Command::Foreground(Flags::default())));
        assert_eq!(
            p(&["status", "--port", "--help"]),
            Ok(Command::Status(Some("--help".into())))
        );
        assert_eq!(p(&["stop", "--help"]), Ok(Command::Stop));
        assert_eq!(
            p(&["--port", "--help"]),
            Ok(Command::Foreground(Flags {
                port: Some("--help".into()),
                ..Flags::default()
            }))
        );
        assert_eq!(
            p(&["--port", "1", "--port", "2"]),
            Ok(Command::Foreground(Flags {
                port: Some("2".into()),
                ..Flags::default()
            }))
        );
    }
    #[test]
    fn start_validation_and_help_precedence() {
        assert_eq!(p(&["start", "--bogus", "--help"]), Ok(Command::StartHelp));
        assert_eq!(
            p(&["start", "--port", "-1"]),
            Err(ParseError::InvalidStartOption("--port".into()))
        );
        assert_eq!(
            p(&["start", "--foreground", "--foreground"]),
            Err(ParseError::UnknownOption("--foreground".into()))
        );
        assert_eq!(
            p(&["start", "--port", "3"]),
            Ok(Command::ManagedStart(Flags {
                port: Some("3".into()),
                ..Flags::default()
            }))
        );
    }
    #[test]
    fn update_errors_are_sequential_and_port_can_consume_flags() {
        assert_eq!(
            p(&["update", "--bad", "--help"]),
            Err(ParseError::UnknownUpdateOption("--bad".into()))
        );
        assert_eq!(
            p(&["update", "--port", "--help"]),
            Ok(Command::Update {
                version: "latest".into(),
                port: Some("--help".into())
            })
        );
        assert_eq!(
            p(&["update", "v1", "v2"]),
            Err(ParseError::UnexpectedUpdateArgument("v2".into()))
        );
    }
    #[test]
    fn daemon_and_doctor_keep_their_distinct_paths() {
        assert_eq!(
            p(&["daemon", "--help"]),
            Err(ParseError::UnknownDaemonCommand(Some("--help".into())))
        );
        assert_eq!(p(&["doctor", "--help"]), Ok(Command::Help));
        assert_eq!(
            p(&["--missing", "--help"]),
            Err(ParseError::UnknownOption("--missing".into()))
        );
        assert_eq!(
            p(&["--port"]),
            Err(ParseError::UnknownOption("--port".into()))
        );
    }
}
