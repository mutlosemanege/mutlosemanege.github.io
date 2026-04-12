# Architektur & Entwicklung

> ⬆ [[../index]] · [[00_Übersicht]]

Technische Dokumentation, Code-Patterns und Architekturentscheidungen für Kalender-AI.

---

## Enthaltene Dokumente

```
Architektur & Entwicklung
├── [[00_Übersicht]]         — Diese Übersicht
└── [[../CLAUDE]]            — Vollständige Codebase-Dokumentation (Architektur, Patterns,
                               Komponenten, Composables, Datenmodell, Limitations)
```

---

## Zwei unabhängige Datenschichten

```
Browser
  ├── Google Calendar API (REST, direkt mit OAuth2-Token)
  │     → useCalendar.ts
  └── IndexedDB / idb-keyval (lokal, offline)
        → useTasks.ts
```

Diese Trennung ist **architektonisch bewusst**: Tasks und Kalender-Events sind unabhängige Systeme. Eine Aufgabe kann optional via `calendarEventId` mit einem Event verknüpft sein, muss es aber nicht.

---

## Composables-Übersicht

| Composable | Aufgabe | State-Typ |
|------------|---------|-----------|
| `useGoogleAuth` | OAuth2 Login/Token | Singleton |
| `useCalendar` | Google Calendar CRUD | Singleton |
| `useTasks` | Tasks & Projekte (IndexedDB) | Singleton |
| `useScheduler` | Auto-Planen, findFreeSlots | Singleton |
| `useAI` | Anthropic API-Aufrufe | Singleton |
| `usePreferences` | Nutzereinstellungen (localStorage) | Singleton |
| `useDeadlineWatcher` | Reaktive Deadline-Warnungen | Computed |

**Singleton-Pattern:** Alle Composables verwenden `ref()` auf Modul-Ebene (außerhalb der Funktion) damit alle Komponenten denselben State teilen.

---

## Wichtigste Code-Patterns

### 1. Module-level Singleton
```ts
// RICHTIG — geteilt über alle Komponenten
const tasks = ref<Task[]>([])
export function useTasks() { return { tasks: readonly(tasks) } }

// FALSCH — jede Komponente hat eigene Instanz
export function useTasks() {
  const tasks = ref<Task[]>([])  // ← innerhalb → neuer State pro Aufruf
}
```

### 2. readonly() als API-Schutz
```ts
return { tasks: readonly(tasks) }  // Nur via Composable-Funktionen mutierbar
```

### 3. Script-Polling für externe Google APIs
```ts
await waitForScript(() => !!window.google?.accounts)  // Nicht window.onload
```

### 4. Structured Output via tool_use (KI-Endpoints)
```ts
tool_choice: { type: 'tool', name: 'prioritize_tasks' }  // Erzwingt Struktur
```

---

## Skills zu den Kernthemen

| Thema | Skill-Note |
|-------|------------|
| Scheduling-Algorithmus | [[skills/Greedy-Scheduler]] |
| KI-Integration | [[skills/KI-Priorisierung]] · [[skills/Nuxt-Serverless-KI]] |
| Datenpersistenz | [[skills/IndexedDB-Vue3]] |
| Authentifizierung | [[skills/Google-OAuth2-Browser]] |
| NLP-Parser | [[skills/Planungs-Chat-NLP]] |
| Deadline-System | [[skills/Deadline-Watcher]] |
| UI-Design | [[skills/Frontend-Design]] · [[skills/Glassmorphism-Redesign]] · [[skills/Tailwind-Design-System]] |

---

*Übergeordnet: [[../index]]*
