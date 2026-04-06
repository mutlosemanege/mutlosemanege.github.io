# Skill: Reaktiver Deadline-Watcher

> ⬆ [[00 Skills Übersicht]] · [[../_INDEX]]
> Verknüpft: [[../CLAUDE]]
> Verwandte Skills: [[IndexedDB-Vue3]] · [[Greedy-Scheduler]]

---

## Was haben wir gebaut?

Einen **reaktiven Deadline-Überwachungs-Service** der automatisch Warnungen berechnet wenn Tasks ihre Deadline annähern oder überschreiten — berücksichtigt verfügbare Arbeitsstunden.

**Datei:** `app/composables/useDeadlineWatcher.ts`
**UI:** `app/components/DeadlineWarning.vue`

---

## Funktionsweise

```ts
const { warnings } = useDeadlineWatcher()
// warnings ist ein readonly computed — aktualisiert sich automatisch
// wenn tasks oder preferences sich ändern
```

Keine Polling-Loops, keine Timer — rein reaktiv über Vue's `computed()`.

---

## Zwei Warnstufen

| Stufe | Trigger | UI |
|-------|---------|-----|
| `warning` | Deadline in ≤ `deadlineWarningDays` Tagen | Gelbe Banner |
| `critical` | Deadline überschritten ODER heute | Rote Banner |

`deadlineWarningDays` ist eine User-Preference (Standard: 3 Tage).

---

## Arbeitsstunden-Berücksichtigung

**Problem:** Eine Deadline "morgen" kann realistisch sein wenn 8h verfügbar sind, unrealistisch wenn heute noch 2h geplante Meetings kommen.

**Lösung:** Der Watcher berechnet die verfügbaren Arbeitsstunden bis zur Deadline:

```ts
function verfügbareStundenBisDeadline(deadline: string): number {
  const jetzt = new Date()
  const frist = new Date(deadline)
  let stunden = 0
  
  // Iteriere über jeden Tag bis zur Deadline
  for (let tag = jetzt; tag <= frist; tag = addDay(tag)) {
    if (istArbeitstag(tag, preferences.workDays)) {
      stunden += preferences.workEndHour - preferences.workStartHour
      stunden -= preferences.lunchEndHour - preferences.lunchStartHour
    }
  }
  return stunden
}
```

Falls `task.estimatedMinutes > verfügbareStunden * 60`: Automatisch `critical`.

---

## Warnung-Objekt

```ts
interface DeadlineWarning {
  task: Task
  severity: 'warning' | 'critical'
  daysRemaining: number          // Negativ wenn überfällig
  availableWorkHours: number     // Wie viel Zeit noch realistisch bleibt
  message: string                // Deutsche Nachricht für die UI
}
```

---

## UI: DeadlineWarning.vue

Schmales Banner direkt unter dem Header — kein Pop-up, kein Modal:

```
⚠ "Hausarbeit" ist in 2 Tagen fällig — nur noch ~6h Arbeitszeit verfügbar
🔴 "Steuererklärung" ist seit gestern überfällig
```

- Mehrere Warnungen: Scrollbare horizontale Liste
- Klick auf Warnung: Öffnet den Task direkt zum Bearbeiten
- Wegklicken: Keine Funktion — bleibt sichtbar bis Deadline vorbei oder Task erledigt
