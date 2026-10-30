# EnglishCoach

App iPhone pour pratiquer l'anglais à l'oral, **entièrement hors ligne** : coach IA embarqué (Qwen 2.5 1.5B via llama.cpp), reconnaissance vocale iOS sur l'appareil, podcasts, vidéos YouTube, 5 exercices et suivi de progression. Aucune clé d'API ni serveur.

Le code est dans [`mobile/`](mobile/), avec le guide complet dans [`mobile/README.md`](mobile/README.md).

## Démarrage rapide

Prérequis : un Mac avec Xcode, Node.js 20+, l'iPhone branché en USB.

```bash
cd mobile
npm install
npx expo install --fix
npx expo run:ios --device
```

Au premier lancement, télécharge le coach (environ 1 Go) depuis l'onglet **Coach** ou **Mon compte**.

> L'ancienne version web (Django + faster-whisper) reste consultable dans l'historique Git, jusqu'au commit `2fa7b2d`.
