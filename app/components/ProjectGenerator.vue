<script setup lang="ts">
import type { CalendarEvent } from '~/composables/useCalendar'
import type { Task, TaskPriority } from '~/types/task'

const emit = defineEmits<{
  close: []
  created: [projectId: string]
}>()

const props = defineProps<{
  show: boolean
  events: readonly CalendarEvent[]
}>()

const { generateProject, isProcessing, aiError } = useAI()
const { createProject, createTask, updateTask } = useTasks()
const { scheduleTasks, findFreeSlots } = useScheduler()
const { createEvent, fetchEvents, deleteEvent } = useCalendar()
const { preferences } = usePreferences()

const description = ref('')
const deadline = ref('')
const projectType = ref('allgemein')
const step = ref<'input' | 'review' | 'done'>('input')
const autoScheduleAfterCreate = ref(true)
const creationSummary = ref<{ scheduledCount: number; remainingCount: number } | null>(null)

interface PreviewTask {
  tempId: string
  title: string
  description: string
  estimatedMinutes: number
  dependsOn: string[]
  isDeepWork: boolean
  suggestedPriority: 'critical' | 'high' | 'medium' | 'low'
  include: boolean // User kann Tasks ab-/anwaehlen
}

const projectName = ref('')
const previewTasks = ref<PreviewTask[]>([])
const tokenUsage = ref({ inputTokens: 0, outputTokens: 0 })

watch(() => props.show, (val) => {
  if (!val) return
  description.value = ''
  deadline.value = ''
  projectType.value = 'allgemein'
  step.value = 'input'
  autoScheduleAfterCreate.value = true
  creationSummary.value = null
  projectName.value = ''
  previewTasks.value = []
})

async function handleGenerate() {
  if (!description.value.trim()) return

  const promptDescription = projectType.value === 'allgemein'
    ? description.value.trim()
    : `Projekttyp: ${projectType.value}\n${description.value.trim()}`

  const result = await generateProject(
    promptDescription,
    deadline.value || undefined,
  )

  if (result) {
    projectName.value = result.projectName
    previewTasks.value = result.tasks.map(t => ({ ...t, include: true }))
    tokenUsage.value = result.usage
    step.value = 'review'
  }
}

async function handleConfirm() {
  const includedTasks = previewTasks.value.filter(t => t.include)
  if (includedTasks.length === 0) return

  // Projekt erstellen
  const project = await createProject({
    name: projectName.value,
    description: description.value,
    taskIds: [],
    deadline: deadline.value ? new Date(`${deadline.value}T23:59:59`).toISOString() : undefined,
  })

  // TempId → echte ID Mapping
  const idMap = new Map<string, string>()
  const createdTaskMap = new Map<string, Task>()

  // Tasks zuerst erstellen
  const createdIds: string[] = []
  for (const pt of includedTasks) {
    const task = await createTask({
      title: pt.title,
      description: pt.description,
      estimatedMinutes: pt.estimatedMinutes,
      priority: pt.suggestedPriority,
      aiSuggestedPriority: pt.suggestedPriority,
      priorityReason: 'Von KI bei der Projektgenerierung vorgeschlagen',
      prioritySource: 'ai',
      status: 'todo',
      projectId: project.id,
      dependencies: [],
      isDeepWork: pt.isDeepWork,
    })

    idMap.set(pt.tempId, task.id)
    createdTaskMap.set(task.id, task)
    createdIds.push(task.id)
  }

  for (const pt of includedTasks) {
    const taskId = idMap.get(pt.tempId)
    if (!taskId) continue

    const realDeps = pt.dependsOn
      .map(depTempId => idMap.get(depTempId))
      .filter((id): id is string => id !== undefined)

    const updatedTask = await updateTask(taskId, { dependencies: realDeps })
    if (updatedTask) {
      createdTaskMap.set(taskId, updatedTask)
    }
  }

  // Projekt mit Task-IDs aktualisieren
  const { updateProject } = useTasks()
  await updateProject(project.id, { taskIds: createdIds })

  if (autoScheduleAfterCreate.value) {
    creationSummary.value = await scheduleCreatedTasks([...createdTaskMap.values()])
  } else {
    creationSummary.value = {
      scheduledCount: 0,
      remainingCount: createdTaskMap.size,
    }
  }

  step.value = 'done'
  emit('created', project.id)
}

const totalMinutes = computed(() =>
  previewTasks.value
    .filter(t => t.include)
    .reduce((sum, t) => sum + t.estimatedMinutes, 0)
)

const totalHours = computed(() => Math.round(totalMinutes.value / 60 * 10) / 10)

const priorityRank: Record<TaskPriority, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
}

