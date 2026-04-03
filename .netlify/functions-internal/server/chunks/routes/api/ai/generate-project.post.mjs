import { d as defineEventHandler, c as createError, r as readBody } from '../../../_/nitro.mjs';
import Anthropic from '@anthropic-ai/sdk';
import 'node:http';
import 'node:https';
import 'node:events';
import 'node:buffer';
import 'node:fs';
import 'node:path';
import 'node:crypto';

const generateProject_post = defineEventHandler(async (event) => {
  var _a;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw createError({ statusCode: 500, message: "ANTHROPIC_API_KEY nicht konfiguriert" });
  }
  const body = await readBody(event);
  if (!((_a = body.description) == null ? void 0 : _a.trim())) {
    throw createError({ statusCode: 400, message: "Projektbeschreibung fehlt" });
  }
  const client = new Anthropic({ apiKey });
  let userMessage = `Erstelle ein Projekt fuer: "${body.description}"`;
  if (body.deadline) {
    userMessage += `
Deadline: ${body.deadline}`;
  }
  userMessage += "\nErstelle 3-12 sinnvolle Tasks mit realistischen Zeitschaetzungen und Abhaengigkeiten.";
  const response = await client.messages.create({
    model: "claude-sonnet-4-6-20250514",
    max_tokens: 2048,
    system: `Du bist ein Projektplanungs-Assistent. Erstelle strukturierte Projektplaene mit Tasks, Zeitschaetzungen und Abhaengigkeiten. Verwende tempIds wie "t1", "t2" etc. Antworte NUR ueber das projekt_erstellen-Tool. Heute ist ${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.`,
    tools: [
      {
        name: "projekt_erstellen",
        description: "Erstellt eine Projektstruktur mit Tasks und Abhaengigkeiten",
        input_schema: {
          type: "object",
          properties: {
            projectName: { type: "string", description: "Kurzer Projektname" },
            tasks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  tempId: { type: "string", description: "Temporaere ID (t1, t2, ...)" },
                  title: { type: "string" },
                  description: { type: "string", description: "Kurze Beschreibung" },
                  estimatedMinutes: { type: "number" },
                  dependsOn: {
                    type: "array",
                    items: { type: "string" },
                    description: "tempIds der Abhaengigkeiten"
                  },
                  isDeepWork: { type: "boolean", description: "Braucht Fokuszeit?" },
                  suggestedPriority: {
                    type: "string",
                    enum: ["critical", "high", "medium", "low"]
                  }
                },
                required: ["tempId", "title", "description", "estimatedMinutes", "dependsOn", "isDeepWork", "suggestedPriority"]
              }
            }
          },
          required: ["projectName", "tasks"]
        }
      }
    ],
    tool_choice: { type: "tool", name: "projekt_erstellen" },
    messages: [
      {
        role: "user",
        content: userMessage
      }
    ]
  });
  const toolBlock = response.content.find((block) => block.type === "tool_use");
  if (!toolBlock || toolBlock.type !== "tool_use") {
    throw createError({ statusCode: 500, message: "Unerwartete AI-Antwort" });
  }
  const result = toolBlock.input;
  return {
    projectName: result.projectName,
    tasks: result.tasks,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens
    }
  };
});

export { generateProject_post as default };
//# sourceMappingURL=generate-project.post.mjs.map
