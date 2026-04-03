import { d as defineEventHandler, c as createError, r as readBody } from '../../../_/nitro.mjs';
import Anthropic from '@anthropic-ai/sdk';
import 'node:http';
import 'node:https';
import 'node:events';
import 'node:buffer';
import 'node:fs';
import 'node:path';
import 'node:crypto';

const prioritize_post = defineEventHandler(async (event) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw createError({ statusCode: 500, message: "ANTHROPIC_API_KEY nicht konfiguriert" });
  }
  const body = await readBody(event);
  if (!body.tasks || body.tasks.length === 0) {
    throw createError({ statusCode: 400, message: "Keine Tasks angegeben" });
  }
  const tasksToRank = body.tasks.slice(0, 20);
  const client = new Anthropic({ apiKey });
  const taskList = tasksToRank.map((t) => {
    let desc = `- ID: ${t.id}, Titel: "${t.title}", Dauer: ${t.estimatedMinutes}min`;
    if (t.deadline) desc += `, Deadline: ${t.deadline}`;
    if (t.description) desc += `, Beschreibung: "${t.description}"`;
    if (t.dependencies.length > 0) desc += `, Abhaengig von: ${t.dependencies.join(", ")}`;
    return desc;
  }).join("\n");
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: `Du bist ein Aufgaben-Priorisierungs-Assistent. Bewerte Tasks nach Dringlichkeit (Deadline-Naehe) und Wichtigkeit (Abhaengigkeiten, Komplexitaet). Heute ist ${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}. Antworte NUR ueber das priorisieren-Tool.`,
    tools: [
      {
        name: "priorisieren",
        description: "Setzt Prioritaeten fuer alle Tasks",
        input_schema: {
          type: "object",
          properties: {
            rankings: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  taskId: { type: "string" },
                  priority: { type: "string", enum: ["critical", "high", "medium", "low"] },
                  reason: { type: "string", description: "Kurze Begruendung (max 50 Zeichen)" }
                },
                required: ["taskId", "priority", "reason"]
              }
            }
          },
          required: ["rankings"]
        }
      }
    ],
    tool_choice: { type: "tool", name: "priorisieren" },
    messages: [
      {
        role: "user",
        content: `Priorisiere diese Tasks:
${taskList}`
      }
    ]
  });
  const toolBlock = response.content.find((block) => block.type === "tool_use");
  if (!toolBlock || toolBlock.type !== "tool_use") {
    throw createError({ statusCode: 500, message: "Unerwartete AI-Antwort" });
  }
  const result = toolBlock.input;
  return { rankings: result.rankings };
});

export { prioritize_post as default };
//# sourceMappingURL=prioritize.post.mjs.map
