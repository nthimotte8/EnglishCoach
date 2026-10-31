"""Every prompt the coach uses, in one place. Answers are JSON; "reply" comes first so it can be streamed."""
from __future__ import annotations

from collections.abc import Callable

from .textproc import LEVELS

FORMAT_TURN = '{"reply": "...", "corrections": [{"original": "...", "better": "...", "why": "..."}], "tip": "..."}'

SCENARIOS = [
    {"key": "interview", "label": "Entretien d’embauche", "you": "candidat·e", "them": "Recruteur",
     "role": "a hiring manager interviewing the learner for a Data Engineer job at an international company",
     "opening": "Greet the learner and ask them to introduce themselves.",
     "hint": "Présente ton parcours, tes projets data et tes motivations à un recruteur."},
    {"key": "hr-call", "label": "Appel RH de présélection", "you": "candidat·e", "them": "Recruteuse RH",
     "role": "a friendly HR recruiter on a 20-minute screening call (motivation, experience, salary expectations, notice period)",
     "opening": "Introduce yourself and the purpose of the call.",
     "hint": "Premier appel avec une recruteuse : motivation, expérience, prétentions, préavis."},
    {"key": "meeting", "label": "Réunion d’équipe", "you": "membre de l’équipe", "them": "Manager",
     "role": "a project manager running a weekly team meeting about a delayed data pipeline project",
     "opening": "Open the meeting and ask the learner for a status update on their work.",
     "hint": "Fais le point sur ton avancement et explique un retard sur un pipeline."},
    {"key": "smalltalk", "label": "Small talk avec un collègue", "you": "collègue", "them": "Collègue",
     "role": "a British colleague chatting at the coffee machine", "opening": "Start some casual small talk about the weekend.",
     "hint": "Discussion détendue à la machine à café."},
    {"key": "hotel", "label": "Voyage : hôtel et aéroport", "you": "voyageur·se", "them": "Réception",
     "role": "a hotel receptionist in New York; there is a problem with the learner's booking",
     "opening": "Welcome the learner at the front desk.", "hint": "Un problème avec ta réservation à l’arrivée à New York."},
    {"key": "restaurant", "label": "Restaurant", "you": "client·e", "them": "Serveur",
     "role": "a waiter in a busy London restaurant", "opening": "Welcome the learner and ask if they have a reservation.",
     "hint": "Commander, poser des questions sur le menu, régler l’addition."},
    {"key": "custom", "label": "Situation libre…", "you": "toi", "them": "Partenaire", "role": "", "opening": "Start the scene.", "hint": ""},
]


def excerpt(material: dict, max_chars: int = 1500) -> str:
    out = ""
    for l in material["lines"]:
        if len(out) + len(l["text"]) > max_chars:
            break
        out += l["text"] + "\n"
    return out.strip()


def _same(a: str, b: str) -> bool:
    keep = lambda s: "".join(ch for ch in s.lower() if ch.isalpha() or ch in "' ").strip()
    return keep(a) == keep(b)


def _clean_turn(r: dict, message: str | None) -> dict:
    corr = [c for c in (r.get("corrections") or []) if isinstance(c, dict) and c.get("original") and c.get("better")
            and not _same(c["original"], c["better"])][:3]
    return {"reply": str(r.get("reply") or "Can you tell me more?").strip(),
            "corrections": [{"original": str(c["original"]), "better": str(c["better"]), "why": str(c.get("why", ""))} for c in corr] if message else [],
            "tip": str(r.get("tip") or "")}


def generate_text(engine, topic: str, level: str) -> dict:
    r = engine.json([
        {"role": "system", "content": "You write short spoken English monologues for language learners. Answer with JSON only."},
        {"role": "user", "content": f'Topic (given in French, write in English): "{topic}". Target CEFR level: {level}.\n'
            f"Write 10 to 12 natural spoken sentences, like the script of a short YouTube video, each 8 to 24 words, with vocabulary "
            f'typical of level {level}. Give a short catchy English title.\nJSON: {{"title": "...", "sentences": ["...", "..."]}}'},
    ], max_tokens=700, temperature=0.8)
    sentences = [str(s).strip() for s in (r.get("sentences") or []) if str(s).strip()]
    if len(sentences) < 3:
        raise ValueError("Le texte généré est trop court. Réessaie.")
    return {"title": str(r.get("title") or topic)[:140], "sentences": sentences}


