import Anthropic from '@anthropic-ai/sdk'

interface GeneratedTask {
  tempId: string
  title: string
  description: string
  estimatedMinutes: number
  dependsOn: string[] // tempIds
  isDeepWork: boolean
  suggestedPriority: 'critical' | 'high' | 'medium' | 'low'
}

const MAX_DESCRIPTION_LENGTH = 2000
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Entfernt Steuerzeichen (inkl. Zeilenumbrüche) und kürzt auf maxLength. */
function sanitizeForPrompt(text: string, maxLength: number): string {
  return text
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .trim()
    .slice(0, maxLength)
}

function isValidISODate(value: string): boolean {
  return ISO_DATE_RE.test(value) && !isNaN(new Date(value).getTime())
}

export default defineEventHandler(async (event) => {
  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    throw createError({ statusCode: 500, message: 'KI-Dienst nicht konfiguriert' })
  }

  const body = await readBody<{ description: string; deadline?: string }>(event)

  if (typeof body?.description !== 'string' || !body.description.trim()) {
    throw createError({ statusCode: 400, message: 'Projektbeschreibung fehlt' })
  }

  if (body.description.length > MAX_DESCRIPTION_LENGTH) {
    throw createError({ statusCode: 400, message: `Projektbeschreibung darf maximal ${MAX_DESCRIPTION_LENGTH} Zeichen lang sein` })
  }

  if (body.deadline !== undefined) {
    if (typeof body.deadline !== 'string' || !isValidISODate(body.deadline)) {
      throw createError({ statusCode: 400, message: 'deadline muss ein gültiges Datum im Format YYYY-MM-DD sein' })
    }
  }

  const client = new Anthropic({ apiKey })

  const safeDescription = sanitizeForPrompt(body.description, MAX_DESCRIPTION_LENGTH)
  let userMessage = `Erstelle ein Projekt fuer: "${safeDescription}"`

  // deadline ist bereits als ISO-Datum validiert
  if (body.deadline) {
    userMessage += `\nDeadline: ${body.deadline}`
  }

  userMessage += '\nErstelle 3-12 sinnvolle Tasks mit realistischen Zeitschaetzungen und Abhaengigkeiten.'

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: `Du bist ein Projektplanungs-Assistent. Erstelle strukturierte Projektplaene mit Tasks, Zeitschaetzungen und Abhaengigkeiten. Verwende tempIds wie "t1", "t2" etc. Antworte NUR ueber das projekt_erstellen-Tool. Heute ist ${new Date().toISOString().slice(0, 10)}.`,
      tools: [
        {
          name: 'projekt_erstellen',
          description: 'Erstellt eine Projektstruktur mit Tasks und Abhaengigkeiten',
          input_schema: {
            type: 'object' as const,
            properties: {
              projectName: { type: 'string', description: 'Kurzer Projektname' },
              tasks: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    tempId: { type: 'string', description: 'Temporaere ID (t1, t2, ...)' },
                    title: { type: 'string' },
                    description: { type: 'string', description: 'Kurze Beschreibung' },
                    estimatedMinutes: { type: 'number' },
                    dependsOn: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'tempIds der Abhaengigkeiten',
                    },
                    isDeepWork: { type: 'boolean', description: 'Braucht Fokuszeit?' },
                    suggestedPriority: {
                      type: 'string',
                      enum: ['critical', 'high', 'medium', 'low'],
                    },
                  },
                  required: ['tempId', 'title', 'description', 'estimatedMinutes', 'dependsOn', 'isDeepWork', 'suggestedPriority'],
                },
              },
            },
            required: ['projectName', 'tasks'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'projekt_erstellen' },
      messages: [
        {
          role: 'user',
          content: userMessage,
        },
      ],
    })

    const toolBlock = response.content.find(block => block.type === 'tool_use')
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      throw createError({ statusCode: 500, message: 'Unerwartete KI-Antwort' })
    }

    const result = toolBlock.input as { projectName: string; tasks: GeneratedTask[] }

    return {
      projectName: result.projectName,
      tasks: result.tasks,
      // Token-Usage wird nicht zurückgegeben (verhindert Cost-Reconnaissance)
    }
  } catch (e: any) {
    if (e.statusCode) throw e  // H3-Fehler (inkl. 403/429 aus Middleware) durchleiten
    if (e.status) {
      // Anthropic API-Fehler: keinen internen Fehlertext leaken
      throw createError({ statusCode: 502, message: 'KI-Dienst nicht erreichbar' })
    }
    throw createError({ statusCode: 500, message: 'Interner Serverfehler' })
  }
})
