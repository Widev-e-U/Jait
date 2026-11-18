// Focused process-lifetime regressions; no Bun, gateway, or production processes.
#[allow(dead_code)]
mod tail_stream {
    include!("support/tail_stream.rs");

    #[cfg(test)]
    mod cleanup_tests {
        use super::*;
        use std::path::PathBuf;

        const FIXTURE: &str = "tail_stream::cleanup_tests::isolated_fixture";

        fn directory() -> PathBuf {
            let path = Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("../../.jait/artifacts/rust-continuation/cleanup")
                .join(uuid::Uuid::new_v4().to_string());
            fs::create_dir_all(&path).unwrap();
            path
        }

        fn scanner_cache_fixture() -> PathBuf {
            let root = directory();
            fs::create_dir_all(root.join(".jait/cache")).unwrap();
            fs::create_dir_all(root.join("outside")).unwrap();
            root
        }

        #[test]
        fn scanner_cache_accepts_owned_project_directory() {
            let root = scanner_cache_fixture();
            let cache = root.join(".jait/cache");
            assert_eq!(
                scoped_trivy_cache(&root, &cache).unwrap(),
                cache.canonicalize().unwrap()
            );
            fs::remove_dir_all(root).unwrap();
        }

        #[test]
        fn scanner_cache_rejects_existing_external_directory() {
            let root = scanner_cache_fixture();
            assert_eq!(
                scoped_trivy_cache(&root, &root.join("outside"))
                    .unwrap_err()
                    .kind(),
                std::io::ErrorKind::PermissionDenied
            );
            fs::remove_dir_all(root).unwrap();
        }

        #[test]
        fn scanner_cache_rejects_files_and_missing_paths() {
            let root = scanner_cache_fixture();
            let file = root.join(".jait/file");
            fs::write(&file, "fixture").unwrap();
            assert_eq!(
                scoped_trivy_cache(&root, &file).unwrap_err().kind(),
                std::io::ErrorKind::PermissionDenied
            );
            assert!(scoped_trivy_cache(&root, &root.join(".jait/missing")).is_err());
            fs::remove_dir_all(root).unwrap();
        }

        #[cfg(unix)]
        #[test]
        fn scanner_cache_rejects_symlink_escapes() {
            let root = scanner_cache_fixture();
            let link = root.join(".jait/escape");
            std::os::unix::fs::symlink(root.join("outside").canonicalize().unwrap(), &link)
                .unwrap();
            assert_eq!(
                scoped_trivy_cache(&root, &link).unwrap_err().kind(),
                std::io::ErrorKind::PermissionDenied
            );
            fs::remove_dir_all(root).unwrap();
        }

        #[cfg(unix)]
        #[test]
        fn scanner_cache_rejects_retargeted_artifact_boundary() {
            let root = scanner_cache_fixture();
            fs::remove_dir_all(root.join(".jait")).unwrap();
            std::os::unix::fs::symlink(
                root.join("outside").canonicalize().unwrap(),
                root.join(".jait"),
            )
            .unwrap();
            assert_eq!(
                scoped_trivy_cache(&root, &root.join(".jait"))
                    .unwrap_err()
                    .kind(),
                std::io::ErrorKind::PermissionDenied
            );
            fs::remove_dir_all(root).unwrap();
        }

        fn fixture_command(directory: &Path, role: &str) -> Command {
            let mut command = Command::new(std::env::current_exe().unwrap());
            command
                .args(["--exact", FIXTURE, "--nocapture"])
                .env("JAIT_CLEANUP_FIXTURE", role)
                .env("JAIT_CLEANUP_DIRECTORY", directory);
            if role == "delayed" {
                command.env("JAIT_CLEANUP_DELAY_BRANCH_READY", "1");
            }
            command
        }

        fn await_file(path: &Path) {
            let deadline = Instant::now() + Duration::from_secs(5);
            while !fs::read(path).is_ok_and(|bytes| !bytes.is_empty()) {
                assert!(
                    Instant::now() < deadline,
                    "fixture readiness: {}",
                    path.display()
                );
                thread::sleep(Duration::from_millis(5));
            }
        }

