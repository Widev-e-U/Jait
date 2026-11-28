use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PlaybackAction {
    Start,
    Read,
    Stop,
}

#[cfg(not(windows))]
#[derive(Default)]
pub struct MeetingPlayback;

#[cfg(not(windows))]
impl MeetingPlayback {
    pub fn handle(&self, _action: PlaybackAction) -> Result<String, String> {
        Err("System playback capture is only available on Windows.".into())
    }
}

#[cfg(windows)]
mod windows_capture {
    use std::collections::VecDeque;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{mpsc, Arc};
    use std::thread;
    use std::time::{Duration, Instant};

    use base64::{engine::general_purpose::STANDARD, Engine};
    use parking_lot::Mutex;
    use wasapi::{DeviceEnumerator, Direction, SampleType, StreamMode, WaveFormat};

    use super::PlaybackAction;

    const SAMPLE_RATE: u32 = 16000;
    const BYTES_PER_SECOND: usize = SAMPLE_RATE as usize * 4;
    const MAX_BUFFER: usize = BYTES_PER_SECOND / 2;
    const START_TIMEOUT: Duration = Duration::from_secs(3);
    const IDLE_TIMEOUT: Duration = Duration::from_secs(10);

    struct Capture {
        stopped: AtomicBool,
        ended: AtomicBool,
        queue: Mutex<VecDeque<u8>>,
        last_read: Mutex<Instant>,
    }

    #[derive(Default)]
    pub struct MeetingPlayback(Mutex<Option<Arc<Capture>>>);

    impl MeetingPlayback {
        pub fn handle(&self, action: PlaybackAction) -> Result<String, String> {
            let mut slot = self.0.lock();
            match action {
                PlaybackAction::Start => {
                    if slot
                        .as_ref()
                        .is_some_and(|capture| !capture.ended.load(Ordering::Acquire))
                    {
                        return Err("System playback is already being captured.".into());
                    }
                    let capture = Arc::new(Capture {
                        stopped: AtomicBool::new(false),
                        ended: AtomicBool::new(false),
                        queue: Mutex::new(VecDeque::with_capacity(MAX_BUFFER)),
                        last_read: Mutex::new(Instant::now()),
                    });
                    let worker = capture.clone();
                    let (ready, started) = mpsc::sync_channel(1);
                    thread::Builder::new()
                        .name("meeting-playback".into())
                        .spawn(move || {
                            with_audio_client(&worker, &ready);
                            worker.ended.store(true, Ordering::Release);
                        })
                        .map_err(|_| "Could not start Windows system audio capture.")?;
                    if !matches!(started.recv_timeout(START_TIMEOUT), Ok(true)) {
                        capture.stopped.store(true, Ordering::Release);
                        return Err("Could not capture the Windows default playback device.".into());
                    }
                    *slot = Some(capture);
                    Ok(String::new())
                }
                PlaybackAction::Read => {
                    let capture = slot
                        .as_ref()
                        .filter(|capture| !capture.ended.load(Ordering::Acquire))
                        .ok_or("Windows system audio capture has stopped.")?;
                    *capture.last_read.lock() = Instant::now();
                    let bytes: Vec<u8> = capture.queue.lock().drain(..).collect();
                    Ok(STANDARD.encode(bytes))
                }
                PlaybackAction::Stop => {
                    if let Some(capture) = slot.take() {
                        capture.stopped.store(true, Ordering::Release);
                    }
                    Ok(String::new())
                }
            }
        }
    }

    fn with_audio_client(capture: &Capture, ready: &mpsc::SyncSender<bool>) {
        if wasapi::initialize_mta().ok().is_err() {
            let _ = ready.send(false);
            return;
        }
        let _ = run_capture(capture, ready);
        wasapi::deinitialize();
    }

    fn run_capture(
        capture: &Capture,
        ready: &mpsc::SyncSender<bool>,
    ) -> Result<(), wasapi::WasapiError> {
        let enumerator = DeviceEnumerator::new()?;
        let device = enumerator.get_default_device(Direction::Render)?;
        let mut client = device.get_iaudioclient()?;
        let format = WaveFormat::new(32, 32, SampleType::Float, SAMPLE_RATE as usize, 1, None);
        client.initialize_client(
            &format,
            Direction::Capture,
            StreamMode::PollingShared {
                autoconvert: true,
                buffer_duration_hns: 1_000_000,
            },
            None,
        )?;
        let input = client.get_audiocaptureclient()?;
        client.start_stream()?;
        let _ = ready.send(true);
        let deadline = Instant::now() + Duration::from_secs(7200);
        while !capture.stopped.load(Ordering::Acquire)
            && Instant::now() < deadline
            && capture.last_read.lock().elapsed() < IDLE_TIMEOUT
        {
            while input.get_next_packet_size()?.unwrap_or(0) > 0 {
                let mut queue = capture.queue.lock();
                input.read_from_device_to_deque(&mut queue)?;
                if queue.len() > MAX_BUFFER {
                    let excess = queue.len() - MAX_BUFFER;
                    queue.drain(..excess);
                }
            }
            thread::sleep(Duration::from_millis(15));
        }
        client.stop_stream()
    }
}

#[cfg(windows)]
pub use windows_capture::MeetingPlayback;
