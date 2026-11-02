//! Run ripgrep only on bytes already opened through the pinned project root.
//! It never receives project paths, so it cannot traverse symlinks or escape scope.
use super::{Error, Operation, Result};
use std::{
    io,
    process::{Command, Stdio},
};

#[cfg(unix)]
pub(super) fn run(
    program: &std::ffi::OsStr,
    query: &str,
    regexp: bool,
    input: &[u8],
    max_output: usize,
    operation: &Operation,
) -> Result<Option<(Vec<u8>, bool)>> {
    use std::{
        io::{Read, Write},
        os::fd::AsRawFd,
        thread,
        time::Duration,
    };
    operation.check()?;
    let mut command = Command::new(program);
    command.args([
        "--no-config",
        "--no-heading",
        "--line-number",
        "--ignore-case",
        "--max-count",
        "50",
        "--max-columns",
        "2000",
        "--max-columns-preview",
    ]);
    if !regexp {
        command.arg("--fixed-strings");
    }
    command
        .args(["--", query, "-"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    let child = match command.spawn() {
        Ok(child) => child,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(Error::Io(e)),
    };
    struct Guard(std::process::Child);
    impl Drop for Guard {
        fn drop(&mut self) {
            let _ = self.0.kill();
            let _ = self.0.wait();
        }
    }
    let mut child = Guard(child);
    let mut stdin = child.0.stdin.take();
    let mut stdout = child
        .0
        .stdout
        .take()
        .ok_or_else(|| Error::Io(io::Error::other("missing ripgrep stdout")))?;
    for fd in [stdin.as_ref().unwrap().as_raw_fd(), stdout.as_raw_fd()] {
        // SAFETY: descriptors are owned by this function and remain open here.
        let flags = unsafe { libc::fcntl(fd, libc::F_GETFL) };
        if flags < 0 || unsafe { libc::fcntl(fd, libc::F_SETFL, flags | libc::O_NONBLOCK) } < 0 {
            return Err(Error::Io(io::Error::last_os_error()));
        }
    }
    let mut written = 0;
    let mut output = Vec::new();
    let mut eof = false;
    loop {
        operation.check()?;
        let mut progressed = false;
        if let Some(pipe) = stdin.as_mut() {
            if written == input.len() {
                stdin = None;
            } else {
                match pipe.write(&input[written..]) {
                    Ok(n) => {
                        written += n;
                        progressed |= n != 0;
                    }
                    Err(e)
                        if matches!(
                            e.kind(),
                            io::ErrorKind::WouldBlock | io::ErrorKind::Interrupted
                        ) => {}
                    Err(e) if e.kind() == io::ErrorKind::BrokenPipe => stdin = None,
                    Err(e) => return Err(Error::Io(e)),
                }
            }
        }
        let mut buffer = [0u8; 8192];
        // Return to the input pipe even if the child continuously writes output.
        // Otherwise a child that writes while waiting for input can starve stdin.
        for _ in 0..16 {
            // A continuously readable child must not starve cancellation or the deadline.
            operation.check()?;
            match stdout.read(&mut buffer) {
                Ok(0) => {
                    eof = true;
                    break;
                }
                Ok(n) => {
                    progressed = true;
                    if output.len().saturating_add(n) > max_output {
                        // Retain complete records from this read that fit the budget,
                        // but never return a partial record as a valid match.
                        let remaining = max_output.saturating_sub(output.len());
                        output.extend_from_slice(&buffer[..remaining]);
                        let complete = output
                            .iter()
                            .rposition(|b| *b == b'\n')
                            .map_or(0, |p| p + 1);
                        output.truncate(complete);
                        return Ok(Some((output, true)));
                    }
                    output.extend_from_slice(&buffer[..n]);
                }
                Err(e)
                    if matches!(
                        e.kind(),
                        io::ErrorKind::WouldBlock | io::ErrorKind::Interrupted
                    ) =>
                {
                    break;
                }
                Err(e) => return Err(Error::Io(e)),
            }
        }
        if let Some(status) = child.0.try_wait().map_err(Error::Io)? {
            if eof {
                return match status.code() {
                    Some(0 | 1) => Ok(Some((output, false))),
                    _ => Err(Error::Input(
                        "ripgrep search failed (invalid expression or process error)".into(),
                    )),
                };
            }
        }
        if !progressed {
            thread::sleep(Duration::from_millis(5));
        }
    }
}

#[cfg(not(unix))]
pub(super) fn run(
    _: &std::ffi::OsStr,
    _: &str,
    _: bool,
    _: &[u8],
    _: usize,
    _: &Operation,
) -> Result<Option<(Vec<u8>, bool)>> {
    // This platform has no descriptor-relative project access yet.
    Err(Error::Unsupported)
}