        #[test]
        // Orphaning is intentional here: the parent regression verifies cleanup
        // after the peer exits, including descendants retaining inherited pipes.
        #[allow(clippy::zombie_processes)]
        fn isolated_fixture() {
            let Ok(role) = std::env::var("JAIT_CLEANUP_FIXTURE") else {
                return;
            };
            let directory = PathBuf::from(std::env::var_os("JAIT_CLEANUP_DIRECTORY").unwrap());
            if role != "leaf" {
                let next = if role == "branch" { "leaf" } else { "branch" };
                // Intentionally inherit stdout/stderr and the peer's process group.
                let mut command = fixture_command(&directory, next);
                #[cfg(unix)]
                if role == "escaped" {
                    use std::os::unix::process::CommandExt;
                    command.process_group(0);
                }
                let _descendant = command.spawn().unwrap();
                // A leaf can be ready while its parent is still initializing.
                // Publish readiness only after our direct child is ready.
                await_file(&directory.join(format!("{next}.pid")));
            }
            // Model a child that has started its leaf but has not published readiness.
            if role == "branch" && std::env::var_os("JAIT_CLEANUP_DELAY_BRANCH_READY").is_some() {
                thread::sleep(Duration::from_millis(200));
            }
            fs::write(
                directory.join(format!("{role}.pid")),
                std::process::id().to_string(),
            )
            .unwrap();
            if role == "exit" {
                return;
            }
            thread::sleep(Duration::from_secs(60));
        }

        // Independent emergency cleanup for regression failures. It only targets
        // groups created by this test and never enumerates host processes.
        struct Rescue(u32);
        impl Drop for Rescue {
            fn drop(&mut self) {
                #[cfg(unix)]
                {
                    unsafe extern "C" {
                        fn kill(pid: i32, signal: i32) -> i32;
                    }
                    unsafe {
                        kill(-(self.0 as i32), 9);
                    }
                }
                #[cfg(windows)]
                {
                    if let Ok(mut killer) = Command::new("taskkill.exe")
                        .args(["/PID", &self.0.to_string(), "/T", "/F"])
                        .stdout(Stdio::null())
                        .stderr(Stdio::null())
                        .spawn()
                    {
                        let deadline = Instant::now() + CLEANUP_TIMEOUT;
                        while matches!(killer.try_wait(), Ok(None)) && Instant::now() < deadline {
                            thread::sleep(Duration::from_millis(5));
                        }
                        let _ = killer.kill();
                        let _ = killer.try_wait();
                    }
                }
            }
        }

        fn peer(directory: &Path, role: &str) -> (OwnedChild, Rescue, mpsc::Receiver<()>) {
            let mut command = fixture_command(directory, role);
            command
                .stdin(Stdio::null())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped());
            let mut child = OwnedChild::spawn(&mut command).unwrap();
            let rescue = Rescue(child.process.id());
            let (send, receive) = mpsc::channel();
            let pipes: Vec<Box<dyn Read + Send>> = vec![
                Box::new(child.process.stdout.take().unwrap()),
                Box::new(child.process.stderr.take().unwrap()),
            ];
            for (index, mut pipe) in pipes.into_iter().enumerate() {
                let send = send.clone();
                let log = directory.join(format!("pipe-{index}.log"));
                child.readers.push(thread::spawn(move || {
                    std::io::copy(&mut pipe, &mut File::create(log).unwrap()).unwrap();
                    send.send(()).unwrap();
                }));
            }
            await_file(&directory.join(format!("{role}.pid")));
            (child, rescue, receive)
        }

        fn pipes_closed(receive: &mpsc::Receiver<()>) {
            for _ in 0..2 {
                receive
                    .recv_timeout(CLEANUP_TIMEOUT)
                    .expect("inherited pipe did not close");
            }
        }

        #[cfg(target_os = "linux")]
        fn descendants_stopped(directory: &Path) {
            for role in ["branch", "leaf"] {
                let pid = fs::read_to_string(directory.join(format!("{role}.pid"))).unwrap();
                let deadline = Instant::now() + CLEANUP_TIMEOUT;
                loop {
                    let stat = fs::read_to_string(format!("/proc/{pid}/stat")).unwrap_or_default();
                    // Orphans may remain zombies until init reaps them. Zombies
                    // cannot execute or retain pipe descriptors.
                    if stat.is_empty() || stat.rsplit_once(") ").unwrap().1.starts_with('Z') {
                        break;
                    }
                    assert!(
                        Instant::now() < deadline,
                        "descendant {pid} still running: {stat}"
                    );
                    thread::sleep(Duration::from_millis(5));
                }
            }
        }
        #[cfg(not(target_os = "linux"))]
        fn descendants_stopped(_: &Path) {} // Pipe EOF is still checked on every platform.

        #[test]
        fn peer_readiness_waits_for_intermediate_child() {
            let directory = directory();
            let (mut child, _rescue, receive) = peer(&directory, "delayed");
            assert!(
                fs::read(directory.join("branch.pid")).is_ok_and(|bytes| !bytes.is_empty()),
                "peer reported readiness before the intermediate child"
            );
            assert!(child.cleanup());
            pipes_closed(&receive);
            descendants_stopped(&directory);
        }