const includedPreviewTasks = computed(() => previewTasks.value.filter(task => task.include))

const orderedPreviewTasks = computed(() => {
  const included = includedPreviewTasks.value
  const includedIds = new Set(included.map(task => task.tempId))
  const dependencyCount = new Map<string, number>()
  const dependents = new Map<string, string[]>()

  for (const task of included) {
    const relevantDeps = task.dependsOn.filter(depId => includedIds.has(depId))
    dependencyCount.set(task.tempId, relevantDeps.length)

    for (const depId of relevantDeps) {
      const entries = dependents.get(depId) || []
      entries.push(task.tempId)
      dependents.set(depId, entries)
    }
  }

  const queue = included.filter(task => (dependencyCount.get(task.tempId) || 0) === 0)
  const result: PreviewTask[] = []

  while (queue.length > 0) {
    queue.sort((a, b) => {
      const priorityDiff = priorityRank[b.suggestedPriority] - priorityRank[a.suggestedPriority]
      if (priorityDiff !== 0) return priorityDiff
      return a.estimatedMinutes - b.estimatedMinutes
    })

    const task = queue.shift()!
    result.push(task)

    for (const dependentId of dependents.get(task.tempId) || []) {
      const nextCount = (dependencyCount.get(dependentId) || 1) - 1
      dependencyCount.set(dependentId, nextCount)
      if (nextCount === 0) {
        const dependentTask = included.find(entry => entry.tempId === dependentId)
        if (dependentTask && !result.includes(dependentTask) && !queue.includes(dependentTask)) {
          queue.push(dependentTask)
        }
      }
    }
  }

  for (const task of included) {
    if (!result.includes(task)) {
      result.push(task)
    }
  }

  return result
})

const suggestedStartTasks = computed(() =>
  orderedPreviewTasks.value
    .filter(task => task.dependsOn.filter(depId => includedPreviewTasks.value.some(entry => entry.tempId === depId)).length === 0)
    .slice(0, 4)
)

const projectScopeInsights = computed(() => {
  const labels: string[] = []
  let severity: 'normal' | 'warning' | 'danger' = 'normal'
  const includedCount = includedPreviewTasks.value.length
  const planningHorizonEnd = deadline.value
    ? new Date(`${deadline.value}T23:59:59`)
    : addDays(new Date(), 21)
  const availableMinutes = findFreeSlots(new Date(), planningHorizonEnd, props.events, preferences.value)
    .reduce((sum, slot) => sum + ((slot.end.getTime() - slot.start.getTime()) / 60000), 0)

  if (includedCount >= 10) {
    labels.push('Viele Teilaufgaben auf einmal')
    severity = 'warning'
  }

  if (totalHours.value >= 20) {
    labels.push('Umfang ueber 20 Stunden')
    severity = severity === 'danger' ? 'danger' : 'warning'
  }

  if (!deadline.value && totalHours.value >= 30) {
    labels.push('Grosse Projektlast ohne Deadline')
    severity = 'warning'
  }

  if (deadline.value && availableMinutes < totalMinutes.value) {
    labels.push('Vor der Deadline fehlen freie Stunden')
    severity = 'danger'
  } else if (deadline.value && availableMinutes < totalMinutes.value * 1.5) {
    labels.push('Wenig Puffer bis zur Deadline')
    severity = severity === 'danger' ? 'danger' : 'warning'
  }

  return {
    labels,
    severity,
    availableHours: Math.round((availableMinutes / 60) * 10) / 10,
  }
})

function dependencyLabels(task: PreviewTask) {
  return task.dependsOn
    .map(depTempId => previewTasks.value.find(candidate => candidate.tempId === depTempId)?.title || depTempId)
    .join(', ')
}

