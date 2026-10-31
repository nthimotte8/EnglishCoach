import json
import random
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from englishcoach import coach, srs, suggestions as sg  # noqa: E402
from englishcoach import textproc as tp  # noqa: E402
from englishcoach.db import Store  # noqa: E402

YT = """0:12
So today I want to talk about how habits are formed.
[Music]
0:17
Most of what we do every day happens on autopilot.
0:22
And that is actually a good thing for our brain.
0:27
It saves energy for the decisions that really matter."""


# ---------------------------------------------------------------- transcripts & exercises
def test_parse_transcript_with_timestamps():
    lines = tp.parse_transcript(YT)
    assert len(lines) == 4
    assert lines[0] == {"t": "00:12", "sec": 12, "text": "So today I want to talk about how habits are formed."}


def test_plain_text_is_split_into_sentences():
    assert [l["text"] for l in tp.parse_transcript("Hello there. This is a test! Is it ok?")] == ["Hello there.", "This is a test!", "Is it ok?"]


def test_units_keep_time_span():
    units = tp.exercise_units(tp.parse_transcript(YT))
    assert len(units) == 4 and (units[0].start, units[0].end) == (12, 17) and (units[3].start, units[3].end) == (27, 33)


def test_unpunctuated_captions_fall_back_to_chunks():
    text = " ".join(f"word{i}" for i in range(40))
    assert [len(u.text.split()) for u in tp.exercise_units([{"t": None, "sec": None, "text": text}])] == [14, 14, 12]


def test_whisper_words_and_segments_to_lines():
    ws = [{"word": w, "start": s, "end": e} for w, s, e in
          [("Welcome", 0, .4), (" to", .5, .6), (" the", .7, .8), (" show.", .9, 1.2), (" Today", 2, 2.3), (" we", 2.4, 2.5), (" talk.", 2.6, 3)]]
    lines = tp.lines_from_timed_words(ws)
    assert [l["text"] for l in lines] == ["Welcome to the show.", "Today we talk."] and lines[1]["t"] == "00:02"
    assert tp.lines_from_segments([{"text": " [Music] Hi there.", "start": 61.4}]) == [{"t": "01:01", "sec": 61, "text": "Hi there."}]
    assert tp.lines_from_sentences(["One two three four five.", "Six seven."])[1]["sec"] == 3


def test_pronunciation_report():
    timed = [{"word": w, "start": s, "end": e} for w, s, e in [("It", 0, .3), ("saves", .4, .7), ("um", .8, 1), ("energy.", 2.2, 2.6)]]
    r = tp.analyse_speech("It saves energy.", "It saves um energy.", timed)
    assert r["accuracy"] == 100 and r["fillers"] == 1 and r["pauses"][0]["after"] == "um" and r["wpm"] > 0
    assert next(o for o in r["ops"] if o["word"] == "saves")["start"] == 0.4
    perfect = tp.analyse_speech("It saves energy.", "it saves energy",
                                [{"word": w, "start": s, "end": e} for w, s, e in [("it", 0, .3), ("saves", .35, .6), ("energy", .65, 1)]])
    assert perfect["score"] == 100
    assert tp.analyse_speech("Good morning everyone.", "good morning")["to_practise"] == ["everyone"]


def test_exercises_are_well_formed():
    units = tp.exercise_units(tp.parse_transcript(YT))
    rng = random.Random(2)
    for kind in ("lecture", "repetition", "dictee"):
        assert len(tp.build_exercise(kind, units, 3, rng)) == 3
    for item in tp.build_exercise("reco", units, 4, rng):
        assert item["text"] in item["options"] and len(item["options"]) == 4
    for item in tp.build_exercise("trous", units, 4, rng):
        for b, ans in zip(item["blanks"], item["answers"]):
            assert item["words"][b].startswith(ans)
    assert tp.build_exercise("dictee", units[:1]) == []
    with pytest.raises(ValueError):
        tp.build_exercise("karaoke", units)


