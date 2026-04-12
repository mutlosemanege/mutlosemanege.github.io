# Skill: Claude API via Nuxt Server Routes (Netlify Functions)

> ⬆ [[00 Skills Übersicht]] · [[../_INDEX]]
> Verknüpft: [[../CLAUDE]] · [[../NETLIFY_SETUP]]
> Verwandte Skills: [[KI-Priorisierung]] · [[Planungs-Chat-NLP]]

---

## Was haben wir gebaut?

**Serverless AI-Endpoints** via Nuxt Server Routes — laufen als Netlify Serverless Functions, halten den Anthropic API-Key sicher auf dem Server (nie im Browser).

**Dateien:**
- `server/api/ai/prioritize.post.ts`
- `server/api/ai/generate-project.post.ts`

---

## Warum Server Routes statt direktem Browser-Call?

| | Browser-Direct | Server Route |
|-|---------------|-------------|
| API Key sicher? | ❌ Nein (sichtbar in JS) | ✅ Ja (nur serverseitig) |
| CORS-Probleme? | Möglich | Nein (gleiche Origin) |
| Rate-Limiting kontrollierbar? | Nein | Ja |
| Deployment | GitHub Pages ❌ | Netlify ✅ |

---

## Endpoint-Struktur

```ts
// server/api/ai/prioritize.post.ts
import Anthropic from '@anthropic-ai/sdk'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { tasks } = body
  
  const client = new Anthropic()  // Liest ANTHROPIC_API_KEY aus env
  
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    tools: [{ name: 'prioritize_tasks', ... }],
    tool_choice: { type: 'tool', name: 'prioritize_tasks' },
    messages: [{ role: 'user', content: buildPrompt(tasks) }]
  })
  
  // Structured output extrahieren
  const toolUse = response.content.find(b => b.type === 'tool_use')
  return toolUse?.input ?? { tasks: [] }
})
```

---

## Nuxt Route-Konvention

```
server/api/ai/prioritize.post.ts
                             ^^^^ → Nur POST-Requests erlaubt (HTTP-Method-Matching)

→ Erreichbar als: POST /api/ai/prioritize
```

Nuxt Nitro erkennt `.post.ts` automatisch und erstellt daraus eine Netlify Lambda-Function.

---

## Frontend-Aufruf (useAI.ts)

```ts
async function prioritizeTasks(tasks: Task[]) {
  const result = await $fetch('/api/ai/prioritize', {
    method: 'POST',
    body: { tasks: tasks.slice(0, 20) }  // Max 20
  })
  
  // Tasks lokal updaten mit KI-Prioritäten
  result.tasks.forEach(({ id, priority, reason }) => {
    updateTask(id, { 
      priority, 
      priorityReason: reason,
      prioritySource: 'ai'
    })
  })
}
```

---

## Prompt-Engineering: Kontext mitgeben

Beide Endpoints geben Claude:
1. Task-Liste (title, deadline, estimatedMinutes, dependencies)
2. Heutiges Datum (für Deadline-Berechnung)
3. Klare deutsche Anweisung
4. Explizite Ausgabe-Constraints (max 20 Tasks, nur erlaubte Priority-Werte)

---

## Projektgenerator: 3–12 Tasks mit Dependencies

```ts
// generate-project.post.ts
// Input: { name, description, projectType }
// Output via tool_use: { tasks: [{ title, estimatedMinutes, priority, dependsOn[] }] }
```

`dependsOn` enthält task-indices (0-based) → wird beim Erstellen in echte Task-IDs umgewandelt.

---

## Kosten-Übersicht (Haiku)

| Feature | Tokens/Call (ca.) | Kosten/Call |
|---------|------------------|------------|
| Priorisierung (20 Tasks) | ~800 in / ~300 out | ~$0.0002 |
| Projektgenerierung | ~400 in / ~600 out | ~$0.0002 |
| **Pro Monat (tägl. Nutzung)** | | **~$0.10–0.30** |
