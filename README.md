# EnglishCoach

Coach pour pratiquer l'anglais à l'oral, **entièrement local et gratuit** : l'IA tourne sur ton appareil, sans clé d'API, sans serveur et sans compte.

| Version | Dossier | Pour qui |
|---|---|---|
| **Site web** | [`web/`](web/) | Chrome ou Edge sur ordinateur. Coach plus puissant (3 à 8 milliards de paramètres), conversation libre à l'oral, analyse de prononciation, carnet de vocabulaire en répétition espacée. Publié sur GitHub Pages : https://nthimotte8.github.io/EnglishCoach/ |
| **App iPhone** | [`mobile/`](mobile/) | iPhone 13 et plus récents (Expo / React Native). Coach embarqué (Qwen 2.5 1.5B), reconnaissance vocale iOS sur l'appareil. |

Les deux partagent les mêmes principes :
- **les sources** : podcast, vidéo YouTube, texte collé, texte généré sur un thème ;
- **les 5 exercices** : lecture à voix haute, répétition sans texte, reconnaissance à l'écoute, dictée, mots manquants ;
- **le coach**, qui pose des questions, corrige et évalue le niveau CECRL ;
- **une progression** stockée localement.

## Démarrage rapide

**Site web** : ouvre https://nthimotte8.github.io/EnglishCoach/ dans Chrome, ou en local :

```bash
python3 -m http.server 8000 -d web   # puis http://localhost:8000
```

**App iPhone** : sur un Mac avec Xcode, l'iPhone branché.

```bash
cd mobile && npm install && npx expo install --fix && npx expo run:ios --device
```

Les détails sont dans [`web/README.md`](web/README.md) et [`mobile/README.md`](mobile/README.md).
