# EnglishCoach

Coach vocal pour pratiquer l'anglais.

| Dossier | Contenu |
|---|---|
| `mobile/` | **App iPhone** (Expo / React Native), entièrement hors ligne : coach IA embarqué (Qwen 2.5 1.5B via llama.cpp), reconnaissance vocale iOS sur l'appareil, podcasts, vidéos YouTube, 5 exercices, suivi de progression. Aucune clé d'API ni serveur. Voir [`mobile/README.md`](mobile/README.md). |
| `config/`, `accounts/`, `englishcoach/` | Application web Django (comptes, moteur audio avec faster-whisper). |

## Démarrage rapide de l'app iPhone

Prérequis : un Mac avec Xcode, Node.js 20+, l'iPhone branché en USB.

```bash
cd mobile
npm install
npx expo install --fix
npx expo run:ios --device
```

Au premier lancement, télécharge le coach (environ 1 Go) depuis l'onglet **Coach** ou **Mon compte**.
