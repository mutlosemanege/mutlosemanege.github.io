import Anthropic from '@anthropic-ai/sdk'

interface TaskInput {
  id: string
  title: string
  description?: string
  deadline?: string
  estimatedMinutes: number
  dependencies: string[]
}

interface PriorityResult {
  taskId: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  reason: string
}

const MAX_TITLE_LENGTH = 200
const MAX_DESCRIPTION_LENGTH = 500
const MAX_ID_LENGTH = 36        // UUID
const MAX_DEPENDENCIES = 20
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

function validateTask(task: TaskInput, index: number): void {
  if (typeof task.title !== 'string' || !task.title.trim()) {
    throw createError({ statusCode: 400, message: `Task ${index}: title fehlt oder ungültig` })
  }
  if (
    typeof task.estimatedMinutes !== 'number' ||
    !isFinite(task.estimatedMinutes) ||
    task.estimatedMinutes < 0 ||
    task.estimatedMinutes > 43200 // max 30 Tage
  ) {
    throw createError({ statusCode: 400, message: `Task ${index}: estimatedMinutes ungültig` })
  }
  if (task.deadline !== undefined) {
    if (typeof task.deadline !== 'string' || !isValidISODate(task.deadline)) {
      throw createError({ statusCode: 400, message: `Task ${index}: deadline muss YYYY-MM-DD sein` })
    }
  }
  if (!Array.isArray(task.dependencies)) {
    throw createError({ statusCode: 400, message: `Task ${index}: dependencies muss ein Array sein` })
  }
}

export default defineEventHandler(async (event) => {
  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    throw createError({ statusCode: 500, message: 'KI-Dienst nicht konfiguriert' })
  }

  const body = await readBody<{ tasks: TaskInput[] }>(event)

  if (!Array.isArray(body?.tasks) || body.tasks.length === 0) {
    throw createError({ statusCode: 400, message: 'Keine Tasks angegeben' })
  }

  const tasksToRank = body.tasks.slice(0, 20)

  for (let i = 0; i < tasksToRank.length; i++) {
    validateTask(tasksToRank[i], i + 1)
  }

  const client = new Anthropic({ apiKey })

  const taskList = tasksToRank.map(t => {
    const safeId = sanitizeForPrompt(String(t.id), MAX_ID_LENGTH)
    const safeTitle = sanitizeForPrompt(t.title, MAX_TITLE_LENGTH)
    const safeMinutes = Math.round(t.estimatedMinutes)

    let desc = `- ID: ${safeId}, Titel: "${safeTitle}", Dauer: ${safeMinutes}min`

    // deadline ist bereits als ISO-Datum validiert
    if (t.deadline) desc += `, Deadline: ${t.deadline}`

    if (t.description) {
      desc += `, Beschreibung: "${sanitizeForPrompt(t.description, MAX_DESCRIPTION_LENGTH)}"`
    }

    const safeDeps = t.dependencies
      .slice(0, MAX_DEPENDENCIES)
      .filter(d => typeof d === 'string')
      .map(d => sanitizeForPrompt(d, MAX_ID_LENGTH))

    if (safeDeps.length > 0) desc += `, Abhaengig von: ${safeDeps.join(', ')}`

    return desc
  }).join('\n')

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: `Du bist ein Aufgaben-Priorisierungs-Assistent. Bewerte Tasks nach Dringlichkeit (Deadline-Naehe) und Wichtigkeit (Abhaengigkeiten, Komplexitaet). Heute ist ${new Date().toISOString().slice(0, 10)}. Antworte NUR ueber das priorisieren-Tool.`,
      tools: [
        {
          name: 'priorisieren',
          description: 'Setzt Prioritaeten fuer alle Tasks',
          input_schema: {
            type: 'object' as const,
            properties: {
              rankings: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    taskId: { type: 'string' },
                    priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
                    reason: { type: 'string', description: 'Kurze Begruendung (max 50 Zeichen)' },
                  },
                  required: ['taskId', 'priority', 'reason'],
                },
              },
            },
            required: ['rankings'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'priorisieren' },
      messages: [
        {
          role: 'user',
          content: `Priorisiere diese Tasks:\n${taskList}`,
        },
      ],
    })

    const toolBlock = response.content.find(block => block.type === 'tool_use')
    if (!toolBlock || toolBlock.type !== 'tool_use') {
      throw createError({ statusCode: 500, message: 'Unerwartete KI-Antwort' })
    }

    const result = toolBlock.input as { rankings: PriorityResult[] }
    return { rankings: result.rankings }
  } catch (e: any) {
    if (e.statusCode) throw e  // H3-Fehler (inkl. 403/429 aus Middleware) durchleiten
    if (e.status) {
      // Anthropic API-Fehler: keinen internen Fehlertext leaken
      throw createError({ statusCode: 502, message: 'KI-Dienst nicht erreichbar' })
    }
    throw createError({ statusCode: 500, message: 'Interner Serverfehler' })
  }
})
