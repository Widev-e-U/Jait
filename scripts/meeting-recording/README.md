# Meeting recording services

Run the services on the gateway host, or on a trusted private network. The two
reference Python adapters listen on loopback. Jait uses the saved service URLs
from the gateway rather than from the device recording the audio.

| Settings field | Loopback example | Service contract |
| --- | --- | --- |
| Parakeet URL | `http://127.0.0.1:18170` | `GET /health` returns `{"ready":true}`. `POST /transcribe` takes binary audio and returns `{"segments":[{"start":0.0,"text":"…"}]}` with timestamps in seconds. |
| Nemotron URL | `http://127.0.0.1:18172/v1` | OpenAI-compatible `GET /models` and `POST /chat/completions`. With the example below, set the model to `nemotron`. |
| Obsidian URL | `http://127.0.0.1:18171` | Authenticated `GET /vault/Meetings/` and `PUT /vault/Meetings/{note}.md`. A repeated PUT uses the same note path. |

Set the Obsidian vault name to the name registered in the Obsidian app on each
device. The note link uses that vault's `Meetings/` path, so the vault needs to be
available on the device to open it. Copy the writer token into **Settings → API
keys → Meeting recording** on the gateway owner's account. Jait stores it in
encrypted storage. **Test connections** checks the transcription service, the
configured summary model, and authenticated access to the `Meetings/` endpoint.

On Linux, create a virtual environment with `sherpa-onnx==2.0.3` and `numpy`.
Install FFmpeg with the `fd` protocol enabled. Download and extract the
[Parakeet TDT v3 INT8 model](https://k2-fsa.github.io/sherpa/onnx/pretrained_models/offline-transducer/nemo-transducer-models.html).
Use a recent CPU build of [llama.cpp](https://github.com/ggml-org/llama.cpp/releases)
and NVIDIA's [Nemotron 3 Nano 4B Q4_K_M](https://huggingface.co/nvidia/NVIDIA-Nemotron-3-Nano-4B-GGUF)
model. Generate a random 32-byte bearer token and save it to an owner-readable
file with mode `0600`. Start the services with absolute paths for supervised runs.

```sh
python scripts/meeting-recording/parakeet-server.py --model-dir "$parakeet_model_dir"
llama-server -m "$nemotron_gguf" --alias nemotron --host 127.0.0.1 --port 18172 \
  --ctx-size 8192 --parallel 1 --threads 6 --n-gpu-layers 0 --reasoning off
python scripts/meeting-recording/obsidian-writer.py \
  --meetings-dir "$vault_dir/Meetings" --token-file "$writer_token_file"
```

The writer expects the `Meetings/` directory to exist and be writable by its
service account. It accepts only Jait's generated meeting filenames and writes
each note atomically. Failed uploads can be resumed on the originating device.
Stopping the recorder starts the Obsidian save automatically. Jait uses the
live transcript and speaker edits, and transcribes the recording if preview
audio was missed. After a complete upload, the gateway keeps processing if the client disconnects
and resumes from saved stages after a gateway restart. Raw audio is removed from
the active job once transcription is checkpointed. Records have a two-hour,
96 MiB upper bound.

Windows Tauri combines the microphone with audio from the default Windows
playback device. Choose that output in the call app. Other Tauri platforms
capture the microphone. Android captures the microphone with a foreground
notification and a Stop action. Android and call apps control concurrent
microphone availability and playback capture permissions.
