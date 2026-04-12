# Skill: Planungs-Chat NLP (Natürliche Sprache → Termin/Aufgabe)

> ⬆ [[00 Skills Übersicht]] · [[../_INDEX]]
> Verknüpft: [[../CLAUDE]] · [[../AI_FEATURE_ROADMAP]]
> Verwandte Skills: [[Greedy-Scheduler]] · [[Nuxt-Serverless-KI]]

---

## Was haben wir gebaut?

Einen **Regex-basierten NLP-Parser** der deutsche Planungseingaben in strukturierte Termin- oder Aufgabenobjekte umwandelt.

**Datei:** `app/components/PlanningChat.vue`

**Kein LLM für das Parsing** — bewusste Entscheidung für Geschwindigkeit und Kosten.

---

## Was wird erkannt?

### Zeitreferenzen

| Eingabe | Erkennt |
|---------|---------|
| "heute" | currentDate |
| "morgen" | currentDate + 1 |
| "nächste Woche" | Montag der nächsten Woche |
| "am Wochenende" | Nächster Samstag |
| "jeden Mittwoch" | Wöchentlich wiederkehrend, Mittwoch |
| "Mo", "Di", "Mi"... | Nächster entsprechender Wochentag |

### Uhrzeiten

| Eingabe | Erkennt |
|---------|---------|
| "14 Uhr", "14:30" | Exakte Uhrzeit |
| "morgens" | 08:00–10:00 Präferenz |
| "nachmittags" | 13:00–17:00 Präferenz |
| "abends" | 18:00–21:00 Präferenz |

### Dauern

| Eingabe | Erkennt |
|---------|---------|
| "2h", "2 Stunden" | 120 Minuten |
| "30min", "30 Minuten" | 30 Minuten |
| "1,5h", "anderthalb Stunden" | 90 Minuten |

### Intent-Erkennung (Termin vs. Aufgabe)

```
Termin-Keywords: Meeting, Termin, Anruf, Call, Treffen, Vorlesung, Kurs, Sport
Aufgaben-Keywords: schreiben, lernen, erledigen, bearbeiten, vorbereiten, lesen
Auto-Mode: Wenn unklar → Nutzer wählt manuell
```

---

## Wochentag-Erkennung (neu implementiert)

```ts
const WOCHENTAGE = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag']
const KURZ = ['So','Mo','Di','Mi','Do','Fr','Sa']

function naechsterWochentag(tag: number): Date {
  const heute = new Date()
  const diff = (tag - heute.getDay() + 7) % 7 || 7  // Minimum 1 Tag in der Zukunft
  return addDays(heute, diff)
}
```

### Wiederholungs-Erkennung

Pattern `jeden <Wochentag>` / `jede Woche <Wochentag>` → `isRecurring: true, recurringDay: number`

---

## Slot-Vorschlag mit Begründung

Nach dem Parsing sucht `findFreeSlots()` den besten Slot und gibt zurück:

```ts
{
  start: '2026-04-08T09:00:00',
  end: '2026-04-08T11:00:00',
  reason: 'Erster freier Deep-Work-Block am Mittwoch Morgen'
}
```

Der Grund wird direkt in der Chat-Antwort angezeigt: *"Ich habe Mittwoch 9-11 Uhr gefunden, weil das dein nächster freier Deep-Work-Block ist."*

---

## Unterschied anzeigen: Termin vs. Aufgabe

| Eigenschaft | Termin (Event) | Aufgabe (Task) |
|-------------|---------------|----------------|
| Speicherort | Google Calendar | IndexedDB |
| Feste Zeit? | Ja | Nein (wird eingeplant) |
| Zeigt in | Kalender | Sidebar + Kalender |
| Label | "Termin erstellt" | "Aufgabe angelegt und geplant" |

---

## Bekannte Grenzen (aus CLAUDE.md)

- Keine spezifischen Daten ("am 15. April")
- Keine Kombination aus Wochentag + Uhrzeit ("Mittwoch um 14 Uhr") in einem Satz — wird über Zukunft behoben
- Keine Zeitspannen ("von Montag bis Freitag")
