"""Smoke test of every Streamlit page with a fake `streamlit` module (no browser, no real models).

It runs each page in several states and presses chosen buttons, to catch typos, wrong arguments and
broken branches. Usage: python tests/smoke_ui.py   (the real pages are tested by hand with `streamlit run`).
"""
import os
import sys
import tempfile
import time
import traceback
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
os.environ["EC_DATA_DIR"] = tempfile.mkdtemp()

PRESS: set[str] = set()      # button labels / keys to "click" during a run
VALUES: dict[str, object] = {}  # widget label/key -> returned value
CALLS: list[str] = []


class Rerun(Exception):
    pass


class Switch(Exception):
    pass


class Dummy:
    def __init__(self, *a, **k):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def __getattr__(self, name):
        return getattr(st, name)

    def update(self, *a, **k):
        pass


class SessionState(dict):
    __getattr__ = dict.get

    def __setattr__(self, k, v):
        self[k] = v


def _cache(fn=None, **kw):
    def wrap(f):
        cache = {}

        def inner(*a):
            if a not in cache:
                cache[a] = f(*a)
            return cache[a]
        inner.clear = cache.clear
        return inner
    return wrap(fn) if fn else wrap


def _value(label, key, default):
    for k in (key, label):
        if k is not None and k in VALUES:
            return VALUES[k]
    return default


st = types.ModuleType("streamlit")
st.session_state = SessionState()
st.cache_resource = _cache
st.cache_data = _cache


def _record(name):
    def f(*a, **k):
        CALLS.append(name)
        if name == "write_stream":
            return "".join(a[0]())
        return Dummy()
    return f


for name in ["title", "subheader", "caption", "write", "markdown", "info", "warning", "error", "success", "toast", "metric",
             "progress", "audio", "video", "image", "link_button", "altair_chart", "dataframe", "download_button",
             "set_page_config", "write_stream", "divider"]:
    setattr(st, name, _record(name))
st.container = st.expander = st.spinner = st.status = st.form = st.chat_message = st.sidebar = Dummy
st.sidebar = Dummy()


def columns(spec, **k):
    n = spec if isinstance(spec, int) else len(spec)
    return [Dummy() for _ in range(n)]


st.columns = columns
st.tabs = lambda labels: [Dummy() for _ in labels]


def button(label, key=None, **k):
    return (key in PRESS) or (label in PRESS)


st.button = button
st.form_submit_button = button
st.text_input = lambda label, value="", key=None, **k: _value(label, key, value)
st.text_area = lambda label, value="", key=None, **k: _value(label, key, value)
st.selectbox = lambda label, options, key=None, **k: _value(label, key, list(options)[0])
st.pills = lambda label, options, default=None, key=None, **k: _value(label, key, default)
st.segmented_control = lambda label, options, default=None, key=None, **k: _value(label, key, default)
st.radio = lambda label, options, index=0, key=None, **k: _value(label, key, (list(options)[index] if index is not None else None))
st.toggle = lambda label, value=False, key=None, **k: _value(label, key, value)
st.checkbox = lambda label, value=False, key=None, **k: _value(label, key, value)
st.audio_input = lambda label, key=None, **k: _value(label, key, None)
st.chat_input = lambda placeholder=None, **k: _value("chat", None, None)
st.file_uploader = lambda label, key=None, **k: _value(label, key, None)


def rerun():
    raise Rerun()


def switch_page(page):
    raise Switch(str(page))


st.rerun = rerun
st.switch_page = switch_page
st.Page = lambda fn, **k: types.SimpleNamespace(fn=fn, **k)
st.navigation = lambda pages: types.SimpleNamespace(run=lambda: None)
sys.modules["streamlit"] = st

# altair / pandas are only drawn, never inspected: light fakes when not installed
for mod in ("altair", "pandas"):
    try:
        __import__(mod)
    except ImportError:
        fake = types.ModuleType(mod)

        class Chain:
            def __init__(self, *a, **k):
                pass

            def __getattr__(self, n):
                return lambda *a, **k: Chain()

            def __add__(self, other):
                return Chain()
        for n in ["Chart", "X", "Y", "Color", "Scale", "Axis", "DataFrame"]:
            setattr(fake, n, Chain)
        sys.modules[mod] = fake

