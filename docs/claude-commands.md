# Claude Commands (Slash Commands)

> ⬆ [[../index]]

Projekt-spezifische Slash Commands für Claude Code. Dateien liegen in `.claude/commands/` (versteckter Ordner, funktional für Claude Code — hier dokumentiert für Obsidian).

Aufruf im Claude Code Terminal: `/command-name [argument]`

---

## Verfügbare Commands

### `/status`
**Datei:** `.claude/commands/status.md`

Zeigt einen kompakten Projektstatus:
- Aktueller Git-Branch + letzte 5 Commits
- Offene Git-Änderungen
- Roadmap-Fortschritt (X erledigt / Y offen)
- Redesign-Phase

**Nützlich:** Zu Beginn jeder Session um schnell den Stand zu erfassen.

---

### `/roadmap [argument]`
**Datei:** `.claude/commands/roadmap.md`

Zeigt und verwaltet die [[../ai/AI_FEATURE_ROADMAP]]:
- `/roadmap` — Zusammenfassung: offen vs. erledigt, nächster Schritt
- `/roadmap was bauen wir als nächstes` — Empfehlung basierend auf Roadmap
- `/roadmap [item] erledigt` — Markiert ein Item als `[x]`

**Verknüpft mit:** [[../ai/AI_FEATURE_ROADMAP]] · [[../planung/Planung & Design]]

---

### `/redesign [argument]`
**Datei:** `.claude/commands/redesign.md`

Lädt den Premium-Redesign-Kontext aus [[../planung/REDESIGN-PROMPT]]:
- `/redesign` — Überblick: Ziel, betroffene Dateien, Reihenfolge
- `/redesign NavBar` — Plan für diese spezifische Komponente
- `/redesign start` — Startet Phase 1 direkt (tailwind.config.ts + main.css)
- `/redesign status` — Prüft Fortschritt: welche Dateien sind schon dark-mode?

**Verknüpft mit:** [[../planung/REDESIGN-PROMPT]] · [[../architektur/skills/Glassmorphism-Redesign]] · [[../planung/Planung & Design]]

---

### `/feature [beschreibung]`
**Datei:** `.claude/commands/feature.md`

Standardisierter Feature-Entwicklungs-Workflow:
1. Lädt Kontext: `CLAUDE.md` + `AI_FEATURE_ROADMAP.md` + `task.ts`
2. Ordnet Feature in Roadmap ein
3. Erstellt Implementierungsplan (max. 5 Schritte)
4. Implementiert nach bestehenden Patterns

**Regeln:** KI-Modelle nicht wechseln, Backend möglichst nicht anfassen, Composable-APIs stabil halten.

**Verknüpft mit:** [[../architektur/Architektur & Entwicklung]] · [[../ai/AI_FEATURE_ROADMAP]]

---

## Commands hinzufügen

Neue Command-Datei anlegen unter `.claude/commands/mein-command.md`:

```markdown
# /mein-command — Kurzbeschreibung

Was dieser Command tun soll...

## Aufgaben
1. ...
2. ...
```

Dann hier in [[Claude Commands]] dokumentieren.

---

*Übergeordnet: [[../index]]*
