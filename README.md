# Kalender-AI

> ⬆ [[Setup & Deployment]] · [[_INDEX]]
> Geschwister: [[GOOGLE_SETUP]] · [[NETLIFY_SETUP]]

KI-gestützte Google Kalender Web-App. Plane, priorisiere und manage Aufgaben mit Claude-Unterstützung — direkt mit deinem Google Kalender verknüpft.

**Stack:** Nuxt 4 (SPA) · Tailwind CSS · Google Calendar API · Anthropic Claude API · Netlify

---

## Voraussetzungen

- Node.js 20 oder höher
- Google Cloud Projekt mit Calendar API und OAuth2 Client ID → [GOOGLE_SETUP.md](GOOGLE_SETUP.md)
- Anthropic API-Key (für KI-Features) → [NETLIFY_SETUP.md](NETLIFY_SETUP.md)

---

## Lokale Entwicklung

```bash
# 1. Abhängigkeiten installieren
npm install

# 2. Umgebungsvariablen einrichten
cp .env.example .env
# .env ausfüllen (Google Client ID + Anthropic API Key)

# 3. Entwicklungsserver starten
npm run dev
# → http://localhost:3000
```

**Benötigte `.env`-Variablen:**

```env
NUXT_PUBLIC_GOOGLE_CLIENT_ID=deine-client-id
NUXT_PUBLIC_GOOGLE_CALENDAR_ID=primary
NUXT_PUBLIC_BASE_URL=http://localhost:3000
NUXT_PUBLIC_AI_ENABLED=true
ANTHROPIC_API_KEY=sk-ant-api03-...
```

---

## Deployment (Netlify)

Die App wird auf Netlify deployed (Serverless Functions für KI-Features erforderlich).

Vollständige Anleitung: [NETLIFY_SETUP.md](NETLIFY_SETUP.md)

```bash
# Produktions-Build (Netlify-Preset)
npm run build

# Statische Generierung (ohne Serverless Functions — ohne KI)
npm run generate

# Build lokal testen
npm run preview
```

---

## KI-Features

Alle KI-Features laufen **serverseitig** via Netlify Serverless Functions:

| Feature | Beschreibung |
|---------|-------------|
| **KI-Priorisierung** | Claude rankt Aufgaben nach Dringlichkeit und gibt Begründungen |
| **Auto-Planen** | Greedy-Algorithmus plant Tasks in freie Kalenderslots (respektiert Arbeitszeiten, Deep-Work-Fenster, Deadlines) |
| **Projekt-Generator** | Claude generiert 3–12 Aufgaben mit Dependencies aus einer Projektbeschreibung |
| **Planungs-Chat** | Natürliche Sprache → Termin oder Aufgabe ("Meeting morgen 14 Uhr") |
| **Deadline-Watcher** | Automatische Warnungen bei nahenden oder überfälligen Deadlines |

---

## Projektstruktur

```
app/
  components/        Vue-Komponenten (13 Stück)
    NavBar.vue        Navigation, Auth, Quick-Actions
    AISidebar.vue     Aufgaben-Panel mit allen KI-Aktionen (611 Zeilen)
    CalendarGrid.vue  Monatsansicht
    WeekView.vue      Wochenansicht mit Zeitachse
    PlanningChat.vue  KI-Planungsassistent (557 Zeilen)
    TaskModal.vue     Aufgabe erstellen/bearbeiten
    EventModal.vue    Kalendertermin erstellen/bearbeiten
    PreferencesModal.vue  Einstellungen & Routinen
    ProjectGenerator.vue  KI-Projekt-Wizard
    DeadlineWarning.vue   Deadline-Warnungen
    EventItem.vue     Event-Badge in Kalenderansichten

  composables/       Zustandslogik & API-Anbindungen
    useGoogleAuth.ts   Google OAuth2, Access Token
    useCalendar.ts     Google Calendar CRUD
    useTasks.ts        Aufgaben & Projekte (IndexedDB)
    useScheduler.ts    Planungs-Engine + findFreeSlots
    useAI.ts           Anthropic API Integration
    usePreferences.ts  Nutzereinstellungen (localStorage)
    useDeadlineWatcher.ts  Deadline-Überwachung

  pages/
    index.vue         Einzige Seite (SPA)

  types/
    task.ts           Task, Project, UserPreferences, etc.

server/
  api/ai/
    prioritize.post.ts       Claude Haiku — Task-Priorisierung
    generate-project.post.ts Claude Haiku — Projekt-Generierung
```

---

## Datenspeicherung

| Daten | Speicherort |
|-------|------------|
| Kalender-Events | Google Calendar (via REST API) |
| Aufgaben & Projekte | IndexedDB (lokal im Browser, via `idb-keyval`) |
| Nutzereinstellungen | localStorage |
| Auth-Token | Nur im Memory (kein localStorage) |

---

## Bekannte Einschränkungen

- Kein automatisches Google OAuth Token Refresh (läuft nach ~1h ab)
- Kein Sync zwischen Google Calendar und lokaler IndexedDB
- Kein Undo nach Auto-Scheduling
- Planungs-Chat: kein Support für Wochentagnamen oder spezifische Daten ("am 15.")
- Keine Browser-Benachrichtigungen für Deadlines

Ausführliche Feature-Planung: [AI_FEATURE_ROADMAP.md](AI_FEATURE_ROADMAP.md)

---

## Dokumentation

| Datei | Inhalt |
|-------|--------|
| [GOOGLE_SETUP.md](GOOGLE_SETUP.md) | Google Cloud Projekt, Calendar API, OAuth2 einrichten |
| [NETLIFY_SETUP.md](NETLIFY_SETUP.md) | Netlify Deployment, Anthropic API-Key konfigurieren |
| [CLAUDE.md](CLAUDE.md) | Vollständige Architektur-Dokumentation (für KI-Assistenten) |
| [AI_FEATURE_ROADMAP.md](AI_FEATURE_ROADMAP.md) | KI-Feature-Roadmap mit Prioritäten und Status |
| [REDESIGN-PROMPT.md](REDESIGN-PROMPT.md) | Premium Dark-Mode Redesign Prompt (für Codex) |