# ------------------------------------------------------------ fakes for the models
from englishcoach import textproc as tp  # noqa: E402
from views import common  # noqa: E402

sys.path.insert(0, str(ROOT / "tests"))
from test_logic import FakeEngine  # noqa: E402


class FakeTranscriber:
    def transcribe(self, audio, words=True, max_seconds=None):
        ws = [{"word": w, "start": i * 0.4, "end": i * 0.4 + 0.3} for i, w in enumerate("So today I want to talk about habits.".split())]
        return {"text": "So today I want to talk about habits.", "words": ws, "segments": [], "seconds": 3}


fake_engine = FakeEngine()
fake_engine.chars_per_sec = 40.0
fake_engine.slow = True
common._engine = lambda tier: fake_engine
common._engine.clear = lambda: None
common._transcriber = lambda q: FakeTranscriber()
common._tts = lambda text, rate: (b"RIFF", "audio/wav")

import app  # noqa: E402,F401  (builds navigation, sidebar)
from views import chat as chat_view  # noqa: E402
from views import coach_page, conversation, exercise, new_material, practice, progress, settings, vocab  # noqa: E402

failures = []


def run(name, fn, press=(), values=None, expect=None):
    PRESS.clear()
    PRESS.update(press)
    VALUES.clear()
    VALUES.update(values or {})
    try:
        fn()
        outcome = "ok"
    except Rerun:
        outcome = "rerun"
    except Switch as s:
        outcome = f"switch:{s}"
    except Exception:
        failures.append(name)
        print(f"FAIL {name}\n{traceback.format_exc()}")
        return
    if expect and not outcome.startswith(expect):
        failures.append(name)
        print(f"FAIL {name}: got {outcome}, expected {expect}")
        return
    print(f"ok   {name} ({outcome})")


db = common.store()
run("practice / empty", practice.render)
run("practice / create example", practice.render, press={"Essayer avec un exemple"}, expect="rerun")
run("practice / with content", practice.render)
run("practice / play a line", practice.render, press={"line-2"}, expect="rerun")
run("practice / line playing", practice.render)
run("practice / add words", practice.render, press={"Ajouter au carnet"}, values={"Mots": ["brain"]})
run("practice / start dictation", practice.render, press={"ex-dictee"}, expect="switch")
st.session_state["engine_ready_for"] = "leger"
run("practice / estimate level (coach loaded)", practice.render)

# exercises
for kind in tp.EXERCISES:
    st.session_state.update(ex_kind=kind)
    st.session_state.pop("ex", None)
    run(f"exercise {kind} / first item", exercise.render)
ex_key = lambda: f"{st.session_state['ex']['kind']}-{db.current()['id']}-{st.session_state['ex']['i']}-{st.session_state['ex']['started']}"

st.session_state.update(ex_kind="dictee"); st.session_state.pop("ex", None)
run("dictation / render", exercise.render)
run("dictation / check", exercise.render, press={"Vérifier"}, values={"Ce que tu entends": "So today I want"}, expect="rerun")
run("dictation / answered", exercise.render)
st.session_state["ex"]["i"] = len(st.session_state["ex"]["items"])
run("dictation / finish", exercise.render)

st.session_state.update(ex_kind="lecture"); st.session_state.pop("ex", None)
run("read aloud / render", exercise.render)
run("read aloud / listen", exercise.render, press={f"l-{ex_key()}"})
run("read aloud / record", exercise.render, values={f"a-{ex_key()}-0": types.SimpleNamespace(getvalue=lambda: b"wav")}, expect="rerun")
run("read aloud / report", exercise.render)
run("read aloud / save words", exercise.render, press={f"save-{ex_key()}"})
run("read aloud / retry", exercise.render, press={f"retry-{ex_key()}"}, expect="rerun")
run("read aloud / after retry", exercise.render)

