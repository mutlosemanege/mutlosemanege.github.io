# Skill: Rescheduling-Modi

> ⬆ [[00 Skills Übersicht]] · [[../_INDEX]]
> Verknüpft: [[../CLAUDE]] · [[../AI_FEATURE_ROADMAP]]
> Verwandte Skills: [[Greedy-Scheduler]] · [[Multi-Block-Scheduling]]

---

## Was haben wir gebaut?

Mehrere **Rescheduling-Modi** für Tasks die "Nicht geschafft" wurden — jeder Modus hat eine andere Strategie wie der neue Termin gewählt wird.

**Auslöser:** Nutzer klickt "Nicht geschafft" auf einen Task in der AISidebar.

---

## Die vier Modi

### 1. `gleiche_uhrzeit` — Gleiche Uhrzeit, nächster verfügbarer Tag
Sucht den nächsten Tag (ab morgen) an dem zur gleichen Uhrzeit ein freier Slot existiert.

**Use Case:** Regelmäßige Tasks die immer um die gleiche Zeit passieren sollen (z.B. Lernblock 9-11 Uhr).

### 2. `noch_heute` — Noch heute wenn möglich
Sucht zuerst ob heute noch ein Slot frei ist. Falls nicht → nächster freier Slot.

**Use Case:** Urgent Tasks die unbedingt heute erledigt werden sollen.

### 3. `naechster_slot` — Nächster sinnvoller Slot (Standard)
Greedy: findet den nächsten freien Slot ab jetzt, respektiert alle Präferenzen.

**Use Case:** Standard-Rescheduling für die meisten Tasks.

### 4. `rest_neu_verteilen` — Verbleibende Zeit neu aufteilen (nur Multi-Block)
Wenn ein Task bereits teilweise erledigt ist: Berechnet die verbleibende Zeit und plant nur diese neu ein.

**Use Case:** "Ich hab 2h von 4h gemacht, die restlichen 2h neu einplanen."

---

## UI: Modus-Auswahl

Nach Klick auf "Nicht geschafft" erscheint ein kompaktes Modal:

```
Wie soll die Aufgabe neu eingeplant werden?

○ Nächster freier Slot  (Standard)
○ Noch heute wenn möglich
○ Gleiche Uhrzeit, nächster Tag
○ Verbleibende Zeit neu verteilen

[Abbrechen]  [Neu einplanen]
```

Der Status des Tasks springt zurück auf `todo` bis der neue Slot gefunden ist, dann auf `scheduled`.

---

## Delta-Anzeige

Nach dem Rescheduling zeigt die UI:
- "Verschoben um X Stunden / X Tage"
- Visuell: alter Slot (durchgestrichen) → neuer Slot
- Kurze Begründung: "Kein freier Slot heute · Nächster: Mittwoch 10:00"
