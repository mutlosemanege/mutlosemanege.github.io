# Planung & Design

> ⬆ [[../index]] · [[00_Übersicht]]

Feature-Roadmap, Design-Entscheidungen und der Redesign-Plan für Kalender-AI.

---

## Enthaltene Dokumente

```
Planung & Design
├── [[00_Übersicht]]               — Diese Übersicht
├── [[AI_FEATURE_ROADMAP]]          — KI-Feature-Roadmap mit Prioritäten und Status
├── [[REDESIGN-PROMPT]]             — Premium Dark-Mode UI-Redesign Prompt (Codex-ready)
├── [[REDESIGN_CHECKLIST]]         — Redesign-Checkliste
└── [[Archiv]]                     — Historische Dokumente
```

---

## Roadmap-Status (Übersicht)

### ✅ Abgeschlossen
- Task-Gruppierung nach Projekten
- Manuelle Prioritätsänderung
- Rescheduling bei „Nicht geschafft" (4 Modi)
- Auto-Planen robust + Multi-Block
- Planungs-Chat mit Wochentagen + Slot-Begründung
- Routinen als Vorlagen
- KI-Priorisierung mit Begründungstext (`priorityReason`)
- Schlaf/Pendeln als blockierende Kalenderblöcke

### 🔄 Nächster Sprint
- Projektgenerator mit direkter Terminierung koppeln
- Zu große Projekte als unplausibel markieren
- Frontend-Redesign (→ [[REDESIGN-PROMPT]])

### 🔮 Später
- Routinen zu echten Planungsregeln ausbauen
- Personalisierung: Planungsstil (entspannt / aggressiv / focus-first)
- KI-Unsicherheit sichtbar machen
- Bild-Import (Stundenplan-Screenshot)

Details + alle Items: [[AI_FEATURE_ROADMAP]]

---

## Redesign-Plan

Das Frontend soll von Light-Mode (grau/weiß) zu einem **Premium Dark-Mode** umgebaut werden:

| Jetzt | Ziel |
|-------|------|
| `bg-white`, `bg-gray-50` | `#0B1020` Base, `#12192B` Surface |
| Flat Tailwind-Utilities | Glassmorphism Cards + Glow-Effekte |
| NavBar on top | Sidebar-Rail (Desktop) + Bottom-Nav (Mobile) |
| AI-Features versteckt in Sidebar | AI prominent durch gesamte UI |
| Single-Column Layout | 3-Spalten Desktop, gestapelt Mobile |

Vollständiger Codex-Prompt: [[REDESIGN-PROMPT]]
Design-Details: [[../architektur/skills/Glassmorphism-Redesign]] · [[../architektur/skills/Tailwind-Design-System]]

---

## Designprinzipien

1. **KI-nativ** — AI-Features überall sichtbar, nicht in einer Ecke versteckt
2. **Keine neuen Routen** — Alles bleibt SPA (`index.vue`)
3. **Backend unangetastet** — Nur Frontend und lokale Logik
4. **Deutsche UI** — Texte bleiben auf Deutsch
5. **Mobile-first** — Jede Desktop-Lösung braucht eine Mobile-Entsprechung

---

*Übergeordnet: [[../index]]*
