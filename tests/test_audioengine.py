from englishcoach.engines.AudioEngine import AudioEngine

class TestAudioEngine:
    def test_initialization(self):
        engine = AudioEngine("test.wav")
        assert engine.get_filename() == "test.wav"
        assert engine.get_recording() is None
        assert not engine.is_recording_available()

    def test_recording_availability(self):
        engine = AudioEngine("test.wav")
        assert not engine.is_recording_available()
        engine.record(1)  # Record for 1 second
        assert engine.is_recording_available()
        engine.delete_recording()
        assert not engine.is_recording_available()

    def test_save_and_delete_recording(self):
        engine = AudioEngine("test.wav")
        engine.record(1)  # Record for 1 second
        engine.save_recording()
        assert engine.is_recording_available()
        engine.delete_recording()
        assert not engine.is_recording_available()

    def test_get_transcription(self):
        engine = AudioEngine("test.wav")
        engine.record(1)  # Record for 1 second
        engine.save_recording()
        transcription = engine.get_transcription()
        assert transcription is not None
        engine.delete_recording()
        assert not engine.is_recording_available()
        assert engine.get_recording() is None
        assert engine.get_filename() == "test.wav"  

    