        #[test]
        fn panic_cleans_tree_and_inherited_pipes_without_touching_other_group() {
            let directory = directory();
            let witness_directory = self::directory();
            let mut witness_command = fixture_command(&witness_directory, "leaf");
            witness_command.stdout(Stdio::null()).stderr(Stdio::null());
            let mut witness = OwnedChild::spawn(&mut witness_command).unwrap();
            let _witness_rescue = Rescue(witness.process.id());
            await_file(&witness_directory.join("leaf.pid"));
            let (child, _rescue, receive) = peer(&directory, "hang");
            let started = Instant::now();
            assert!(
                std::panic::catch_unwind(std::panic::AssertUnwindSafe(move || {
                    let _guard = child;
                    panic!("isolated protocol/assertion failure");
                }))
                .is_err()
            );
            assert!(started.elapsed() < CLEANUP_TIMEOUT + Duration::from_secs(1));
            pipes_closed(&receive);
            descendants_stopped(&directory);
            assert!(
                witness.process.try_wait().unwrap().is_none(),
                "unrelated group was killed"
            );
            assert!(witness.cleanup());
        }

        #[test]
        fn completed_protocol_with_hung_peer_has_bounded_exit_and_cleanup() {
            let directory = directory();
            let (mut child, _rescue, receive) = peer(&directory, "hang");
            let started = Instant::now();
            let error = child
                .wait_until(Instant::now() + Duration::from_millis(100))
                .unwrap_err();
            assert_eq!(error.kind(), std::io::ErrorKind::TimedOut);
            assert!(child.cleanup());
            assert!(started.elapsed() < CLEANUP_TIMEOUT + Duration::from_secs(1));
            pipes_closed(&receive);
            descendants_stopped(&directory);
            assert!(
                child.process.try_wait().unwrap().is_some(),
                "peer was not reaped"
            );
        }

        #[test]
        fn peer_that_stops_reading_stdin_cannot_block_deadline_cleanup() {
            let directory = directory();
            let mut command = fixture_command(&directory, "leaf");
            command
                .stdin(Stdio::piped())
                .stdout(Stdio::null())
                .stderr(Stdio::null());
            let mut child = OwnedChild::spawn(&mut command).unwrap();
            let _rescue = Rescue(child.process.id());
            await_file(&directory.join("leaf.pid"));
            let input = FixtureInput::new(&mut child);
            let started = Instant::now();
            let error = input
                .write(
                    "x".repeat(4 * 1024 * 1024),
                    Instant::now() + Duration::from_millis(100),
                )
                .unwrap_err();
            assert_eq!(error.kind(), std::io::ErrorKind::TimedOut);
            drop(input);
            assert!(child.cleanup());
            assert!(started.elapsed() < CLEANUP_TIMEOUT + Duration::from_secs(1));
        }

        #[cfg(unix)]
        #[test]
        fn escaped_pipe_holder_reports_incomplete_cleanup_within_bound() {
            let directory = directory();
            let (mut child, _rescue, receive) = peer(&directory, "escaped");
            let escaped_pid = fs::read_to_string(directory.join("branch.pid"))
                .unwrap()
                .parse::<u32>()
                .unwrap();
            let escaped_rescue = Rescue(escaped_pid);
            let started = Instant::now();
            assert!(
                !child.cleanup(),
                "escaped group must not count as fully cleaned"
            );
            assert!(started.elapsed() < CLEANUP_TIMEOUT + Duration::from_secs(1));
            assert!(!child.cleanup(), "cleanup must preserve its failure result");
            // Explicitly clean the deliberately escaped fixture, then verify EOF.
            drop(escaped_rescue);
            pipes_closed(&receive);
            descendants_stopped(&directory);
        }

        // taskkill cannot discover orphans after the Windows root has exited.
        #[cfg(unix)]
        #[test]
        fn exited_peer_still_cleans_descendants_before_joining_stderr() {
            let directory = directory();
            let (mut child, _rescue, receive) = peer(&directory, "exit");
            assert!(
                child
                    .wait_until(Instant::now() + CLEANUP_TIMEOUT)
                    .unwrap()
                    .success()
            );
            assert!(
                receive.try_recv().is_err(),
                "descendants should still hold both pipes"
            );
            assert!(child.cleanup());
            pipes_closed(&receive);
            descendants_stopped(&directory);
            assert!(child.cleanup(), "repeated cleanup must be harmless");
        }
    }
}