async function scheduleCreatedTasks(tasksToSchedule: Task[]) {
  if (tasksToSchedule.length === 0) {
    return { scheduledCount: 0, remainingCount: 0 }
  }

  const plannedSchedule = scheduleTasks(
    tasksToSchedule,
    props.events,
    preferences.value,
  )

  let scheduledCount = 0
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone

  for (const [taskId, plan] of plannedSchedule) {
    const task = tasksToSchedule.find(entry => entry.id === taskId)
    if (!task) continue

    const createdCalendarIds: string[] = []
    try {
      const createdBlocks: Array<{ start: string; end: string; calendarEventId?: string }> = []

      for (const [index, block] of plan.blocks.entries()) {
        const createdEvent = await createEvent({
          summary: plan.blocks.length > 1 ? `${task.title} (${index + 1}/${plan.blocks.length})` : task.title,
          description: `[KALENDER-AI-TASK:${taskId}]\n${task.description || ''}`,
          start: { dateTime: block.start.toISOString(), timeZone: tz },
          end: { dateTime: block.end.toISOString(), timeZone: tz },
          colorId: task.isDeepWork ? '3' : '9',
        })

        if (!createdEvent?.id) {
          throw new Error('Kalendereintrag konnte nicht erstellt werden.')
        }

        createdCalendarIds.push(createdEvent.id)
        createdBlocks.push({
          start: block.start.toISOString(),
          end: block.end.toISOString(),
          calendarEventId: createdEvent.id,
        })
      }

      await updateTask(taskId, {
        status: 'scheduled',
        scheduleBlocks: createdBlocks,
        scheduledStart: createdBlocks[0]?.start,
        scheduledEnd: createdBlocks[createdBlocks.length - 1]?.end,
        calendarEventId: createdBlocks[0]?.calendarEventId,
      })
      scheduledCount++
    } catch (error) {
      for (const calendarId of createdCalendarIds) {
        // best effort rollback
        try {
          await deleteEvent(calendarId)
        } catch {
          // ignore rollback errors
        }
      }
      console.error(`Projekt-Task "${task.title}" konnte nicht automatisch eingeplant werden:`, error)
    }
  }

  const now = new Date()
  const rangeStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const rangeEnd = new Date(now.getFullYear(), now.getMonth() + 4, 0)
  await fetchEvents(rangeStart.toISOString(), rangeEnd.toISOString())

  return {
    scheduledCount,
    remainingCount: tasksToSchedule.length - scheduledCount,
  }
}

