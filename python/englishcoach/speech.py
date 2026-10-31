"""Voice, 100 % Python and local: Whisper speech-to-text (faster-whisper) and text-to-speech.

- Speech-to-text: faster-whisper on the processor (int8), word timestamps included. It leaves the
  graphics/unified memory to the coach, so the two never compete.
- Text-to-speech: the system voice through pyttsx3 (macOS, Windows, Linux with espeak), saved as audio
  that the page plays. On a Mac, the built-in `say` command is used directly (better voices).
"""
from __future__ import annotations

import io
import os
import platform
import shutil
import subprocess
import tempfile
import threading
from pathlib import Path

SAMPLE_RATE = 16000
ASR_MODELS = {"rapide": "tiny.en", "precis": "base.en", "tres-precis": "small.en"}
_asr_lock = threading.Lock()


class Transcriber:
    def __init__(self, quality: str = "rapide"):
        from faster_whisper import WhisperModel

        self.quality = quality if quality in ASR_MODELS else "rapide"
        threads = max(1, min(8, (os.cpu_count() or 4) - 1))
        self.model = WhisperModel(ASR_MODELS[self.quality], device="cpu", compute_type="int8", cpu_threads=threads)

    def transcribe(self, audio, words: bool = True, max_seconds: float | None = None) -> dict:
        """audio: path, bytes or file-like. Returns {text, words: [{word, start, end}], segments: [{text, start}]}."""
        from faster_whisper import decode_audio

        if isinstance(audio, (bytes, bytearray)):
            audio = io.BytesIO(audio)
        samples = decode_audio(audio, sampling_rate=SAMPLE_RATE)
        if max_seconds:
            samples = samples[: int(max_seconds * SAMPLE_RATE)]
        with _asr_lock:
            segments, _info = self.model.transcribe(samples, language="en", beam_size=1, word_timestamps=words,
                                                    condition_on_previous_text=False, vad_filter=len(samples) > SAMPLE_RATE * 60)
            segs, ws = [], []
            for s in segments:
                segs.append({"text": s.text.strip(), "start": s.start, "end": s.end})
                for w in (s.words or []) if words else []:
                    ws.append({"word": w.word, "start": w.start, "end": w.end})
        return {"text": " ".join(s["text"] for s in segs).strip(), "words": ws, "segments": segs, "seconds": len(samples) / SAMPLE_RATE}


def tts_available() -> bool:
    if platform.system() == "Darwin" and shutil.which("say"):
        return True
    try:
        import pyttsx3  # noqa: F401
        return True
    except ImportError:
        return False


def tts(text: str, rate: float = 1.0) -> tuple[bytes, str] | None:
    """Synthesises speech: returns (audio bytes, mime type), or None if no voice is available."""
    text = str(text).strip()[:2000]
    if not text:
        return None
    with tempfile.TemporaryDirectory() as d:
        if platform.system() == "Darwin" and shutil.which("say"):
            out = Path(d) / "speech.wav"
            # Samantha is the default US voice on every Mac; the rate is in words per minute
            cmd = ["say", "-v", "Samantha", "-r", str(int(175 * rate)), "-o", str(out),
                   "--file-format=WAVE", "--data-format=LEI16@22050", text]
            if subprocess.run(cmd, capture_output=True, timeout=60).returncode != 0:
                cmd = [c for c in cmd if c not in ("-v", "Samantha")]
                subprocess.run(cmd, capture_output=True, timeout=60)
            return (out.read_bytes(), "audio/wav") if out.exists() else None
        try:
            import pyttsx3
        except ImportError:
            return None
        out = Path(d) / "speech.wav"
        engine = pyttsx3.init()
        engine.setProperty("rate", int(175 * rate))
        for v in engine.getProperty("voices"):
            if "en" in (getattr(v, "id", "") + str(getattr(v, "languages", ""))).lower():
                engine.setProperty("voice", v.id)
                break
        engine.save_to_file(text, str(out))
        engine.runAndWait()
        return (out.read_bytes(), "audio/wav") if out.exists() and out.stat().st_size > 0 else None
