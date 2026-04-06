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
    reviewAfterDate: addDays(new Date(), 3).toISOString(),
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
    labels.push('Umfang über 20 Stunden')
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

const reviewWhy = computed(() => {
  const reasons: string[] = []

  if (suggestedStartTasks.value.length > 0) {
    reasons.push(`${suggestedStartTasks.value.length} Aufgaben können sofort starten, weil sie keine offenen Abhängigkeiten haben.`)
  }

  const deepWorkCount = includedPreviewTasks.value.filter(task => task.isDeepWork).length
  if (deepWorkCount > 0) {
    reasons.push(`${deepWorkCount} Aufgaben wurden als Deep Work markiert und sollten in ruhigere Blöcke.`)
  }

  if (projectScopeInsights.value.availableHours > 0) {
    reasons.push(`Die Plausibilitaet wird mit ca. ${projectScopeInsights.value.availableHours} freien Stunden im aktuellen Horizont abgeglichen.`)
  }

  return reasons
})

const reviewUncertainty = computed(() => {
  if (projectScopeInsights.value.severity === 'danger') {
    return 'Der Umfang wirkt aktuell kritisch. Deadline oder Umfang könnten für den verfügbaren Kalender zu eng sein.'
  }

  if (!deadline.value) {
    return 'Ohne Deadline ist die Reihenfolge plausibel, aber die Dringlichkeit der späteren Schritte bleibt unschärfer.'
  }

  if (includedPreviewTasks.value.some(task => task.dependsOn.length >= 2)) {
    return 'Mehrere vernetzte Abhängigkeiten können später noch Feintuning brauchen.'
  }

  return null
})

