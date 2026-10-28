//! Candidate desktop parent-pipe lifecycle. This module is deliberately not wired
//! into a production entrypoint. The owner must be retained until `run` returns.
//!
//! Startup and completion must supervise and join their own work, observe stop,
//! and finish only after cleanup. No task is spawned here. Dropping a `run`
//! future preserves all state; dropping the owner abandons that responsibility.
//! A shutdown deadline is reported once, without dropping either future. The caller
//! must retain and drive the owner or deliberately decide how to handle a stuck
//! process. This differs from Node's forced exit and is not host integration or
//! full Node parity; the host's own kill deadline and launch behavior still apply.
use std::{future::Future, io, pin::Pin, time::Duration};
use tokio::{
    io::{AsyncRead, ReadBuf},
    sync::watch,
};

const READ_SIZE: usize = 256;
// Bound consecutive input processing so a noisy parent cannot starve startup or
// runtime completion. At the boundary a ready lifecycle future gets priority.
const INPUT_BUDGET: usize = 4096;
type Lifecycle = Pin<Box<dyn Future<Output = io::Result<()>> + Send>>;

pub struct DesktopParentPipe<R, F> {
    input: R,
    ready: F,
    port: u16,
    startup: Option<Lifecycle>,
    completion: Option<Lifecycle>,
    stop: watch::Sender<bool>,
    stopping: bool,
    shutdown_timeout: Duration,
    deadline: Option<Pin<Box<tokio::time::Sleep>>>,
    error: Option<io::Error>,
    line_len: usize,
    line_matches: bool,
    after_cr: bool,
    input_budget: usize,
    finished: bool,
}

