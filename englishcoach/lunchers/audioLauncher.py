from englishcoach.engines.AudioEngine import AudioEngine


class AudioLauncher:
    def __init__(self, filename):
        self.engine = AudioEngine(filename)

    def record_and_transcribe(self, duration):
        self.engine.record(duration)
        self.engine.save_recording()
        transcription = self.engine.get_transcription()
        self.engine.delete_recording()
        return transcription

    def save_transcription(self,transcription):
        """"""
        return None
        

    def run(self, duration):
        transcription = self.record_and_transcribe(duration)
        self.save_transcription(transcription)
        print(transcription)