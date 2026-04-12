# Skill: Tailwind Design System aufbauen

> ⬆ [[00 Skills Übersicht]] · [[../_INDEX]]
> Verknüpft: [[../REDESIGN-PROMPT]] · [[../CLAUDE]]
> Verwandte Skills: [[Glassmorphism-Redesign]]

---

## Was haben wir gebaut / planen wir?

Einen **vollständigen Design-Token-Layer** in `tailwind.config.ts` + eine globale CSS-Datei mit Utility-Klassen — als Grundlage für das Premium-Redesign.

---

## Tailwind Config: Design Tokens

```ts
// tailwind.config.ts
theme: {
  extend: {
    colors: {
      // Surfaces
      base: '#0B1020',
      surface: '#12192B',
      'surface-secondary': '#1A2236',
      
      // Akzente
      accent: {
        purple: '#8B6CFF',
        'purple-soft': '#B7A2FF',
        blue: '#6CB8FF',
        green: '#8DFFB5',
        pink: '#F6C1E7',
      },
      
      // Text-Hierarchie
      'text-primary': '#F5F7FF',
      'text-secondary': '#A7B0C5',
      'text-muted': '#6B7A99',
      
      // Semantik
      priority: {
        critical: '#FF6B8A',
        high: '#FFB06B',
        medium: '#FFD66B',
        low: '#8DFFB5',
      },
    },
    
    boxShadow: {
      glass: '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)',
      'glow-purple': '0 0 20px rgba(139,108,255,0.15)',
      'glow-blue': '0 0 20px rgba(108,184,255,0.15)',
      'glow-green': '0 0 20px rgba(141,255,181,0.15)',
    },
    
    borderRadius: {
      glass: '20px',
      'glass-lg': '24px',
      'glass-xl': '32px',
    },
  }
}
```

---

## Globale CSS-Utility-Klassen

```css
/* app/assets/css/main.css */

/* Glassmorphism-Karte */
.glass-card { ... }
.glass-card-elevated { ... }

/* Button-Varianten */
.btn-primary { ... }   /* Lila-Blau Gradient */
.btn-secondary { ... } /* Ghost mit Glass-Border */
.btn-accent-green { ... } /* Grüner Gradient für Auto-Planen */

/* Input */
.input-dark { ... }    /* Dark-Mode Eingabefeld */
```

---

## Warum @layer components statt Tailwind-Plugins?

`@layer components` ist einfacher für One-off Utilities die wir nur intern verwenden.
Tailwind-Plugins wären sinnvoll wenn wir das System als npm-Package veröffentlichen würden.

---

## Event-Farben für Dark-Mode (Google Calendar)

Die 11 Google Calendar Farben müssen für Dark-Mode angepasst werden (heller, leuchtender):

```
Original #4285F4 (Google Blau) → Dark-Mode: #6CB8FF mit 15% Opacity
Original #0F9D58 (Google Grün) → Dark-Mode: #8DFFB5 mit 15% Opacity
...
```

Alle 11 Farben mit `bg-[farbe]/15 text-[farbe] border-l-[farbe]` Pattern.

---

## Schriftart: Inter

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
```

**Vorteile von Inter:**
- Optimiert für Screen-Rendering
- Sehr gute Zahl-Darstellung (Tabular Numbers optionen)
- Kostenlos via Google Fonts
- Deckt alle Deutsch-spezifischen Zeichen ab (ä, ö, ü, ß)

---

## Breakpoints-Strategie

```
Mobile (<640px):    Bottom-Navigation, Full-Screen Modals
Tablet (640-1280px): Top-Navigation, Slide-Over Sidebar
Desktop (1280px+):  Sidebar-Rail + Persistenter AI-Panel
```

Tailwind-Klassen: `lg:` für Desktop-Layout, `xl:` für breites Desktop (AI-Panel einblenden)