def test_json_helpers():
    assert tp.extract_json('Sure! {"a": 3} hope it helps') == {"a": 3}
    assert tp.extract_json('```json\n{"a": 2}\n```') == {"a": 2}
    with pytest.raises(ValueError):
        tp.extract_json("no json")
    assert tp.partial_field('{"reply": "Hello, ho', "reply") == ("Hello, ho", False)
    assert tp.partial_field('{"reply": "He said \\"hi\\"\\nthen', "reply") == ('He said "hi"\nthen', False)
    assert tp.partial_field('{"reply": "Done.", "corrections": [', "reply") == ("Done.", True)
    assert tp.partial_field('{"reply": "caf\\u00e9', "reply") == ("café", False)
    assert tp.youtube_id("https://youtu.be/dQw4w9WgXcQ") == "dQw4w9WgXcQ" and tp.youtube_id("https://example.com") is None


# ---------------------------------------------------------------- spaced repetition
def test_spaced_repetition():
    t0 = 1_800_000_000
    c = srs.new_card({"front": "catch up"}, t0)
    intervals = []
    for g in (2, 2, 2, 3):
        c = srs.review(c, g, t0)
        intervals.append(c["interval"])
    assert intervals[:3] == [1, 6, 15] and intervals[3] >= 40 and srs.is_mastered(c)
    lapsed = srs.review(c, 0, t0)
    assert lapsed["reps"] == 0 and lapsed["due"] == t0 + 600 and lapsed["ease"] < c["ease"]
    assert [x["due"] for x in srs.due_cards([{"due": t0 + 5}, {"due": t0 - 10}, {"due": t0 - 5}], t0)] == [t0 - 10, t0 - 5]
    assert srs.card_key("  Catch-Up!  ") == "catchup"
    assert srs.check_answer("catch up", "to catch up") == "wrong"
    assert srs.check_answer("cach up", "catch up") == "almost" and srs.check_answer("Catch up!", "catch up") == "exact"


# ---------------------------------------------------------------- suggestions & sources
def test_suggestions_ranked_by_level():
    a2 = sg.rank_by_level(sg.TEXTS, "A2")
    assert a2[0]["title"] == "My morning routine"
    b1 = sg.rank_by_level(sg.PODCASTS, "B1")
    names = [p["name"] for p in b1]
    assert names.index("6 Minute English") < names.index("Data Engineering Podcast")
    assert all(x["theme"] == "tech" for x in sg.rank_by_level(sg.YOUTUBE, "B2", "tech"))
    for t in sg.TEXTS:
        assert len(tp.exercise_units(tp.parse_transcript(t["text"]))) >= 5, t["title"]
    assert "search_query=data%20%26%20AI" in sg.youtube_search_url("data & AI")
    assert sg.level_tag({"levels": ["B1", "B2"], "fit": False}, "C2") == "B1–B2 · hors niveau"


def test_podcast_parsing():
    from englishcoach import sources

    assert sources.to_show({"collectionId": 7, "collectionName": "Daily", "artistName": "BBC", "artworkUrl600": "a.jpg"})["title"] == "Daily"
    ep = sources.to_episode({"trackName": "Ep 1", "episodeUrl": "https://x/ep.mp3", "trackTimeMillis": 361000, "shortDescription": "<p>Hi  there</p>"})
    assert ep["duration"] == 361 and ep["description"] == "Hi there"
    assert sources.to_episode({"trackName": "Video", "episodeUrl": "v.mp4", "episodeContentType": "video"}) is None
    feed = sources.parse_feed(b"""<?xml version="1.0"?><rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel>
      <title>Daily English</title><item><title>Notes</title></item>
      <item><title>Remote work</title><enclosure url="https://cdn.x.com/ep1.mp3" type="audio/mpeg"/><itunes:duration>12:30</itunes:duration></item>
      </channel></rss>""")
    assert feed["show"] == "Daily English" and feed["episodes"][0]["duration"] == 750
    with pytest.raises(sources.SourceError):
        sources.parse_feed(b"<html></html>")


