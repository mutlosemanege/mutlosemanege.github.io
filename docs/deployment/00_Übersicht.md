# Übersicht

> ⬆ [[../index|Zurück zum Hub]]

Setup-Anleitungen, Deployment-Konfiguration und erste Schritte.

## Schnellstart-Reihenfolge

1. **[[GOOGLE_SETUP]]** — Google Cloud Projekt + OAuth2 Client ID erstellen
2. **[[NETLIFY_SETUP]]** — Netlify Site anlegen + Umgebungsvariablen setzen
3. **[[Setup & Deployment]]** — Übersicht & lokale Entwicklung

## Dokumentation

| Dokument | Beschreibung |
|----------|--------------|
| [[Setup & Deployment]] | Vollständige Setup-Anleitung |
| [[GOOGLE_SETUP]] | Google Cloud Console, Calendar API, OAuth2 |
| [[NETLIFY_SETUP]] | Netlify Deployment, Anthropic API-Key, Serverless |

## Wichtige URLs

| Dienst | URL |
|--------|-----|
| Google Cloud Console | https://console.cloud.google.com |
| Anthropic Console | https://console.anthropic.com |
| Netlify Dashboard | https://app.netlify.com |

## Benötigte Umgebungsvariablen

| Variable | Quelle | Wo |
|----------|--------|-----|
| `NUXT_PUBLIC_GOOGLE_CLIENT_ID` | Google Cloud → Anmeldedaten | `.env` + Netlify |
| `NUXT_PUBLIC_GOOGLE_CALENDAR_ID` | `primary` (Standard) | `.env` + Netlify |
| `NUXT_PUBLIC_BASE_URL` | Netlify Site URL | `.env` + Netlify |
| `ANTHROPIC_API_KEY` | Anthropic Console | Nur Netlify |

## Lokal starten

```bash
npm install
cp .env.example .env   # Werte eintragen
npm run dev            # → localhost:3000
```

## Bekannte Fallstricke

- Google OAuth: URL muss **exakt** mit dem Eintrag in der Google Cloud Console übereinstimmen
- `ANTHROPIC_API_KEY` niemals committen — nur in Netlify Environment Variables
- Nach Ändern von Netlify-Env-Variablen: manueller Re-Deploy nötig

---

*Zurück: [[../index]]*