function addDays(date: Date, days: number) {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/40" @click="emit('close')" />

        <div class="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">

          <!-- Step 1: Eingabe -->
          <template v-if="step === 'input'">
            <h2 class="text-lg font-semibold text-gray-900">KI-Projekt generieren</h2>
            <p class="text-sm text-gray-500">
              Beschreibe dein Projekt und die KI erstellt automatisch alle Aufgaben mit Abhaengigkeiten.
            </p>

            <div class="space-y-3">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Projekttyp</label>
                <select
                  v-model="projectType"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                >
                  <option value="allgemein">Allgemein</option>
                  <option value="programmierung">Programmierung</option>
                  <option value="videoschnitt">Videoschnitt</option>
                  <option value="content">Content</option>
                  <option value="lernen">Lernen</option>
                  <option value="privat">Privat</option>
                  <option value="organisation">Organisation</option>
                </select>
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Projektbeschreibung</label>
                <textarea
                  v-model="description"
                  rows="4"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none resize-none"
                  placeholder="z.B. YouTube-Video schneiden, Umzug planen, Pruefung vorbereiten oder Website relaunchen..."
                />
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Deadline (optional)</label>
                <input
                  v-model="deadline"
                  type="date"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                >
              </div>
            </div>

            <!-- AI Error -->
            <div v-if="aiError" class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {{ aiError }}
            </div>

            <div class="flex justify-end gap-2 pt-2">
              <button
                class="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                @click="emit('close')"
              >
                Abbrechen
              </button>
              <button
                class="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
                :disabled="!description.trim() || isProcessing"
                @click="handleGenerate"
              >
                <svg v-if="isProcessing" class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {{ isProcessing ? 'Generiere...' : 'Mit KI generieren' }}
              </button>
            </div>
          </template>

          <!-- Step 2: Review -->
          <template v-if="step === 'review'">
            <div class="flex items-center justify-between">
              <h2 class="text-lg font-semibold text-gray-900">{{ projectName }}</h2>
              <span class="text-xs text-gray-400">
                {{ tokenUsage.inputTokens + tokenUsage.outputTokens }} Tokens
              </span>
            </div>
            <p class="text-sm text-gray-500">
              {{ previewTasks.filter(t => t.include).length }} Aufgaben, ca. {{ totalHours }} Stunden
            </p>

            <div
              v-if="projectScopeInsights.labels.length > 0"
              class="rounded-xl border px-4 py-3"
              :class="projectScopeInsights.severity === 'danger'
                ? 'border-red-200 bg-red-50'
                : 'border-amber-200 bg-amber-50'"
            >
              <div class="text-sm font-medium"
                :class="projectScopeInsights.severity === 'danger' ? 'text-red-700' : 'text-amber-700'"
              >
                Projekt-Check
              </div>
              <p class="mt-1 text-xs"
                :class="projectScopeInsights.severity === 'danger' ? 'text-red-600' : 'text-amber-700'"
              >
                Freie Zeit im aktuellen Horizont: ca. {{ projectScopeInsights.availableHours }} Stunden.
              </p>
              <div class="mt-2 flex flex-wrap gap-2">
                <span
                  v-for="label in projectScopeInsights.labels"
                  :key="label"
                  class="rounded-full bg-white px-2 py-0.5 text-[11px]"
                  :class="projectScopeInsights.severity === 'danger' ? 'text-red-700' : 'text-amber-700'"
                >
                  {{ label }}
                </span>
              </div>
            </div>

            <div v-if="suggestedStartTasks.length > 0" class="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <div class="text-sm font-medium text-blue-800">Empfohlener Start</div>
              <div class="mt-2 space-y-2">
                <div
                  v-for="task in suggestedStartTasks"
                  :key="`start-${task.tempId}`"
                  class="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2"
                >
                  <div class="min-w-0">
                    <div class="text-sm font-medium text-gray-900">{{ task.title }}</div>
                    <div class="text-xs text-gray-500">
                      {{ task.estimatedMinutes }} Min.{{ task.dependsOn.length === 0 ? ', keine Abhaengigkeiten' : '' }}
                    </div>
                  </div>
                  <span class="rounded-full px-2 py-0.5 text-[11px]"
                    :class="{
                      'bg-red-100 text-red-700': task.suggestedPriority === 'critical',
                      'bg-orange-100 text-orange-700': task.suggestedPriority === 'high',
                      'bg-yellow-100 text-yellow-700': task.suggestedPriority === 'medium',
                      'bg-green-100 text-green-700': task.suggestedPriority === 'low',
                    }"
                  >
                    zuerst
                  </span>
                </div>
              </div>
            </div>

            <label class="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
              <input
                v-model="autoScheduleAfterCreate"
                type="checkbox"
                class="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              >
              Nach dem Erstellen direkt automatisch einplanen
            </label>

            <div class="space-y-2">
              <div
                v-for="task in orderedPreviewTasks"
                :key="task.tempId"
                class="flex items-start gap-3 p-3 rounded-lg border"
                :class="task.include ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-50'"
              >
                <input
                  v-model="task.include"
                  type="checkbox"
                  class="mt-1 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                >
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-medium text-gray-900">{{ task.title }}</span>
                    <span
                      class="text-xs px-1.5 py-0.5 rounded-full"
                      :class="{
                        'bg-red-100 text-red-700': task.suggestedPriority === 'critical',
                        'bg-orange-100 text-orange-700': task.suggestedPriority === 'high',
                        'bg-yellow-100 text-yellow-700': task.suggestedPriority === 'medium',
                        'bg-green-100 text-green-700': task.suggestedPriority === 'low',
                      }"
                    >
                      {{ task.suggestedPriority }}
                    </span>
                    <span v-if="task.isDeepWork" class="text-xs px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">
                      Deep Work
                    </span>
                  </div>
                  <p class="text-xs text-gray-500 mt-0.5">{{ task.description }}</p>
                  <div class="flex items-center gap-3 mt-1 text-xs text-gray-400">
                    <span>{{ task.estimatedMinutes }} Min.</span>
                    <span v-if="task.dependsOn.length === 0" class="text-blue-500">
                      Startklar
                    </span>
                    <span v-if="task.dependsOn.length > 0">
                      Abhaengig von: {{ dependencyLabels(task) }}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div class="flex justify-between pt-2">
              <button
                class="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                @click="step = 'input'"
              >
                Zurueck
              </button>
              <div class="flex gap-2">
                <button
                  class="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  @click="emit('close')"
                >
                  Abbrechen
                </button>
                <button
                  class="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                  @click="handleConfirm"
                >
                  Projekt erstellen
                </button>
              </div>
            </div>
          </template>

          <!-- Step 3: Fertig -->
          <template v-if="step === 'done'">
            <div class="text-center py-6">
              <svg class="mx-auto w-12 h-12 text-green-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              <h2 class="text-lg font-semibold text-gray-900">Projekt erstellt!</h2>
              <p class="text-sm text-gray-500 mt-1">
                {{ previewTasks.filter(t => t.include).length }} Aufgaben wurden angelegt.
              </p>
              <p v-if="creationSummary && autoScheduleAfterCreate" class="text-sm text-gray-500 mt-1">
                {{ creationSummary.scheduledCount }} Aufgaben wurden direkt eingeplant,
                {{ creationSummary.remainingCount }} bleiben vorerst offen.
              </p>
              <p v-else-if="creationSummary && !autoScheduleAfterCreate" class="text-sm text-gray-500 mt-1">
                Die Aufgaben wurden angelegt und koennen danach manuell oder per Auto-Planen eingeplant werden.
              </p>
              <button
                class="mt-4 px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                @click="emit('close')"
              >
                Schliessen
              </button>
            </div>
          </template>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