# ---------------------------------------------------------------- storage
def test_store_contents_cards_and_stats(tmp_path):
    st = Store(tmp_path / "t.db")
    m = st.create_material("Habits", "text", tp.parse_transcript(YT), level="B2")
    assert st.current()["id"] == m["id"] and m["word_count"] > 20
    card, added = st.add_card("brain", context="good for our brain")
    assert added and not st.add_card("Brain!")[1]
    assert st.add_corrections([{"original": "I has", "better": "I have", "why": "accord"}], "Coach") == 1
    card = srs.review(card, 2)
    st.save_card(card)
    st.add_session("dictee", 4, material_id=m["id"], score=80)
    st.add_session("coach", 6, material_id=m["id"], score=71, level="B2", messages=3, wpm=118)
    s = st.stats()
    assert s["level"] == "B2" and s["total_minutes"] == 10 and s["exercises"] == 1 and s["conversations"] == 1
    assert s["messages"] == 3 and s["avg_wpm"] == 118 and s["streak"] == 1 and s["cards"]["total"] == 2
    assert s["history"][0]["title"] == "Habits"
    backup = json.loads(json.dumps(st.export()))
    st.clear()
    assert st.stats()["cards"]["total"] == 0
    st.import_(backup)
    assert st.stats()["total_minutes"] == 10 and st.current()["title"] == "Habits"
    with pytest.raises(ValueError):
        st.import_({"app": "other"})
    # column names from a backup file are never trusted
    st.import_({**backup, "sessions": [{"kind": "x", "minutes": 1, "at": 1, "evil); DROP TABLE cards; --": 1}]})
    assert st.stats()["cards"]["total"] == 2
    st.delete_material(m["id"])
    assert st.current() is None


# ---------------------------------------------------------------- coach (fake model)
class FakeEngine:
    def __init__(self):
        self.calls = []

    def json(self, messages, *, max_tokens=350, temperature=0.5, stream_field=None, on_partial=None):
        self.calls.append(messages)
        last = messages[-1]["content"]
        if stream_field and on_partial:
            on_partial("Interesting", False)
            on_partial("Interesting! Why?", True)
        if "monologue" in messages[0]["content"]:
            return {"title": "Remote work", "sentences": ["One two three.", "Four five six.", "Seven eight nine."]}
        if "CEFR level (A1" in last:
            return {"level": "B2"}
        if "examiner" in messages[0]["content"]:
            return {"level": "B1", "score": "73", "strengths": ["a"], "work_on": ["b"], "summary": "ok"}
        if "Expression:" in last:
            return {"meaning_fr": "cerveau", "example": "Use your brain."}
        return {"reply": "Interesting! Why?", "tip": "Bien.", "corrections": [
            {"original": "I has learned", "better": "I have learned", "why": "accord"},
            {"original": "habits", "better": "Habits", "why": "rien"}]}


def test_coach_prompts_and_cleanup():
    e, m = FakeEngine(), {"title": "Habits", "level": "B2", "lines": tp.parse_transcript(YT)}
    seen = []
    first = coach.content_turn(e, m, [], None, on_reply=lambda t, d: seen.append((t, d)))
    assert first["corrections"] == [] and seen[-1] == ("Interesting! Why?", True)
    assert "how habits are formed" in e.calls[-1][0]["content"]
    r = coach.content_turn(e, m, [{"role": "assistant", "content": "Q?"}], "I has learned")
    assert [c["better"] for c in r["corrections"]] == ["I have learned"]  # the no-op correction is dropped
    assert e.calls[-1][-1]["content"] == "Learner: I has learned"
    sc = next(s for s in coach.SCENARIOS if s["key"] == "interview")
    rp = coach.roleplay_turn(e, sc, "", "B2", [], None)
    assert rp["reply"] and "hiring manager" in e.calls[-1][0]["content"]
    custom = next(s for s in coach.SCENARIOS if s["key"] == "custom")
    coach.roleplay_turn(e, custom, "Je négocie une augmentation", None, [], "Hello")
    assert "Je négocie une augmentation" in e.calls[-1][0]["content"]
    assert coach.evaluate(e, "test", ["a", "b"], {"wpm": 100, "pauses": 1})["score"] == 73
    assert coach.estimate_level(e, m) == "B2"
    assert coach.generate_text(e, "Business", "B1")["title"] == "Remote work"
    assert coach.explain(e, "brain", "our brain")["meaning"] == "cerveau"