def estimate_level(engine, material: dict) -> str | None:
    r = engine.json([
        {"role": "system", "content": "You assess how difficult English texts are for learners. Answer with JSON only."},
        {"role": "user", "content": "Which CEFR level (A1, A2, B1, B2, C1 or C2) does a learner need to understand this spoken "
            f'English comfortably?\n\n{excerpt(material, 2500)}\n\nJSON: {{"level": "B2"}}'},
    ], max_tokens=30, temperature=0)
    return r.get("level") if r.get("level") in LEVELS else None


def content_turn(engine, material: dict, history: list[dict], message: str | None,
                 on_reply: Callable[[str, bool], None] | None = None) -> dict:
    system = ("You are English Coach, a friendly, demanding speaking coach for a French adult learner.\n"
              f'The learner just studied "{material["title"]}" (level {material.get("level") or "unknown"}):\n"""\n{excerpt(material)}\n"""\n'
              "Answer with JSON only, in this order:\n"
              '- "reply": your next message in English: ONE open question about the content, then about the learner\'s opinion and experience. Under 40 words.\n'
              '- "corrections": up to 3 real mistakes in the learner\'s last message: "original" (their words), "better" (natural English), "why" (short, in French). Empty list if none. Ignore capitals and punctuation.\n'
              '- "tip": one short sentence in French with an expression to reuse.\n'
              f"Format: {FORMAT_TURN}")
    msgs = [{"role": "system", "content": system}, *history[-6:],
            {"role": "user", "content": f"Learner: {message}" if message else "Start with your first question. Corrections must be empty."}]
    return _clean_turn(engine.json(msgs, max_tokens=320, stream_field="reply", on_partial=on_reply), message)


def roleplay_turn(engine, scenario: dict, custom: str, level: str | None, history: list[dict], message: str | None,
                  on_reply: Callable[[str, bool], None] | None = None) -> dict:
    role = f'a character in this situation described by the learner: "{custom}"' if scenario["key"] == "custom" else scenario["role"]
    system = (f"You are playing {role}. The learner is a French speaker practising spoken English{f' (level {level})' if level else ''}.\n"
              "Answer with JSON only, in this order:\n"
              '- "reply": your next line, in character: 1 to 3 short spoken sentences, under 40 words, usually ending with a question.\n'
              '- "corrections": out of character, up to 3 real mistakes in the learner\'s last message: "original", "better", "why" (short, in French). Empty list if none. Ignore punctuation: messages come from speech recognition.\n'
              '- "tip": one short sentence in French with a useful phrase for this situation.\n'
              f"Format: {FORMAT_TURN}")
    msgs = [{"role": "system", "content": system}, *history[-8:],
            {"role": "user", "content": f"Learner: {message}" if message else f"{scenario['opening']} Corrections must be empty."}]
    return _clean_turn(engine.json(msgs, max_tokens=300, temperature=0.7, stream_field="reply", on_partial=on_reply), message)


def evaluate(engine, context: str, learner_messages: list[str], speech: dict | None = None) -> dict:
    listing = "\n".join(f"{i + 1}. {m}" for i, m in enumerate(learner_messages))[-3500:]
    oral = f"\nSpeaking data: {speech['wpm']} words per minute on average, {speech['pauses']} long pauses." if speech else ""
    r = engine.json([
        {"role": "system", "content": "You are a strict but fair CEFR English examiner. Answer with JSON only. strengths, work_on and summary are in French."},
        {"role": "user", "content": f"A French learner took part in: {context}.\nTheir messages:\n{listing}{oral}\n\n"
            "Judge grammar, vocabulary range, fluency and how well ideas are developed. Short answers are weak evidence: do not overrate.\n"
            'JSON: {"level": "B1", "score": 0-100, "strengths": ["..."], "work_on": ["..."], "summary": "..."}'},
    ], max_tokens=450, temperature=0.2)
    try:
        score = max(0, min(100, round(float(r.get("score", 0)))))
    except (TypeError, ValueError):
        score = 0
    return {"level": r.get("level") if r.get("level") in LEVELS else None, "score": score,
            "strengths": [str(s) for s in (r.get("strengths") or [])][:3],
            "work_on": [str(s) for s in (r.get("work_on") or [])][:3], "summary": str(r.get("summary") or "")}


def explain(engine, expression: str, context: str = "") -> dict:
    r = engine.json([
        {"role": "system", "content": "You are an English teacher for French speakers. Answer with JSON only."},
        {"role": "user", "content": f'Expression: "{expression}"' + (f'\nSentence where it appeared: "{context}"' if context else "") +
            "\nGive its meaning in this context in French (a few words), and one short natural English example sentence.\n"
            'JSON: {"meaning_fr": "...", "example": "..."}'},
    ], max_tokens=120, temperature=0.3)
    return {"meaning": str(r.get("meaning_fr") or "").strip(), "example": str(r.get("example") or "").strip()}
