"""Content sources fetched by Python: YouTube transcripts, podcast directory and feeds, episode downloads.

Running in Python (not in a browser) removes the web version's limits: YouTube transcripts are fetched
automatically and every podcast can be downloaded (no CORS).
"""
from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from pathlib import Path

import requests

from .textproc import lines_from_segments

UA = {"User-Agent": "EnglishCoach/1.0 (personal language practice)"}
ITUNES = "{http://www.itunes.com/dtds/podcast-1.0.dtd}"
MAX_EPISODE_BYTES = 40 * 1024 * 1024


class SourceError(Exception):
    pass


# ---------------------------------------------------------------- YouTube
def youtube_title(video_id: str) -> str | None:
    try:
        r = requests.get("https://www.youtube.com/oembed", params={"url": f"https://www.youtube.com/watch?v={video_id}", "format": "json"},
                         headers=UA, timeout=10)
        return r.json().get("title") if r.ok else None
    except (requests.RequestException, ValueError):
        return None


def youtube_transcript(video_id: str) -> list[dict]:
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
    except ImportError as e:
        raise SourceError("Le module youtube-transcript-api n’est pas installé (pip install -r requirements.txt).") from e
    langs = ["en", "en-US", "en-GB"]
    try:
        api = YouTubeTranscriptApi()
        if hasattr(api, "fetch"):
            snippets = [{"text": s.text, "start": s.start} for s in api.fetch(video_id, languages=langs)]
        else:  # versions < 1.0
            snippets = YouTubeTranscriptApi.get_transcript(video_id, languages=langs)
    except Exception as e:
        raise SourceError("Aucune transcription anglaise n’a pu être récupérée pour cette vidéo (absente, ou refusée par "
                          "YouTube). Colle-la à la main dans le champ prévu.") from e
    return lines_from_segments(snippets)


# ---------------------------------------------------------------- podcasts
def _itunes(path: str, params: dict) -> list[dict]:
    try:
        r = requests.get(f"https://itunes.apple.com/{path}", params=params, headers=UA, timeout=15)
        r.raise_for_status()
        return r.json().get("results", [])
    except (requests.RequestException, ValueError) as e:
        raise SourceError("L’annuaire des podcasts ne répond pas. Vérifie ta connexion.") from e


def to_show(r: dict) -> dict:
    return {"id": r.get("collectionId"), "title": r.get("collectionName") or r.get("trackName") or "Podcast",
            "author": r.get("artistName") or "", "artwork": r.get("artworkUrl600") or r.get("artworkUrl100"),
            "genre": r.get("primaryGenreName") or "", "feed_url": r.get("feedUrl"), "count": r.get("trackCount")}


def to_episode(r: dict) -> dict | None:
    url = r.get("episodeUrl") or r.get("previewUrl")
    if not url or (r.get("episodeContentType") and r["episodeContentType"] != "audio"):
        return None
    desc = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", str(r.get("shortDescription") or r.get("description") or ""))).strip()
    return {"title": r.get("trackName") or "Épisode", "audio_url": url,
            "duration": round(r["trackTimeMillis"] / 1000) if r.get("trackTimeMillis") else None,
            "published": r.get("releaseDate"), "description": desc[:220]}


def search_shows(term: str, limit: int = 18) -> list[dict]:
    res = _itunes("search", {"media": "podcast", "entity": "podcast", "limit": limit, "term": term})
    return [to_show(r) for r in res if r.get("collectionId")]


def _duration(raw: str | None) -> int | None:
    if not raw:
        return None
    raw = raw.strip()
    if raw.isdigit():
        return int(raw)
    try:
        total = 0
        for p in raw.split(":"):
            total = total * 60 + int(float(p))
        return total
    except ValueError:
        return None


def parse_feed(xml: bytes | str, limit: int = 30) -> dict:
    try:
        root = ET.fromstring(xml)
    except ET.ParseError as e:
        raise SourceError("Ce lien n’est pas un flux RSS de podcast.") from e
    channel = root.find("channel")
    if channel is None:
        raise SourceError("Ce lien n’est pas un flux RSS de podcast.")
    eps = []
    for item in channel.findall("item"):
        enc = item.find("enclosure")
        if enc is None or not str(enc.get("type", "audio")).startswith("audio") or not enc.get("url"):
            continue
        eps.append({"title": (item.findtext("title") or "Épisode").strip(), "audio_url": enc.get("url"),
                    "published": (item.findtext("pubDate") or "").strip() or None,
                    "duration": _duration(item.findtext(f"{ITUNES}duration")), "description": ""})
        if len(eps) >= limit:
            break
    if not eps:
        raise SourceError("Aucun épisode audio dans ce flux.")
    return {"show": (channel.findtext("title") or "Podcast").strip(), "episodes": eps}


def episodes(show: dict, limit: int = 25) -> list[dict]:
    res = _itunes("lookup", {"id": show["id"], "media": "podcast", "entity": "podcastEpisode", "limit": limit})
    eps = [e for e in (to_episode(r) for r in res if r.get("wrapperType") == "podcastEpisode" or r.get("kind") == "podcast-episode") if e]
    if eps or not show.get("feed_url"):
        return sorted(eps, key=lambda e: str(e.get("published")), reverse=True)
    return feed_episodes(show["feed_url"], limit)["episodes"]


def feed_episodes(feed_url: str, limit: int = 25) -> dict:
    try:
        r = requests.get(feed_url, headers=UA, timeout=20)
        r.raise_for_status()
    except requests.RequestException as e:
        raise SourceError("Flux RSS injoignable.") from e
    return parse_feed(r.content, limit)


def download(url: str, dest: Path, max_bytes: int = MAX_EPISODE_BYTES) -> Path:
    """Downloads the start of an audio file (enough for 15+ minutes of a typical podcast)."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    try:
        with requests.get(url, headers=UA, stream=True, timeout=30) as r:
            r.raise_for_status()
            size = 0
            with open(dest, "wb") as f:
                for chunk in r.iter_content(256 * 1024):
                    f.write(chunk)
                    size += len(chunk)
                    if size >= max_bytes:
                        break
    except requests.RequestException as e:
        dest.unlink(missing_ok=True)
        raise SourceError("Téléchargement de l’épisode impossible.") from e
    return dest
