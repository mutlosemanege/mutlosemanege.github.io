# Kalender-AI — Projekt-Hub

> KI-gestützte Google Kalender Web-App · Nuxt 4 · Tailwind · Claude API · Netlify

---

## Schnellstart

| Was | Wo |
|-----|-----|
| Einrichten & Deployen | [[deployment/00_Übersicht]] |
| Architektur verstehen | [[architektur/00_Übersicht]] |
| Features planen | [[planung/00_Übersicht]] |
| Skills nachschlagen | [[architektur/skills/00 Skills Übersicht]] |
| Slash Commands | [[claude-commands]] |
| App starten | `npm run dev` → localhost:3000 |

---

## Dokumenten-Karte

```
_HUB_  (dieser Index)
│
├── [[deployment/00_Übersicht]]          Einrichten, deployen, Umgebungsvariablen
│     ├── [[deployment/Setup & Deployment]]
│     ├── [[deployment/GOOGLE_SETUP]]
│     └── [[deployment/NETLIFY_SETUP]]
│
├── [[architektur/00_Übersicht]]         Technische Dokumentation & Patterns
│     ├── [[architektur/Architektur & Entwicklung]]
│     ├── [[architektur/COMPONENT_TEMPLATE_ERROR_ANALYSIS]]
│     ├── [[architektur/SECURITY_VALIDATION_REVIEW]]
│     └── [[architektur/skills/00 Skills Übersicht]]
│           ├── [[architektur/skills/Greedy-Scheduler]]
│           ├── [[architektur/skills/KI-Priorisierung]]
│           ├── [[architektur/skills/Multi-Block-Scheduling]]
│           ├── [[architektur/skills/Rescheduling-Modi]]
│           ├── [[architektur/skills/Planungs-Chat-NLP]]
│           ├── [[architektur/skills/Google-OAuth2-Browser]]
│           ├── [[architektur/skills/IndexedDB-Vue3]]
│           ├── [[architektur/skills/Nuxt-Serverless-KI]]
│           ├── [[architektur/skills/Glassmorphism-Redesign]]
│           ├── [[architektur/skills/Tailwind-Design-System]]
│           ├── [[architektur/skills/Deadline-Watcher]]
│           └── [[architektur/skills/Frontend-Design]] · [[architektur/skills/Agent-Generator]]
│
├── [[planung/00_Übersicht]]             Features, Roadmap, Redesign
│     ├── [[planung/Planung & Design]]
│     ├── [[planung/IDEEN_BACKLOG]]
│     ├── [[planung/KI-Fehler und Design-Fehler]]
│     ├── [[planung/Archiv]]
│     ├── [[planung/REDESIGN-PROMPT]]
│     └── [[planung/REDESIGN_CHECKLIST]]
│
├── [[ai/00_Übersicht]]                  KI-Feature-Roadmap
│     ├── [[ai/AI_FEATURE_ROADMAP]]
│     ├── [[ai/AI_FEATURE_ROADMAP_PHASE_3]]
│     ├── [[ai/AI_FEATURE_ROADMAP_PHASE_4]]
│     ├── [[ai/AI_FEATURE_ROADMAP_PHASE_5]]
│     └── [[ai/Verbesserungen-KI-Features]]
│
├── [[testing/00_Übersicht]]             Tests
│     ├── [[testing/TEST_STRATEGY]]
│     └── [[testing/E2E_SMOKE_CHECKLIST]]
│
├── [[prompts/Prompt]]                   Ursprünglicher Build-Prompt
├── [[claude-commands]]                  Claude Code Slash Commands
└── [[prompts/PROMPT_white-mode]]        Legacy: White-Mode Designs
```

---

## Alle Dokumente

### Hub
[[index]] · [[../README]] · [[../CLAUDE]]

### Deployment
[[deployment/00_Übersicht]] · [[deployment/Setup & Deployment]] · [[deployment/GOOGLE_SETUP]] · [[deployment/NETLIFY_SETUP]]

### Architektur
[[architektur/00_Übersicht]] · [[architektur/Architektur & Entwicklung]] · [[architektur/COMPONENT_TEMPLATE_ERROR_ANALYSIS]] · [[architektur/SECURITY_VALIDATION_REVIEW]]

### Planung
[[planung/00_Übersicht]] · [[planung/Planung & Design]] · [[planung/IDEEN_BACKLOG]] · [[planung/KI-Fehler und Design-Fehler]] · [[planung/Archiv]] · [[planung/REDESIGN-PROMPT]] · [[planung/REDESIGN_CHECKLIST]]

### AI Features
[[ai/00_Übersicht]] · [[ai/AI_FEATURE_ROADMAP]] · [[ai/AI_FEATURE_ROADMAP_PHASE_3]] · [[ai/AI_FEATURE_ROADMAP_PHASE_4]] · [[ai/AI_FEATURE_ROADMAP_PHASE_5]] · [[ai/Verbesserungen-KI-Features]]

### Testing
[[testing/00_Übersicht]] · [[testing/TEST_STRATEGY]] · [[testing/E2E_SMOKE_CHECKLIST]]

### Prompts
[[prompts/Prompt]] · [[prompts/PROMPT_white-mode]]

### Skills
[[architektur/skills/00 Skills Übersicht]] · [[architektur/skills/Greedy-Scheduler]] · [[architektur/skills/Multi-Block-Scheduling]] · [[architektur/skills/Rescheduling-Modi]] · [[architektur/skills/KI-Priorisierung]] · [[architektur/skills/Nuxt-Serverless-KI]] · [[architektur/skills/Planungs-Chat-NLP]] · [[architektur/skills/IndexedDB-Vue3]] · [[architektur/skills/Deadline-Watcher]] · [[architektur/skills/Google-OAuth2-Browser]] · [[architektur/skills/Glassmorphism-Redesign]] · [[architektur/skills/Tailwind-Design-System]] · [[architektur/skills/Frontend-Design]] · [[architektur/skills/Agent-Generator]]

### Sonstiges
[[claude-commands]]

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

### Nächste Schritte (aus [[ai/AI_FEATURE_ROADMAP]])
- [ ] Projektgenerator direkt mit erster Terminierung koppeln
- [ ] Zu große Projekte markieren wenn Umfang unplausibel
- [ ] Frontend-Redesign ausführen ([[planung/REDESIGN-PROMPT]] → Codex)

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

*Hub zuletzt aktualisiert: 2026-04-09*
