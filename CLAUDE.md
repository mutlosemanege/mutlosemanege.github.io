# CLAUDE.md

> Hub: [[docs/index]]
> Architektur: [[docs/architektur/Architektur & Entwicklung]]
> Planung: [[docs/planung/Planung & Design]]
> KI-Roadmaps: [[docs/ai/AI_FEATURE_ROADMAP]] · [[docs/ai/AI_FEATURE_ROADMAP_PHASE_3]] · [[docs/ai/AI_FEATURE_ROADMAP_PHASE_4]] · [[docs/ai/AI_FEATURE_ROADMAP_PHASE_5]]
> Redesign: [[docs/planung/REDESIGN-PROMPT]] · [[docs/planung/REDESIGN_CHECKLIST]]

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

Kalender-AI is a Nuxt 4 SPA for Google Calendar, local task/project planning, and AI-assisted scheduling.
The UI and most product copy are in German.

Core stack:
- Nuxt 4 (`ssr: false`)
- Vue 3 + Composition API
- Tailwind CSS
- Google Calendar REST API
- IndexedDB via `idb-keyval`
- Anthropic API for server-side AI endpoints

## Commands

- `npm run dev` - start dev server
- `npm run build` - production build
- `npm run generate` - static generation
- `npm run preview` - preview production build
- `npm run test:planning` - planning regression tests

Notes:
- The dev server is configured with `devServer.host: '0.0.0.0'` in `nuxt.config.ts`.
- Local builds currently tend to finish functionally and then fail on a known Windows/Nuxt cache `EPERM` while unlinking files in `node_modules/.cache/nuxt/.nuxt/...`.

## Environment Variables

Required in `.env`:
- `NUXT_PUBLIC_GOOGLE_CLIENT_ID`
- `NUXT_PUBLIC_GOOGLE_CALENDAR_ID`
- `NUXT_PUBLIC_BASE_URL`
- `NUXT_PUBLIC_AI_ENABLED`
- `ANTHROPIC_API_KEY`

## Documentation Layout

Current docs live under `docs/`:
- Hub: `docs/index.md`
- Architecture: `docs/architektur/Architektur & Entwicklung.md`
- Planning: `docs/planung/Planung & Design.md`
- AI roadmap: `docs/ai/AI_FEATURE_ROADMAP.md`
- Redesign checklist: `docs/planung/REDESIGN_CHECKLIST.md`
- Test strategy: `docs/testing/TEST_STRATEGY.md`

## Architecture

### Two separate data layers

1. Google Calendar events  
Fetched and mutated directly from the browser via OAuth2 access tokens in `useCalendar.ts`.

2. Local tasks and projects  
Stored in IndexedDB and managed via `useTasks.ts`.

These systems are intentionally separate. Tasks may link to calendar events, but they are not the same source of truth.

### Main composables

- `useGoogleAuth` - Google OAuth login/token handling
- `useCalendar` - Google Calendar CRUD, duplicate detection, sync status
- `useTasks` - tasks/projects CRUD and project-task consistency
- `useScheduler` - free-slot detection, multi-block scheduling, dependency-aware planning
- `useAI` - frontend wrapper for AI endpoints
- `usePreferences` - local planning preferences, behavior signals, daily modes/commits/reflections
- `useDeadlineWatcher` - deadline warnings and pressure signals

### Scheduling

`useScheduler.ts` currently supports:
- work hours, lunch, work days
- deep-work windows
- task buffer
- dependency ordering
- multi-block scheduling
- holiday blockers by region
- optional blockers from sleep, commute, routines, work blocks, and lunch blocks
- behavior-aware slot preference

The scheduler exports `findFreeSlots` and `scheduleTasks`.

### AI endpoints

- `server/api/ai/prioritize.post.ts`
- `server/api/ai/generate-project.post.ts`

Security middleware:
- `server/middleware/security.ts`

Current middleware protections:
- origin validation
- simple IP/path rate limiting
- sanitized inputs before prompt insertion
- raw backend errors not forwarded to the client

## Important Components

- `app/pages/index.vue` - main shell, dashboard, calendar, mobile navigation
- `app/components/AISidebar.vue` - task room, AI actions, schedule review, recovery
- `app/components/PlanningChat.vue` - natural language planning modal
- `app/components/PreferencesModal.vue` - planning rules, routines, imports
- `app/components/ProjectGenerator.vue` - AI project breakdown flow
- `app/components/TaskModalDialog.vue` - current task create/edit modal
- `app/components/EventModal.vue` - calendar event modal
- `app/components/NavBar.vue` - top navigation
- `app/components/CalendarGrid.vue` - month view
- `app/components/WeekView.vue` - week view

Important note:
- The active task modal file is `TaskModalDialog.vue`.
- Older docs may still mention `TaskModal.vue`.

## Current Product State

