# English Coach — version Python

Équivalent du site web, écrit **entièrement en Python** avec [Streamlit](https://streamlit.io). Tout tourne sur ton ordinateur, **sans clé d'API, sans compte et sans autre application à installer** : le coach IA, la reconnaissance vocale et la voix sont des bibliothèques Python installées avec `pip`.

## Ce que le Python apporte par rapport au site web

| | Site web | Version Python |
|---|---|---|
| Transcription YouTube | à coller à la main | **récupérée automatiquement** (`youtube-transcript-api`) |
| Podcasts | certains bloqués par le navigateur | **tous téléchargeables** (pas de restriction CORS) |
| Coach sur Mac M1 | WebGPU dans Chrome, peut saturer la mémoire | **MLX d'Apple**, optimisé pour les puces M1/M2/M3, plus rapide et plus léger |
| Reconnaissance vocale | Whisper dans le navigateur | **faster-whisper**, 4 fois plus rapide que Whisper d'origine sur processeur |
| Partage | un simple lien | il faut installer Python (voir plus bas) |

On retrouve toutes les fonctionnalités du site :
- **les contenus** : podcast avec recherche et suggestions, fichier audio ou vidéo, YouTube, texte, thème généré par le coach ;
- **les 5 exercices**, avec l'analyse de prononciation ;
- **le coach**, dont la réponse s'affiche pendant qu'elle s'écrit ;
- **la conversation libre** en jeux de rôle ;
- **le carnet de vocabulaire** en répétition espacée ;
- **la progression**, la sauvegarde et la restauration.

## Installation (une fois)

Il faut **Python 3.11 ou 3.12** (sur Mac : `brew install python@3.12`, ou le site python.org).

```bash
cd python
python3 -m venv .venv
source .venv/bin/activate          # Windows : .venv\Scripts\activate
pip install -r requirements.txt
```

## Lancer

```bash
cd python
source .venv/bin/activate
streamlit run app.py
```

Le navigateur s'ouvre sur http://localhost:8501.

Au premier usage, deux modèles se téléchargent depuis Hugging Face, une seule fois :
- le **coach** : environ 1 Go en niveau « Léger » ;
- **Whisper** : environ 75 Mo en mode « Rapide ».

Ils sont ensuite gardés dans `~/.cache/huggingface` et l'app fonctionne hors ligne. Tes données (contenus, progression, carnet, fichiers audio) sont dans `~/.english_coach`.

## Comment ça marche

| Brique | Bibliothèque Python |
|---|---|
| Interface | `streamlit` (8 pages, dans `views/`) |
| Coach (questions, corrections, bilans, textes) | `mlx-lm` sur Mac Apple Silicon, `transformers` + `torch` ailleurs. Modèles Qwen 2.5 (1,5B, 3B ou 7B) |
| Reconnaissance vocale | `faster-whisper` (tiny, base ou small), sur le processeur pour laisser la mémoire au coach |
| Voix | commande `say` du Mac (voix Samantha), `pyttsx3` sous Windows et Linux |
| YouTube, podcasts | `youtube-transcript-api`, annuaire Apple Podcasts et flux RSS via `requests` |
| Données | SQLite (`englishcoach/db.py`) |

```
python/
├── app.py                 point d'entrée Streamlit (navigation, barre latérale)
├── englishcoach/          la logique, sans interface : réutilisable et testée
│   ├── textproc.py        transcriptions, exercices, analyse de prononciation
│   ├── srs.py             répétition espacée
│   ├── coach.py           tous les prompts du coach
│   ├── llm.py             moteur du modèle (MLX ou transformers)
│   ├── speech.py          Whisper et voix
│   ├── sources.py         YouTube, podcasts
│   ├── suggestions.py     suggestions par niveau (+ suggestions.json)
│   └── db.py              stockage SQLite
├── views/                 une page Streamlit par fichier
└── tests/                 pytest (logique) + test de fumée de l'interface
```

## Tests

```bash
pip install pytest
pytest                      # 13 tests de la logique (transcriptions, exercices, coach simulé, base de données…)
python tests/smoke_ui.py    # parcourt les 8 pages avec un faux Streamlit et des modèles simulés
```

## Partager avec quelqu'un

Cette version tourne sur la machine où elle est lancée. Pour la faire utiliser à une autre personne :
1. elle installe Python, clone le dépôt et suit les étapes ci-dessus ;
2. ou tu l'héberges sur un serveur avec une carte graphique, ce qui devient payant. Le partage gratuit par simple lien reste le rôle du site web.
