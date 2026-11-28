"""Loopback-only Parakeet TDT v3 audio adapter for the Jait gateway."""
import argparse
import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from subprocess import run, SubprocessError

import numpy as np
import sherpa_onnx

SAMPLE_RATE = 16000
WINDOW_SECONDS = 25
MAX_SECONDS = 7200
MAX_BYTES = 96 * 1024 * 1024


def segments(recognizer, audio):
    window = WINDOW_SECONDS * SAMPLE_RATE
    for offset in range(0, len(audio), window):
        samples = audio[offset:offset + window].astype(np.float32) / 32768
        if not np.any(np.abs(samples) > 0.001):
            continue
        stream = recognizer.create_stream()
        stream.accept_waveform(SAMPLE_RATE, samples)
        recognizer.decode_stream(stream)
        result = stream.result
        if result.text.strip():
            start = result.timestamps[0] if len(result.timestamps) else 0
            yield {"start": offset / SAMPLE_RATE + max(0, float(start)), "text": result.text.strip()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-dir", type=Path, required=True)
    parser.add_argument("--port", type=int, default=18170)
    parser.add_argument("--threads", type=int, default=4)
    args = parser.parse_args()
    recognizer = sherpa_onnx.OfflineRecognizer.from_transducer(
        encoder=str(args.model_dir / "encoder.int8.onnx"), decoder=str(args.model_dir / "decoder.int8.onnx"),
        joiner=str(args.model_dir / "joiner.int8.onnx"), tokens=str(args.model_dir / "tokens.txt"),
        num_threads=args.threads, model_type="nemo_transducer",
    )

    class Handler(BaseHTTPRequestHandler):
        def setup(self):
            super().setup()
            self.connection.settimeout(60)

        def respond(self, status, payload):
            response = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(response)))
            self.end_headers()
            self.wfile.write(response)

        def do_GET(self):
            if self.path == "/health":
                self.respond(200, {"ready": True})
            else:
                self.send_error(404)

        def do_POST(self):
            if self.path != "/transcribe":
                self.send_error(404)
                return
            try:
                size = int(self.headers.get("Content-Length", "0"))
                if not 0 < size <= MAX_BYTES:
                    self.send_error(413)
                    return
                # Android's MP4 metadata may follow the audio and require a
                # seekable input. Pass one anonymous file with no path access.
                with os.fdopen(os.memfd_create("jait-meeting"), "w+b") as source:
                    remaining = size
                    while remaining:
                        chunk = self.rfile.read(min(remaining, 512 * 1024))
                        if not chunk:
                            self.send_error(400)
                            return
                        source.write(chunk)
                        remaining -= len(chunk)
                    source.seek(0)
                    pcm = run(["ffmpeg", "-nostdin", "-v", "error", "-protocol_whitelist", "fd,pipe",
                               "-format_whitelist", "wav,matroska,webm,ogg,mov,mp4,m4a,3gp,3g2,mj2,aac,mp3",
                               "-fd", str(source.fileno()), "-i", "fd:", "-map", "0:a:0", "-vn", "-ac", "1",
                               "-ar", str(SAMPLE_RATE), "-t", str(MAX_SECONDS + 1), "-f", "s16le", "pipe:1"],
                              pass_fds=(source.fileno(),), capture_output=True, check=True, timeout=180).stdout
                if len(pcm) > MAX_SECONDS * SAMPLE_RATE * 2:
                    self.send_error(413)
                    return
                self.respond(200, {"segments": list(segments(recognizer, np.frombuffer(pcm, dtype="<i2")))})
            except (ValueError, SubprocessError):
                self.send_error(422, "Unable to decode recording")
            except (TimeoutError, BrokenPipeError, ConnectionResetError):
                return

    with HTTPServer(("127.0.0.1", args.port), Handler) as server:
        server.serve_forever()


if __name__ == "__main__":
    main()