Implemented and active in the app:
- AI prioritization with explanations and local escalation
- auto-plan with preview/review before applying
- rescheduling with multiple modes
- project generation with review-first scheduling
- planning chat with parser, clarifications, grouped suggestions, and selectable alternatives
- routines, sleep, commute, holiday, and other planning blockers
- recovery/undo flows for important planning actions
- dashboard cards for today, week forecast, personalization, and reflection
- redesign to dark/glass UI with mobile bottom navigation

Roadmap status:
- Phase 1 to 4 are documented as completed
- Phase 5 is in progress in `docs/ai/AI_FEATURE_ROADMAP_PHASE_5.md`

## Testing

There is no full E2E framework yet, but there is a lightweight regression suite:
- `tests/planning-regressions.test.mjs`

Supporting docs:
- `docs/testing/TEST_STRATEGY.md`
- `docs/testing/E2E_SMOKE_CHECKLIST.md`

## Known Limitations

- No automatic Google OAuth token refresh
- Google Calendar and IndexedDB are still separate systems; external calendar changes can leave stale task links
- AI/planning behavior is partly heuristic and partly local, not fully model-driven
- The app relies on browser APIs and local state; some flows still need real-device browser smoke testing
- Older docs may reference outdated component names or earlier file locations

## Deployment

- Netlify config: `netlify.toml`
- Build command: `npm run build`
- Publish dir in config: `dist`
- `NITRO_PRESET=netlify` is set in Netlify build environment

## Maintenance

When changing architecture, key composables, environment variables, docs structure, component entry points, roadmap status, or testing strategy, update this file to match the real current state.

<!-- gitnexus:start -->
# GitNexus - Code Intelligence

This project is indexed by GitNexus as **kalender-ai** (929 symbols, 2004 relationships, 77 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol - callers, callees, which execution flows it participates in - use `gitnexus_context({name: "symbolName"})`.

## When Debugging

1. `gitnexus_query({query: "<error or symptom>"})` - find execution flows related to the issue
2. `gitnexus_context({name: "<suspect function>"})` - see all callers, callees, and process participation
3. `READ gitnexus://repo/kalender-ai/process/{processName}` - trace the full execution flow step by step
4. For regressions: `gitnexus_detect_changes({scope: "compare", base_ref: "main"})` - see what your branch changed

## When Refactoring

- **Renaming**: MUST use `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` first. Review the preview - graph edits are safe, text_search edits need manual review. Then run with `dry_run: false`.
- **Extracting/Splitting**: MUST run `gitnexus_context({name: "target"})` to see all incoming/outgoing refs, then `gitnexus_impact({target: "target", direction: "upstream"})` to find all external callers before moving code.
- After any refactor: run `gitnexus_detect_changes({scope: "all"})` to verify only expected files changed.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace - use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Tools Quick Reference

| Tool | When to use | Command |
|------|-------------|---------|
| `query` | Find code by concept | `gitnexus_query({query: "auth validation"})` |
| `context` | 360-degree view of one symbol | `gitnexus_context({name: "validateUser"})` |
| `impact` | Blast radius before editing | `gitnexus_impact({target: "X", direction: "upstream"})` |
| `detect_changes` | Pre-commit scope check | `gitnexus_detect_changes({scope: "staged"})` |
| `rename` | Safe multi-file rename | `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` |
| `cypher` | Custom graph queries | `gitnexus_cypher({query: "MATCH ..."})` |

## Impact Risk Levels

| Depth | Meaning | Action |
|-------|---------|--------|
| d=1 | WILL BREAK - direct callers/importers | MUST update these |
| d=2 | LIKELY AFFECTED - indirect deps | Should test |
| d=3 | MAY NEED TESTING - transitive | Test if critical path |

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/kalender-ai/context` | Codebase overview, check index freshness |
| `gitnexus://repo/kalender-ai/clusters` | All functional areas |
| `gitnexus://repo/kalender-ai/processes` | All execution flows |
| `gitnexus://repo/kalender-ai/process/{name}` | Step-by-step execution trace |

## Self-Check Before Finishing

Before completing any code modification task, verify:
1. `gitnexus_impact` was run for all modified symbols
2. No HIGH/CRITICAL risk warnings were ignored
3. `gitnexus_detect_changes()` confirms changes match expected scope
4. All d=1 (WILL BREAK) dependents were updated

## Keeping the Index Fresh

After committing code changes, the GitNexus index becomes stale. Re-run analyze to update it:

```bash
npx gitnexus analyze
```

If the index previously included embeddings, preserve them by adding `--embeddings`:

```bash
npx gitnexus analyze --embeddings
```

To check whether embeddings exist, inspect `.gitnexus/meta.json` - the `stats.embeddings` field shows the count (0 means no embeddings). **Running analyze without `--embeddings` will delete any previously generated embeddings.**

> Claude Code users: A PostToolUse hook handles this automatically after `git commit` and `git merge`.

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
