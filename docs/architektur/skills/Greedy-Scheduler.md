# Skill: Greedy Scheduler (Auto-Planen)

> ⬆ [[00 Skills Übersicht]] · [[../_INDEX]]
> Verknüpft: [[../CLAUDE]] · [[../AI_FEATURE_ROADMAP]]
> Verwandte Skills: [[Multi-Block-Scheduling]] · [[Rescheduling-Modi]] · [[KI-Priorisierung]]

---

## Was haben wir gebaut?

Einen **Greedy Scheduling Algorithmus** der automatisch Aufgaben in freie Kalenderslots einplant — respektiert Arbeitszeiten, Mittagspause, Deep-Work-Fenster, Deadlines und Aufgaben-Dependencies.

**Datei:** `app/composables/useScheduler.ts`

---

## Kernkonzept

```
Für jede unerledigte, priorisierte Aufgabe:
  → Finde den nächsten freien Slot im Kalender
  → Respektiere: Arbeitszeiten, Schlaf, Mittagspause, Deep-Work-Fenster
  → Prüfe: Passen Dependencies vor diesem Slot?
  → Blockiere: Task-Buffer (15min) nach jedem Block
  → Erstelle: Google Calendar Event + setze Task.status = 'scheduled'
```

---

## Gelöste Probleme

### Problem 1: Race Conditions beim parallelen Slot-Suchen
**Lösung:** Tasks sequenziell planen, nicht parallel — jeder gebuchte Slot wird sofort als blockiert markiert bevor der nächste Task sucht.

### Problem 2: Multi-Block-Scheduling (große Tasks > 2h)
**Lösung:** Task wird auf mehrere Blöcke aufgeteilt. Jeder Block erhält ein eigenes Calendar-Event. Alle Blocks werden in `task.scheduleBlocks[]` gespeichert.
→ Skill: [[Multi-Block-Scheduling]]

### Problem 3: Deep-Work-Fenster zu klein
**Lösung:** `minDeepWorkBlockMinutes` (User-Preference). Wenn der verfügbare Deep-Work-Slot kleiner ist, weicht der Scheduler auf reguläre Slots aus statt zu blockieren.

### Problem 4: Dependencies in falscher Reihenfolge
**Lösung:** While-Loop mit multi-level Dependency-Resolution. Nicht nur direkte Dependencies, sondern transitiv alle Voraussetzungen werden zuerst eingeplant.

### Problem 5: Buffer um bestehende Kalender-Events
**Lösung:** `taskBufferMinutes` wird auch um BESTEHENDE Google Calendar Events herum angewendet, nicht nur um geplante Tasks.

---

## Exports

```ts
const { autoSchedule, findFreeSlots } = useScheduler()

// Vollständiges Auto-Scheduling aller todo-Tasks
await autoSchedule()

// Nur freie Slots suchen (für PlanningChat)
const slots = await findFreeSlots(durationMinutes, options)
```

---

## Planungs-Fenster

- **Minimum:** 21 Tage
- **Maximum:** 90 Tage
- **Dynamisch:** Bis zum spätesten Deadline + 7 Tage

---

## Feedback nach dem Planen

Der Scheduler gibt zurück:
- Anzahl erfolgreich geplanter Tasks
- Nicht planbare Tasks mit **Grund**: `kein_slot` | `dependency_blockiert` | `deadline_unrealistisch` | `zu_wenig_deep_work`
- Sortiert nach Schweregrad des Planungsproblems
