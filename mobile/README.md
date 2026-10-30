# English Coach

App iPhone d'apprentissage de l'anglais à partir de vrais contenus (podcasts, vidéos YouTube, textes générés), avec exercices oraux notés et un coach IA qui corrige et estime le niveau CECRL.

**Tout tourne sur l'iPhone** : pas de clé d'API, pas de serveur, pas de compte, pas d'abonnement. Une fois le coach téléchargé, l'app fonctionne hors ligne, sauf pour récupérer des podcasts ou lire YouTube.


## Comment ça marche sans clé d'API

| Besoin | Brique sur l'iPhone |
|---|---|
| Coach (questions, corrections, bilan de niveau, textes par thème) | **Qwen 2.5 1.5B Instruct**, modèle open source (Apache-2.0) d'environ 1 Go, exécuté par llama.cpp (`llama.rn`). Téléchargé une fois depuis l'app. Ses réponses sont contraintes à un format JSON strict. |
| Reconnaissance vocale (exercices oraux, réponses au coach, transcription des podcasts) | Reconnaissance vocale d'iOS, forcée en mode **sur l'appareil** (`expo-speech-recognition`) |
| Voix de lecture | Synthèse vocale d'iOS (`expo-speech`) |
| Données et progression | SQLite sur le téléphone (`expo-sqlite`) |

Le modèle a été choisi pour tenir dans les 4 Go de mémoire d'un **iPhone 13**. Sur un iPhone plus récent, tu peux en mettre un plus gros : il suffit de changer `MODEL` dans `mobile/src/llm.ts`.

## Installer sur ton iPhone

Prérequis : un Mac avec **Xcode**, Node.js 20+, ton iPhone et un câble USB.

```bash
cd mobile
npm install
npx expo install --fix        # aligne les versions des modules Expo
npx expo run:ios --device     # compile et installe sur l'iPhone branché
```

- La première fois, Xcode te demandera de choisir une équipe de signature. Ton identifiant Apple suffit.
- Sur l'iPhone, autorise le développeur dans Réglages › Général › VPN et gestion de l'appareil.
- Sans compte Apple Developer payant, l'app expire au bout de 7 jours : relance simplement la commande. Le compte payant (99 €/an) lève cette limite et ouvre TestFlight puis l'App Store (`npx eas build -p ios`).
- **Expo Go ne suffit pas** : le modèle d'IA et la reconnaissance vocale demandent une app compilée.

Au premier lancement, ouvre l'onglet **Coach** ou **Mon compte** et touche « Télécharger le coach (1 Go) », de préférence en Wi-Fi.

Si la reconnaissance vocale refuse de démarrer hors ligne, va dans Réglages › Général › Clavier : ajoute le clavier « English (US) » et active la dictée. iOS télécharge alors le modèle vocal anglais.

## Fonctionnalités

| Écran | Ce qu'il fait |
|---|---|
| **Pratiquer** | Lecteur (YouTube ou podcast), transcription synchronisée (toucher une ligne y saute), niveau estimé, débit, contenus récents |
| **Nouveau contenu** | **Podcast** : flux RSS, choix d'un épisode, transcription sur l'iPhone. **YouTube / texte** : lien de la vidéo et transcription collée. **Thème** : texte écrit par le coach au niveau choisi |
| **Exercices** | Lecture à voix haute et Répétition sans texte (notées à partir de ta voix : mots reconnus, débit, pauses longues, mots à retravailler), Reconnaissance à l'écoute, Dictée, Mots manquants |
| **Coach** | Questions sur le contenu, réponse écrite ou orale, corrections expliquées en français, bilan de niveau à la fin |
| **Mon compte** | Niveau, temps de pratique, statistiques, courbe de progression, grille d'activité, historique, gestion du modèle |

## Limites à connaître

- **Qualité du coach.** Un modèle de 1,5 milliard de paramètres reste loin de Claude ou GPT :
  - il repère bien les fautes courantes (accords, temps, prépositions) et pose des questions pertinentes ;
  - il peut rater des erreurs subtiles, ou proposer une correction inutile (l'app filtre déjà les plus évidentes) ;
  - l'estimation du niveau est indicative ;
  - il ne lit qu'un extrait d'environ 1 800 caractères du contenu.
- **Vitesse.** Il faut compter 5 à 15 secondes par réponse du coach sur un iPhone 13, et 20 à 40 secondes pour générer un texte. Le premier appel prend quelques secondes de plus, le temps de charger le modèle.
- **Podcasts.**
  - La transcription prend environ la durée de l'épisode : privilégie les épisodes courts, comme BBC 6 Minute English.
  - iOS est sûr pour les MP3 et M4A standards, mais certains fichiers exotiques peuvent être refusés.
  - Les deux flux suggérés sont à vérifier ; n'importe quel lien RSS fonctionne.
- **YouTube.** Sans serveur, la transcription se colle à la main (sous la vidéo : « … Plus », puis « Afficher la transcription »). La vidéo, elle, se lit dans l'app, et le lecteur reste toujours visible, comme l'exigent les règles de YouTube.
- **Espace.** Le modèle occupe environ 1 Go. Tu peux le supprimer depuis « Mon compte ».
- **Sauvegarde.** Les données restent sur le téléphone. Une réinstallation complète les efface.

## Vérifié avant livraison

- La logique locale a été testée : découpage des transcriptions, génération des exercices, notation de la prononciation, lecture des flux RSS.
- Les 22 fichiers de l'app ont été vérifiés syntaxiquement.
- L'app n'a pas pu être compilée ici, faute d'accès aux paquets npm. La première compilation sur ton Mac peut demander de petits ajustements, surtout autour de `llama.rn` et `expo-speech-recognition`, dont les API évoluent vite.
