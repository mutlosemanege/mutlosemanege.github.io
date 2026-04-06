# Kalender Web App — Ursprünglicher Build-Prompt (Archiv)

> ⬆ [[Archiv]] · [[_INDEX]]
> **Historisches Dokument.** Spiegelt nicht den aktuellen Projektzustand wider.
> Aktueller Stand: [[CLAUDE]] · [[Setup & Deployment]] · [[AI_FEATURE_ROADMAP]]

---

# Kalender Web App – Nuxt + Google Calendar API → GitHub Pages

Du bist ein erfahrener Full-Stack-Entwickler. Baue eine vollständige Kalender-Web-App mit Nuxt als statisches Frontend, das die **Google Calendar API** per CRUD nutzt und auf **GitHub Pages** deployed wird.

---

## Subagenten

Starte **zwei spezialisierte Subagenten** nacheinander. Warte jeweils auf deren Abschluss, bevor du weiterarbeitest.

---

### Subagent 1 – Google Cloud Setup

**Aufgabe:** Führe den Nutzer Schritt für Schritt durch das vollständige Google Cloud Setup. Erstelle dafür eine Datei `GOOGLE_SETUP.md` mit einer detaillierten Anleitung, die alle nötigen Schritte erklärt.

Die Anleitung muss folgende Punkte abdecken:

1. **Google Cloud Projekt erstellen**
   - Neues Projekt anlegen unter https://console.cloud.google.com
   - Projektname vorschlagen: `kalender-app`

2. **Google Calendar API aktivieren**
   - Navigation: APIs & Dienste → Bibliothek → „Google Calendar API" → aktivieren

3. **OAuth2-Zustimmungsbildschirm konfigurieren**
   - Typ: Extern
   - App-Name, Support-E-Mail, Entwickler-E-Mail ausfüllen
   - Scope hinzufügen: `https://www.googleapis.com/auth/calendar`
   - Test-Nutzer hinzufügen (eigene E-Mail-Adresse)

4. **OAuth2 Client ID erstellen**
   - Navigation: APIs & Dienste → Anmeldedaten → „+ Anmeldedaten erstellen" → OAuth-Client-ID
   - Anwendungstyp: **Webanwendung**
   - Autorisierte JavaScript-Quellen:
     - `http://localhost:3000` (für lokale Entwicklung)
     - `https://<GITHUB_USERNAME>.github.io` (für Produktion – Platzhalter lassen, Nutzer trägt ein)
   - Autorisierte Weiterleitungs-URIs: dieselben zwei URLs
   - Client ID und Client Secret notieren

5. **Umgebungsvariablen vorbereiten**
   Erstelle eine `.env.example` Datei:
```env
   NUXT_PUBLIC_GOOGLE_CLIENT_ID=your-client-id-here
   NUXT_PUBLIC_GOOGLE_CALENDAR_ID=primary
   NUXT_PUBLIC_BASE_URL=https://<GITHUB_USERNAME>.github.io/<REPO_NAME>
```

6. **Wichtige Hinweise**
   - `.env` zur `.gitignore` hinzufügen
   - Die App läuft rein clientseitig (kein Server), OAuth2 PKCE Flow im Browser
   - GitHub Pages URL muss exakt in den autorisierten Quellen stehen

Gib am Ende eine Checkliste aus, die der Nutzer abhaken kann.

---

### Subagent 2 – Nuxt App entwickeln

**Voraussetzung:** Subagent 1 ist abgeschlossen. Die Umgebungsvariablen sind gesetzt.

**Aufgabe:** Baue die vollständige Nuxt Kalender-App.

#### Technischer Stack
- **Nuxt** mit `ssr: false` (Static/SPA Mode)
- **`nuxt generate`** für statischen Output
- **Google Identity Services** (`accounts.google.com/gsi/client`) für OAuth2
- **Google API JS Client** (`apis.google.com/js/api.js`) für Calendar API
- **`@nuxtjs/tailwindcss`** für Styling
- Kein separates Backend – alles läuft im Browser

