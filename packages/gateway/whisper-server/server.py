"""
Faster Whisper HTTP transcription server for Jait.

Loads the faster-whisper model once on startup and exposes a simple
POST /transcribe endpoint that accepts WAV audio and returns text.

Install:
  pip install faster-whisper flask

Run:
  python server.py                          # defaults: medium model, port 8178
  python server.py --model large-v3         # use a different model
  python server.py --port 9000 --lang en    # custom port & language
  python server.py --device cuda            # GPU acceleration

Environment variables (alternative to CLI args):
  WHISPER_MODEL=medium
  WHISPER_PORT=8178
  WHISPER_LANGUAGE=de
  WHISPER_DEVICE=auto
"""

import argparse
import io
import os
import sys
import logging

from flask import Flask, request, jsonify

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("whisper-server")

app = Flask(__name__)

# Globals set in main()
_model = None
_language = None


def load_model(model_size: str, device: str, compute_type: str):
    from faster_whisper import WhisperModel

    log.info("Loading faster-whisper model '%s' on %s (%s)...", model_size, device, compute_type)
    model = WhisperModel(model_size, device=device, compute_type=compute_type)
    log.info("Model loaded.")
    return model


@app.route("/transcribe", methods=["POST"])
def transcribe():
    if _model is None:
        return jsonify({"error": "Model not loaded"}), 503

    audio_data = request.get_data()
    if not audio_data:
        return jsonify({"error": "No audio data provided"}), 400

    try:
        audio_file = io.BytesIO(audio_data)
        segments, info = _model.transcribe(
            audio_file,
            language=_language,
            beam_size=5,
            vad_filter=True,
        )
        text = " ".join(seg.text.strip() for seg in segments).strip()
        return jsonify({"text": text, "language": info.language, "duration": round(info.duration, 2)})
    except Exception as e:
        log.exception("Transcription failed")
        return jsonify({"error": str(e)}), 500


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"ok": _model is not None})


def main():
    global _model, _language

    parser = argparse.ArgumentParser(description="Faster Whisper HTTP server")
    parser.add_argument("--model", default=os.environ.get("WHISPER_MODEL", "medium"), help="Model size (tiny, base, small, medium, large-v3)")
    parser.add_argument("--port", type=int, default=int(os.environ.get("WHISPER_PORT", "8178")))
    parser.add_argument("--lang", default=os.environ.get("WHISPER_LANGUAGE", None), help="Language code (e.g. de, en). None = auto-detect")
    parser.add_argument("--device", default=os.environ.get("WHISPER_DEVICE", "auto"), help="Device: auto, cpu, cuda")
    parser.add_argument("--compute-type", default=os.environ.get("WHISPER_COMPUTE_TYPE", "default"), help="Compute type: default, float16, int8, int8_float16")
    args = parser.parse_args()

    _language = args.lang
    _model = load_model(args.model, args.device, args.compute_type)

    log.info("Starting server on port %d (language=%s)", args.port, _language or "auto")
    app.run(host="0.0.0.0", port=args.port, threaded=True)


if __name__ == "__main__":
    main()
