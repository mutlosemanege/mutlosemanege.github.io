# Kalender

Eine statische Web-App zur Verwaltung von Google Kalender Terminen. Gebaut mit Nuxt, Tailwind CSS und der Google Calendar API. Laeuft komplett im Browser ohne Backend.

## Voraussetzungen

- Node.js 20 oder hoeher
- Ein Google Cloud Projekt mit aktivierter Calendar API und OAuth2 Client ID (siehe [GOOGLE_SETUP.md](GOOGLE_SETUP.md))

## Lokale Entwicklung

1. Repository klonen und Abhaengigkeiten installieren:

   ```bash
   git clone <REPO_URL>
   cd kalender-ai
   npm install
   ```

2. Umgebungsvariablen einrichten:

   ```bash
   cp .env.example .env
   ```

   Trage in der `.env`-Datei deine Google Client ID ein:

   ```
   NUXT_PUBLIC_GOOGLE_CLIENT_ID=deine-client-id-hier
   NUXT_PUBLIC_GOOGLE_CALENDAR_ID=primary
   NUXT_PUBLIC_BASE_URL=
   ```

3. Entwicklungsserver starten:

   ```bash
   npm run dev
   ```

   Die App ist unter `http://localhost:3000` erreichbar.

## Statische Generierung

```bash
npm run generate
```

Die statischen Dateien werden in `.output/public/` erzeugt.

## Deployment auf GitHub Pages

### GitHub Secrets konfigurieren

Navigiere in deinem Repository zu **Settings > Secrets and variables > Actions** und erstelle folgende Secrets:

| Secret                            | Beschreibung                                                  |
| --------------------------------- | ------------------------------------------------------------- |
| `NUXT_PUBLIC_GOOGLE_CLIENT_ID`    | Deine Google OAuth2 Client ID                                 |
| `NUXT_PUBLIC_GOOGLE_CALENDAR_ID`  | Kalender-ID (optional, Standard: `primary`)                   |
| `NUXT_PUBLIC_BASE_URL`            | Die GitHub Pages URL, z.B. `https://user.github.io/repo-name` |

### Erstes Deployment

1. Pushe deinen Code auf den `main`-Branch. Die GitHub Action baut die App automatisch und deployed sie auf den Branch `gh-pages`.

2. Aktiviere GitHub Pages in den Repository-Einstellungen:
   - Gehe zu **Settings > Pages**
   - Unter **Source** waehle den Branch `gh-pages` und den Ordner `/ (root)`
   - Klicke auf **Save**

3. Nach wenigen Minuten ist die App unter `https://<USERNAME>.github.io/<REPO_NAME>/` erreichbar.

### Wichtig

Stelle sicher, dass die GitHub Pages URL in der Google Cloud Console als autorisierte JavaScript-Quelle und Weiterleitungs-URI eingetragen ist (siehe [GOOGLE_SETUP.md](GOOGLE_SETUP.md)).

## Projektstruktur

```
app/
  components/    - Vue-Komponenten (NavBar, CalendarGrid, WeekView, EventModal, EventItem)
  composables/   - Composables (useGoogleAuth, useCalendar)
  pages/         - Seiten (index.vue)
  app.vue        - Root-Komponente
nuxt.config.ts   - Nuxt-Konfiguration
tailwind.config.ts - Tailwind CSS Konfiguration
```

## Technologien

- [Nuxt](https://nuxt.com) (SPA-Modus, statisch generiert)
- [Tailwind CSS](https://tailwindcss.com)
- [Google Identity Services](https://developers.google.com/identity/gsi/web) (OAuth2)
- [Google Calendar API](https://developers.google.com/calendar)
