# CLAUDE.md

> Verknüpft mit: [[_INDEX]] · [[AI_FEATURE_ROADMAP]] · [[REDESIGN-PROMPT]]
> Skills: [[skills/Greedy-Scheduler]] · [[skills/KI-Priorisierung]] · [[skills/Nuxt-Serverless-KI]] · [[skills/Google-OAuth2-Browser]] · [[skills/IndexedDB-Vue3]]

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Kalender-AI is a Google Calendar web app with AI-powered task management. Built with Nuxt 4 (SPA mode, `ssr: false`), Tailwind CSS, Google Calendar API, and Anthropic Claude API. The UI and codebase are in German.

## Commands

- `npm run dev` — start dev server at localhost:3000
- `npm run build` — production build (Netlify target via `NITRO_PRESET=netlify`)
- `npm run generate` — static site generation (output: `.output/public/`)
- `npm run preview` — preview production build locally

No test framework is configured.

## Environment Variables

Required in `.env`:
- `NUXT_PUBLIC_GOOGLE_CLIENT_ID` — Google OAuth2 client ID
- `NUXT_PUBLIC_GOOGLE_CALENDAR_ID` — calendar ID (default: `primary`)
- `NUXT_PUBLIC_BASE_URL` — base URL for deployment path resolution
- `NUXT_PUBLIC_AI_ENABLED` — enable/disable AI features (default: `true`)
- `ANTHROPIC_API_KEY` — server-side only, required for AI endpoints

## Architecture

**Two data layers that operate independently:**

1. **Google Calendar events** — fetched/mutated via Google Calendar REST API directly from the browser using OAuth2 access tokens. No server proxy. Composable: `useCalendar` calls the API with `fetch()` and the token from `useGoogleAuth`.

2. **Local tasks & projects** — persisted in IndexedDB via `idb-keyval`. Tasks have priorities, deadlines, dependencies, estimated durations, and deep-work flags. Composable: `useTasks` handles CRUD and keeps `project.taskIds` in sync automatically when tasks are created/updated. Tasks can optionally be linked to calendar events via `calendarEventId`.

**Task statuses:** `todo` | `scheduled` | `in_progress` | `done` | `missed`. The `missed` status allows scheduled tasks to be reset and re-planned.

**AI features (server-side):**
- `server/api/ai/prioritize.post.ts` — Claude Haiku ranks tasks by urgency/importance using tool_use (max 20 tasks per call)
- `server/api/ai/generate-project.post.ts` — Claude Haiku generates project task breakdowns (3-12 tasks) with dependencies using tool_use. Supports project type hints (programming, video editing, content, learning, etc.)
- Both endpoints use structured output via `tool_choice` to force tool responses

**Scheduling engine** (`useScheduler`): greedy iterative algorithm that slots tasks into free calendar time, respecting work hours, lunch breaks, deep-work windows (with `minDeepWorkBlockMinutes` threshold), task priorities, deadlines, and dependency ordering. Dynamic planning window: min 21 days, up to 90 days, extending to latest deadline + 7 days. Uses a while-loop for correct multi-level dependency resolution. Exports `findFreeSlots` for use by PlanningChat.

**Planning Chat** (`PlanningChat.vue`): natural language input for quick event/task creation. Parses time references (heute/morgen/nächste Woche/Wochenende), time-of-day preferences (morgens/nachmittag/abend), and durations (2h, 30min) via regex. Auto-detects intent (event vs task) based on keywords, with manual override. Uses `findFreeSlots` from the scheduler to find optimal slots.

**Routine Templates** (`PreferencesModal.vue`): users define recurring weekly events (e.g. Uni, Gym, Calls) with day/start/end. "Nächste 4 Wochen eintragen" bulk-creates Google Calendar events. Includes duplicate prevention by matching title + exact start/end time against existing events.

**User preferences** (`usePreferences`): work hours, lunch break, work days, deep-work windows, `minDeepWorkBlockMinutes`, deadline warning threshold, routine templates. Stored in localStorage.

**Deadline watcher** (`useDeadlineWatcher`): computed warnings for overdue/approaching deadlines, factoring in available work hours.

## Components

- `AISidebar.vue` — right sidebar with task list grouped by project, status filter (Alle/Offen/Geplant/Erledigt), collapsible groups, inline priority change, "Nicht geschafft" (missed) flow, AI prioritization, auto-scheduling with feedback messages
- `PlanningChat.vue` — modal for natural language event/task creation with preview and confirmation
- `TaskModal.vue` — create/edit tasks with project dropdown and dependency checkboxes
- `PreferencesModal.vue` — "Planung und Routinen": work hours, deep-work config, routine template management
- `ProjectGenerator.vue` — AI-powered project generation wizard (input → review → done) with project type selection
- `CalendarGrid.vue` — month view calendar grid
- `WeekView.vue` — week view with hourly slots
- `EventModal.vue` — create/edit Google Calendar events
- `NavBar.vue` — top navigation with view toggle, task/planner/settings buttons
- `DeadlineWarning.vue` — deadline warning display

## Key Patterns

- Composables use module-level `ref()` for shared singleton state (not per-component instances)
- Google auth loads external scripts (`accounts.google.com/gsi/client`, `apis.google.com/js/api.js`) via `<head>` and polls for availability with `waitForScript()`
- All composable return values use `readonly()` wrappers
- Types are defined in `app/types/task.ts` (Task, Project, TaskPriority, TaskStatus, DeepWorkWindow, RoutineTemplate, UserPreferences); calendar event types are co-located in `useCalendar.ts`
- Dev server configured with `devServer.host: 'localhost'` in `nuxt.config.ts` for reliable IPv4/IPv6 binding on Windows

## Known Limitations

- No automatic Google OAuth token refresh (expires after ~1h)
- No sync between Google Calendar and local IndexedDB (deleted calendar events leave orphaned `calendarEventId` on tasks)
- No undo after auto-scheduling
- PlanningChat NLP is regex-based (no weekday names, no specific dates like "am 15.")
- `in_progress` task status is defined but never set in UI
- No browser notifications for deadlines
- No task search functionality

## Deployment

- **Netlify**: configured via `netlify.toml` (build command: `npm run build`, publish: `dist`)
- **GitHub Pages**: GitHub Actions workflow on push to `main`, runs `npm run generate`, deploys `.output/public/`

## Maintenance

When making changes that affect architecture, composables, data layers, environment variables, commands, deployment config, or key patterns described above — update this file to reflect the current state. This applies to additions, removals, renames, and structural refactors.