impl<R, F> DesktopParentPipe<R, F>
where
    R: AsyncRead + Unpin,
    F: FnMut(&str) -> io::Result<()>,
{
    /// Both factories receive the same stop signal and must supervise their work.
    /// The deadline begins at the first stop request, including errors and EOF.
    /// `completion` must supervise the runtime and react to the supplied watch
    /// receiver. The synchronous readiness callback must write the entire marker
    /// or return an error; it must not re-enter this owner.
    pub fn new<S, C, MakeStartup, MakeCompletion>(
        input: R,
        port: u16,
        make_startup: MakeStartup,
        make_completion: MakeCompletion,
        ready: F,
        shutdown_timeout: Duration,
    ) -> Self
    where
        S: Future<Output = io::Result<()>> + Send + 'static,
        C: Future<Output = io::Result<()>> + Send + 'static,
        MakeStartup: FnOnce(watch::Receiver<bool>) -> S,
        MakeCompletion: FnOnce(watch::Receiver<bool>) -> C,
    {
        let (stop, receiver) = watch::channel(false);
        Self {
            input,
            ready,
            port,
            startup: Some(Box::pin(make_startup(receiver.clone()))),
            completion: Some(Box::pin(make_completion(receiver))),
            stop,
            stopping: false,
            shutdown_timeout,
            deadline: None,
            error: None,
            line_len: 0,
            line_matches: true,
            after_cr: false,
            input_budget: 0,
            finished: false,
        }
    }

    fn request_stop(&mut self) {
        if !self.stopping {
            self.stopping = true;
            self.stop.send_replace(true);
            self.deadline = Some(Box::pin(tokio::time::sleep(self.shutdown_timeout)));
        }
    }

    fn fail(&mut self, error: io::Error) {
        if self.error.is_none() {
            self.error = Some(error);
        }
        self.request_stop();
    }

    fn line_end(&mut self) {
        if self.line_matches && self.line_len == 4 {
            self.request_stop();
        }
        self.line_len = 0;
        self.line_matches = true;
    }

    fn consume(&mut self, bytes: &[u8]) {
        for &byte in bytes {
            if self.after_cr {
                self.after_cr = false;
                if byte == b'\n' {
                    continue;
                }
            }
            match byte {
                b'\r' => {
                    self.line_end();
                    self.after_cr = true;
                }
                b'\n' => self.line_end(),
                _ => {
                    if self.line_len >= 4 || b"stop"[self.line_len] != byte {
                        self.line_matches = false;
                    }
                    // Only the first four bytes can match; do not grow on long lines.
                    self.line_len = self.line_len.saturating_add(1).min(5);
                }
            }
        }
    }

    /// Drive startup, parent control and supervised completion. Cancelling this
    /// borrow does not drop any of them. On failure, request stop and retain the
    /// first error until startup and supervised cleanup have both completed. If
    /// the shutdown deadline expires, return `TimedOut` once while retaining
    /// both futures and the first error. Calling `run` again continues cleanup
    /// without a second deadline. The caller owns any escalation policy.
    pub async fn run(&mut self) -> io::Result<()> {
        if self.finished {
            return Err(io::Error::other("desktop lifecycle already completed"));
        }
        loop {
            if self.startup.is_none() && self.completion.is_none() {
                self.finished = true;
                return match self.error.take() {
                    Some(error) => Err(error),
                    None => Ok(()),
                };
            }
            // Keep input on the stack instead of allocating for each read.
            #[allow(clippy::large_enum_variant)]
            enum Event {
                Input(io::Result<usize>, [u8; READ_SIZE]),
                Startup(io::Result<()>, Option<io::Result<()>>),
                Completion(io::Result<()>),
                Deadline,
            }
            let event = std::future::poll_fn(|cx| {
                use std::task::Poll;
                let mut poll_lifecycle = |cx: &mut std::task::Context<'_>| {
                    // A completed runtime takes precedence over readiness when
                    // both are observable in the same poll.
                    if let Some(completion) = &mut self.completion
                        && let Poll::Ready(result) = completion.as_mut().poll(cx)
                    {
                        return Some(Event::Completion(result));
                    }
                    if let Some(startup) = &mut self.startup
                        && let Poll::Ready(result) = startup.as_mut().poll(cx)
                    {
                        // Startup can itself make completion ready. Recheck
                        // before publishing readiness, without repolling startup.
                        let completion = self.completion.as_mut().and_then(|completion| {
                            match completion.as_mut().poll(cx) {
                                Poll::Ready(result) => Some(result),
                                Poll::Pending => None,
                            }
                        });
                        return Some(Event::Startup(result, completion));
                    }
                    None
                };
                if (self.input_budget >= INPUT_BUDGET || self.stopping)
                    && let Some(event) = poll_lifecycle(cx)
                {
                    return Poll::Ready(event);
                }
                if !self.stopping {
                    let mut bytes = [0; READ_SIZE];
                    let mut read_buf = ReadBuf::new(&mut bytes);
                    match Pin::new(&mut self.input).poll_read(cx, &mut read_buf) {
                        Poll::Ready(Ok(())) => {
                            let n = read_buf.filled().len();
                            return Poll::Ready(Event::Input(Ok(n), bytes));
                        }
                        Poll::Ready(Err(error)) => {
                            return Poll::Ready(Event::Input(Err(error), bytes));
                        }
                        Poll::Pending => {}
                    }
                }
                if self.input_budget < INPUT_BUDGET
                    && !self.stopping
                    && let Some(event) = poll_lifecycle(cx)
                {
                    return Poll::Ready(event);
                }
                if let Some(deadline) = &mut self.deadline
                    && deadline.as_mut().poll(cx).is_ready()
                {
                    return Poll::Ready(Event::Deadline);
                }
                Poll::Pending
            })
            .await;
            match event {
                Event::Deadline => {
                    self.deadline = None;
                    return Err(io::Error::new(
                        io::ErrorKind::TimedOut,
                        "desktop shutdown deadline exceeded; cleanup remains owned",
                    ));
                }
                Event::Input(Ok(0), _) => self.request_stop(),
                Event::Input(Ok(n), bytes) => {
                    self.input_budget = self.input_budget.saturating_add(n);
                    self.consume(&bytes[..n]);
                    if self.input_budget >= INPUT_BUDGET {
                        tokio::task::yield_now().await;
                    }
                }
                Event::Input(Err(error), _) => self.fail(error),
                Event::Startup(result, completion) => {
                    self.input_budget = 0;
                    self.startup = None;
                    if let Some(completion) = completion {
                        self.completion = None;
                        match completion {
                            Err(error) => self.fail(error),
                            Ok(()) => self.request_stop(),
                        }
                    }
                    match result {
                        Ok(()) if !self.stopping => {
                            if let Err(error) =
                                (self.ready)(&format!("JAIT_DESKTOP_READY {}\n", self.port))
                            {
                                self.fail(error);
                            }
                        }
                        Err(error) => self.fail(error),
                        _ => {}
                    }
                }
                Event::Completion(result) => {
                    self.input_budget = 0;
                    self.completion = None;
                    if let Err(error) = result {
                        self.fail(error);
                    } else {
                        self.request_stop();
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        sync::{Arc, Mutex},
        time::Duration,
    };
    use tokio::{io::AsyncWriteExt, sync::oneshot, time::timeout};

    async fn supervisor(mut stop: watch::Receiver<bool>) -> io::Result<()> {
        while !*stop.borrow_and_update() {
            stop.changed().await.map_err(io::Error::other)?;
        }
        Ok(())
    }
    type CapturedOutput = Arc<Mutex<Vec<String>>>;

    fn output() -> (CapturedOutput, impl FnMut(&str) -> io::Result<()>) {
        let result = Arc::new(Mutex::new(Vec::new()));
        let captured = result.clone();
        (result, move |s| {
            captured.lock().unwrap().push(s.into());
            Ok(())
        })
    }

    #[tokio::test]
    async fn exact_lines_ignored_input_and_ready_then_stop() {
        let (mut parent, child) = tokio::io::duplex(128);
        let (seen, ready) = output();
        let mut owner = DesktopParentPipe::new(
            child,
            1234,
            |_| async { Ok(()) },
            supervisor,
            ready,
            Duration::from_secs(1),
        );
        parent.write_all(b"stopx\n stop\r\nSTOP\n").await.unwrap();
        assert!(
            timeout(Duration::from_millis(10), owner.run())
                .await
                .is_err()
        );
        assert_eq!(*seen.lock().unwrap(), ["JAIT_DESKTOP_READY 1234\n"]);
        parent.write_all(b"stop\r\nstop\n").await.unwrap();
        owner.run().await.unwrap();
    }

    #[tokio::test]
    async fn stop_and_eof_suppress_readiness_during_startup() {
        for eof in [false, true] {
            let (mut parent, child) = tokio::io::duplex(128);
            let (tx, rx) = oneshot::channel();
            let (seen, ready) = output();
            let mut owner = DesktopParentPipe::new(
                child,
                1234,
                |_| async {
                    rx.await.unwrap();
                    Ok(())
                },
                supervisor,
                ready,
                Duration::from_secs(1),
            );
            if eof {
                drop(parent);
            } else {
                parent.write_all(b"stop\n").await.unwrap();
            }
            assert!(
                timeout(Duration::from_millis(10), owner.run())
                    .await
                    .is_err()
            );
            tx.send(()).unwrap();
            owner.run().await.unwrap();
            assert!(seen.lock().unwrap().is_empty());
        }
    }

    #[tokio::test]
    async fn cancellation_preserves_partial_line_and_cleanup() {
        let (mut parent, child) = tokio::io::duplex(128);
        let (clean_tx, clean_rx) = oneshot::channel();
        let (seen, ready) = output();
        let mut owner = DesktopParentPipe::new(
            child,
            1234,
            |_| async { Ok(()) },
            move |mut stop: watch::Receiver<bool>| async move {
                while !*stop.borrow_and_update() {
                    stop.changed().await.unwrap();
                }
                clean_rx.await.unwrap();
                Ok(())
            },
            ready,
            Duration::from_secs(1),
        );
        parent.write_all(b"st").await.unwrap();
        assert!(
            timeout(Duration::from_millis(10), owner.run())
                .await
                .is_err()
        );
        parent.write_all(b"op\n").await.unwrap();
        assert!(
            timeout(Duration::from_millis(10), owner.run())
                .await
                .is_err()
        );
        clean_tx.send(()).unwrap();
        owner.run().await.unwrap();
        assert_eq!(seen.lock().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn unterminated_stop_at_eof_and_simultaneous_startup() {
        for input in [&b"stop"[..], &b"stop\r\n"[..]] {
            let (mut parent, child) = tokio::io::duplex(128);
            parent.write_all(input).await.unwrap();
            drop(parent);
            let (seen, ready) = output();
            let mut owner = DesktopParentPipe::new(
                child,
                4321,
                |_| async { Ok(()) },
                supervisor,
                ready,
                Duration::from_secs(1),
            );
            owner.run().await.unwrap();
            assert!(seen.lock().unwrap().is_empty());
        }
    }

    #[tokio::test]
    async fn long_ignored_line_is_bounded_and_startup_makes_progress() {
        let (mut parent, child) = tokio::io::duplex(8192);
        parent.write_all(&vec![b'x'; 6000]).await.unwrap();
        let (seen, ready) = output();
        let mut owner = DesktopParentPipe::new(
            child,
            1234,
            |_| async { Ok(()) },
            supervisor,
            ready,
            Duration::from_secs(1),
        );
        assert!(
            timeout(Duration::from_millis(10), owner.run())
                .await
                .is_err()
        );
        assert_eq!(owner.line_len, 5);
        assert_eq!(seen.lock().unwrap().len(), 1);
        parent.write_all(b"\nstop\n").await.unwrap();
        owner.run().await.unwrap();
    }

    #[tokio::test]
    async fn startup_failure_requests_stop_and_waits_for_cleanup() {
        let (_parent, child) = tokio::io::duplex(128);
        let (clean_tx, clean_rx) = oneshot::channel();
        let (seen, ready) = output();
        let mut owner = DesktopParentPipe::new(
            child,
            1234,
            |_| async { Err(io::Error::other("startup")) },
            move |mut stop: watch::Receiver<bool>| async move {
                while !*stop.borrow_and_update() {
                    stop.changed().await.unwrap();
                }
                clean_rx.await.unwrap();
                Ok(())
            },
            ready,
            Duration::from_secs(1),
        );
        assert!(
            timeout(Duration::from_millis(10), owner.run())
                .await
                .is_err()
        );
        clean_tx.send(()).unwrap();
        assert_eq!(owner.run().await.unwrap_err().to_string(), "startup");
        assert!(seen.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn completion_precedes_simultaneous_startup() {
        let (_parent, child) = tokio::io::duplex(128);
        let (seen, ready) = output();
        let mut owner = DesktopParentPipe::new(
            child,
            1234,
            |_| async { Ok(()) },
            |_| async { Err(io::Error::other("runtime failed")) },
            ready,
            Duration::from_secs(1),
        );
        assert_eq!(owner.run().await.unwrap_err().to_string(), "runtime failed");
        assert!(seen.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn startup_can_make_completion_ready_before_marker() {
        let (_parent, child) = tokio::io::duplex(128);
        let (tx, rx) = oneshot::channel();
        let (seen, ready) = output();
        let mut owner = DesktopParentPipe::new(
            child,
            1234,
            move |_| async move {
                tx.send(()).unwrap();
                Ok(())
            },
            move |_| async move {
                rx.await.unwrap();
                Err(io::Error::other("runtime failed"))
            },
            ready,
            Duration::from_secs(1),
        );
        assert_eq!(owner.run().await.unwrap_err().to_string(), "runtime failed");
        assert!(seen.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn stop_reaches_startup_and_cleanup_survives_deadline_and_cancel() {
        let (mut parent, child) = tokio::io::duplex(128);
        let (observed_tx, observed_rx) = oneshot::channel();
        let (release_tx, release_rx) = oneshot::channel();
        let (seen, ready) = output();
        let mut owner = DesktopParentPipe::new(
            child,
            1234,
            move |mut stop: watch::Receiver<bool>| async move {
                while !*stop.borrow_and_update() {
                    stop.changed().await.unwrap();
                }
                observed_tx.send(()).unwrap();
                release_rx.await.unwrap();
                Ok(())
            },
            supervisor,
            ready,
            Duration::from_millis(40),
        );
        parent.write_all(b"stop\n").await.unwrap();
        assert!(
            timeout(Duration::from_millis(10), owner.run())
                .await
                .is_err()
        );
        observed_rx.await.unwrap();
        assert_eq!(
            owner.run().await.unwrap_err().kind(),
            io::ErrorKind::TimedOut
        );
        assert!(seen.lock().unwrap().is_empty());
        release_tx.send(()).unwrap();
        owner.run().await.unwrap();
    }

    #[tokio::test]
    async fn deadline_preserves_first_failure_for_later_cleanup() {
        let (_parent, child) = tokio::io::duplex(128);
        let (release_tx, release_rx) = oneshot::channel();
        let (_, ready) = output();
        let mut owner = DesktopParentPipe::new(
            child,
            1234,
            move |_| async move {
                release_rx.await.unwrap();
                Ok(())
            },
            |_| async { Err(io::Error::other("runtime failed")) },
            ready,
            Duration::from_millis(10),
        );
        assert_eq!(
            owner.run().await.unwrap_err().kind(),
            io::ErrorKind::TimedOut
        );
        release_tx.send(()).unwrap();
        assert_eq!(owner.run().await.unwrap_err().to_string(), "runtime failed");
    }
}
