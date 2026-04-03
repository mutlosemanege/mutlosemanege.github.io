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

export default defineEventHandler(async (event) => {
  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!apiKey) {
    throw createError({ statusCode: 500, message: 'ANTHROPIC_API_KEY nicht konfiguriert' })
  }

  const body = await readBody<{ description: string; deadline?: string }>(event)

  if (!body.description?.trim()) {
    throw createError({ statusCode: 400, message: 'Projektbeschreibung fehlt' })
  }

  const client = new Anthropic({ apiKey })

  let userMessage = `Erstelle ein Projekt fuer: "${body.description}"`
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
      throw createError({ statusCode: 500, message: 'Unerwartete AI-Antwort: Kein Tool-Use-Block' })
    }

    const result = toolBlock.input as { projectName: string; tasks: GeneratedTask[] }

    return {
      projectName: result.projectName,
      tasks: result.tasks,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    }
  } catch (e: any) {
    // Anthropic API Fehler weiterleiten
    if (e.status) {
      throw createError({ statusCode: e.status, message: `Anthropic API: ${e.message}` })
    }
    throw e
  }
})
