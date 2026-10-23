//! Parse-only shell validation before writing a command into an interactive terminal.
//! The caller must choose an authorized shell executable. This grants no execution
//! permission and deliberately does not accept additional flags or shell fragments.
use crate::contracts::bounded_json::Utf16Text;
use std::{io, path::Path, process::Stdio, time::Duration};
use tokio::{
    io::{AsyncRead, AsyncReadExt, AsyncWriteExt},
    process::Command,
    sync::Semaphore,
};

const OUTPUT_LIMIT: usize = 8000;
const DEADLINE: Duration = Duration::from_secs(1);
// The synchronous reference serializes parser invocations. Keep async callers
// from spawning an unbounded number of parser processes.
static PARSER_SLOT: Semaphore = Semaphore::const_new(1);

/// Return the same bounded diagnostic as commandSyntaxError. Unsupported or
/// missing shells pass through, as in the reference. Syntax validation is not
/// authorization, and a successful parse says nothing about command safety.
pub async fn command_syntax_error(command: &str, shell: &str) -> io::Result<Option<Utf16Text>> {
    let kind = Path::new(shell).file_name().and_then(|v| v.to_str());
    let args: &[&str] = match kind {
        Some("bash") => &["--noprofile", "--norc", "-n"],
        Some("sh" | "zsh") => &["-f", "-n"],
        _ => return Ok(None),
    };
    let _permit = PARSER_SLOT
        .acquire()
        .await
        .expect("parser admission remains open");
    // Match the reference's environment, overriding both shell startup hooks.
    let mut parser = Command::new(shell);
    parser
        .args(args)
        .env("BASH_ENV", "/dev/null")
        .env("ENV", "/dev/null")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        parser.as_std_mut().process_group(0);
    }
    let mut child = match parser.spawn() {
        Ok(child) => child,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) if error.kind() == io::ErrorKind::InvalidInput => return Err(error),
        Err(error) => return Ok(Some(failure(shell, error_code(&error)))),
    };
    #[cfg(unix)]
    let group = ParserGroup(child.id().expect("spawned parser") as i32);
    let mut stdin = child.stdin.take().expect("piped stdin");
    let stdout = child.stdout.take().expect("piped stdout");
    let stderr = child.stderr.take().expect("piped stderr");
    let work = async {
        tokio::try_join!(
            async {
                match stdin.write_all(command.as_bytes()).await {
                    Err(error) if error.kind() != io::ErrorKind::BrokenPipe => return Err(error),
                    _ => {}
                }
                drop(stdin);
                Ok(())
            },
            read_bounded(stdout),
            read_bounded(stderr),
            child.wait(),
        )
    };
    let completed = tokio::time::timeout(DEADLINE, work).await;
    match completed {
        Ok(Ok((_, _, stderr, status))) if status.success() => {
            // stderr warnings on a successful parse do not reject the command.
            drop(stderr);
            Ok(None)
        }
        Ok(Ok((_, _, stderr, _))) => {
            let stderr = String::from_utf8_lossy(&stderr);
            let mut units: Vec<u16> = "Invalid shell syntax: ".encode_utf16().collect();
            units.extend(crate::text::js_trim(&stderr).encode_utf16().take(2000));
            Ok(Some(Utf16Text(units)))
        }
        other => {
            #[cfg(unix)]
            group.kill();
            let _ = child.start_kill();
            let _ = child.wait().await;
            let code = match &other {
                Err(_) => "ETIMEDOUT",
                Ok(Err(error)) => error_code(error),
                _ => unreachable!(),
            };
            Ok(Some(failure(shell, code)))
        }
    }
}
fn failure(shell: &str, code: &str) -> Utf16Text {
    let detail = if code == "ENOBUFS" {
        format!("spawnSync {shell} ENOBUFS (stdout or stderr buffer reached maxBuffer size limit)")
    } else if code == "ETIMEDOUT" {
        format!("spawnSync {shell} {code}")
    } else {
        // The shipping reference runs on Bun's node:child_process adapter.
        let reason = match code {
            "EACCES" => "permission denied",
            "E2BIG" => "argument list too long",
            "ELOOP" => "too many symbolic links encountered",
            "ENOTDIR" => "not a directory",
            "EMFILE" => "too many open files",
            "ENFILE" => "file table overflow",
            "ENOMEM" => "not enough memory",
            "EIO" => "i/o error",
            "EPIPE" => "broken pipe",
            _ => "unknown error",
        };
        format!("{code}: {reason}, posix_spawn '{shell}'")
    };
    Utf16Text(
        format!("Shell syntax check failed: {detail}")
            .encode_utf16()
            .collect(),
    )
}
fn error_code(error: &io::Error) -> &'static str {
    if error.kind() == io::ErrorKind::FileTooLarge {
        return "ENOBUFS";
    }
    #[cfg(unix)]
    {
        match error.raw_os_error() {
            Some(libc::EACCES) => "EACCES",
            Some(libc::ENOEXEC) => "ENOEXEC",
            Some(libc::E2BIG) => "E2BIG",
            Some(libc::ELOOP) => "ELOOP",
            Some(libc::ENOTDIR) => "ENOTDIR",
            Some(libc::EMFILE) => "EMFILE",
            Some(libc::ENFILE) => "ENFILE",
            Some(libc::ENOMEM) => "ENOMEM",
            Some(libc::EIO) => "EIO",
            Some(libc::EPIPE) => "EPIPE",
            _ => "UNKNOWN",
        }
    }
    #[cfg(not(unix))]
    {
        match error.kind() {
            io::ErrorKind::PermissionDenied => "EACCES",
            io::ErrorKind::BrokenPipe => "EPIPE",
            _ => "UNKNOWN",
        }
    }
}
async fn read_bounded(mut pipe: impl AsyncRead + Unpin) -> io::Result<Vec<u8>> {
    let mut output = Vec::new();
    let mut buffer = [0; 4096];
    loop {
        let count = pipe.read(&mut buffer).await?;
        if count == 0 {
            return Ok(output);
        }
        if output.len() + count > OUTPUT_LIMIT {
            return Err(io::Error::new(
                io::ErrorKind::FileTooLarge,
                "parser output limit",
            ));
        }
        output.extend_from_slice(&buffer[..count]);
    }
}
#[cfg(unix)]
struct ParserGroup(i32);
#[cfg(unix)]
impl ParserGroup {
    fn kill(&self) {
        // The parser has its own group. Never signal the terminal's group.
        unsafe {
            libc::kill(-self.0, libc::SIGKILL);
        }
    }
}
#[cfg(unix)]
impl Drop for ParserGroup {
    fn drop(&mut self) {
        self.kill();
    }
}
