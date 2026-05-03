# Agent-Generator

> ⬆ [[00 Skills Übersicht]] · [[../index]]

Erstellt spezialisierte Agents mit Skill-Dateien, Tool-Konfigurationen und umfassender Dokumentation.

## Wann verwenden

- "Erstelle einen neuen Agenten für..."
- "Baue einen Agenten für Debugging/Refactoring/Design"
- "Generiere Agent-Scaffolding für..."

## Agent-Struktur

```
.agents/
└── skills/
    └── {skill-name}/
        ├── SKILL.md          # Kern-Skill-Definition
        ├── LICENSE.txt       # Lizenz (optional)
        └── resources/        # Zusätzliche Ressourcen (optional)
```

## SKILL.md Template

```markdown
---
name: {skill-name}
description: Klare Beschreibung wann dieser Agent verwendet wird (Trigger-Phrasen)
---

# Skill Name

## Zweck
Was dieser Skill macht und wann man ihn verwendet.

## Workflow
Schritt-für-Schritt Anweisungen.

## Richtlinien
- Tu dies
- Tu das nicht
- Wichtige Überlegungen

## Tools-Referenz
| Tool | Wann verwenden |
|------|-----------------|
| tool_name | spezifischer Anwendungsfall |
```

## Design-Prinzipien

### Gute Agent-Beschreibungen:
- Beginnen mit Aktionsverben: "Erstelle...", "Debugge...", "Analysiere..."
- Enthalten Trigger-Phrasen: "wenn Benutzer fragt..."
- Sind spezifisch über den Scope: "für Vue 3", "für CSS"

### Skill-Datei Inhalt:
- Klare Zweck-Angabe
- Schritt-für-Schritt Workflow
- Do's und Don'ts
- Tool-Nutzungsrichtlinien
- Beispiele für Input/Output

## Erstellungs-Workflow

1. **Anforderungen analysieren**
   - Zweck: Welche Aufgabe soll der Agent bearbeiten?
   - Domain: Programmierung, Design, Debugging, Refactoring?
   - Benötigte Tools: Welche Tools braucht der Agent?
   - Kontext: Welche Codebase-Patterns?

2. **Ordnerstruktur erstellen**
   ```bash
   mkdir -p .agents/skills/{skill-name}
   ```

3. **SKILL.md schreiben**
   - YAML Frontmatter (name, description)
   - Zweck-Sektion
   - Workflow/Schritte
   - Richtlinien (Do/Don't)
   - Tools-Referenztabelle
   - Beispiele

4. **In Projekt integrieren**
   - Zur Skills-Übersicht hinzufügen
   - Dokumentation aktualisieren

## Beispiel: GitNexus-Style Agent

```markdown
---
name: code-intelligence
description: Analysiere Code, verfolge Ausführungsflows und verstehe Symbol-Beziehungen.
---

# Code Intelligence Agent

## Zweck
Tiefgehende Code-Analyse mit Symbol-Graphen, Ausführungs-Traces und Beziehungs-Mapping.

## Workflow

1. **Anfrage verstehen** - Was will der Benutzer über den Code wissen?
2. **Symbol analysieren** - gitnexus_context für vollständiges Bild
3. **Impact bewerten** - gitnexus_impact für Blast-Radius
4. **Ergebnisse berichten** - Zusammenfassung mit Risiko-Leveln
```

## Checkliste

- [ ] Ordnerstruktur erstellt
- [ ] SKILL.md mit Frontmatter geschrieben
- [ ] Beschreibung enthält Trigger-Phrasen
- [ ] Workflow ist schrittweise
- [ ] Tools-Referenztabelle enthalten
- [ ] Beispiele vorhanden
- [ ] In Projekt-Index integriert

## Verwandte Skills

- [[Frontend-Design]] — Frontend-Agent für UI-Design
- [[Greedy-Scheduler]] — Scheduling-Logik für Kalender-AI
