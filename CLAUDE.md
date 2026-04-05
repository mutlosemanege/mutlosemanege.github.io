# CLAUDE.md

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

2. **Local tasks & projects** — persisted in IndexedDB via `idb-keyval`. Tasks have priorities, deadlines, dependencies, estimated durations, and deep-work flags. Composable: `useTasks`. Tasks can optionally be linked to calendar events via `calendarEventId`.

**AI features (server-side):**
- `server/api/ai/prioritize.post.ts` — Claude Haiku ranks tasks by urgency/importance using tool_use
- `server/api/ai/generate-project.post.ts` — Claude Haiku generates project task breakdowns using tool_use
- Both endpoints use structured output via `tool_choice` to force tool responses

**Scheduling engine** (`useScheduler`): greedy algorithm that slots tasks into free calendar time, respecting work hours, lunch breaks, deep-work windows, task priorities, deadlines, and dependency ordering. Plans 14 days ahead.

**User preferences** (`usePreferences`): work hours, lunch break, work days, deep-work windows, deadline warning threshold. Stored in localStorage.

**Deadline watcher** (`useDeadlineWatcher`): computed warnings for overdue/approaching deadlines, factoring in available work hours.

## Key Patterns

- Composables use module-level `ref()` for shared singleton state (not per-component instances)
- Google auth loads external scripts (`accounts.google.com/gsi/client`, `apis.google.com/js/api.js`) via `<head>` and polls for availability with `waitForScript()`
- All composable return values use `readonly()` wrappers
- Types are defined in `app/types/task.ts`; calendar event types are co-located in `useCalendar.ts`

## Deployment

- **Netlify**: configured via `netlify.toml` (build command: `npm run build`, publish: `dist`)
- **GitHub Pages**: GitHub Actions workflow on push to `main`, runs `npm run generate`, deploys `.output/public/`

## Maintenance

When making changes that affect architecture, composables, data layers, environment variables, commands, deployment config, or key patterns described above — update this file to reflect the current state. This applies to additions, removals, renames, and structural refactors.
