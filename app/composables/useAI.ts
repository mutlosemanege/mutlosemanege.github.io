import type { Task, TaskPriority } from '~/types/task'

interface PriorityRanking {
  taskId: string
  priority: TaskPriority
  reason: string
}

interface GeneratedTask {
  tempId: string
  title: string
  description: string
  estimatedMinutes: number
  dependsOn: string[]
  isDeepWork: boolean
  suggestedPriority: TaskPriority
}

interface GenerateProjectResult {
  projectName: string
  tasks: GeneratedTask[]
  usage: { inputTokens: number; outputTokens: number }
}

const isProcessing = ref(false)
const aiError = ref<string | null>(null)

export function useAI() {
  /**
   * Priorisiert eine Liste von Tasks via Claude Haiku.
   */
  async function prioritizeTasks(tasks: Task[]): Promise<PriorityRanking[]> {
    isProcessing.value = true
    aiError.value = null

    try {
      const taskInputs = tasks.map(t => ({
        id: t.id,
        title: t.title,
        description: t.description,
        deadline: t.deadline,
        estimatedMinutes: t.estimatedMinutes,
        dependencies: t.dependencies,
      }))

      const response = await $fetch<{ rankings: PriorityRanking[] }>('/api/ai/prioritize', {
        method: 'POST',
        body: { tasks: taskInputs },
      })

      return response.rankings
    } catch (e: any) {
      aiError.value = e.data?.message || e.message || 'KI-Fehler bei Priorisierung'
      return []
    } finally {
      isProcessing.value = false
    }
  }

  /**
   * Generiert ein Projekt mit Tasks aus einer Beschreibung via Claude Sonnet.
   */
  async function generateProject(description: string, deadline?: string): Promise<GenerateProjectResult | null> {
    isProcessing.value = true
    aiError.value = null

    try {
      const response = await $fetch<GenerateProjectResult>('/api/ai/generate-project', {
        method: 'POST',
        body: { description, deadline },
      })

      return response
    } catch (e: any) {
      aiError.value = e.data?.message || e.message || 'KI-Fehler bei Projektgenerierung'
      return null
    } finally {
      isProcessing.value = false
    }
  }

  return {
    isProcessing: readonly(isProcessing),
    aiError: readonly(aiError),
    prioritizeTasks,
    generateProject,
  }
}