const reviewAlternatives = computed(() => {
  const alternatives: string[] = []

  if (projectScopeInsights.value.severity !== 'normal') {
    alternatives.push('Nur die Startaufgaben übernehmen und den Rest später nachziehen.')
  }

  if (autoScheduleAfterCreate.value) {
    alternatives.push('Projekt erst nur anlegen und Auto-Planen später manuell starten.')
  } else {
    alternatives.push('Direkt nach dem Erstellen automatisch einplanen lassen.')
  }

  if (includedPreviewTasks.value.some(task => task.dependsOn.length > 0)) {
    alternatives.push('Blockierte Aufgaben vorerst abwählen und nur den ersten Abschnitt übernehmen.')
  }

  return alternatives
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
      <div v-if="show" class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
        <div class="absolute inset-0" @click="emit('close')" />

        <div class="glass-card-elevated relative z-10 max-h-[100dvh] w-full overflow-y-auto rounded-t-glass-xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:max-h-[92vh] sm:max-w-4xl sm:rounded-glass-lg sm:p-6 sm:pb-6">
          <template v-if="step === 'input'">
            <div class="flex items-start justify-between gap-4">
              <div class="absolute left-1/2 top-2 h-1.5 w-14 -translate-x-1/2 rounded-full bg-white/12 sm:hidden" />
              <div>
                <div class="flex items-center gap-2">
                  <span class="h-2.5 w-2.5 animate-glow rounded-full bg-accent-purple shadow-glow-purple" />
                  <p class="text-xs font-semibold uppercase tracking-[0.24em] text-accent-purple-soft">KI Projektgenerator</p>
                </div>
                <h2 class="mt-2 text-2xl font-semibold text-text-primary">Projekt in Aufgaben zerlegen</h2>
                <p class="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
                  Beschreibe dein Projekt und die KI erstellt daraus sinnvolle Aufgaben, Prioritäten und Abhängigkeiten.
                </p>
              </div>
            </div>

            <div class="mt-6 grid gap-5 lg:grid-cols-[1.2fr,0.8fr]">
              <section class="glass-card p-4">
                <label class="block text-sm font-medium text-text-secondary">Projektbeschreibung</label>
                <textarea
                  v-model="description"
                  rows="5"
                  class="input-dark mt-3 w-full resize-none px-4 py-4"
                  placeholder="z.B. YouTube-Video schneiden, Umzug planen, Prüfung vorbereiten oder Website relaunchen..."
                />

                <div class="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label class="mb-2 block text-sm font-medium text-text-secondary">Projekttyp</label>
                    <select v-model="projectType" class="input-dark w-full px-4 py-3">
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
                    <label class="mb-2 block text-sm font-medium text-text-secondary">Deadline</label>
                    <input v-model="deadline" type="date" class="input-dark w-full px-4 py-3">
                  </div>
                </div>
              </section>

              <section class="glass-card p-4">
                <h3 class="text-sm font-semibold uppercase tracking-[0.24em] text-accent-blue">Leitplanken</h3>
                <div class="mt-4 space-y-3 text-sm text-text-secondary">
                  <div class="rounded-xl border border-border-subtle bg-white/[0.04] p-3">
                    Die vorhandene KI bleibt unverändert. Wir redesignen nur die Oberfläche und den Review-Fluss.
                  </div>
                  <div class="rounded-xl border border-border-subtle bg-white/[0.04] p-3">
                    Der Generator ist bewusst allgemeiner gehalten und passt für private, kreative und produktive Projekte.
                  </div>
                  <div class="rounded-xl border border-border-subtle bg-white/[0.04] p-3">
                    Nach dem Erstellen kann das Projekt auf Wunsch direkt automatisch eingeplant werden.
                  </div>
                </div>
              </section>
            </div>

            <div v-if="aiError" class="mt-5 rounded-glass border border-priority-critical/30 bg-priority-critical/10 px-4 py-3 text-sm text-[#FFD3DC]">
              {{ aiError }}
            </div>

            <div class="mt-6 flex justify-end gap-2">
              <button type="button" class="btn-secondary px-4 py-2 text-sm" @click="emit('close')">Abbrechen</button>
              <button
                type="button"
                class="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm disabled:opacity-50"
                :disabled="!description.trim() || isProcessing"
                @click="handleGenerate"
              >
                <svg v-if="isProcessing" class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {{ isProcessing ? 'Generiere...' : 'Mit KI generieren' }}
              </button>
            </div>
          </template>

          <template v-else-if="step === 'review'">
            <div class="flex items-start justify-between gap-4">
              <div>
                <p class="text-xs font-semibold uppercase tracking-[0.24em] text-accent-purple-soft">Review</p>
                <h2 class="mt-2 text-2xl font-semibold text-text-primary">{{ projectName }}</h2>
                <p class="mt-2 text-sm text-text-secondary">
                  {{ previewTasks.filter(t => t.include).length }} Aufgaben, ca. {{ totalHours }} Stunden
                </p>
              </div>
              <span class="rounded-full bg-white/[0.05] px-3 py-1 text-[11px] text-text-muted">
                {{ tokenUsage.inputTokens + tokenUsage.outputTokens }} Tokens
              </span>
            </div>

            <div class="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div class="glass-card p-4">
                <div class="text-[11px] font-semibold uppercase tracking-[0.22em] text-text-muted">Aktive Aufgaben</div>
                <div class="mt-3 text-2xl font-semibold text-text-primary">{{ includedPreviewTasks.length }}</div>
                <div class="mt-1 text-xs text-text-secondary">werden übernommen</div>
              </div>
              <div class="glass-card p-4">
                <div class="text-[11px] font-semibold uppercase tracking-[0.22em] text-text-muted">Geplanter Aufwand</div>
                <div class="mt-3 text-2xl font-semibold text-text-primary">{{ totalHours }}h</div>
                <div class="mt-1 text-xs text-text-secondary">{{ totalMinutes }} Minuten Gesamtumfang</div>
              </div>
              <div class="glass-card p-4">
                <div class="text-[11px] font-semibold uppercase tracking-[0.22em] text-text-muted">Sofort startbar</div>
                <div class="mt-3 text-2xl font-semibold text-accent-blue">{{ suggestedStartTasks.length }}</div>
                <div class="mt-1 text-xs text-text-secondary">ohne offene Abhängigkeiten</div>
              </div>
              <div class="glass-card p-4">
                <div class="text-[11px] font-semibold uppercase tracking-[0.22em] text-text-muted">Deep Work</div>
                <div class="mt-3 text-2xl font-semibold text-accent-purple-soft">
                  {{ includedPreviewTasks.filter(task => task.isDeepWork).length }}
                </div>
                <div class="mt-1 text-xs text-text-secondary">mit Fokusbedarf</div>
              </div>
            </div>

            <div v-if="projectScopeInsights.labels.length > 0" class="mt-5 rounded-glass border px-4 py-4"
              :class="projectScopeInsights.severity === 'danger'
                ? 'border-priority-critical/30 bg-priority-critical/10'
                : 'border-priority-high/30 bg-priority-high/10'"
            >
              <div class="text-sm font-medium" :class="projectScopeInsights.severity === 'danger' ? 'text-priority-critical' : 'text-priority-high'">
                Projekt-Check
              </div>
              <p class="mt-2 text-xs text-text-secondary">
                Freie Zeit im aktuellen Horizont: ca. {{ projectScopeInsights.availableHours }} Stunden.
              </p>
              <div class="mt-3 flex flex-wrap gap-2">
                <span
                  v-for="label in projectScopeInsights.labels"
                  :key="label"
                  class="rounded-full bg-white/[0.08] px-2 py-0.5 text-[11px]"
                  :class="projectScopeInsights.severity === 'danger' ? 'text-priority-critical' : 'text-priority-high'"
                >
                  {{ label }}
                </span>
              </div>
            </div>

            <div v-if="suggestedStartTasks.length > 0" class="mt-5 rounded-glass border border-accent-blue/20 bg-accent-blue/10 p-4">
              <div class="text-sm font-medium text-accent-blue">Empfohlener Start</div>
              <div class="mt-3 space-y-2">
                <div
                  v-for="task in suggestedStartTasks"
                  :key="`start-${task.tempId}`"
                  class="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3"
                >
                  <div class="flex items-center justify-between gap-3">
                    <div class="min-w-0">
                      <div class="text-sm font-medium text-text-primary">{{ task.title }}</div>
                      <div class="mt-1 text-xs text-text-secondary">
                        {{ task.estimatedMinutes }} Min.{{ task.dependsOn.length === 0 ? ', keine Abhängigkeiten' : '' }}
                      </div>
                    </div>
                    <span class="rounded-full bg-accent-blue/15 px-2 py-0.5 text-[11px] text-accent-blue">zuerst</span>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="reviewWhy.length > 0 || reviewUncertainty || reviewAlternatives.length > 0" class="mt-5 rounded-glass border border-border-subtle bg-white/[0.03] p-4">
              <div class="text-sm font-medium text-text-primary">Warum diese Entscheidung?</div>
              <div v-if="reviewWhy.length > 0" class="mt-3 space-y-2">
                <p v-for="reason in reviewWhy" :key="reason" class="text-sm leading-6 text-text-secondary">
                  {{ reason }}
                </p>
              </div>
              <p v-if="reviewUncertainty" class="mt-3 text-xs text-priority-high">Unsicherheit: {{ reviewUncertainty }}</p>
              <div v-if="reviewAlternatives.length > 0" class="mt-4 space-y-2">
                <div class="text-[11px] font-medium uppercase tracking-[0.2em] text-text-muted">Alternativen</div>
                <div
                  v-for="alternative in reviewAlternatives"
                  :key="alternative"
                  class="rounded-xl border border-border-subtle bg-white/[0.04] px-3 py-2 text-xs text-text-secondary"
                >
                  {{ alternative }}
                </div>
              </div>
            </div>

            <label class="mt-5 flex items-center gap-3 rounded-glass border border-border-subtle bg-white/[0.03] px-4 py-3 text-sm text-text-secondary">
              <input
                v-model="autoScheduleAfterCreate"
                type="checkbox"
                class="rounded border-border-subtle bg-transparent text-accent-purple focus:ring-accent-purple"
              >
              Nach dem Erstellen direkt automatisch einplanen
            </label>

            <div v-if="orderedPreviewTasks.length === 0" class="mt-5 rounded-glass border border-dashed border-border-strong bg-white/[0.03] px-4 py-8 text-center">
              <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent-purple/12 text-accent-purple shadow-glow-purple">
                <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 5v14m7-7H5" />
                </svg>
              </div>
              <h3 class="mt-4 text-sm font-semibold text-text-primary">Keine Aufgabe ausgewählt</h3>
              <p class="mt-2 text-sm text-text-secondary">Aktiviere mindestens eine Aufgabe, damit das Projekt erstellt werden kann.</p>
            </div>

            <div v-else class="mt-5 space-y-3">
              <div
                v-for="(task, index) in orderedPreviewTasks"
                :key="task.tempId"
                class="rounded-glass border p-4 transition"
                :class="task.include ? 'border-border-subtle bg-white/[0.04]' : 'border-border-subtle/60 bg-white/[0.02] opacity-50'"
              >
                <div class="flex items-start gap-3">
                  <input
                    v-model="task.include"
                    type="checkbox"
                    class="mt-1 rounded border-border-subtle bg-transparent text-accent-purple focus:ring-accent-purple"
                  >
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="rounded-full border border-border-subtle bg-white/[0.04] px-2 py-0.5 text-[11px] text-text-secondary">
                        Schritt {{ index + 1 }}
                      </span>
                      <span class="text-sm font-medium text-text-primary">{{ task.title }}</span>
                      <span
                        class="rounded-full px-2 py-0.5 text-[11px]"
                        :class="{
                          'bg-priority-critical/15 text-priority-critical': task.suggestedPriority === 'critical',
                          'bg-priority-high/15 text-priority-high': task.suggestedPriority === 'high',
                          'bg-priority-medium/15 text-priority-medium': task.suggestedPriority === 'medium',
                          'bg-priority-low/15 text-priority-low': task.suggestedPriority === 'low',
                        }"
                      >
                        {{ task.suggestedPriority }}
                      </span>
                      <span v-if="task.isDeepWork" class="rounded-full bg-accent-purple/15 px-2 py-0.5 text-[11px] text-accent-purple">
                        Deep Work
                      </span>
                    </div>
                    <p class="mt-2 text-sm text-text-secondary">{{ task.description }}</p>
                    <div class="mt-2 flex flex-wrap items-center gap-3 text-xs text-text-muted">
                      <span>{{ task.estimatedMinutes }} Min.</span>
                      <span v-if="task.dependsOn.length === 0" class="text-accent-blue">Startklar</span>
                      <span v-if="task.dependsOn.length > 0">Abhängig von: {{ dependencyLabels(task) }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="sticky bottom-0 mt-6 rounded-glass border border-border-subtle bg-surface/80 px-4 py-3 backdrop-blur-glass">
              <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div class="text-xs text-text-secondary">
                  {{ includedPreviewTasks.length }} Aufgaben werden übernommen.
                  <span v-if="autoScheduleAfterCreate">Auto-Planen ist nach dem Erstellen aktiv.</span>
                </div>
                <div class="flex justify-between gap-2 sm:justify-end">
                  <button type="button" class="btn-secondary px-4 py-2 text-sm" @click="step = 'input'">Zurück</button>
                  <button type="button" class="btn-secondary px-4 py-2 text-sm" @click="emit('close')">Abbrechen</button>
                  <button type="button" class="btn-accent-green px-4 py-2 text-sm" @click="handleConfirm">Projekt erstellen</button>
                </div>
              </div>
            </div>
          </template>

          <template v-else-if="step === 'done'">
            <div class="py-8 text-center">
              <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-green/15 text-accent-green shadow-glow-green">
                <svg class="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 class="mt-5 text-2xl font-semibold text-text-primary">Projekt erstellt</h2>
              <p class="mt-2 text-sm text-text-secondary">
                {{ previewTasks.filter(t => t.include).length }} Aufgaben wurden angelegt.
              </p>
              <p v-if="creationSummary && autoScheduleAfterCreate" class="mt-2 text-sm text-text-secondary">
                {{ creationSummary.scheduledCount }} Aufgaben wurden direkt eingeplant, {{ creationSummary.remainingCount }} bleiben vorerst offen.
              </p>
              <p v-else-if="creationSummary && !autoScheduleAfterCreate" class="mt-2 text-sm text-text-secondary">
                Die Aufgaben wurden angelegt und können danach manuell oder per Auto-Planen eingeplant werden.
              </p>
              <div class="mt-6 flex justify-center gap-2">
                <button type="button" class="btn-secondary px-4 py-2 text-sm" @click="emit('close')">Schließen</button>
              </div>
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






