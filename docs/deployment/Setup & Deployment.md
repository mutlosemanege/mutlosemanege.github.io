# Setup & Deployment

> ⬆ [[../index]] · [[00_Übersicht]]

Alles was du brauchst um Kalender-AI einzurichten, lokal zu entwickeln und zu deployen.

---

## Enthaltene Dokumente

```
Setup & Deployment
├── [[00_Übersicht]]         — Diese Übersicht
├── [[../README]]             — Projektübersicht, lokale Entwicklung, Stack
├── [[GOOGLE_SETUP]]          — Google Cloud, Calendar API, OAuth2 einrichten
└── [[NETLIFY_SETUP]]         — Netlify Deployment, Anthropic API-Key, Serverless
```

---

## Reihenfolge beim Ersteinrichten

1. **[[GOOGLE_SETUP]]** — Zuerst: Google Cloud Projekt + OAuth2 Client ID erstellen
2. **[[NETLIFY_SETUP]]** — Dann: Netlify Site anlegen + Umgebungsvariablen setzen
3. **[[../README]]** — Danach: Lokale Entwicklung starten (`npm run dev`)

---

## Schnellreferenz

### Wichtige URLs
| Dienst | URL |
|--------|-----|
| Google Cloud Console | https://console.cloud.google.com |
| Anthropic Console | https://console.anthropic.com |
| Netlify Dashboard | https://app.netlify.com |

### Benötigte Umgebungsvariablen
| Variable | Quelle | Wo eingetragen |
|----------|--------|---------------|
| `NUXT_PUBLIC_GOOGLE_CLIENT_ID` | Google Cloud → Anmeldedaten | `.env` + Netlify |
| `NUXT_PUBLIC_GOOGLE_CALENDAR_ID` | `primary` (Standard) | `.env` + Netlify |
| `NUXT_PUBLIC_BASE_URL` | Netlify Site URL | `.env` + Netlify |
| `ANTHROPIC_API_KEY` | Anthropic Console | Nur Netlify (nicht lokal commiten) |

### Lokal starten
```bash
cp .env.example .env  # Dann Werte eintragen
npm install
npm run dev           # → localhost:3000
```

### Deployen
```bash
git push origin main  # Netlify baut automatisch
```

---

## Bekannte Fallstricke

- Google OAuth: URL muss **exakt** mit dem Eintrag in der Google Cloud Console übereinstimmen (kein trailing `/`)
- `ANTHROPIC_API_KEY` niemals in `.env` committen — nur in Netlify Environment Variables
- Nach dem Ändern von Netlify-Env-Variablen: manueller Re-Deploy nötig

---

*Übergeordnet: [[../index]]*
