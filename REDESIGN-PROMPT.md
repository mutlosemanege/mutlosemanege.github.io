# Kalender-AI Premium Redesign — Codex Execution Prompt

## Context: What exists right now

This is a **Nuxt 4 SPA** (ssr: false) with Tailwind CSS 3, Vue 3 Composition API, no Pinia/Vuex. All styling is Tailwind utility classes — no global CSS, no design tokens, no custom components layer. Currently light-mode with `bg-gray-50` base, `bg-white` cards, standard gray borders.

### Existing files you MUST modify (do NOT create new page routes):

```
app/app.vue                          — minimal wrapper, just <NuxtPage />
app/pages/index.vue                  — THE single page, orchestrates everything
app/components/NavBar.vue            — top navigation bar
app/components/AISidebar.vue         — right slide-in task panel with AI actions
app/components/CalendarGrid.vue      — month view
app/components/WeekView.vue          — week view with hourly timeline
app/components/EventItem.vue         — small event badge in calendar cells
app/components/EventModal.vue        — create/edit Google Calendar events
app/components/TaskModal.vue         — create/edit tasks
app/components/PlanningChat.vue      — AI natural language planning modal
app/components/PreferencesModal.vue  — settings/preferences modal
app/components/DeadlineWarning.vue   — deadline alert banner
app/components/ProjectGenerator.vue  — AI project generation wizard
tailwind.config.ts                   — currently only extends primary blue
```

### Existing AI features (already functional — DO NOT rebuild backend):

1. **AI Task Prioritization** — `useAI().prioritizeTasks()` — ranks tasks via Claude Haiku, returns priority + reason. Triggered from AISidebar button.
2. **Auto-Scheduling** — `useScheduler().autoSchedule()` — greedy algorithm slots tasks into free calendar time. Creates Google Calendar events. Triggered from AISidebar button.
3. **AI Project Generator** — `ProjectGenerator.vue` — user describes a project, Claude generates 3-12 tasks with dependencies. 3-step wizard (input > review > done).
4. **Planning Chat** — `PlanningChat.vue` — natural language input like "Meeting morgen um 14 Uhr" or "Hausarbeit schreiben 3h". Parses intent (event vs task), finds free slots via `findFreeSlots()`, creates entries.
5. **Deadline Watcher** — `useDeadlineWatcher()` — computed warnings for overdue/approaching deadlines.

### Existing data model (in `app/types/task.ts`):

- **Task**: id, title, description, estimatedMinutes, deadline, priority (critical/high/medium/low), status (todo/scheduled/in_progress/done/missed), projectId, dependencies[], scheduledStart/End, calendarEventId, isDeepWork, priorityReason, prioritySource (ai/manual)
- **Project**: id, name, description, taskIds[], deadline
- **UserPreferences**: workStartHour/EndHour, sleepSchedule, commute, deepWorkWindows[], lunchBreak, workDays[], routineTemplates[], taskBufferMinutes, deadlineWarningDays

### Existing composables (DO NOT rename or change their APIs):

- `useGoogleAuth()` — { isLoggedIn, user, login, logout, initClient, accessToken }
- `useCalendar()` — { events, fetchEvents, createEvent, updateEvent, deleteEvent }
- `useTasks()` — { tasks, projects, init, createTask, updateTask, deleteTask, createProject, ... }
- `useScheduler()` — { autoSchedule, findFreeSlots }
- `useAI()` — { prioritizeTasks, generateProject }
- `usePreferences()` — { preferences, updatePreferences }
- `useDeadlineWatcher()` — { warnings }

### Language: German (de-DE)

All UI text is in German. Keep it German. Key terms:
- Aufgaben = Tasks, Termine = Events/Appointments, Planen = Plan
- Heute = Today, Morgen = Tomorrow, Woche = Week, Monat = Month
- Prioritaet = Priority, Frist/Deadline, Projekt = Project
- Erledigt = Done, Offen = Open, Geplant = Scheduled, Verpasst = Missed

---

## Design System: Color Palette & Tokens

### Step 1: Update `tailwind.config.ts`

Replace the current config with a full dark design system:

```ts
import type { Config } from 'tailwindcss'

export default <Config>{
  content: [
    './app/components/**/*.{vue,ts}',
    './app/composables/**/*.ts',
    './app/pages/**/*.{vue,ts}',
    './app/app.vue',
  ],
  theme: {
    extend: {
      colors: {
        // Core surfaces
        base: '#0B1020',
        surface: '#12192B',
        'surface-secondary': '#1A2236',
        'surface-elevated': '#1F2A42',
        
        // Accent palette
        accent: {
          purple: '#8B6CFF',
          'purple-soft': '#B7A2FF',
          blue: '#6CB8FF',
          green: '#8DFFB5',
          pink: '#F6C1E7',
        },
        
        // Text
        'text-primary': '#F5F7FF',
        'text-secondary': '#A7B0C5',
        'text-muted': '#6B7A99',
        
        // Borders
        'border-subtle': 'rgba(255,255,255,0.08)',
        'border-medium': 'rgba(255,255,255,0.12)',
        'border-strong': 'rgba(255,255,255,0.20)',
        
        // Priority semantic colors (dark-mode adapted)
        priority: {
          critical: '#FF6B8A',
          high: '#FFB06B',
          medium: '#FFD66B',
          low: '#8DFFB5',
        },
        
        // Status semantic colors
        status: {
          todo: '#A7B0C5',
          scheduled: '#6CB8FF',
          'in-progress': '#B7A2FF',
          done: '#8DFFB5',
          missed: '#FF6B8A',
        },
      },
      borderRadius: {
        'glass': '20px',
        'glass-lg': '24px',
        'glass-xl': '32px',
      },
      boxShadow: {
        'glass': '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)',
        'glass-hover': '0 12px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)',
        'glow-purple': '0 0 20px rgba(139,108,255,0.15), 0 0 60px rgba(139,108,255,0.05)',
        'glow-blue': '0 0 20px rgba(108,184,255,0.15), 0 0 60px rgba(108,184,255,0.05)',
        'glow-green': '0 0 20px rgba(141,255,181,0.15), 0 0 60px rgba(141,255,181,0.05)',
      },
      backdropBlur: {
        'glass': '16px',
        'glass-heavy': '24px',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { opacity: '0.5' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
```

### Step 2: Add global CSS in `app/assets/css/main.css`

Create this file and register it in `nuxt.config.ts` under `css: ['~/assets/css/main.css']`:

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

/* Base dark background */
html, body {
  background-color: #0B1020;
  color: #F5F7FF;
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;
}

/* Scrollbar styling */
::-webkit-scrollbar {
  width: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.1);
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(255,255,255,0.2);
}

/* Glass card utility */
.glass-card {
  background: rgba(18, 25, 43, 0.7);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 20px;
}

.glass-card-elevated {
  background: rgba(26, 34, 54, 0.8);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255,255,255,0.10);
  border-radius: 20px;
}

