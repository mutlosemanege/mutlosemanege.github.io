# Prompt: White Mode / Light Theme einbauen

## Aufgabe

Füge dem Projekt einen vollständigen Light Mode hinzu, der per Toggle zwischen Dark Mode (aktuell) und White Mode (neu) wechselt. Der White Mode soll die folgende Farbpalette verwenden:

| Name        | Hex       | Verwendung                        |
|-------------|-----------|-----------------------------------|
| Swan Wing   | `#F5F0E9` | Hintergrund (base, body)         |
| Shellstone  | `#D9CBC2` | Surface-Flächen, Cards, Inputs   |
| Quicksand   | `#E0C58F` | Akzente, Hover-States, Highlights|
| Sapphire    | `#3C507D` | Primäre Aktion, Buttons, Links   |
| Royal Blue  | `#112250` | Text Primary, Headlines           |

---

## Technische Anforderungen

### 1. CSS Custom Properties in `app/assets/css/main.css`

Refaktoriere alle hardcodierten Farben in CSS Custom Properties. Verwende `html.dark` für den Dark Mode und `html.light` (oder `:root` ohne Klasse) für den Light Mode:

```css
html.dark {
  --color-base: #0B1020;
  --color-surface: #12192B;
  --color-surface-secondary: #1A2236;
  --color-surface-elevated: #1F2A42;
  --color-text-primary: #F5F7FF;
  --color-text-secondary: #A7B0C5;
  --color-text-muted: #6B7A99;
  --color-border-subtle: rgba(255,255,255,0.08);
  --color-border-medium: rgba(255,255,255,0.12);
  --color-border-strong: rgba(255,255,255,0.20);
  --color-accent-primary: #8B6CFF;       /* Sapphire-Äquivalent im Dark */
  --color-glass-bg: rgba(18,25,43,0.7);
  --color-glass-elevated: rgba(26,34,54,0.8);
  --color-btn-primary-bg: linear-gradient(135deg, #8B6CFF 0%, #6CB8FF 100%);
  --color-btn-primary-text: #F5F7FF;
  --color-btn-secondary-bg: rgba(255,255,255,0.06);
  --color-btn-secondary-text: #A7B0C5;
  --color-btn-secondary-border: rgba(255,255,255,0.08);
  --color-input-bg: rgba(255,255,255,0.04);
  --color-input-border: rgba(255,255,255,0.08);
  --color-scrollbar: rgba(255,255,255,0.1);
  --color-body-gradient-1: rgba(139,108,255,0.12);
  --color-body-gradient-2: rgba(108,184,255,0.10);
}

html.light {
  --color-base: #F5F0E9;                 /* Swan Wing */
  --color-surface: #EDE7DF;
  --color-surface-secondary: #D9CBC2;    /* Shellstone */
  --color-surface-elevated: #CFC0B6;
  --color-text-primary: #112250;         /* Royal Blue */
  --color-text-secondary: #3C507D;       /* Sapphire */
  --color-text-muted: #6B7A8E;
  --color-border-subtle: rgba(17,34,80,0.10);
  --color-border-medium: rgba(17,34,80,0.16);
  --color-border-strong: rgba(17,34,80,0.25);
  --color-accent-primary: #3C507D;       /* Sapphire */
  --color-glass-bg: rgba(245,240,233,0.75);
  --color-glass-elevated: rgba(217,203,194,0.85);
  --color-btn-primary-bg: linear-gradient(135deg, #3C507D 0%, #112250 100%);
  --color-btn-primary-text: #F5F0E9;
  --color-btn-secondary-bg: rgba(17,34,80,0.06);
  --color-btn-secondary-text: #3C507D;
  --color-btn-secondary-border: rgba(17,34,80,0.12);
  --color-input-bg: rgba(17,34,80,0.04);
  --color-input-border: rgba(17,34,80,0.12);
  --color-scrollbar: rgba(17,34,80,0.15);
  --color-body-gradient-1: rgba(60,80,125,0.08);
  --color-body-gradient-2: rgba(224,197,143,0.15);
}
```

Ersetze dann alle hardcodierten Werte in `.glass-card`, `.glass-card-elevated`, `.btn-primary`, `.btn-secondary`, `.btn-accent-green`, `.input-dark`, `body`, `html/body` durch diese CSS-Variablen.

### 2. Tailwind-Farben in `tailwind.config.ts`

Ergänze die Light-Mode-Farben als eigene Palette (für gelegentliche direkte Klassen):

```ts
light: {
  base: '#F5F0E9',
  surface: '#D9CBC2',
  sapphire: '#3C507D',
  royal: '#112250',
  quicksand: '#E0C58F',
}
```

### 3. Composable `useTheme` — neu anlegen

Erstelle `app/composables/useTheme.ts`:

```ts
// Singleton — persists in localStorage
const theme = ref<'dark' | 'light'>('dark')

export function useTheme() {
  function init() {
    const saved = localStorage.getItem('theme') as 'dark' | 'light' | null
    theme.value = saved ?? 'dark'
    applyTheme(theme.value)
  }

  function toggle() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
    localStorage.setItem('theme', theme.value)
    applyTheme(theme.value)
  }

  function applyTheme(t: 'dark' | 'light') {
    document.documentElement.classList.remove('dark', 'light')
    document.documentElement.classList.add(t)
  }

  return { theme: readonly(theme), toggle, init }
}
```

### 4. Initialisierung in `app/app.vue`

Rufe `useTheme().init()` in `onMounted` auf, damit das Theme beim Start geladen wird.

### 5. Toggle-Button in `NavBar.vue`

Füge in der NavBar einen Icon-Button ein, der zwischen Dark und Light wechselt:
- Dark Mode Icon: Mond (Moon SVG)
- Light Mode Icon: Sonne (Sun SVG)
- Klick: `useTheme().toggle()`
- Zeige das jeweils aktive Theme-Icon

---

## Worauf besonders achten

- Alle `bg-[#0B1020]`, `bg-surface`, `text-text-primary` etc. in den Vue-Komponenten werden über die CSS Custom Properties gesteuert — **keine Komponenten einzeln anfassen**, außer wenn ein Wert nicht über Variablen abgedeckt ist.
- Die Akzentfarben (`accent-purple`, `accent-blue`, `accent-green`) bleiben im Dark Mode unverändert. Im Light Mode werden sie auf `#3C507D` (Sapphire) für primäre Aktionen und `#E0C58F` (Quicksand) für Highlights gemappt.
- `border-subtle` und ähnliche rgba-Werte müssen invertiert werden (im Light Mode: dunkle rgba auf hellem Hintergrund).
- Das Glass-Effekt-System (`backdrop-filter: blur`) bleibt erhalten, nur die Hintergrundfarbe ändert sich.
- Priority-Farben (`critical`, `high`, `medium`, `low`) und Status-Farben bleiben themenneutral, da sie semantische Bedeutung tragen.

---

## Verifikation

Nach der Implementierung:
- `npm run build` muss fehlerfrei durchlaufen
- Wechsel zwischen Dark und Light muss live ohne Reload funktionieren
- LocalStorage-Persistenz: Theme bleibt nach Reload erhalten
- Alle `.glass-card`, `.glass-card-elevated`, Buttons, Inputs, Modals und die Sidebar müssen im Light Mode lesbar sein
