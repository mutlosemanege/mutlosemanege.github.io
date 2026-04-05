# /feature — Neues Feature planen und implementieren

Plane und implementiere ein neues Feature für Kalender-AI.

## Aufgaben

### Schritt 1: Kontext laden
Lies diese Dateien bevor du anfängst:
- `CLAUDE.md` — Architektur, Composables, Patterns
- `AI_FEATURE_ROADMAP.md` — Was ist bereits geplant?
- `app/types/task.ts` — Datenmodell

### Schritt 2: Feature einordnen
Prüfe ob das gewünschte Feature bereits in `AI_FEATURE_ROADMAP.md` steht.
Falls ja: Lies den entsprechenden Abschnitt und arbeite nach dem dort beschriebenen Ziel.
Falls nein: Schlage vor, es unter "Danach bauen" in die Roadmap einzutragen.

### Schritt 3: Plan erstellen
Erstelle einen kurzen Plan (max. 5 Punkte) mit:
- Welche Dateien werden geändert?
- Welche Composables / Typen sind betroffen?
- Ändert sich die Architektur oder nur die UI?
- Wird ein neues Backend-Endpoint benötigt? (Möglichst vermeiden)

### Schritt 4: Implementieren
Implementiere das Feature nach dem Plan. Halte dich an:
- Bestehende Code-Patterns (module-level refs, readonly() exports)
- Deutsche UI-Texte
- Kein neues npm-Package ohne Begründung
- `CLAUDE.md` nach Architektur-Änderungen aktualisieren

## Wichtig

- KI-Modelle nicht wechseln
- Backend möglichst nicht anfassen
- Composable-APIs stabil halten