/* Gradient button base */
.btn-primary {
  background: linear-gradient(135deg, #8B6CFF 0%, #6CB8FF 100%);
  color: #F5F7FF;
  border: none;
  border-radius: 12px;
  font-weight: 600;
  transition: all 0.2s ease;
  box-shadow: 0 4px 15px rgba(139,108,255,0.3);
}
.btn-primary:hover {
  box-shadow: 0 6px 25px rgba(139,108,255,0.45);
  transform: translateY(-1px);
}

.btn-secondary {
  background: rgba(255,255,255,0.06);
  color: #A7B0C5;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  font-weight: 500;
  transition: all 0.2s ease;
}
.btn-secondary:hover {
  background: rgba(255,255,255,0.10);
  color: #F5F7FF;
  border-color: rgba(255,255,255,0.15);
}

.btn-accent-green {
  background: linear-gradient(135deg, #8DFFB5 0%, #6CB8FF 100%);
  color: #0B1020;
  font-weight: 600;
  border-radius: 12px;
  transition: all 0.2s ease;
  box-shadow: 0 4px 15px rgba(141,255,181,0.2);
}
.btn-accent-green:hover {
  box-shadow: 0 6px 25px rgba(141,255,181,0.35);
  transform: translateY(-1px);
}

/* Input dark styling */
.input-dark {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  color: #F5F7FF;
  transition: all 0.2s ease;
}
.input-dark:focus {
  border-color: #8B6CFF;
  box-shadow: 0 0 0 3px rgba(139,108,255,0.15);
  outline: none;
}
.input-dark::placeholder {
  color: #6B7A99;
}

/* Ambient glow backgrounds */
.ambient-glow-purple {
  position: relative;
}
.ambient-glow-purple::before {
  content: '';
  position: absolute;
  top: -100px;
  right: -100px;
  width: 400px;
  height: 400px;
  background: radial-gradient(circle, rgba(139,108,255,0.08) 0%, transparent 70%);
  pointer-events: none;
  z-index: 0;
}

.ambient-glow-blue {
  position: relative;
}
.ambient-glow-blue::before {
  content: '';
  position: absolute;
  bottom: -100px;
  left: -100px;
  width: 400px;
  height: 400px;
  background: radial-gradient(circle, rgba(108,184,255,0.06) 0%, transparent 70%);
  pointer-events: none;
  z-index: 0;
}
```

---

## Component-by-Component Redesign Instructions

### 1. `app/app.vue` — App Shell

Currently just `<NuxtPage />`. Keep it minimal but add the dark base:

```vue
<template>
  <div class="min-h-screen bg-base text-text-primary font-sans antialiased">
    <NuxtPage />
  </div>
</template>
```

---

### 2. `app/pages/index.vue` — Main Page Layout

**Current:** Single column, NavBar on top, calendar below, sidebar slides in from right.

**New layout (desktop):** Full app shell with:
- **Left sidebar rail** (64px wide, icon-only nav) — always visible on desktop (lg+)
- **Top bar** (compact, inside main content area) — date nav, search, quick actions
- **Main content area** — calendar views
- **Right panel** — AISidebar as persistent side panel on desktop (not a slide-over)
- **Modals** — remain as overlays via Teleport

**New layout (mobile):** 
- No left sidebar — bottom navigation instead
- Full-width content
- AISidebar becomes a bottom sheet or full-screen overlay
- Compact top bar

**Structure change for index.vue template:**

```html
<div class="min-h-screen bg-base text-text-primary flex">
  <!-- Desktop Left Sidebar Rail -->
  <aside class="hidden lg:flex flex-col items-center w-16 bg-surface border-r border-border-subtle py-4 gap-2 flex-shrink-0">
    <!-- Logo icon -->
    <div class="w-10 h-10 rounded-glass bg-gradient-to-br from-accent-purple to-accent-blue flex items-center justify-center mb-6">
      <svg class="w-5 h-5 text-white" ...calendar icon... />
    </div>
    
    <!-- Nav items (icon buttons with tooltips) -->
    <!-- Dashboard/Today (home icon) — active state: bg-accent-purple/10 text-accent-purple -->
    <!-- Calendar (calendar icon) -->
    <!-- Tasks (checklist icon) -->
    <!-- AI Assistant (sparkle/brain icon) -->
    <!-- Insights (chart icon) — future, can be grayed out -->
    
    <!-- Bottom of rail -->
    <!-- Settings (gear) -->
    <!-- User avatar (small, from Google profile) -->
  </aside>
  
  <!-- Main Content Area -->
  <div class="flex-1 flex flex-col min-w-0">
    <!-- Top Bar (replaces NavBar on desktop) -->
    <header class="h-16 flex items-center justify-between px-4 lg:px-6 border-b border-border-subtle bg-surface/50 backdrop-blur-glass flex-shrink-0">
      <!-- Left: Date navigation (Heute, prev, next, month/year label) -->
      <!-- Center: View toggle pills (Monat | Woche) — glass pill switcher -->
      <!-- Right: Quick actions row -->
      <!--   Search icon button -->
      <!--   + Neue Aufgabe button (btn-primary, compact) -->
      <!--   AI Planer button (sparkle icon, btn-secondary) -->
      <!--   Notification bell (with badge dot if warnings exist) -->
      <!--   User avatar (lg:hidden, since rail shows it on desktop) -->
    </header>
    
    <!-- Deadline warnings (if any) — slim banner below top bar -->
    <DeadlineWarning />
    
    <!-- Content + Right Panel -->
    <div class="flex-1 flex overflow-hidden">
      <!-- Calendar Content -->
      <main class="flex-1 overflow-y-auto p-4 lg:p-6">
        <!-- Calendar views here -->
      </main>
      
      <!-- AI Sidebar (desktop: persistent right panel, 380px) -->
      <aside class="hidden xl:block w-[380px] border-l border-border-subtle overflow-y-auto flex-shrink-0">
        <AISidebar :show="true" ... />
      </aside>
    </div>
  </div>
  
  <!-- Mobile Bottom Navigation (lg:hidden) -->
  <nav class="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-surface/90 backdrop-blur-glass-heavy border-t border-border-subtle flex items-center justify-around px-2 z-50">
    <!-- 5 items: Heute, Kalender, + (FAB-style center), Aufgaben, KI -->
    <!-- Center button: floating action button with gradient, slightly elevated -->
  </nav>
</div>
```

**IMPORTANT:** The left sidebar rail and bottom nav are NEW navigation elements. They replace the current NavBar for navigation. NavBar.vue can be refactored into the top bar header section directly in index.vue, or NavBar can become the new top bar component. Choose whichever is cleaner.

---

### 3. `NavBar.vue` — Refactor into Top Bar

**Remove:** The current logo section, the full "Kalender AI" text on desktop, the separate auth section.

**Transform into** a compact top bar that fits the new layout:

- **Left group:** "Heute" button (glass pill), prev/next chevrons, current date label (e.g. "April 2026" or "KW 15 — 6. - 12. April")
- **Center:** View toggle — two pills in a glass container: "Monat" / "Woche". Active = `bg-accent-purple/20 text-accent-purple`, inactive = `text-text-secondary`
- **Right group:** Icon buttons — search (magnifying glass), "+ Aufgabe" (compact primary button), AI Planer (sparkle icon), notification bell, settings gear, mobile menu/sidebar toggle

**Style:**
- Height: h-14 or h-16
- Background: `bg-surface/50 backdrop-blur-[16px]`
- Border bottom: `border-b border-border-subtle`
- Button style: `btn-secondary` for icon buttons (rounded-xl, 36x36px), subtle hover glow
- "Heute" button: glass pill, `bg-white/5 hover:bg-white/10 border border-border-subtle`
- Date label: `text-lg font-semibold text-text-primary`

---

### 4. `CalendarGrid.vue` — Month View

**Surface:** The outer container becomes a glass card.

**Grid styling:**
- Day headers (Mo, Di, Mi, ...): `text-xs font-medium text-text-muted uppercase tracking-wider`
- Grid lines: `border-border-subtle` (very subtle, almost invisible)
- Day cells: 
  - Default: transparent, `hover:bg-white/[0.03]` transition
  - Other month days: `text-text-muted/40`
  - Today: small circular indicator with `bg-accent-purple` glow, `text-white font-bold`
  - Selected: `bg-accent-purple/10 ring-1 ring-accent-purple/30`
- Event pills inside cells: small rounded pills with left color border accent
  - Use event color from Google Calendar, adapted for dark mode (slightly desaturated, glowing)
  - Text: `text-xs text-text-secondary`
  - Max 2-3 visible, "+X mehr" in muted text

**Month/Year header:** Remove from CalendarGrid (moved to top bar). If CalendarGrid still needs a title, make it minimal.

---

### 5. `WeekView.vue` — Week Timeline

**This is the primary power-user view. Make it premium.**

**Container:** Glass card with `overflow-hidden rounded-glass-lg`

**Header row (days):**
- Each day column header: day name + date number
- Today column: subtle vertical glow strip (`bg-accent-purple/5` full height)
- Day labels: `text-sm font-medium text-text-secondary`, date number `text-lg font-semibold`
- Today: date number gets `bg-accent-purple text-white w-8 h-8 rounded-full inline-flex items-center justify-center`

**Time grid:**
- Time labels (left): `text-xs text-text-muted`
- Grid lines: `border-border-subtle` — barely visible, create structure without clutter
- Current time indicator: horizontal red/pink line with small dot, `bg-accent-pink` with slight glow
- **Hour cell interaction:** `hover:bg-white/[0.02]`, click to create event

**Event blocks (positioned absolutely within day columns):**
- Rounded-xl (16px), glass-card style with left color stripe (4px)
- Background: semi-transparent version of event color + slight blur
- Title in `text-sm font-medium text-text-primary`
- Time in `text-xs text-text-secondary`
- Hover: slight scale(1.02), elevated shadow, border brightens
- Scheduled tasks (from auto-scheduler): distinguish with a small sparkle/AI icon badge

**All-day events row:**
- Glass pills at top, `rounded-xl px-3 py-1`

---

### 6. `EventItem.vue` — Event Badge

**Adapt colors for dark mode.** The current 11-color system maps to dark-friendly colors:

```
1 (Lavender)  → bg-[#B7A2FF]/15 text-[#B7A2FF] border-l-[#B7A2FF]
2 (Sage)      → bg-[#8DFFB5]/15 text-[#8DFFB5] border-l-[#8DFFB5]
3 (Grape)     → bg-[#C084FC]/15 text-[#C084FC] border-l-[#C084FC]
4 (Flamingo)  → bg-[#F6C1E7]/15 text-[#F6C1E7] border-l-[#F6C1E7]
5 (Banana)    → bg-[#FFD66B]/15 text-[#FFD66B] border-l-[#FFD66B]
6 (Tangerine) → bg-[#FFB06B]/15 text-[#FFB06B] border-l-[#FFB06B]
7 (Peacock)   → bg-[#6CB8FF]/15 text-[#6CB8FF] border-l-[#6CB8FF]
8 (Graphite)  → bg-[#A7B0C5]/15 text-[#A7B0C5] border-l-[#A7B0C5]
9 (Blueberry) → bg-[#818CF8]/15 text-[#818CF8] border-l-[#818CF8]
10 (Basil)    → bg-[#6EE7B7]/15 text-[#6EE7B7] border-l-[#6EE7B7]
11 (Tomato)   → bg-[#FF6B8A]/15 text-[#FF6B8A] border-l-[#FF6B8A]
```

Each event badge: `rounded-lg border-l-[3px] px-2 py-0.5` with the appropriate color combo.

---

### 7. `AISidebar.vue` — AI Task Panel (Major Redesign)

**Current:** Slide-in white panel from right, 384px wide, with stats grid, action buttons, task list.

**New:** Premium AI-native side panel. On desktop xl+, it's a persistent right column. On smaller screens and mobile, it's a slide-in overlay (keep the existing transition).

**Structure from top to bottom:**

#### 7a. AI Status Header
Small section at top with:
- "KI Assistent" label with sparkle icon and animated subtle glow dot (indicating AI is "active")
- Optional: one-line AI greeting/suggestion: "Guten Morgen! 5 Aufgaben stehen heute an." (computed from task data)

#### 7b. Today Summary Card (NEW — but uses existing data)
A glass card showing today's overview:
- "Heute" heading with date
- Number of tasks due / scheduled today
- Next upcoming event (from `events` prop)
- Available work hours remaining (can be computed from preferences + events)
- Small progress ring or bar showing "X von Y Aufgaben erledigt"

Build this from existing composable data — no new backend needed. Compute from `tasks`, `events`, and `preferences`.

#### 7c. AI Quick Actions (existing buttons, restyled)
Three action cards in a vertical stack (not a row — more spacious):

1. **KI Priorisierung** — `btn-primary` gradient style, sparkle icon
   - Subtitle: "Aufgaben nach Dringlichkeit sortieren"
   - Shows loading spinner when active (existing `isPrioritizing` state)

2. **Auto-Planen** — `btn-accent-green` style
   - Subtitle: "Freie Zeitslots automatisch fuellen"
   - Shows scheduling result feedback (existing `lastScheduleResult`)
   
3. **Projekt generieren** — glass card with purple accent border
   - Subtitle: "KI erstellt Aufgaben aus Projektbeschreibung"
   - Opens ProjectGenerator (existing behavior)

Each card: `glass-card p-4 rounded-glass cursor-pointer` with hover glow effect.

#### 7d. Task Filter Pills
Horizontal scrollable pill row:
- Alle / Offen / Geplant / Erledigt / Verpasst
- Style: `rounded-full px-3 py-1 text-sm`
- Active: `bg-accent-purple/20 text-accent-purple`
- Inactive: `bg-white/5 text-text-secondary hover:bg-white/8`

#### 7e. Task List (scrollable, main area)
Grouped by project (existing behavior). Each group:
- Project header: collapsible, `text-sm font-semibold text-text-secondary`, chevron icon
- Ungrouped tasks under "Einzelaufgaben"

**Task card design:**
- Glass card with subtle left border color = priority color
- Layout:
  ```
  [Priority dot] Title                    [...menu]
  [Status badge] [Duration badge] [Deadline if set]
  [AI priority reason if exists — italic, muted, small]
  ```
- Priority dot: small 8px circle, `bg-priority-{level}`
- Status badge: `rounded-full px-2 py-0.5 text-xs`, colored per status
- Duration: `text-xs text-text-muted` with clock icon
- Deadline: `text-xs` — normal = `text-text-muted`, approaching = `text-priority-high`, overdue = `text-priority-critical`
- Deep work indicator: small brain/focus icon if `isDeepWork`
- AI indicator: if `prioritySource === 'ai'`, show tiny sparkle next to priority
- **Hover:** card border brightens, slight translateY(-1px)
- **Actions on hover/tap:** Edit (pencil), Mark done (check), Mark missed (clock-rewind) — small icon buttons

#### 7f. Stats Footer (simplified)
Compact stats row at bottom:
- Total | Offen | Geplant | Erledigt — just numbers with labels, `text-xs text-text-muted`

---

### 8. `PlanningChat.vue` — AI Planning Modal

**Current:** Wide 2-column modal with input, type selector, duration, examples, preview.

**New:** Premium command-center style modal, centered, with conversation-like feel.

**Overlay:** Dark scrim `bg-black/60 backdrop-blur-sm`

**Modal container:** `glass-card-elevated max-w-xl w-full mx-4 p-0 overflow-hidden`

**Layout (single column, stacked):**

1. **Header:** "KI Planer" with sparkle icon, close X button. `px-6 py-4 border-b border-border-subtle`

2. **Input area:** 
   - Large textarea (3-4 rows), `input-dark` styling, placeholder: "Was moechtest du planen? z.B. 'Meeting morgen um 14 Uhr' oder 'Hausarbeit 3h diese Woche'"
   - Below textarea: inline chip selectors
     - Type: Auto | Termin | Aufgabe — small pills
     - Duration: dropdown or pill selector
   - Submit button: `btn-primary` with arrow icon, right-aligned

3. **Preview section (appears after analysis):**
   - Glass card showing parsed result
   - Icon + "Termin erkannt" or "Aufgabe erkannt" label
   - Details: Title, Date/Time, Duration
   - Suggested time slot (from findFreeSlots)
   - "Erstellen" confirmation button (green accent) + "Anpassen" secondary button

4. **Examples (collapsible or shown when input is empty):**
   - Small muted text with 3-4 example phrases
   - Style: `text-sm text-text-muted italic`

---

### 9. `TaskModal.vue` — Task Editor

**Overlay:** `bg-black/60 backdrop-blur-sm`
**Container:** `glass-card-elevated max-w-lg w-full mx-4 p-6`

**Form fields — all use `input-dark` class:**
- Title: full width, larger text input
- Description: textarea, 3 rows
- Duration: custom pill selector (15min, 30min, 1h, 1.5h, 2h, 3h, 4h) instead of dropdown
- Priority: 4 colored pills (Kritisch, Hoch, Mittel, Niedrig) with `bg-priority-{level}/15 text-priority-{level}` active state
- Deadline: date input, dark styled
- Project: select dropdown, dark styled
- Dependencies: checkbox list in scrollable container
- Deep Work toggle: custom toggle switch with accent-purple active state

**Buttons:**
- Delete: `text-priority-critical hover:bg-priority-critical/10 rounded-xl` (left side)
- Cancel: `btn-secondary`
- Save: `btn-primary`

---

### 10. `EventModal.vue` — Event Editor

Same glass-card overlay treatment as TaskModal. Dark inputs, accent buttons. Keep the fields (title, description, date, time, all-day toggle, delete).

---

### 11. `PreferencesModal.vue` — Settings

**Overlay + glass container** (same pattern).

**Organize into sections with subtle dividers:**
- Arbeitszeiten (Work hours) — start/end dropdowns
- Schlafzeiten (Sleep schedule) — with sync toggle
- Mittagspause (Lunch) — start/end
- Pendeln (Commute) — minutes inputs
- Deep Work — windows config
- Routine-Vorlagen (Routine templates) — list with add/remove
- Erweitert (Advanced) — buffer, deadline warning days, work days

**Section headers:** `text-sm font-semibold text-accent-purple uppercase tracking-wider`
**Toggle switches:** Custom, `bg-white/10` inactive, `bg-accent-purple` active
**Number/time inputs:** compact `input-dark` styled

---

### 12. `DeadlineWarning.vue` — Alert Banner

**Replace the red banner with a sleek notification bar:**
- Glass card with left accent border
- Critical: `border-l-priority-critical bg-priority-critical/5`
- Warning: `border-l-priority-high bg-priority-high/5`
- Icon (warning triangle) + text + dismiss X
- Compact: `py-2 px-4 mx-4 lg:mx-6 mt-2 rounded-glass text-sm`

---

### 13. `ProjectGenerator.vue` — AI Project Wizard

**3-step wizard, glassmorphism modal:**

Step 1 (Input):
- Project name input
- Description textarea (larger, `input-dark`)
- Project type selector: horizontal pill cards with icons (Programmierung, Video, Content, Lernen, etc.)
- "Generieren" button: `btn-primary` with sparkle icon

Step 2 (Review):
- Generated tasks shown as a vertical list of glass mini-cards
- Each shows: title, duration, priority badge, dependency arrows/lines
- User can toggle tasks on/off, edit titles inline
- "Projekt erstellen" button: `btn-accent-green`

Step 3 (Done):
- Success state with checkmark animation
- Summary: "X Aufgaben in Projekt 'Name' erstellt"
- "Zum Projekt" / "Schliessen" buttons

---

### 14. New Component: `DashboardToday.vue` (OPTIONAL — only if time permits)

A dashboard widget that could replace/augment the calendar as the default landing view. Shows:
- Greeting: "Guten Morgen, {name}" (from useGoogleAuth user)
- Today's agenda (timeline of events)
- Pending tasks overview
- AI suggestion card: "3 Aufgaben koennten heute eingeplant werden" with action button

This is computed from existing data only — no new backend.

---

## Mobile-Specific Instructions

### Bottom Navigation Bar
5 items, each with icon + label:
1. **Heute** (home/sun icon) — scrolls to today / shows today view
2. **Kalender** (calendar icon) — shows calendar grid/week
3. **+ Neu** (center, elevated FAB) — opens action menu (Neuer Termin / Neue Aufgabe / KI Planer)
4. **Aufgaben** (checklist icon) — opens AISidebar as full-screen
5. **KI** (sparkle icon) — opens PlanningChat or AI features

**Style:**
- `bg-surface/90 backdrop-blur-[24px] border-t border-border-subtle`
- Active item: `text-accent-purple`
- Inactive: `text-text-muted`
- Center FAB: `w-12 h-12 rounded-full bg-gradient-to-br from-accent-purple to-accent-blue shadow-glow-purple -mt-4`

### Mobile Modals
- All modals: full-screen on mobile (`sm:max-w-lg sm:mx-auto sm:my-8`)
- Use `rounded-t-glass-xl` on mobile (bottom sheet style) where appropriate
- Touch-friendly: min 44px tap targets, generous padding

### Mobile AISidebar
- Opens as full-screen overlay on mobile (not a narrow sidebar)
- Header with back arrow + "Aufgaben"
- Same content, vertically stacked, no 2-column layouts

---

## Transition & Animation Guidelines

- **Modal entry:** `opacity 0→1 (200ms)` + `translateY(16px)→0 (300ms ease-out)` + `scale(0.98)→1`
- **Modal exit:** reverse, 200ms
- **Sidebar slide (mobile):** `translateX(100%)→0 (300ms ease-out)`
- **Card hover:** `transform: translateY(-2px)` + shadow increase, 150ms
- **Button hover:** subtle scale(1.02) + shadow glow increase, 150ms
- **View transitions (month/week):** crossfade `opacity 150ms`
- **Loading states:** pulse animation on skeleton shapes, `bg-white/5` shimmer
- **AI processing:** subtle pulsing glow on the button/card that triggered it

Keep all transitions under 300ms. No bouncy or playful animations — everything should feel swift and premium.

---

## What NOT To Do

1. **Do NOT create new pages/routes.** Everything stays on `index.vue` as a single-page app.
2. **Do NOT modify composable logic or APIs.** Only change `.vue` templates and styles.
3. **Do NOT change the data model** in `task.ts` (the pending changes in the working tree should be preserved).
4. **Do NOT remove any existing functionality.** Every button, action, and feature must survive the redesign.
5. **Do NOT add new npm dependencies** for UI (no Headless UI, no Radix, no animation libraries). Pure Tailwind + CSS.
6. **Do NOT create a landing page, hero section, footer, testimonials, or marketing content.**
7. **Do NOT build new AI backend endpoints.** All AI integration uses existing composables.
8. **Do NOT change text from German to English.**
9. **Do NOT use bright white backgrounds anywhere.** Everything must be dark.
10. **Do NOT use flat/generic dashboard styling.** Every surface should have depth, glass, and atmosphere.

---

## Execution Order (Recommended)

1. `tailwind.config.ts` + `assets/css/main.css` + `nuxt.config.ts` (css registration) — foundation
2. `app.vue` — dark base wrapper
3. `index.vue` — new layout shell (left rail, top bar, right panel, mobile bottom nav)
4. `CalendarGrid.vue` + `WeekView.vue` + `EventItem.vue` — calendar views
5. `AISidebar.vue` — the biggest component, most redesign work
6. `PlanningChat.vue` — AI planning modal
7. `TaskModal.vue` + `EventModal.vue` — editor modals
8. `PreferencesModal.vue` — settings
9. `DeadlineWarning.vue` — alert banner
10. `ProjectGenerator.vue` — AI wizard
11. `NavBar.vue` — refactor or integrate into top bar
12. Polish pass — hover states, transitions, mobile testing, spacing consistency

---

## Quality Checklist

- [ ] All surfaces are dark (#0B1020 base, #12192B surface, #1A2236 cards)
- [ ] No white backgrounds anywhere
- [ ] Glass effect (backdrop-blur + semi-transparent bg + subtle border) on all cards/panels
- [ ] Accent colors (purple, blue, green, pink) appear as highlights throughout
- [ ] Text hierarchy: primary (#F5F7FF), secondary (#A7B0C5), muted (#6B7A99)
- [ ] All existing features functional (AI prioritize, auto-schedule, project gen, planning chat, CRUD events/tasks, preferences, deadline warnings)
- [ ] Left sidebar rail visible on lg+ screens
- [ ] Bottom navigation visible on mobile (<lg)
- [ ] AISidebar persistent on xl+ screens, overlay on smaller
- [ ] All modals have glass-card overlay treatment
- [ ] Buttons use gradient or glass styling (no flat gray)
- [ ] Priority colors adapted for dark mode
- [ ] Event colors adapted for dark mode
- [ ] Hover states on all interactive elements
- [ ] Smooth transitions (modal open/close, sidebar, view switch)
- [ ] Touch-friendly on mobile (44px min targets)
- [ ] Responsive from 360px mobile to 1920px+ desktop
- [ ] German text preserved throughout
- [ ] No broken imports or missing component references
- [ ] Current working tree changes in PreferencesModal.vue, useScheduler.ts, task.ts are preserved