st.session_state.update(ex_kind="trous"); st.session_state.pop("ex", None)
run("cloze / render", exercise.render)
run("cloze / check", exercise.render, press={"Vérifier"}, values={f"t-{ex_key()}-0": "xx"}, expect="rerun")
run("cloze / answered + next", exercise.render, press={"Phrase suivante"}, expect="rerun")

st.session_state.update(ex_kind="reco"); st.session_state.pop("ex", None)
run("reco / render", exercise.render)
item = st.session_state["ex"]["items"][0]
run("reco / answer", exercise.render, press={"Valider"}, values={"Quel passage as-tu entendu ?": item["text"]}, expect="rerun")
run("reco / answered", exercise.render)

# coach & conversation
run("coach / first question", coach_page.render)
sk = f"chat-content-{db.current()['id']}"
run("coach / typed answer", coach_page.render, values={"chat": "I has learned a lot"}, expect="rerun")
run("coach / answer processed", coach_page.render)
run("coach / voice answer", coach_page.render, values={f"{sk}-mic-0": types.SimpleNamespace(getvalue=lambda: b"wav")}, expect="rerun")
run("coach / voice processed", coach_page.render)
run("coach / evaluate", coach_page.render, press={"Terminer et obtenir mon bilan"}, expect="rerun")
run("coach / evaluation shown", coach_page.render)
assert db.stats()["conversations"] == 1, "coach session not saved"
run("conversation / pick", conversation.render)
run("conversation / start interview", conversation.render, press={"sc-interview"}, expect="rerun")
run("conversation / first line", conversation.render)
run("conversation / change", conversation.render, press={"Changer de situation"}, expect="rerun")
run("conversation / custom", conversation.render, press={"sc-custom"}, values={"custom-text": "Je négocie une augmentation"}, expect="rerun")
run("conversation / custom first line", conversation.render)

# new content
run("new / render", new_material.render)
run("new / ready text", new_material.render, press={"txt-My morning routine"}, expect="switch")
run("new / theme generation", new_material.render, press={"Générer le texte"}, expect="switch")
run("new / youtube bad link", new_material.render, press={"yt-load"}, values={"Lien de la vidéo YouTube": "https://example.com"})
run("new / text form", new_material.render, press={"Charger"},
    values={"Titre": "Mon texte", "Texte en anglais": "One sentence here. Another one here. And a third one."}, expect="switch")

# vocabulary
st.session_state.pop("review", None)
run("vocab / review start", vocab.render)
run("vocab / reveal", vocab.render, press={"Afficher la réponse"}, expect="rerun")
run("vocab / answer shown", vocab.render)
run("vocab / grade", vocab.render, press={"grade-2"}, expect="rerun")
for _ in range(10):  # go through the queue: type an answer on cards that ask for one, reveal otherwise
    rs = st.session_state["review"]
    if rs["i"] >= len(rs["queue"]):
        break
    run("vocab / next card", vocab.render, press={"Vérifier", "Afficher la réponse"},
        values={f"g-{rs['queue'][rs['i']]}-{rs['i']}": "I have learned"}, expect="rerun")
    run("vocab / grade card", vocab.render, press={"grade-0" if rs["i"] == 1 else "grade-3"}, expect="rerun")
run("vocab / session finished", vocab.render)
run("vocab / add card", vocab.render, press={"Ajouter"}, values={"Nouvelle expression": "to catch up on"}, expect="rerun")
run("vocab / notebook", vocab.render)

# progress & settings
run("progress", progress.render)
run("settings", settings.render)
run("settings / change tier", settings.render, values={"Niveau": "equilibre"}, expect="rerun")
run("settings / test voice", settings.render, press={"Tester la voix"})
st.session_state["engine_ready_for"] = "equilibre"
run("chat / slow-model hint", coach_page.render)

print(f"\n{len(failures)} failure(s)" if failures else "\nall UI smoke checks passed")
sys.exit(1 if failures else 0)
