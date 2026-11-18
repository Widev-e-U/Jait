//! Regression: cancelling one HTTP poll must not strand every later inventory poll.
use jait_gateway::services::network_resources::{
    DockerError, DockerResourceInventory, DockerRunner, InventoryStatus,
};
use std::sync::{
    Arc,
    atomic::{AtomicUsize, Ordering},
};
use tokio::sync::Semaphore;
struct PausedRunner {
    calls: AtomicUsize,
    started: Semaphore,
    release: Semaphore,
}
impl DockerRunner for PausedRunner {
    async fn run(&self, _: &[String]) -> Result<String, DockerError> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        self.started.add_permits(1);
        self.release.acquire().await.unwrap().forget();
        Ok(String::new())
    }
}
#[tokio::test]
async fn dropping_first_poll_does_not_freeze_shared_collection() {
    let runner = Arc::new(PausedRunner {
        calls: AtomicUsize::new(0),
        started: Semaphore::new(0),
        release: Semaphore::new(0),
    });
    let inventory = Arc::new(DockerResourceInventory::new(runner.clone()));
    let first_inventory = inventory.clone();
    let first = tokio::spawn(async move { first_inventory.get().await });
    runner.started.acquire().await.unwrap().forget();
    first.abort();
    let _ = first.await;
    runner.release.add_permits(1);
    let next = tokio::time::timeout(std::time::Duration::from_millis(100), inventory.get())
        .await
        .expect("dropping first poll stranded inventory pending state");
    assert_eq!(next.status, InventoryStatus::Available);
    assert_eq!(
        runner.calls.load(Ordering::SeqCst),
        1,
        "a detached subscriber must not restart or duplicate the collection"
    );
    assert_eq!(inventory.get().await.status, InventoryStatus::Available);
}
