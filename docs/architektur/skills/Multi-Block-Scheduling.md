# Skill: Multi-Block-Scheduling

> ⬆ [[00 Skills Übersicht]] · [[../_INDEX]]
> Verknüpft: [[../CLAUDE]] · [[../AI_FEATURE_ROADMAP]]
> Verwandte Skills: [[Greedy-Scheduler]] · [[Rescheduling-Modi]]

---

## Was haben wir gebaut?

Einen **Multi-Block-Scheduler** der große Tasks (z.B. 4h Hausarbeit) automatisch auf mehrere kleinere Kalenderblöcke aufteilt — über mehrere Tage hinweg wenn nötig.

**Warum notwendig:** Ein 4h-Block passt selten in einen einzigen freien Slot. Ohne Multi-Block würde der Scheduler viele große Tasks als "nicht planbar" markieren.

---

## Datenmodell

```ts
interface Task {
  estimatedMinutes: number         // Gesamtdauer (z.B. 240 = 4h)
  scheduleBlocks?: TaskScheduleBlock[]  // Alle geplanten Blöcke
  scheduledStart?: string          // Start des ersten Blocks
  scheduledEnd?: string            // Ende des letzten Blocks
}

interface TaskScheduleBlock {
  start: string           // ISO 8601
  end: string             // ISO 8601
  calendarEventId?: string  // Verknüpftes Google Calendar Event
}
```

---

## Algorithmus

```
remainingMinutes = task.estimatedMinutes

WHILE remainingMinutes > 0:
  slot = findeNächstenFreienSlot()
  
  IF slot ist Deep-Work-Fenster:
    blockDauer = MIN(remainingMinutes, slot.verfügbareDauer)
  ELSE:
    blockDauer = MIN(remainingMinutes, slot.verfügbareDauer, maxBlockOhneDeepWork)
  
  erstelleKalenderEvent(slot.start, slot.start + blockDauer)
  fügZuScheduleBlocksHinzu(task, block)
  remainingMinutes -= blockDauer
```

---

## Gelöstes Regressionsproblem

**Problem:** Nach dem Einführen von Multi-Block wurden kleine Tasks manchmal doppelt eingeplant.

**Ursache:** Der `isSlotFree`-Check berücksichtigte die bereits im selben Scheduler-Lauf gebuchten Blöcke nicht sofort.

**Lösung:** In-memory "gebuchte Slots"-Liste die in jedem Scheduler-Durchlauf mitgeführt und sofort aktualisiert wird — unabhängig vom Kalender-Fetch.

---

## UI-Darstellung

- Task-Card in AISidebar zeigt: "3 Blöcke · 4h gesamt"
- Im WeekView: Alle Blöcke eines Tasks haben dieselbe Farbe + Task-Titel
- Nach "Nicht geschafft": Alle Blöcke des Tasks werden neu eingeplant (Rescheduling)
