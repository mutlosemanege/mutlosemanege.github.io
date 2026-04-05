# Kalender-AI — Projekt-Hub

> KI-gestützte Google Kalender Web-App · Nuxt 4 · Tailwind · Claude API · Netlify

---

## Schnellstart

| Was | Wo |
|-----|-----|
| Architektur & Dev-Guide | [[CLAUDE]] |
| App starten | `npm run dev` → localhost:3000 |
| Google Auth einrichten | [[GOOGLE_SETUP]] |
| Netlify deployen | [[NETLIFY_SETUP]] |
| Feature-Planung | [[AI_FEATURE_ROADMAP]] |
| Frontend-Redesign (Codex) | [[REDESIGN-PROMPT]] |

---

## Projekt-Struktur

```
app/
  components/     NavBar, AISidebar, CalendarGrid, WeekView,
                  PlanningChat, TaskModal, EventModal,
                  PreferencesModal, ProjectGenerator, ...
  composables/    useGoogleAuth, useCalendar, useTasks,
                  useScheduler, useAI, usePreferences,
                  useDeadlineWatcher
  pages/          index.vue  (single-page app)
  types/          task.ts  (Task, Project, UserPreferences, ...)
  assets/css/     main.css  (globale Stile)
server/
  api/ai/         prioritize.post.ts, generate-project.post.ts
```

---

## Dokumenten-Karte

### Setup & Deployment
- [[GOOGLE_SETUP]] — Google Cloud Projekt, Calendar API, OAuth2 einrichten
- [[NETLIFY_SETUP]] — Netlify Deployment, Anthropic API-Key, Serverless Functions
- [[README]] — Übersicht, lokale Entwicklung, GitHub Secrets

### Entwicklung & Architektur
- [[CLAUDE]] — Vollständige Codebase-Dokumentation für Claude Code (Architektur, Patterns, Komponenten, Composables, Limitations)

### Planung & Design
- [[AI_FEATURE_ROADMAP]] — KI-Feature-Roadmap mit Status (✓ erledigt / ◻ offen)
- [[REDESIGN-PROMPT]] — Premium Dark-Mode Redesign Prompt für Codex (vollständig, ausführbar)

### Archiv
- [[Prompt]] — Ursprünglicher Subagent-Prompt aus dem ersten Build (historisch)

---

## Aktueller Status

### Zuletzt abgeschlossen
- Scheduling-Flow gehärtet, Race Conditions behoben
- Buffer um bestehende Kalender-Events beim Auto-Planen
- Scheduler: Slot-Auswahl für kleine und große Tasks verbessert
- Projektordner löschbar
- KI-Priorisierung mit Begründungstext (`priorityReason`, `prioritySource`)

### Branch: `frontend-redesign`
Offene Änderungen:
- `PreferencesModal.vue` — (staged) Änderungen
- `useScheduler.ts` — (unstaged) Änderungen
- `task.ts` — (unstaged) Änderungen

### Nächste Schritte (aus [[AI_FEATURE_ROADMAP]])
- [ ] Mehrere Rescheduling-Modi (`gleiche Uhrzeit`, `noch heute`, `naechster Slot`)
- [ ] Planungs-Chat: Wochentage und Wiederholungen besser erkennen
- [ ] Projektgenerator direkt mit Terminierung koppeln

---

## KI-Features (bereits live)

| Feature | Auslöser | Endpoint / Composable |
|---------|----------|----------------------|
| Task-Priorisierung | AISidebar → "KI Priorisierung" | `useAI().prioritizeTasks()` → `server/api/ai/prioritize.post.ts` |
| Auto-Scheduling | AISidebar → "Auto-Planen" | `useScheduler().autoSchedule()` |
| Projekt-Generator | AISidebar → "Projekt generieren" | `useAI().generateProject()` → `server/api/ai/generate-project.post.ts` |
| Planungs-Chat | NavBar → "KI Planer" | `useScheduler().findFreeSlots()` + Regex-Parser |
| Deadline-Watcher | Immer aktiv | `useDeadlineWatcher()` |

---

## Technologie-Stack

| Bereich | Technologie |
|---------|-------------|
| Framework | Nuxt 4, Vue 3, Composition API |
| Styling | Tailwind CSS 3 |
| Datenbank (lokal) | IndexedDB via `idb-keyval` |
| Auth | Google OAuth2 (clientseitig, PKCE) |
| Kalender | Google Calendar REST API (direkt aus Browser) |
| KI | Anthropic Claude claude-haiku-4-5-20251001 (serverseitig via Netlify Functions) |
| Deployment | Netlify (build: `npm run build`, publish: `.output/public`) |

---

*Hub zuletzt aktualisiert: 2026-04-05*
