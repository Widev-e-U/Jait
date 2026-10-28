//! Candidate desktop parent-pipe lifecycle. This module is deliberately not wired
//! into a production entrypoint. The owner must be retained until `run` returns.
//!
//! The runtime completion future must own and join its runtime work, observe the
//! stop receiver, and finish only after cleanup. No task is spawned here. Dropping
//! a `run` future is safe: input parsing, startup, and completion remain owned by
//! the candidate. Dropping the candidate itself abandons that responsibility.
use std::{future::Future, io, pin::Pin};
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
    /// `completion` must supervise the runtime and react to the supplied watch
    /// receiver. The synchronous readiness callback must write the entire marker
    /// or return an error; it must not re-enter this owner.
    pub fn new<S, C, MakeCompletion>(
        input: R,
        port: u16,
        startup: S,
        make_completion: MakeCompletion,
        ready: F,
    ) -> Self
    where
        S: Future<Output = io::Result<()>> + Send + 'static,
        C: Future<Output = io::Result<()>> + Send + 'static,
        MakeCompletion: FnOnce(watch::Receiver<bool>) -> C,
    {
        let (stop, receiver) = watch::channel(false);
        Self {
            input,
            ready,
            port,
            startup: Some(Box::pin(startup)),
            completion: Some(Box::pin(make_completion(receiver))),
            stop,
            stopping: false,
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
    /// first error until startup and supervised cleanup have both completed.
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
            enum Event {
                Input(io::Result<usize>, [u8; READ_SIZE]),
                Startup(io::Result<()>),
                Completion(io::Result<()>),
            }
            let event = std::future::poll_fn(|cx| {
                use std::task::Poll;
                let mut poll_lifecycle = |cx: &mut std::task::Context<'_>| {
                    if let Some(startup) = &mut self.startup {
                        if let Poll::Ready(result) = startup.as_mut().poll(cx) {
                            return Some(Event::Startup(result));
                        }
                    }
                    if let Some(completion) = &mut self.completion {
                        if let Poll::Ready(result) = completion.as_mut().poll(cx) {
                            return Some(Event::Completion(result));
                        }
                    }
                    None
                };
                if self.input_budget >= INPUT_BUDGET || self.stopping {
                    if let Some(event) = poll_lifecycle(cx) {
                        return Poll::Ready(event);
                    }
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
                if self.input_budget < INPUT_BUDGET && !self.stopping {
                    if let Some(event) = poll_lifecycle(cx) {
                        return Poll::Ready(event);
                    }
                }
                Poll::Pending
            })
            .await;
            match event {
                Event::Input(Ok(0), _) => self.request_stop(),
                Event::Input(Ok(n), bytes) => {
                    self.input_budget = self.input_budget.saturating_add(n);
                    self.consume(&bytes[..n]);
                    if self.input_budget >= INPUT_BUDGET {
                        tokio::task::yield_now().await;
                    }
                }
                Event::Input(Err(error), _) => self.fail(error),
                Event::Startup(result) => {
                    self.input_budget = 0;
                    self.startup = None;
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

    fn supervisor(mut stop: watch::Receiver<bool>) -> impl Future<Output = io::Result<()>> + Send {
        async move {
            while !*stop.borrow_and_update() {
                stop.changed().await.map_err(io::Error::other)?;
            }
            Ok(())
        }
    }
    fn output() -> (Arc<Mutex<Vec<String>>>, impl FnMut(&str) -> io::Result<()>) {
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
        let mut owner = DesktopParentPipe::new(child, 1234, async { Ok(()) }, supervisor, ready);
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
                async {
                    rx.await.unwrap();
                    Ok(())
                },
                supervisor,
                ready,
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
            async { Ok(()) },
            move |mut stop: watch::Receiver<bool>| async move {
                while !*stop.borrow_and_update() {
                    stop.changed().await.unwrap();
                }
                clean_rx.await.unwrap();
                Ok(())
            },
            ready,
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
            let mut owner =
                DesktopParentPipe::new(child, 4321, async { Ok(()) }, supervisor, ready);
            owner.run().await.unwrap();
            assert!(seen.lock().unwrap().is_empty());
        }
    }

    #[tokio::test]
    async fn long_ignored_line_is_bounded_and_startup_makes_progress() {
        let (mut parent, child) = tokio::io::duplex(8192);
        parent.write_all(&vec![b'x'; 6000]).await.unwrap();
        let (seen, ready) = output();
        let mut owner = DesktopParentPipe::new(child, 1234, async { Ok(()) }, supervisor, ready);
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
            async { Err(io::Error::other("startup")) },
            move |mut stop: watch::Receiver<bool>| async move {
                while !*stop.borrow_and_update() {
                    stop.changed().await.unwrap();
                }
                clean_rx.await.unwrap();
                Ok(())
            },
            ready,
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
}
