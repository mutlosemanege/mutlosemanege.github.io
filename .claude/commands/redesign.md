# /redesign — Codex Redesign-Prompt laden und besprechen

Lies die Datei `REDESIGN-PROMPT.md` und helfe beim Frontend-Redesign.

## Aufgaben

1. Lies `REDESIGN-PROMPT.md` vollständig.
2. Lies auch `CLAUDE.md` für den aktuellen Codebase-Zustand.
3. Je nach Nutzer-Anfrage:

### Ohne Argument (`/redesign`)
Gib einen Überblick:
- Was ist das Ziel des Redesigns?
- Welche Dateien sind betroffen?
- Was ist die empfohlene Ausführungsreihenfolge (Phase 1–4)?
- Was darf NICHT verändert werden?

### Mit Argument (`/redesign <Komponente>`)
Gib den spezifischen Redesign-Plan für diese Komponente aus, direkt aus `REDESIGN-PROMPT.md`.

### Mit "start" (`/redesign start`)
Beginne direkt mit Phase 1: `tailwind.config.ts` und `app/assets/css/main.css`.
Erstelle diese Dateien nach dem Plan in `REDESIGN-PROMPT.md`.

### Mit "status" (`/redesign status`)
Prüfe welche Dateien bereits die neuen dark-mode Klassen enthalten (`bg-base`, `glass-card`, `text-text-primary`, etc.)
vs. welche noch `bg-gray-*`, `bg-white`, `text-gray-*` verwenden.
Gib eine Fortschritts-Übersicht aus.

## Regeln

- Keine neuen npm-Packages
- Kein Backend anfassen
- Keine neuen Seiten/Routen erstellen
- Alle Composable-APIs bleiben unverändert
- Deutsche Texte bleiben deutsch
