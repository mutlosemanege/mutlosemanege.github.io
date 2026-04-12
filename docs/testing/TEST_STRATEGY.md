# Test Strategy

Diese Strategie trennt bewusst zwischen lokal automatisierbaren Kernregeln und manuellen Browser-Pruefungen fuer die produktnahen KI-Flows.

## 1. Automatisiert lokal testbar

Aktuell ueber `npm run test:planning` abgedeckt:
- Scheduler verteilt lange Aufgaben ueber mehrere Bloecke
- Dependencies werden respektiert
- unplanbare Deadlines bleiben unplanbar
- Feiertage blockieren Planung
- ganztagige Events blockieren den Tag
- Termine ueber Mitternacht blockieren Folgeslots
- DST-/Offset-Randfaelle bleiben stabil
- Reschedule-Modi unterscheiden sich nachvollziehbar
- Chat-Parsing fuer Termin, Aufgabe, Routine und Zeitfenster bleibt stabil

Diese Ebene prueft:
- Entscheidungslogik
- Slot-Rechnung
- Parser-Verhalten
- Edge-Cases ohne UI

## 2. Manuell im Browser pruefen

Diese Ebene deckt ab:
- reale Kalender-Synchronisation
- Vorschau- und Confirm-Flows
- Undo/Wiederherstellen
- Sidebar-, Chat- und Generator-UX
- tatsaechliches Zusammenspiel zwischen Kalender, Tasks und UI

Verbindliche Referenz dafuer:
- [E2E_SMOKE_CHECKLIST.md](d:/kalender-ai/E2E_SMOKE_CHECKLIST.md)

## 3. Wann welcher Test reicht

Nur `npm run test:planning` reicht bei:
- Parser-Anpassungen
- Scheduler-Fixes
- lokalen Slot-/Regel-Aenderungen
- Edge-Case-Haertungen

`npm run test:planning` plus Smoke-Checkliste sind noetig bei:
- Chat-UI-Aenderungen
- Auto-Planen/Review/Aufgaben-Sidebar
- Wiederherstellen/Undo
- Projektgenerator
- Tagesmodus, Abendabschluss, Morgenbrief

## 4. Kritische Produktpfade

Diese Pfade gelten als besonders wichtig:
1. Chat -> Vorschlag -> Termin erstellen
2. Chat -> Aufgabe mit Slot -> Aufgabe erstellen
3. Auto-Planen -> Vorschau -> Anwenden
4. Nicht geschafft -> Vorschau -> Anwenden -> Wiederherstellen
5. Projektgenerator -> Review -> Erstellen -> Planvorschau
6. Wiederherstellen fuer Batch-Aenderungen

## 5. Mindestabnahme vor groesseren Releases

Vor groesseren UI- oder KI-Aenderungen sollte mindestens laufen:
- `npm run test:planning`
- Smoke-Pfade 4, 8, 9, 10 und 11 aus [E2E_SMOKE_CHECKLIST.md](d:/kalender-ai/E2E_SMOKE_CHECKLIST.md)

## 6. Aktuelle bekannte Grenze

`npm run build` laeuft fachlich durch, scheitert lokal aber gelegentlich am bekannten Nuxt-Cache-`EPERM` in `node_modules/.cache/nuxt/.nuxt/...`.

Das gilt aktuell als lokales Dateilock-Problem und nicht als inhaltlicher Buildfehler, solange:
- keine Vue-Templatefehler auftreten
- `npm run test:planning` gruen bleibt
- die Smoke-Flows im Browser funktionieren
