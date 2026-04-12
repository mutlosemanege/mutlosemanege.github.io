# Skills & Wissen — Übersicht

> ⬆ [[../index]] · [[../00_Übersicht]]

Technische Skill-Notes aus der Entwicklung von Kalender-AI. Jede Note dokumentiert ein konkretes Problem, die gewählte Lösung und die dabei gelernten Muster.

---

## Scheduling & Planung

```
[[Greedy-Scheduler]]         Kern-Algorithmus: Tasks in freie Slots einplanen
  ├── [[Multi-Block-Scheduling]]   Große Tasks aufteilen (> 2h)
  └── [[Rescheduling-Modi]]        4 Strategien für "Nicht geschafft"
```

## KI-Integration

```
[[KI-Priorisierung]]         Claude Haiku + tool_use → strukturiertes Ranking
  └── [[Nuxt-Serverless-KI]] Server Routes als Netlify Functions (API-Key sicher)
```

## Natürliche Sprache

```
[[Planungs-Chat-NLP]]        Regex-Parser: Deutsch → Termin/Aufgabe
  └── (nutzt [[Greedy-Scheduler]] für Slot-Suche)
```

## Daten & Persistenz

```
[[IndexedDB-Vue3]]           idb-keyval + Singleton-Pattern + readonly()
[[Deadline-Watcher]]         Reaktiver computed, Arbeitsstunden-Berechnung
```

## Authentifizierung

```
[[Google-OAuth2-Browser]]    PKCE-Flow, Script-Polling, Token im Memory
  └── Anleitung: [[../../deployment/GOOGLE_SETUP]]
```

## Design

```
[[Frontend-Design]]           Produktionsreife Interfaces, Ästhetik-Guidelines
  └── [[Glassmorphism-Redesign]]   Farbpalette, Glass-CSS, Layout-Architektur
        └── [[Tailwind-Design-System]]  Design Tokens, Breakpoints, Event-Farben
```

---

## Alle Skills

| Skill | Kategorie | Verknüpfte Dateien |
|-------|-----------|-------------------|
| [[Greedy-Scheduler]] | Scheduling | [[../../CLAUDE]], [[../../ai/AI_FEATURE_ROADMAP]] |
| [[Multi-Block-Scheduling]] | Scheduling | Greedy-Scheduler, Rescheduling-Modi |
| [[Rescheduling-Modi]] | Scheduling | Greedy-Scheduler, Multi-Block |
| [[KI-Priorisierung]] | KI | Nuxt-Serverless-KI, [[../../CLAUDE]] |
| [[Nuxt-Serverless-KI]] | KI | [[../../deployment/NETLIFY_SETUP]], KI-Priorisierung |
| [[Planungs-Chat-NLP]] | NLP | Greedy-Scheduler, [[../../ai/AI_FEATURE_ROADMAP]] |
| [[IndexedDB-Vue3]] | Daten | [[../../CLAUDE]], Greedy-Scheduler |
| [[Deadline-Watcher]] | Daten | IndexedDB-Vue3, Greedy-Scheduler |
| [[Google-OAuth2-Browser]] | Auth | [[../../deployment/GOOGLE_SETUP]], [[../../deployment/NETLIFY_SETUP]] |
| [[Frontend-Design]] | Design | Glassmorphism-Redesign, Tailwind-Design-System |
| [[Glassmorphism-Redesign]] | Design | [[../../planung/REDESIGN-PROMPT]], Tailwind-Design-System, Frontend-Design |
| [[Tailwind-Design-System]] | Design | [[../../planung/REDESIGN-PROMPT]], Glassmorphism-Redesign |

---

*Übergeordnet: [[../index]]*
