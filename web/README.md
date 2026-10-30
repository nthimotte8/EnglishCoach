# English Coach — version web

Le site web reprend les principes de l'app iPhone : tout tourne **dans le navigateur**, sans clé d'API, sans serveur et sans compte. Il va plus loin sur quatre points :

| Amélioration | Ce que ça donne |
|---|---|
| **Coach plus intelligent** | Modèle de 3 milliards de paramètres par défaut (Qwen 2.5 3B), jusqu'à 7-8 milliards (Qwen 2.5 7B ou Llama 3.1 8B) si la carte graphique le permet, contre 1,5 milliard sur l'iPhone. Il lit un extrait deux fois plus long du contenu. |
| **Révision du vocabulaire** | Carnet alimenté en un clic (un mot dans une transcription), par les mots mal prononcés et par les corrections du coach. Révision en répétition espacée (SM-2), réponse écrite ou orale, et le coach explique le sens en français. |
| **Conversation libre à l'oral** | Jeux de rôle à la voix : entretien d'embauche Data Engineer, appel RH, réunion d'équipe, small talk, hôtel, restaurant, ou une situation que tu décris. Le coach joue son rôle, répond à voix haute et corrige chaque phrase, puis fait un bilan CECRL. |
| **Analyse de prononciation** | Whisper donne l'horodatage de chaque mot. Tu vois les mots reconnus ou non (clique pour les écouter), une frise de ton débit avec les pauses longues, tes hésitations (« um », « euh »), et tu réécoutes ta voix à côté du modèle. |

Il y a aussi :
- une source **Fichier audio / vidéo** (n'importe quel MP3, M4A, MP4… transcrit par Whisper) ;
- une **série de jours** consécutifs dans la progression ;
- l'**export et l'import** de toutes tes données ;
- l'**installation comme une app**, avec un fonctionnement hors ligne une fois les modèles en cache.

## Comment ça marche

| Brique | Technologie |
|---|---|
| Coach (questions, corrections, bilans, textes, explications de vocabulaire) | [WebLLM](https://github.com/mlc-ai/web-llm) sur la carte graphique (WebGPU), dans un Web Worker. Réponses contraintes par un schéma JSON. |
| Reconnaissance vocale | Whisper base.en via [transformers.js](https://huggingface.co/docs/transformers.js), dans un Web Worker, avec horodatage par mot |
| Voix | Synthèse vocale du système (`speechSynthesis`) |
| Lecteurs | API IFrame YouTube, ou `<audio>` pour les podcasts et les fichiers. Les exercices rejouent le passage exact de l'original. |
| Données | IndexedDB, uniquement dans ce navigateur |

Le code est en JavaScript moderne, sans étape de build : les fichiers de `web/` sont servis tels quels.

## Utiliser le site

**Prérequis : Chrome ou Edge à jour, sur un ordinateur.** Safari et Firefox gèrent mal WebGPU pour l'instant. Une carte graphique récente aide, mais une puce Apple M1 ou un PC portable récent suffisent pour le niveau « Équilibré ».

- **En ligne** : une fois la pull request fusionnée, le site est publié automatiquement sur GitHub Pages, à l'adresse https://nthimotte8.github.io/EnglishCoach/.
- **En local** :
  ```bash
  python3 -m http.server 8000 -d web
  ```
  puis ouvre http://localhost:8000.

Au premier usage du coach, le modèle se télécharge (environ 2,5 Go pour « Équilibré »), une seule fois. Whisper pèse environ 150 Mo. Les deux restent ensuite dans le cache du navigateur.

## Limites

- **YouTube** : un site web ne peut pas récupérer seul la transcription d'une vidéo. Il faut la coller (sous la vidéo : « … Plus », puis « Afficher la transcription »).
- **Podcasts** : beaucoup de serveurs de podcasts interdisent aux sites web de lire leurs fichiers (CORS). Quand c'est le cas, télécharge l'épisode et importe-le via « Fichier audio / vidéo ».
- **Transcription** : seules les 15 premières minutes d'un audio sont transcrites, pour garder un temps raisonnable dans le navigateur.
- **Qualité du coach** : il reste moins fin que Claude ou GPT-4, mais le niveau « Précis » s'en rapproche pour la correction d'erreurs courantes.
- **Données** : tout vit dans ce navigateur. Utilise « Exporter une sauvegarde » dans Réglages pour les garder.

## Tests

```bash
node --test web/tests/unit.test.mjs        # logique : transcriptions, exercices, prononciation, répétition espacée
python3 -m http.server 8123 -d web &       # puis parcours complet de l'interface,
node web/tests/e2e.mjs /tmp                # avec des modèles simulés (demande Playwright)
```

Les tests unitaires tournent sur GitHub Actions à chaque pull request.
