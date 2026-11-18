use super::*;
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};
struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let path = PathBuf::from(
            option_env!("JAIT_PROJECT_SEARCH_REPO_ROOT")
                .unwrap_or(concat!(env!("CARGO_MANIFEST_DIR"), "/../..")),
        )
        .join(".jait/artifacts/gateway-rust/parallel-implementation/project-search-fixtures")
        .join(format!(
            "watch-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&path).unwrap();
        Self(fs::canonicalize(path).unwrap())
    }
    fn root(&self) -> ProjectRoot {
        ProjectRoot::open(&self.0).unwrap()
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
fn event(path: &str, kind: FileChangeType) -> FileChangeEvent {
    FileChangeEvent {
        path: path.into(),
        kind,
    }
}
fn opts() -> ProjectWatcherOptions {
    ProjectWatcherOptions {
        allow_generated_root: true,
        reconcile_interval: Duration::from_millis(100),
        coalesce: Duration::from_millis(20),
        ..Default::default()
    }
}
fn until(mut predicate: impl FnMut() -> bool) {
    let deadline = Instant::now() + Duration::from_secs(5);
    while !predicate() {
        assert!(Instant::now() < deadline, "watch condition deadline");
        thread::sleep(Duration::from_millis(5));
    }
}
#[test]
fn coalescing_preserves_case_order_and_reference_transitions() {
    use FileChangeType::*;
    assert_eq!(
        coalesce_events([
            event("a", Created),
            event("a", Updated),
            event("a", Deleted)
        ]),
        vec![]
    );
    assert_eq!(
        coalesce_events([
            event("a", Deleted),
            event("b", Created),
            event("a", Created),
            event("B", Updated)
        ]),
        vec![
            event("a", Updated),
            event("b", Created),
            event("B", Updated)
        ]
    );
    assert_eq!(
        coalesce_events([
            event("a", Created),
            event("b", Updated),
            event("a", Deleted),
            event("a", Created)
        ]),
        vec![event("b", Updated), event("a", Created)]
    );
}
#[test]
fn bounded_delivery_reports_loss_without_blocking_control() {
    let shared = Shared {
        state: AtomicU8::new(1),
        lost: AtomicBool::new(false),
        error: Mutex::new(None),
        wake: (Mutex::new(false), Condvar::new()),
    };
    let (sender, receiver) = mpsc::sync_channel(1);
    let mut emit = Emitter {
        sender,
        shared: &shared,
        pending: vec![],
        bytes: 0,
        since: None,
        max_events: 1,
        max_bytes: 128,
    };
    emit.push(event("a", FileChangeType::Created)).unwrap();
    emit.push(event("b", FileChangeType::Created)).unwrap();
    assert!(shared.lost.load(Ordering::Acquire));
    assert!(receiver.try_recv().is_ok());
    emit.push(event(&"x".repeat(1024), FileChangeType::Created))
        .unwrap();
    assert!(emit.pending.is_empty());
}
#[cfg(unix)]
#[test]
fn live_watch_exclusions_nested_creation_stop_and_permit_release() {
    let fixture = Fixture::new();
    let supervisor = WatcherSupervisor::new(1).unwrap();
    assert!(
        supervisor
            .watch(
                fixture.root(),
                ProjectWatcherOptions::default(),
                Cancellation::default()
            )
            .unwrap()
            .is_none()
    );
    let mut watcher = supervisor
        .watch(fixture.root(), opts(), Cancellation::default())
        .unwrap()
        .unwrap();
    until(|| watcher.state() != WatchState::Starting);
    assert_eq!(
        watcher.state(),
        WatchState::Watching,
        "{:?}",
        watcher.error()
    );
    assert!(
        supervisor
            .watch(fixture.root(), opts(), Cancellation::default())
            .is_err()
    );
    fs::create_dir(fixture.0.join("src")).unwrap();
    fs::write(fixture.0.join("src/file.txt"), "one").unwrap();
    fs::create_dir(fixture.0.join("node_modules")).unwrap();
    fs::write(fixture.0.join("node_modules/noise"), "x").unwrap();
    let mut observed = Vec::new();
    until(|| {
        while let Ok(batch) = watcher.try_recv() {
            observed.extend(batch.changes);
        }
        observed
            .iter()
            .any(|e| e.path == "src/file.txt" && e.kind == FileChangeType::Created)
    });
    assert!(observed.iter().all(|e| !e.path.contains("node_modules")));
    fs::remove_file(fixture.0.join("src/file.txt")).unwrap();
    until(|| {
        while let Ok(batch) = watcher.try_recv() {
            if batch
                .changes
                .iter()
                .any(|e| e.path == "src/file.txt" && e.kind == FileChangeType::Deleted)
            {
                return true;
            }
        }
        false
    });
    watcher.stop();
    assert_eq!(watcher.state(), WatchState::Stopped);
    let mut replacement = supervisor
        .watch(fixture.root(), opts(), Cancellation::default())
        .unwrap()
        .unwrap();
    replacement.stop();
}
#[cfg(unix)]
#[test]
fn external_cancel_and_drop_join_workers_even_with_full_channel() {
    let fixture = Fixture::new();
    let supervisor = WatcherSupervisor::new(1).unwrap();
    let cancel = Cancellation::default();
    let mut options = opts();
    options.channel_capacity = 1;
    options.max_batch_size = 1;
    let watcher = supervisor
        .watch(fixture.root(), options, cancel.clone())
        .unwrap()
        .unwrap();
    until(|| watcher.state() != WatchState::Starting);
    assert!(watcher.watching());
    for n in 0..20 {
        fs::write(fixture.0.join(format!("file{n}")), "x").unwrap();
    }
    cancel.cancel();
    until(|| watcher.state() == WatchState::Stopped);
    drop(watcher);
    let replacement = supervisor
        .watch(fixture.root(), opts(), Cancellation::default())
        .unwrap()
        .unwrap();
    drop(replacement);
    assert!(
        supervisor
            .watch(fixture.root(), opts(), Cancellation::default())
            .is_ok()
    );
}
#[cfg(unix)]
#[test]
fn watcher_lease_expires_and_never_reports_complete_subscription_after_budget_failure() {
    let fixture = Fixture::new();
    let supervisor = WatcherSupervisor::new(1).unwrap();
    let mut options = opts();
    options.lifetime = Duration::from_millis(100);
    let watcher = supervisor
        .watch(fixture.root(), options, Cancellation::default())
        .unwrap()
        .unwrap();
    until(|| watcher.state() == WatchState::Failed);
    assert_eq!(
        watcher.error().as_deref(),
        Some("project operation timed out")
    );
    drop(watcher);
    for n in 0..3 {
        fs::write(fixture.0.join(format!("file{n}")), "x").unwrap();
    }
    let mut options = opts();
    options.budgets.max_files = 1;
    let watcher = supervisor
        .watch(fixture.root(), options, Cancellation::default())
        .unwrap()
        .unwrap();
    until(|| watcher.state() == WatchState::Failed);
    assert!(watcher.error().unwrap().contains("budget"));
}

#[cfg(unix)]
#[test]
fn delivered_native_changes_do_not_reappear_in_snapshot_recovery() {
    let fixture = Fixture::new();
    fs::write(fixture.0.join("file.txt"), "before").unwrap();
    let cancel = Cancellation::default();
    let index_options = IndexOptions {
        include_ignored_files: true,
        ..Default::default()
    };
    let mut previous =
        project_search::build_index(&fixture.root(), &index_options, &cancel).unwrap();
    fs::write(fixture.0.join("file.txt"), "after update").unwrap();
    fs::write(fixture.0.join("new.txt"), "new").unwrap();
    for (path, kind) in [
        ("file.txt", FileChangeType::Updated),
        ("new.txt", FileChangeType::Created),
    ] {
        assert!(
            acknowledge_native_event(&mut previous, &event(path, kind), &Budgets::default())
                .unwrap()
        );
    }
    let next = project_search::build_index(&fixture.root(), &index_options, &cancel).unwrap();
    let shared = Shared {
        state: AtomicU8::new(1),
        lost: AtomicBool::new(false),
        error: Mutex::new(None),
        wake: (Mutex::new(false), Condvar::new()),
    };
    let (sender, receiver) = mpsc::sync_channel(1);
    let mut emitter = Emitter {
        sender,
        shared: &shared,
        pending: vec![],
        bytes: 0,
        since: None,
        max_events: 500,
        max_bytes: 256 * 1024,
    };
    diff(&previous, &next, &mut emitter, &cancel).unwrap();
    assert!(emitter.pending.is_empty());
    assert!(receiver.try_recv().is_err());
    assert_eq!(previous.coverage.files, next.coverage.files);
    assert_eq!(previous.coverage.path_bytes, next.coverage.path_bytes);
    let narrow = Budgets {
        max_files: 2,
        ..Default::default()
    };
    fs::write(fixture.0.join("extra.txt"), "extra").unwrap();
    assert!(
        acknowledge_native_event(
            &mut previous,
            &event("extra.txt", FileChangeType::Created),
            &narrow
        )
        .is_err()
    );
    assert!(!previous.entries.contains_key("extra.txt"));
}

#[cfg(unix)]
#[test]
fn deleting_native_directory_keeps_children_for_recovery_and_rejects_links() {
    let fixture = Fixture::new();
    fs::create_dir(fixture.0.join("nested")).unwrap();
    fs::write(fixture.0.join("nested/child.txt"), "child").unwrap();
    let cancel = Cancellation::default();
    let mut previous =
        project_search::build_index(&fixture.root(), &IndexOptions::default(), &cancel).unwrap();
    fs::remove_dir_all(fixture.0.join("nested")).unwrap();
    assert!(
        acknowledge_native_event(
            &mut previous,
            &event("nested", FileChangeType::Deleted),
            &Budgets::default()
        )
        .unwrap()
    );
    assert!(previous.entries.contains_key("nested/child.txt"));
    std::os::unix::fs::symlink("/etc/passwd", fixture.0.join("link")).unwrap();
    assert!(
        !acknowledge_native_event(
            &mut previous,
            &event("link", FileChangeType::Created),
            &Budgets::default()
        )
        .unwrap()
    );
    assert!(!previous.entries.contains_key("link"));
}

#[test]
fn native_event_reads_observe_cancel_and_deadline() {
    let fixture = Fixture::new();
    let root = fixture.root();
    let mut native = Native::new(&root).unwrap();
    // Queued events must not cause path inspection after cancellation.
    fs::write(fixture.0.join("queued.txt"), "queued").unwrap();
    let cancelled = Cancellation::default();
    cancelled.cancel();
    let operation = project_search::Operation::new(Duration::from_secs(1), &cancelled);
    assert!(matches!(
        native.read(&root, &operation),
        Err(Error::Cancelled)
    ));
    let operation = project_search::Operation::new(Duration::ZERO, &Cancellation::default());
    assert!(matches!(
        native.read(&root, &operation),
        Err(Error::TimedOut)
    ));
}
