# Skill: IndexedDB mit Vue 3 (via idb-keyval)

> Verknüpft mit: [[../_INDEX]] · [[../CLAUDE]]
> Verwandte Skills: [[Google-OAuth2-Browser]] · [[Greedy-Scheduler]]

---

## Was haben wir gebaut?

Vollständige **lokale Task- und Projektverwaltung in IndexedDB** — persistent, offline-fähig, ohne Server. Via `idb-keyval` für einfaches Key-Value-Interface.

**Datei:** `app/composables/useTasks.ts`

---

## Warum IndexedDB statt localStorage?

| | localStorage | IndexedDB (idb-keyval) |
|-|-------------|----------------------|
| Max. Größe | ~5MB | Hunderte MB |
| Async | Nein (blockiert) | Ja |
| Objekte | Nur Strings (JSON.stringify) | Native Objekte |
| Strukturierte Abfragen | Nein | Ja |
| Für Arrays/Listen | Umständlich | Einfach |

---

## Pattern: Singleton-State mit module-level refs

```ts
// WICHTIG: refs außerhalb der Composable-Funktion — NICHT innerhalb
// So teilen alle Component-Instanzen denselben State (Singleton)
const tasks = ref<Task[]>([])
const projects = ref<Project[]>([])
const initialized = ref(false)

export function useTasks() {
  // ...
  return { tasks: readonly(tasks), projects: readonly(projects), ... }
}
```

**Warum module-level?** Vue 3 erstellt bei jedem `useTasks()`-Aufruf eine neue Instanz wenn refs INNERHALB der Funktion stehen. Bei `useTasks` wäre das fatal — jede Komponente hätte ihren eigenen Task-State.

---

## Initialisierung (einmalig beim App-Start)

```ts
async function init() {
  if (initialized.value) return  // Idempotent — sicher mehrfach aufrufbar
  
  const [storedTasks, storedProjects] = await Promise.all([
    get('tasks'),      // idb-keyval
    get('projects')
  ])
  
  tasks.value = storedTasks ?? []
  projects.value = storedProjects ?? []
  initialized.value = true
}
```

---

## Auto-Sync: `project.taskIds` immer aktuell halten

Beim Erstellen/Löschen/Updaten eines Tasks wird `project.taskIds` automatisch synchronisiert:

```ts
async function createTask(data: Omit<Task, 'id'|'createdAt'|'updatedAt'>) {
  const task: Task = { id: uuid(), createdAt: now(), updatedAt: now(), ...data }
  tasks.value.push(task)
  
  // Auto-sync: Projekt-Referenz aktuell halten
  if (task.projectId) {
    const project = projects.value.find(p => p.id === task.projectId)
    if (project && !project.taskIds.includes(task.id)) {
      project.taskIds.push(task.id)
      await set('projects', projects.value)
    }
  }
  
  await set('tasks', tasks.value)  // Persist
}
```

---

## readonly() Wrapper als API-Schutz

```ts
return {
  tasks: readonly(tasks),      // ← Kann nicht von außen gemutiert werden
  projects: readonly(projects),
  createTask,    // ← Nur über definierte Funktionen änderbar
  updateTask,
  deleteTask,
  createProject,
  deleteProject,
}
```

**Warum:** Verhindert dass Komponenten direkt `tasks.value.push(...)` aufrufen — alles läuft durch die Composable und wird in IndexedDB persistiert.

---

## Bekannte Limitation

Kein Sync mit Google Calendar: Wenn ein Calendar-Event gelöscht wird, bleibt `task.calendarEventId` gesetzt. Das Erkennen von "Orphaned Tasks" ist eine offene Aufgabe.
