from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from englishcoach.engines.AudioEngine import AudioEngine


@pytest.fixture
def mock_audio_engine():
    """Crée un AudioEngine avec sounddevice, WhisperModel et wavfile mockés."""
    with (
        patch("englishcoach.engines.AudioEngine.sd") as mock_sd,
        patch("englishcoach.engines.AudioEngine.WhisperModel") as mock_whisper_model,
        patch("englishcoach.engines.AudioEngine.wavfile") as mock_wavfile,
    ):
        # Simule un enregistrement audio (tableau numpy factice)
        mock_sd.rec.return_value = np.zeros((44100, 2))
        mock_sd.wait.return_value = None

        # Simule le modèle Whisper et sa transcription
        mock_model_instance = MagicMock()
        mock_segment = MagicMock()
        mock_segment.text = "hello world"
        mock_model_instance.transcribe.return_value = ([mock_segment], None)
        mock_whisper_model.return_value = mock_model_instance

        engine = AudioEngine("test.wav")
        yield engine, mock_sd, mock_wavfile


class TestAudioEngine:
    def test_initialization(self, mock_audio_engine):
        engine, _, _ = mock_audio_engine
        assert engine.get_filename() == "test.wav"
        assert engine.get_recording() is None
        assert not engine.is_recording_available()

    def test_recording_availability(self, mock_audio_engine, tmp_path):
        engine, _, _ = mock_audio_engine
        engine.filename = str(tmp_path / "test.wav")
        assert not engine.is_recording_available()
        engine.record(1)
        assert engine.is_recording_available()
        engine.delete_recording()
        assert not engine.is_recording_available()

    def test_save_and_delete_recording(self, mock_audio_engine, tmp_path):
        engine, _, mock_wavfile = mock_audio_engine
        engine.filename = str(tmp_path / "test.wav")
        engine.record(1)
        engine.save_recording()
        mock_wavfile.write.assert_called_once()
        assert engine.is_recording_available()
        engine.delete_recording()
        assert not engine.is_recording_available()

    def test_get_transcription(self, mock_audio_engine, tmp_path):
        engine, _, _ = mock_audio_engine
        engine.filename = str(tmp_path / "test.wav")
        engine.record(1)
        engine.save_recording()
        transcription = engine.get_transcription()
        assert transcription == "hello world"
        engine.delete_recording()
        assert not engine.is_recording_available()
        assert engine.get_recording() is None
