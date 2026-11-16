# Recording a browser demo

`browser.record` records the viewport of the browser shared with the current chat. Call it with `action: "start"`, perform the browser interactions, then call it with `action: "stop"`. `action: "status"` reports whether a recording exists. The stop result contains the MP4 path under the project's `.jait/artifacts/`. Capture ends automatically after 60 seconds; call stop to retrieve the result. Only one recording may be active per chat.

To record the Jait interface and its browser demo without the recording browser appearing inside itself:

1. Open the normal Jait interface in a separate chat (the demo chat), and prepare the browser demo there. Use test data and close unrelated sensitive views.
2. In the recording chat, open Jait in its shared browser and navigate to the demo chat. Sign in before recording, using the existing browser takeover and sharing controls if needed. Return browser control to the agent.
3. Start `browser.record` in the recording chat. The recording browser shows the other chat and its shared-browser panel. Interact with that interface through the recording browser, then stop the recording. Do not open the recording chat inside its own browser: its live panel would recurse.

The browser must be shared with the agent. Taking browser control interrupts and discards the recording, including an in-flight frame. Secret-safe sessions are refused, and capture is rechecked around each frame and before saving. The recording can contain everything visible in the selected viewport; review it before sharing. It does not capture audio or other windows.

The gateway needs `ffmpeg` with the H.264 encoder. Recording currently supports projects on the gateway machine, not remote execution nodes. It samples up to five frames per second, so slow screenshots can make playback shorter than elapsed time. Videos are 1280 × 720, with padding as needed. Frames are limited to 8 MiB each and 100 MiB total; exceeding a limit discards the recording. Temporary frames are removed on normal completion or failure. A gateway crash can leave a `browser-recording-*` directory in `.jait/artifacts/`; remove it after inspecting whether it contains sensitive material. This records browser content, not the host desktop or native browser chrome.
