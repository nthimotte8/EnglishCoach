import sounddevice as sd
import scipy.io.wavfile as wavfile
from faster_whisper import WhisperModel

class AudioEngine:
    def __init__(self, filename, samplerate=44100):
        self.filename = filename
        self.samplerate = samplerate
        self.recording = None
        self.model = WhisperModel(
            "small",  # Specify the model size here
            device="cpu",
            compute_type="int8",
        )

    def record(self, duration):
        self.recording = sd.rec(int(duration * self.samplerate), samplerate=self.samplerate, channels=2)
        sd.wait()
        return self.recording
        

    def get_recording(self):
        return self.recording

    def save_recording(self):
        if self.recording is not None:
            wavfile.write(self.filename, self.samplerate, self.recording)
        else:
            raise ValueError("No recording available to save.")
    def delete_recording(self):
        self.recording = None
        import os
        if os.path.exists(self.filename):
            os.remove(self.filename)

    def is_recording_available(self):
        return self.recording is not None

    def get_filename(self):
        return self.filename

    def get_transcription(self):
        if self.recording is None:
            raise ValueError("No recording available for transcription.")
        segments, info = self.model.transcribe(self.filename)
        transcription = ""
        for segment in segments:
            transcription += segment.text
        return transcription