#### Projektstruktur
```
/
├── nuxt.config.ts
├── app.vue
├── .env.example
├── .gitignore
├── .github/
│   └── workflows/
│       └── deploy.yml          # GitHub Actions Deploy
├── composables/
│   ├── useGoogleAuth.ts        # OAuth2 Login/Logout
│   └── useCalendar.ts          # CRUD Calendar API
├── components/
│   ├── CalendarGrid.vue        # Monatsansicht
│   ├── EventModal.vue          # Event erstellen/bearbeiten
│   ├── EventItem.vue           # Einzelner Event
│   └── NavBar.vue              # Navigation + Login-Button
└── pages/
    └── index.vue               # Hauptseite
```

#### Funktionsanforderungen

**Auth (`useGoogleAuth.ts`):**
- Login via Google OAuth2 (PKCE, implicit flow)
- Logout
- Auth-Status reaktiv als `isLoggedIn`, `userProfile`
- Access Token sicher im Memory halten (kein localStorage)

**Calendar CRUD (`useCalendar.ts`):**
- `fetchEvents(timeMin, timeMax)` – Events eines Zeitraums laden
- `createEvent(event)` – Neuen Event erstellen
- `updateEvent(eventId, event)` – Event bearbeiten
- `deleteEvent(eventId)` – Event löschen
- Fehlerbehandlung mit nutzerfreundlichen Meldungen
- Loading States

**UI:**
- Monatsansicht mit Navigation (Vor/Zurück/Heute)
- auch eine Wochenansicht
- Events auf den jeweiligen Tagen anzeigen (Farbe, Titel, Uhrzeit)
- Klick auf Tag → neuen Event erstellen
- Klick auf Event → Event bearbeiten oder löschen
- Modal für Event-Formular: Titel, Beschreibung, Start- und Enddatum/-uhrzeit
- Responsive Design (Mobile + Desktop)
- Ladezustand und Fehlermeldungen anzeigen

#### `nuxt.config.ts` Anforderungen
```ts
export default defineNuxtConfig({
  ssr: false,
  target: 'static',
  app: {
    baseURL: process.env.NUXT_PUBLIC_BASE_URL ? '/<REPO_NAME>/' : '/',
    head: {
      script: [
        { src: 'https://accounts.google.com/gsi/client', async: true },
        { src: 'https://apis.google.com/js/api.js', async: true }
      ]
    }
  },
  runtimeConfig: {
    public: {
      googleClientId: process.env.NUXT_PUBLIC_GOOGLE_CLIENT_ID,
      googleCalendarId: process.env.NUXT_PUBLIC_GOOGLE_CALENDAR_ID || 'primary'
    }
  },
  modules: ['@nuxtjs/tailwindcss']
})
```

#### GitHub Actions Deploy (`.github/workflows/deploy.yml`)
- Trigger: Push auf `main`
- Node 20, `npm ci`, `npm run generate`
- Deploy `.output/public` auf Branch `gh-pages` via `peaceiris/actions-gh-pages`
- Secret `NUXT_PUBLIC_GOOGLE_CLIENT_ID` aus GitHub Secrets lesen

#### Abschluss
- `README.md` mit Setup-Anleitung schreiben:
  - Lokale Entwicklung
  - GitHub Secrets konfigurieren
  - Erstes Deployment
  - GitHub Pages in Repo-Einstellungen aktivieren (Branch: `gh-pages`)

---

## Ausführungsreihenfolge

1. Subagent 1 starten → `GOOGLE_SETUP.md` + `.env.example` erstellen
2. Nutzer bestätigen lassen, dass Google Setup abgeschlossen
3. Subagent 2 starten → komplette Nuxt App bauen
4. Abschließend alle Dateien auflisten und nächste Schritte zusammenfassen