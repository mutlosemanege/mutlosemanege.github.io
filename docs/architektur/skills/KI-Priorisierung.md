# Skill: KI-Priorisierung mit Claude

> ⬆ [[00 Skills Übersicht]] · [[../_INDEX]]
> Verknüpft: [[../CLAUDE]] · [[../AI_FEATURE_ROADMAP]]
> Verwandte Skills: [[Greedy-Scheduler]] · [[Nuxt-Serverless-KI]]

---

## Was haben wir gebaut?

Einen **KI-Priorisierungsservice** der Aufgaben via Claude Haiku nach Dringlichkeit und Wichtigkeit rankt — mit Begründungstext pro Aufgabe, der direkt in der UI angezeigt wird.

**Dateien:**
- `server/api/ai/prioritize.post.ts` — Serverless Function
- `app/composables/useAI.ts` — Frontend-Integration

---

## Architektur-Muster: Structured Output mit `tool_use`

```ts
// Statt freiem Text → erzwungenes Struktur-Output via tool_choice
const response = await anthropic.messages.create({
  model: 'claude-haiku-4-5-20251001',
  max_tokens: 1024,
  tools: [{
    name: 'prioritize_tasks',
    description: 'Ranks tasks by urgency and importance',
    input_schema: {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
              reason: { type: 'string' }
            }
          }
        }
      }
    }
  }],
  tool_choice: { type: 'tool', name: 'prioritize_tasks' }  // ← Zwingt zur Struktur
})
```

**Warum tool_use statt JSON-Prompt?** Zuverlässigeres Parsing, kein JSON-Escape-Handling, klare Fehlerbehandlung wenn Format nicht stimmt.

---

## Transparenz in der UI

Jede Aufgabe zeigt:
- `prioritySource: 'ai' | 'manual'` — Woher kommt die Priorität?
- `priorityReason: string` — Warum hat Claude so entschieden?
- Kleines Sparkle-Icon ✨ wenn die Priorität KI-generiert ist
- Unterschied zwischen: KI-Vorschlag, manuell geändert, durch Deadline-Druck hochgezogen

---

## Limits

- **Max 20 Tasks** pro Aufruf (Token-Limit für Haiku)
- Nur `todo` und `in_progress` Tasks werden priorisiert
- Deadline-Nähe und Dependencies werden im Prompt als Kontext mitgegeben

---

## Kosten-Optimierung

- Lokale Vorsortierung nach Deadline bevor KI-Aufruf → weniger Context-Tokens
- Claude Haiku statt Sonnet/Opus für einfache Ranking-Aufgaben → 10x günstiger
- Keine automatische Re-Priorisierung — nur auf expliziten Nutzer-Klick
