# Kalender-AI — Projekt-Hub

> KI-gestützte Google Kalender Web-App · Nuxt 4 · Tailwind · Claude API · Netlify

---

## Schnellstart

| Was | Wo |
|-----|-----|
| Einrichten & Deployen | [[Setup & Deployment]] |
| Architektur verstehen | [[Architektur & Entwicklung]] |
| Features planen | [[Planung & Design]] |
| Techniken nachschlagen | [[skills/00 Skills Übersicht]] |
| Slash Commands | [[Claude Commands]] |
| App starten | `npm run dev` → localhost:3000 |

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

```
_INDEX  (dieser Hub)
│
├── [[Setup & Deployment]]          Einrichten, deployen, Env-Variablen
│     ├── [[README]]                Projektübersicht & lokale Entwicklung
│     ├── [[GOOGLE_SETUP]]          Google Cloud, Calendar API, OAuth2
│     └── [[NETLIFY_SETUP]]         Netlify, Anthropic API-Key, Serverless
│
├── [[Architektur & Entwicklung]]   Technische Dokumentation & Patterns
│     └── [[CLAUDE]]                Vollständige Codebase-Dokumentation
│
├── [[Planung & Design]]            Features, Roadmap, Redesign
│     ├── [[AI_FEATURE_ROADMAP]]    KI-Feature-Roadmap (✓ erledigt / ◻ offen)
│     └── [[REDESIGN-PROMPT]]       Premium Redesign Prompt für Codex
│
├── [[skills/00 Skills Übersicht]]  Techniken aus der Entwicklung
│     ├── [[skills/Greedy-Scheduler]]
│     ├── [[skills/KI-Priorisierung]]
│     ├── [[skills/Multi-Block-Scheduling]]
│     ├── [[skills/Rescheduling-Modi]]
│     ├── [[skills/Planungs-Chat-NLP]]
│     ├── [[skills/Google-OAuth2-Browser]]
│     ├── [[skills/IndexedDB-Vue3]]
│     ├── [[skills/Nuxt-Serverless-KI]]
│     ├── [[skills/Glassmorphism-Redesign]]
│     ├── [[skills/Tailwind-Design-System]]
│     └── [[skills/Deadline-Watcher]]
│
├── [[Claude Commands]]             Slash Commands für Claude Code
│     /status · /roadmap · /redesign · /feature
│
└── [[Archiv]]                      Historische Dokumente
      └── [[Prompt]]                Ursprünglicher Build-Prompt
```

---

## Aktueller Status

### Zuletzt abgeschlossen
- Scheduling-Flow gehärtet, Race Conditions behoben
- Buffer um bestehende Kalender-Events beim Auto-Planen
- Scheduler: Slot-Auswahl für kleine und große Tasks verbessert
- Projektordner löschbar
- KI-Priorisierung mit Begründungstext (`priorityReason`, `prioritySource`)
- Rescheduling-Modi implementiert (gleiche Uhrzeit, noch heute, nächster Slot, Rest verteilen)
- Planungs-Chat: Wochentage, Wiederholungen und Slot-Begründungen

### Branch: `frontend-redesign`
Offene Änderungen:
- `PreferencesModal.vue` — (staged) Änderungen
- `useScheduler.ts` — (unstaged) Änderungen
- `task.ts` — (unstaged) Änderungen

### Nächste Schritte (aus [[AI_FEATURE_ROADMAP]])
- [ ] Projektgenerator direkt mit erster Terminierung koppeln
- [ ] Zu große Projekte markieren wenn Umfang unplausibel
- [ ] Frontend-Redesign ausführen ([[REDESIGN-PROMPT]] → Codex)

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
