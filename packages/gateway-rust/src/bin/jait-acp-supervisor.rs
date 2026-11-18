//! Experimental Linux ACP child supervisor. This binary is not mounted.
//!
//! The parent passes a connected Unix stream as descriptor 3 and supplies one
//! newline-terminated JSON launch record (maximum 1 MiB). Child stdio is inherited
//! transparently. Control replies are newline-delimited JSON; any control byte or
//! EOF after launch requests shutdown. Credentials belong in the launch record,
//! never in arguments. The parent must arrange descriptor 3 and private pipes.
//! This prototype does not handle helper death, escaped descendants or Windows.

#[cfg(target_os = "linux")]
mod linux {
    use serde::Deserialize;
    use std::{
        collections::BTreeMap,
        io::{self, Read, Write},
        os::{
            fd::{AsRawFd, FromRawFd},
            unix::{net::UnixStream, process::CommandExt},
        },
        process::{Child, Command, Stdio},
        time::{Duration, Instant},
    };

    const MAX_LAUNCH: u64 = 1024 * 1024;
    const DELAY: Duration = Duration::from_secs(5);
    #[derive(Deserialize)]
    struct Launch {
        command: String,
        args: Vec<String>,
        cwd: String,
        env: BTreeMap<String, String>,
    }

    fn default_sigchld() -> io::Result<()> {
        // The helper is a dedicated single-threaded executable. Reset inherited
        // auto-reap dispositions and unblock SIGCHLD before creating a child.
        unsafe {
            let mut action: libc::sigaction = std::mem::zeroed();
            action.sa_sigaction = libc::SIG_DFL;
            libc::sigemptyset(&mut action.sa_mask);
            if libc::sigaction(libc::SIGCHLD, &action, std::ptr::null_mut()) != 0 {
                return Err(io::Error::last_os_error());
            }
            let mut set: libc::sigset_t = std::mem::zeroed();
            libc::sigemptyset(&mut set);
            libc::sigaddset(&mut set, libc::SIGCHLD);
            if libc::sigprocmask(libc::SIG_UNBLOCK, &set, std::ptr::null_mut()) != 0 {
                return Err(io::Error::last_os_error());
            }
        }
        Ok(())
    }
    fn observe(pid: u32) -> io::Result<bool> {
        unsafe {
            let mut info: libc::siginfo_t = std::mem::zeroed();
            loop {
                if libc::waitid(
                    libc::P_PID,
                    pid,
                    &mut info,
                    libc::WEXITED | libc::WNOHANG | libc::WNOWAIT,
                ) == 0
                {
                    return Ok(info.si_pid() != 0);
                }
                let error = io::Error::last_os_error();
                if error.kind() != io::ErrorKind::Interrupted {
                    return Err(error);
                }
            }
        }
    }
    fn signal(target: i32, sig: i32) -> io::Result<()> {
        if unsafe { libc::kill(target, sig) } == 0 {
            Ok(())
        } else {
            Err(io::Error::last_os_error())
        }
    }
    fn read_launch(stream: &mut UnixStream, timeout: Duration) -> io::Result<Vec<u8>> {
        let deadline = Instant::now() + timeout;
        let mut line = Vec::new();
        loop {
            let remaining = deadline
                .checked_duration_since(Instant::now())
                .filter(|duration| !duration.is_zero())
                .ok_or_else(|| {
                    io::Error::new(io::ErrorKind::TimedOut, "launch deadline elapsed")
                })?;
            stream.set_read_timeout(Some(remaining))?;
            let mut byte = [0];
            match stream.read(&mut byte) {
                Ok(0) => {
                    return Err(io::Error::new(
                        io::ErrorKind::UnexpectedEof,
                        "incomplete launch frame",
                    ));
                }
                Ok(_) => {
                    line.push(byte[0]);
                    if line.len() as u64 > MAX_LAUNCH {
                        return Err(io::Error::new(
                            io::ErrorKind::InvalidData,
                            "launch frame too large",
                        ));
                    }
                    if byte[0] == b'\n' {
                        return Ok(line);
                    }
                }
                Err(error) if error.kind() == io::ErrorKind::Interrupted => continue,
                Err(error) => return Err(error),
            }
        }
    }
    fn reply(stream: &mut UnixStream, value: serde_json::Value) -> io::Result<()> {
        serde_json::to_writer(&mut *stream, &value)?;
        stream.write_all(b"\n")
    }
    fn isolate_descriptors() -> io::Result<()> {
        // This dedicated process owns its descriptor table. Fail closed when the
        // kernel cannot atomically mark all non-stdio descriptors close-on-exec.
        if unsafe { libc::syscall(libc::SYS_close_range, 3u32, u32::MAX, 4u32) } < 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(())
    }
    fn finish(child: Child, control: UnixStream) -> io::Result<()> {
        finish_with_delay(child, control, DELAY)
    }
    fn finish_with_delay(
        mut child: Child,
        mut control: UnixStream,
        delay: Duration,
    ) -> io::Result<()> {
        let pid = child.id();
        // If the leader is no longer waitable, its numeric identity is no longer
        // pinned. Never send a group or direct signal in that state.
        if let Err(error) = observe(pid) {
            let _ = reply(
                &mut control,
                serde_json::json!({"event":"ownership_lost", "errno":error.raw_os_error()}),
            );
            return Err(io::Error::other("child ownership lost before cleanup"));
        }
        let group = -(pid as i32);
        // No wait/try_wait before the last group signal: the unreaped child pins
        // the numeric identity. Only this single-threaded process can reap it.
        let term = signal(group, libc::SIGTERM);
        let term_error = term.as_ref().err().and_then(io::Error::raw_os_error);
        let mut kill_error = None;
        if term.is_ok() {
            std::thread::sleep(delay);
            kill_error = signal(group, libc::SIGKILL)
                .err()
                .and_then(|e| e.raw_os_error());
        }
        let direct_error = signal(pid as i32, libc::SIGKILL)
            .err()
            .and_then(|e| e.raw_os_error());
        let deadline = Instant::now() + Duration::from_secs(5);
        let exit = loop {
            match observe(pid) {
                Ok(true) => break child.wait().ok(),
                Ok(false) if Instant::now() < deadline => {
                    std::thread::sleep(Duration::from_millis(20))
                }
                _ => break None,
            }
        };
        use std::os::unix::process::ExitStatusExt;
        let response = reply(
            &mut control,
            serde_json::json!({"event":"cleanup", "term_errno":term_error, "kill_errno":kill_error, "direct_errno":direct_error, "code":exit.as_ref().and_then(|s| s.code()), "signal":exit.as_ref().and_then(|s| s.signal()), "reaped":exit.is_some()}),
        );
        if term_error.is_some() || kill_error.is_some() || direct_error.is_some() || exit.is_none()
        {
            return Err(io::Error::other("child cleanup incomplete"));
        }
        response
    }
    pub fn run() -> io::Result<()> {
        default_sigchld()?;
        // SAFETY: the launching contract reserves descriptor 3 exclusively for
        // this process. No other object in the helper owns that descriptor.
        let mut control = unsafe { UnixStream::from_raw_fd(3) };
        let flags = unsafe { libc::fcntl(control.as_raw_fd(), libc::F_GETFD) };
        if flags < 0
            || unsafe { libc::fcntl(control.as_raw_fd(), libc::F_SETFD, flags | libc::FD_CLOEXEC) }
                < 0
        {
            return Err(io::Error::last_os_error());
        }
        isolate_descriptors()?;
        control.set_write_timeout(Some(Duration::from_secs(1)))?;
        // One-byte reads preserve subsequent shutdown bytes for poll. The deadline
        // applies to the whole record, not separately to each read.
        let line = read_launch(&mut control, Duration::from_secs(10))?;
        let launch: Launch = serde_json::from_slice(&line)
            .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "invalid launch record"))?;
        let mut command = Command::new(launch.command);
        command
            .args(launch.args)
            .current_dir(launch.cwd)
            .env_clear()
            .envs(launch.env)
            .stdin(Stdio::inherit())
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .process_group(0);
        let child = command.spawn()?;
        let pid = child.id();
        // Close helper copies; the agent alone retains the ACP streams.
        unsafe {
            libc::close(0);
            libc::close(1);
            libc::close(2);
        }
        if reply(
            &mut control,
            serde_json::json!({"event":"spawned", "pid":pid}),
        )
        .is_err()
        {
            // Never append cleanup JSON to a potentially partial frame.
            let _ = control.shutdown(std::net::Shutdown::Write);
            return finish(child, control);
        }
        loop {
            match observe(pid) {
                Ok(true) => {
                    if reply(&mut control, serde_json::json!({"event":"exit_observed"})).is_err() {
                        let _ = control.shutdown(std::net::Shutdown::Write);
                    }
                    break;
                }
                Ok(false) => {}
                Err(error) => {
                    // Do not signal a potentially recycled process or group ID.
                    let _ = reply(
                        &mut control,
                        serde_json::json!({"event":"ownership_lost", "errno":error.raw_os_error()}),
                    );
                    return Err(io::Error::other("child ownership lost"));
                }
            }
            let mut pollfd = libc::pollfd {
                fd: control.as_raw_fd(),
                events: libc::POLLIN,
                revents: 0,
            };
            let result = unsafe { libc::poll(&mut pollfd, 1, 100) };
            if result < 0 && io::Error::last_os_error().kind() != io::ErrorKind::Interrupted {
                break;
            }
            if result > 0 {
                break;
            }
        }
        finish(child, control)
    }
    #[cfg(test)]
    mod tests {
        use super::*;
        #[test]
        fn descriptor_isolation_closes_inherited_fd_on_exec() {
            const MARKER: &str = "JAIT_ACP_FD_TEST_CHILD";
            if std::env::var_os(MARKER).is_none() {
                let status = Command::new(std::env::current_exe().unwrap())
                    .args([
                        "--exact",
                        "linux::tests::descriptor_isolation_closes_inherited_fd_on_exec",
                    ])
                    .env(MARKER, "1")
                    .status()
                    .unwrap();
                assert!(status.success());
                return;
            }
            let file = std::fs::File::open("/dev/null").unwrap();
            assert_eq!(unsafe { libc::dup2(file.as_raw_fd(), 100) }, 100);
            isolate_descriptors().unwrap();
            let flags = unsafe { libc::fcntl(100, libc::F_GETFD) };
            assert_ne!(flags & libc::FD_CLOEXEC, 0);
            let status = Command::new("/bin/sh")
                .args(["-c", "test ! -e /proc/self/fd/100"])
                .status()
                .unwrap();
            assert!(status.success());
        }
        #[test]
        fn cleanup_refuses_to_signal_after_leader_was_reaped() {
            let mut child = Command::new("/bin/true").process_group(0).spawn().unwrap();
            assert!(child.wait().unwrap().success());
            let (control, mut peer) = UnixStream::pair().unwrap();
            assert!(finish_with_delay(child, control, Duration::ZERO).is_err());
            let mut frame = String::new();
            peer.read_to_string(&mut frame).unwrap();
            let value: serde_json::Value = serde_json::from_str(&frame).unwrap();
            assert_eq!(value["event"], "ownership_lost");
            assert_eq!(value["errno"], libc::ECHILD);
        }
        #[test]
        fn cleanup_reports_closed_control_after_reaping() {
            let child = Command::new("/bin/sleep")
                .arg("30")
                .process_group(0)
                .spawn()
                .unwrap();
            let pid = child.id();
            let (control, peer) = UnixStream::pair().unwrap();
            drop(peer);
            assert!(finish_with_delay(child, control, Duration::ZERO).is_err());
            let mut status = 0;
            assert_eq!(
                unsafe { libc::waitpid(pid as i32, &mut status, libc::WNOHANG) },
                -1
            );
            assert_eq!(
                io::Error::last_os_error().raw_os_error(),
                Some(libc::ECHILD)
            );
        }
        #[test]
        fn cleanup_reaps_child_and_reports_outcome() {
            let child = Command::new("/bin/sleep")
                .arg("30")
                .process_group(0)
                .spawn()
                .unwrap();
            let (control, mut peer) = UnixStream::pair().unwrap();
            finish_with_delay(child, control, Duration::ZERO).unwrap();
            let mut frame = String::new();
            peer.read_to_string(&mut frame).unwrap();
            let value: serde_json::Value = serde_json::from_str(&frame).unwrap();
            assert_eq!(value["event"], "cleanup");
            assert_eq!(value["reaped"], true);
        }
        #[test]
        fn launch_frame_preserves_following_control_byte() {
            let (mut reader, mut writer) = UnixStream::pair().unwrap();
            writer.write_all(b"{}\nx").unwrap();
            assert_eq!(
                read_launch(&mut reader, Duration::from_secs(1)).unwrap(),
                b"{}\n"
            );
            let mut next = [0];
            reader.read_exact(&mut next).unwrap();
            assert_eq!(next, *b"x");
        }
        #[test]
        fn launch_frame_has_overall_deadline() {
            let (mut reader, mut writer) = UnixStream::pair().unwrap();
            let sender = std::thread::spawn(move || {
                for _ in 0..20 {
                    if writer.write_all(b"x").is_err() {
                        break;
                    }
                    std::thread::sleep(Duration::from_millis(15));
                }
            });
            let start = Instant::now();
            assert!(read_launch(&mut reader, Duration::from_millis(80)).is_err());
            assert!(start.elapsed() < Duration::from_millis(250));
            drop(reader);
            sender.join().unwrap();
        }
    }
}

fn main() {
    #[cfg(target_os = "linux")]
    if linux::run().is_err() {
        std::process::exit(1);
    }
    #[cfg(not(target_os = "linux"))]
    std::process::exit(1);
}
