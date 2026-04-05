# Skill: Glassmorphism Dark-Mode Design (Premium Redesign)

> Verknüpft mit: [[../_INDEX]] · [[../REDESIGN-PROMPT]] · [[../AI_FEATURE_ROADMAP]]
> Verwandte Skills: [[Tailwind-Design-System]]

---

## Was planen wir zu bauen?

Ein **Premium Dark-Mode UI-System** mit Glassmorphism-Effekten, atmosphärischen Hintergrundlichtern und echtem Produkt-Feeling — als vollständiges Redesign der bestehenden Light-Mode UI.

**Prompt für Codex:** [[../REDESIGN-PROMPT]]

---

## Farbpalette

| Token | Hex | Verwendung |
|-------|-----|-----------|
| `base` | `#0B1020` | Haupt-Hintergrund |
| `surface` | `#12192B` | Cards, Panel |
| `surface-secondary` | `#1A2236` | Inputs, Sub-Cards |
| `accent.purple` | `#8B6CFF` | Primary Accent, CTA |
| `accent.blue` | `#6CB8FF` | Sekundäre Aktionen |
| `accent.green` | `#8DFFB5` | Erfolg, Auto-Planen |
| `accent.pink` | `#F6C1E7` | Highlights, Zeit-Linie |
| `text-primary` | `#F5F7FF` | Haupttext |
| `text-secondary` | `#A7B0C5` | Labels, Metadaten |
| `text-muted` | `#6B7A99` | Placeholder, Icons |

---

## Glassmorphism-Rezept in Tailwind/CSS

```css
.glass-card {
  background: rgba(18, 25, 43, 0.7);     /* surface mit 70% Opacity */
  backdrop-filter: blur(16px);            /* Der Kern des Glaseffekts */
  -webkit-backdrop-filter: blur(16px);    /* Safari */
  border: 1px solid rgba(255,255,255,0.08); /* Subtile helle Kante */
  border-radius: 20px;                    /* Starke Rundungen */
  box-shadow: 
    0 8px 32px rgba(0,0,0,0.3),          /* Tiefe */
    inset 0 1px 0 rgba(255,255,255,0.05); /* Inneres Top-Light */
}
```

**Wichtig:** Glassmorphism funktioniert nur wenn **Hintergrund selbst Tiefe hat** — nicht auf einfarbigem Hintergrund. Deshalb atmosphärische Radial-Gradients auf `body`.

---

## Atmosphärisches Hintergrundlicht

```css
body {
  background: #0B1020;
  background-image:
    radial-gradient(ellipse 80% 60% at 20% 10%, 
      rgba(139,108,255,0.06) 0%, transparent 60%),
    radial-gradient(ellipse 60% 50% at 80% 80%, 
      rgba(108,184,255,0.04) 0%, transparent 60%);
  background-attachment: fixed;
}
```

---

## Layout-Architektur (neu)

```
Desktop:
  [64px Sidebar Rail] | [Hauptinhalt] | [380px AI-Panel]

Mobile:
  [Vollbild-Inhalt]
  [Bottom Navigation 5 Items]
```

- **Keine neuen Seiten** — alles bleibt SPA (`pages/index.vue`)
- Rail und Bottom-Nav ersetzen die bisherige `NavBar.vue`
- AI-Sidebar: persistentes Panel auf xl+, Overlay auf kleiner

---

## Mikro-Interaktionen

| Element | Hover-State |
|---------|------------|
| Glass-Card | `translateY(-2px)` + Shadow erhöht |
| Gradient-Button | `translateY(-1px)` + Glow verstärkt |
| Nav-Item | `color → accent-purple` |
| Task-Card | Border heller + Glow links |
| Modal-Open | `opacity 0→1 + translateY(16px)→0` (300ms) |

---

## Ausführungsreihenfolge (Codex)

1. `tailwind.config.ts` — Design-Tokens
2. `app/assets/css/main.css` — Globale Klassen
3. `nuxt.config.ts` — CSS registrieren + Inter Font
4. `app.vue` — Dark-Base-Wrapper
5. `pages/index.vue` — Neues Layout-Shell
6. `components/CalendarGrid.vue` + `WeekView.vue`
7. `components/AISidebar.vue` (größte Komponente)
8. `components/PlanningChat.vue`
9. Alle Modals (TaskModal, EventModal, PreferencesModal)
10. `components/DeadlineWarning.vue`
11. `components/ProjectGenerator.vue`
12. Polish-Pass
