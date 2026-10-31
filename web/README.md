# English Coach — version web

Le site web reprend les principes de l'app iPhone : tout tourne **dans le navigateur**, sans clé d'API, sans serveur et sans compte. Il va plus loin sur quatre points :

| Amélioration | Ce que ça donne |
|---|---|
| **Coach plus intelligent** | Modèle de 3 milliards de paramètres par défaut (Qwen 2.5 3B), jusqu'à 7-8 milliards (Qwen 2.5 7B ou Llama 3.1 8B) si la carte graphique le permet, contre 1,5 milliard sur l'iPhone. Il lit un extrait deux fois plus long du contenu. |
| **Révision du vocabulaire** | Carnet alimenté en un clic (un mot dans une transcription), par les mots mal prononcés et par les corrections du coach. Révision en répétition espacée (SM-2), réponse écrite ou orale, et le coach explique le sens en français. |
| **Conversation libre à l'oral** | Jeux de rôle à la voix : entretien d'embauche Data Engineer, appel RH, réunion d'équipe, small talk, hôtel, restaurant, ou une situation que tu décris. Le coach joue son rôle, répond à voix haute et corrige chaque phrase, puis fait un bilan CECRL. |
| **Analyse de prononciation** | Whisper donne l'horodatage de chaque mot. Tu vois les mots reconnus ou non (clique pour les écouter), une frise de ton débit avec les pauses longues, tes hésitations (« um », « euh »), et tu réécoutes ta voix à côté du modèle. |

Il y a aussi :
- la **recherche de podcasts** dans l'annuaire Apple Podcasts, plus 17 suggestions classées par niveau CECRL et par thème (apprendre l'anglais, business, tech et data, actualité, science, culture) ;
- des **suggestions pour chaque source**, adaptées à ton niveau :
  - **YouTube** : 14 chaînes et recherches, qui ouvrent YouTube filtré sur les vidéos sous-titrées ;
  - **Texte** : 6 textes prêts à pratiquer en un clic, de A2 à C1, et 8 sites de textes gradués ;
  - **Thème** : des idées de sujets ;
  - **Fichier** : des idées de fichiers à importer ;
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

## Ordinateurs avec 8 Go de mémoire (Mac M1, portables)

Par défaut, le coach utilise le niveau « Léger » : un modèle plus gros peut saturer la mémoire et figer tout l'ordinateur. Le coach occupe la carte graphique avec une fenêtre de contexte limitée (2 048 tokens), et il en est retiré après 8 minutes d'inactivité. La reconnaissance vocale « Rapide » tourne sur le processeur pour ne pas concurrencer le coach sur la carte graphique.

## Vitesse sur les ordinateurs modestes

Sur un Mac M1 ou un portable avec 8 Go de mémoire :
- **La réponse du coach s'affiche pendant qu'elle s'écrit**, et la voix la lit dès qu'elle est complète, avant même la fin des corrections.
- **Le coach se charge en arrière-plan** à l'ouverture du site s'il est déjà téléchargé.
- **La vitesse est mesurée**. Si elle est faible, le site propose de passer au niveau « Léger », environ deux fois plus rapide.
- **La reconnaissance vocale est en mode « Rapide »** par défaut (Whisper tiny, environ deux fois plus rapide), et elle est préchargée dès l'ouverture d'un exercice oral ou d'une conversation. Tu peux passer en mode « Précis » dans Réglages.

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
