<script setup lang="ts">
import type { Task, TaskPriority } from '~/types/task'
import type { CalendarEvent } from '~/composables/useCalendar'
import type { ScheduledTaskPlan, ScheduleTaskOptions } from '~/composables/useScheduler'

const props = defineProps<{
  show: boolean
  events: readonly CalendarEvent[]
}>()

const emit = defineEmits<{
  close: []
  'edit-task': [task: Task]
}>()

const { tasks, projects, getPendingTasks, getUnscheduledTasks, updateTask, deleteTask, deleteProjectWithTasks } = useTasks()
const { prioritizeTasks, isProcessing, aiError } = useAI()
const { scheduleTasks, findFreeSlots } = useScheduler()
const { events: calendarEvents, createEvent, fetchEvents, deleteEvent } = useCalendar()
const { preferences } = usePreferences()

const showProjectGenerator = ref(false)
const activeFilter = ref<'all' | 'open' | 'scheduled' | 'done'>('all')
const collapsedGroups = ref<string[]>([])
const planningFeedback = ref<string | null>(null)
const priorityFeedback = ref<string | null>(null)

// Aufgaben-Statistiken
const stats = computed(() => {
  const all = tasks.value
  return {
    total: all.length,
    todo: all.filter(t => t.status === 'todo' || t.status === 'missed').length,
    scheduled: all.filter(t => t.status === 'scheduled').length,
    done: all.filter(t => t.status === 'done').length,
    unscheduled: getUnscheduledTasks().length,
  }
})

const priorityColors: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-green-100 text-green-700',
}

const priorityOptions: Task['priority'][] = ['critical', 'high', 'medium', 'low']
const filterOptions = [
  { value: 'all' as const, label: 'Alle' },
  { value: 'open' as const, label: 'Offen' },
  { value: 'scheduled' as const, label: 'Geplant' },
  { value: 'done' as const, label: 'Erledigt' },
]

const priorityRank: Record<TaskPriority, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
}

interface TaskPriorityInsight {
  recommendedPriority?: TaskPriority
  source: 'ai' | 'manual' | 'system'
  headline: string
  riskLabels: string[]
}

interface SchedulingDiagnosis {
  taskId: string
  title: string
  code: 'dependency' | 'deadline' | 'deep-work' | 'work-window' | 'no-slot'
  severity: 'high' | 'medium' | 'low'
  summary: string
  detail: string
}

const planningDiagnostics = ref<SchedulingDiagnosis[]>([])
const diagnosisLabels: Record<SchedulingDiagnosis['code'], string> = {
  dependency: 'Dependency blockiert',
  deadline: 'Deadline unrealistisch',
  'deep-work': 'Zu wenig Fokuszeit',
  'work-window': 'Arbeitsfenster zu eng',
  'no-slot': 'Kein passender Slot',
}

// KI-Priorisierung
async function handlePrioritize() {
  const pending = getPendingTasks()
  if (pending.length === 0) return
  priorityFeedback.value = null

  const autoPrioritizable = pending.filter(task => task.prioritySource !== 'manual')
  const skippedManual = pending.length - autoPrioritizable.length
  if (autoPrioritizable.length === 0) {
    priorityFeedback.value = 'Alle offenen Aufgaben sind aktuell manuell fixiert.'
    return
  }

  const rankings = await prioritizeTasks(autoPrioritizable)
  const rankingMap = new Map(rankings.map(ranking => [ranking.taskId, ranking]))
  let escalatedBySystem = 0
  let appliedCount = 0

  for (const task of autoPrioritizable) {
    const ranking = rankingMap.get(task.id)
    if (!ranking) continue

    const insight = buildTaskPriorityInsight(task, ranking.priority, ranking.reason)
    const finalPriority = insight.recommendedPriority && priorityRank[insight.recommendedPriority] > priorityRank[ranking.priority]
      ? insight.recommendedPriority
      : ranking.priority
    const finalSource = finalPriority === ranking.priority ? 'ai' : 'system'
    const combinedReason = finalSource === 'ai'
      ? ranking.reason
      : `${ranking.reason} Lokal hochgezogen: ${insight.headline}.`

    await updateTask(task.id, {
      priority: finalPriority,
      aiSuggestedPriority: ranking.priority,
      priorityReason: combinedReason,
      prioritySource: finalSource,
    })
    appliedCount++
    if (finalSource === 'system') {
      escalatedBySystem++
    }
  }

  if (appliedCount > 0) {
    const parts = [`${appliedCount} Aufgaben aktualisiert`]
    if (escalatedBySystem > 0) {
      parts.push(`${escalatedBySystem} lokal hochgezogen`)
    }
    if (skippedManual > 0) {
      parts.push(`${skippedManual} manuell geschuetzt`)
    }
    priorityFeedback.value = parts.join(', ') + '.'
  }
}

// Auto-Scheduling
async function handleAutoSchedule() {
  const unscheduled = getUnscheduledTasks()
  if (unscheduled.length === 0) return

  planningFeedback.value = null
  planningDiagnostics.value = []

  const currentEvents = await refreshCalendarEvents()
  const schedule = await applyScheduleForTasks(unscheduled, currentEvents)

  const scheduledCount = schedule.size
  const remainingTasks = unscheduled.filter(task => !schedule.has(task.id))
  const unscheduledCount = remainingTasks.length
  const scheduleEvents = buildScheduleEvents(schedule, unscheduled)
  const diagnostics = remainingTasks
    .map(task => diagnoseSchedulingIssue(task, [...currentEvents, ...scheduleEvents]))
    .sort(sortSchedulingDiagnosis)

  planningDiagnostics.value = diagnostics

  if (scheduledCount === 0) {
    const topReasons = diagnostics.slice(0, 3).map(entry => `${entry.title} (${entry.summary})`).join(', ')
    planningFeedback.value = `Es konnte aktuell keine Aufgabe in einen freien Slot eingeplant werden.${topReasons ? ` Hauptgruende: ${topReasons}` : ''}`
    return
  }

  if (unscheduledCount > 0) {
    const remainingTitles = diagnostics
      .slice(0, 3)
      .map(entry => `${entry.title} (${entry.summary})`)
      .join(', ')

    planningFeedback.value = `${scheduledCount} Aufgaben eingeplant, ${unscheduledCount} noch offen. ${remainingTitles ? `Noch offen: ${remainingTitles}` : ''}`
    return
  }

  planningFeedback.value = `Alle ${scheduledCount} offenen Aufgaben wurden eingeplant.`
}

async function markDone(task: Task) {
  const calendarIds = task.scheduleBlocks?.map(block => block.calendarEventId).filter(Boolean) || []
  if (calendarIds.length > 0) {
    for (const calendarId of calendarIds) {
      await deleteEvent(calendarId!)
    }
  } else if (task.calendarEventId) {
    await deleteEvent(task.calendarEventId)
  }

  await updateTask(task.id, {
    status: 'done',
    scheduleBlocks: undefined,
    scheduledStart: undefined,
    scheduledEnd: undefined,
    calendarEventId: undefined,
  })

  await refreshCalendarEvents()
}

async function markMissed(task: Task) {
  const calendarIds = task.scheduleBlocks?.map(block => block.calendarEventId).filter(Boolean) || []

  if (calendarIds.length > 0) {
    for (const calendarId of calendarIds) {
      await deleteEvent(calendarId!)
    }
  } else if (task.calendarEventId) {
    await deleteEvent(task.calendarEventId)
  }

  await updateTask(task.id, {
    status: 'missed',
    scheduleBlocks: undefined,
    scheduledStart: undefined,
    scheduledEnd: undefined,
    calendarEventId: undefined,
  })

  const refreshedEvents = await refreshCalendarEvents()
  const refreshedTask = tasks.value.find(entry => entry.id === task.id)
  if (!refreshedTask) return

  const schedule = await applyScheduleForTasks([{
    ...refreshedTask,
    status: 'todo',
    scheduleBlocks: undefined,
    scheduledStart: undefined,
    scheduledEnd: undefined,
    calendarEventId: undefined,
  }], refreshedEvents, {
    preferredStartByTaskId: {
      [task.id]: task.scheduledStart,
    },
  })

  if (schedule.has(task.id)) {
    planningFeedback.value = `"${task.title}" wurde automatisch neu eingeplant.`
  } else {
    planningFeedback.value = `"${task.title}" konnte noch nicht automatisch neu eingeplant werden.`
  }
}

async function changePriority(task: Task, priority: Task['priority']) {
  if (task.priority === priority) return
  await updateTask(task.id, {
    priority,
    prioritySource: 'manual',
    priorityReason: 'Manuell angepasst',
  })
}

const priorityInsights = computed(() => {
  const insights = new Map<string, TaskPriorityInsight>()

  for (const task of tasks.value) {
    insights.set(
      task.id,
      buildTaskPriorityInsight(task, task.aiSuggestedPriority || task.priority, task.priorityReason || ''),
    )
  }

  return insights
})

const tasksByProject = computed(() => {
  const groups = projects.value.map(project => ({
    id: project.id,
    name: project.name,
    tasks: tasks.value.filter(task => task.projectId === project.id),
  })).filter(group => group.tasks.length > 0)

  const inboxTasks = tasks.value.filter(task => !task.projectId)
  if (inboxTasks.length > 0) {
    groups.unshift({
      id: 'inbox',
      name: 'Ohne Projekt',
      tasks: inboxTasks,
    })
  }

  return groups
})

const filteredTaskGroups = computed(() => {
  return tasksByProject.value
    .map(group => ({
      ...group,
      tasks: group.tasks.filter(matchesActiveFilter),
    }))
    .filter(group => group.tasks.length > 0)
})

function taskStatusLabel(task: Task) {
  if (task.status === 'done') return 'Erledigt'
  if (task.status === 'scheduled') return 'Eingeplant'
  if (task.status === 'missed') return 'Neu planen'
  return 'Offen'
}

function taskScheduleSummary(task: Task) {
  if (!task.scheduleBlocks || task.scheduleBlocks.length === 0) return null

  const firstBlock = task.scheduleBlocks[0]
  const label = `${new Date(firstBlock.start).toLocaleDateString('de-DE')} ${new Date(firstBlock.start).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`

  if (task.scheduleBlocks.length === 1) return label
  return `${label} + ${task.scheduleBlocks.length - 1} weitere Bloecke`
}

function getTaskInsight(task: Task) {
  return priorityInsights.value.get(task.id)
}

function buildTaskPriorityInsight(task: Task, basePriority: TaskPriority, baseReason: string): TaskPriorityInsight {
  const riskLabels: string[] = []
  let recommendedPriority: TaskPriority | undefined
  const explanationParts: string[] = []

  const blocker = getBlockingDependency(task)
  if (blocker) {
    riskLabels.push(`Blockiert durch ${blocker.title}`)
    explanationParts.push(`wartet auf ${blocker.title}`)
  }

  const projectLoad = getProjectLoad(task)
  if (projectLoad >= 5) {
    riskLabels.push('Projektlast hoch')
    explanationParts.push(`${projectLoad} offene Projektaufgaben`)
  }

  const availableMinutes = getAvailableMinutesForTask(task)
  if (task.deadline) {
    const deadline = new Date(task.deadline)
    const hoursUntilDeadline = Math.max((deadline.getTime() - Date.now()) / (60 * 60 * 1000), 0)

    if (availableMinutes < task.estimatedMinutes) {
      recommendedPriority = maxPriority(recommendedPriority, 'critical')
      riskLabels.push('Deadline unrealistisch')
      explanationParts.push('passt aktuell nicht mehr sauber vor Deadline')
    } else if (hoursUntilDeadline <= 24) {
      recommendedPriority = maxPriority(recommendedPriority, 'critical')
      riskLabels.push('Deadline unter 24h')
      explanationParts.push('Deadline in weniger als 24 Stunden')
    } else if (hoursUntilDeadline <= 72 && basePriority !== 'critical') {
      recommendedPriority = maxPriority(recommendedPriority, 'high')
      riskLabels.push('Deadline naht')
      explanationParts.push('Deadline in den naechsten 3 Tagen')
    }
  }

  if (task.isDeepWork) {
    const deepWorkMinutes = getAvailableMinutesForTask(task, true)
    if (deepWorkMinutes < task.estimatedMinutes) {
      recommendedPriority = maxPriority(recommendedPriority, 'high')
      riskLabels.push('Zu wenig Fokuszeit')
      explanationParts.push('zu wenig freie Deep-Work-Zeit')
    } else {
      riskLabels.push('Braucht Fokuszeit')
    }
  }

  if (availableMinutes < task.estimatedMinutes * 2 && task.deadline) {
    riskLabels.push('Kaum Puffer')
    explanationParts.push('wenig Planungspuffer bis zur Deadline')
  }

  if (task.status === 'missed') {
    riskLabels.push('Schon verschoben')
    explanationParts.push('wurde bereits neu eingeplant')
  }

  const headline = explanationParts.length > 0
    ? explanationParts.join(', ')
    : (baseReason || 'KI-Vorschlag ohne zusaetzliche lokale Risiken')

  return {
    recommendedPriority,
    source: recommendedPriority && priorityRank[recommendedPriority] > priorityRank[basePriority] ? 'system' : 'ai',
    headline,
    riskLabels,
  }
}

function getBlockingDependency(task: Task) {
  return task.dependencies
    .map(depId => tasks.value.find(candidate => candidate.id === depId))
    .find(candidate => candidate && candidate.status !== 'done')
}

function getProjectLoad(task: Task) {
  if (!task.projectId) return 0
  return tasks.value.filter(candidate =>
    candidate.projectId === task.projectId &&
    candidate.status !== 'done',
  ).length
}

function getAvailableMinutesForTask(task: Task, deepWorkOnly = false) {
  const from = new Date()
  const to = task.deadline ? new Date(task.deadline) : addDays(from, 14)
  const slots = findFreeSlots(from, to, props.events, preferences.value)

  return slots
    .filter(slot => !deepWorkOnly || slot.isDeepWork)
    .reduce((sum, slot) => sum + ((slot.end.getTime() - slot.start.getTime()) / 60000), 0)
}

function maxPriority(current: TaskPriority | undefined, next: TaskPriority) {
  if (!current) return next
  return priorityRank[next] > priorityRank[current] ? next : current
}

function addDays(date: Date, days: number) {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

function buildScheduleEvents(schedule: Map<string, ScheduledTaskPlan>, sourceTasks: Task[]) {
  const events: CalendarEvent[] = []

  for (const [taskId, plan] of schedule) {
    const task = sourceTasks.find(entry => entry.id === taskId) || tasks.value.find(entry => entry.id === taskId)
    if (!task) continue

    for (const block of plan.blocks) {
      events.push({
        summary: task.title,
        description: `[KALENDER-AI-TASK:${taskId}]`,
        start: { dateTime: block.start.toISOString() },
        end: { dateTime: block.end.toISOString() },
      })
    }
  }

  return events
}

function diagnoseSchedulingIssue(task: Task, existingEvents: readonly CalendarEvent[]): SchedulingDiagnosis {
  const blocker = getBlockingDependency(task)
  if (blocker) {
    return {
      taskId: task.id,
      title: task.title,
      code: 'dependency',
      severity: 'high',
      summary: 'Dependency blockiert',
      detail: `Diese Aufgabe wartet noch auf "${blocker.title}".`,
    }
  }

  const from = new Date()
  const to = task.deadline ? new Date(task.deadline) : addDays(from, 14)
  const allSlots = findFreeSlots(from, to, existingEvents, preferences.value)
  const earliestReadyAt = getEarliestReadyAt(task)
  const usableSlots = allSlots.filter(slot => slot.end > earliestReadyAt)
  const effectiveMinutes = usableSlots.reduce((sum, slot) => {
    const start = Math.max(slot.start.getTime(), earliestReadyAt.getTime())
    return sum + Math.max(0, (slot.end.getTime() - start) / 60000)
  }, 0)

  if (usableSlots.length === 0) {
    return {
      taskId: task.id,
      title: task.title,
      code: 'work-window',
      severity: 'medium',
      summary: 'Arbeitsfenster zu eng',
      detail: 'Im aktuellen Arbeitsfenster gibt es keinen freien Block, in dem diese Aufgabe starten kann.',
    }
  }

  if (task.isDeepWork) {
    const deepWorkMinutes = usableSlots
      .filter(slot => slot.isDeepWork)
      .reduce((sum, slot) => {
        const start = Math.max(slot.start.getTime(), earliestReadyAt.getTime())
        return sum + Math.max(0, (slot.end.getTime() - start) / 60000)
      }, 0)

    if (deepWorkMinutes < task.estimatedMinutes && effectiveMinutes >= task.estimatedMinutes) {
      return {
        taskId: task.id,
        title: task.title,
        code: 'deep-work',
        severity: 'medium',
        summary: 'Zu wenig Fokuszeit',
        detail: `Es gibt genug freie Zeit, aber nicht genug Deep-Work-Fenster fuer ${task.estimatedMinutes} Minuten.`,
      }
    }
  }

  if (task.deadline && effectiveMinutes < task.estimatedMinutes) {
    return {
      taskId: task.id,
      title: task.title,
      code: 'deadline',
      severity: 'high',
      summary: 'Deadline unrealistisch',
      detail: `Bis zur Deadline fehlen freie ${task.isDeepWork ? 'Fokus-' : ''}Minuten fuer ${task.estimatedMinutes} Minuten Aufwand.`,
    }
  }

  return {
    taskId: task.id,
    title: task.title,
    code: 'no-slot',
    severity: 'low',
    summary: 'Kein passender Slot',
    detail: 'Aktuell wurde kein passender freier Block fuer diese Aufgabe gefunden.',
  }
}

function getEarliestReadyAt(task: Task) {
  let earliestStart = new Date()

  for (const depId of task.dependencies) {
    const dependencyTask = tasks.value.find(candidate => candidate.id === depId)
    const dependencyEnd = dependencyTask?.scheduleBlocks?.[dependencyTask.scheduleBlocks.length - 1]?.end ||
      dependencyTask?.scheduledEnd
    if (dependencyEnd) {
      const end = new Date(dependencyEnd)
      if (end > earliestStart) {
        earliestStart = end
      }
    }
  }

  return earliestStart
}

function sortSchedulingDiagnosis(a: SchedulingDiagnosis, b: SchedulingDiagnosis) {
  const severityRank = { high: 0, medium: 1, low: 2 }
  const severityDiff = severityRank[a.severity] - severityRank[b.severity]
  if (severityDiff !== 0) return severityDiff

  const aTask = tasks.value.find(task => task.id === a.taskId)
  const bTask = tasks.value.find(task => task.id === b.taskId)
  const aDeadline = aTask?.deadline ? new Date(aTask.deadline).getTime() : Infinity
  const bDeadline = bTask?.deadline ? new Date(bTask.deadline).getTime() : Infinity
  return aDeadline - bDeadline
}

function matchesActiveFilter(task: Task) {
  if (activeFilter.value === 'all') return true
  if (activeFilter.value === 'open') {
    return task.status === 'todo' || task.status === 'missed' || task.status === 'in_progress'
  }
  if (activeFilter.value === 'scheduled') return task.status === 'scheduled'
  return task.status === 'done'
}

function toggleGroup(groupId: string) {
  if (collapsedGroups.value.includes(groupId)) {
    collapsedGroups.value = collapsedGroups.value.filter(id => id !== groupId)
    return
  }

  collapsedGroups.value = [...collapsedGroups.value, groupId]
}

function isGroupCollapsed(groupId: string) {
  return collapsedGroups.value.includes(groupId)
}

async function applyScheduleForTasks(
  tasksToSchedule: Task[],
  existingEvents: readonly CalendarEvent[],
  options: ScheduleTaskOptions = {},
) {
  const plannedSchedule = scheduleTasks(
    tasksToSchedule,
    existingEvents,
    preferences.value,
    options,
  )

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const successfulSchedule = new Map<string, ScheduledTaskPlan>()
  let successCount = 0
  let failCount = 0

  for (const [taskId, plan] of plannedSchedule) {
    const task = tasks.value.find(t => t.id === taskId) || tasksToSchedule.find(t => t.id === taskId)
    if (!task) continue

    const createdCalendarIds: string[] = []
    try {
      const createdBlocks: Array<{ start: string; end: string; calendarEventId?: string }> = []

      for (const [index, block] of plan.blocks.entries()) {
        const calEvent = await createEvent({
          summary: plan.blocks.length > 1 ? `${task.title} (${index + 1}/${plan.blocks.length})` : task.title,
          description: `[KALENDER-AI-TASK:${taskId}]\n${task.description || ''}`,
          start: { dateTime: block.start.toISOString(), timeZone: tz },
          end: { dateTime: block.end.toISOString(), timeZone: tz },
          colorId: task.isDeepWork ? '3' : '9',
        })

        if (!calEvent?.id) {
          throw new Error('Kalendereintrag konnte nicht erstellt werden.')
        }

        createdCalendarIds.push(calEvent.id)
        createdBlocks.push({
          start: block.start.toISOString(),
          end: block.end.toISOString(),
          calendarEventId: calEvent.id,
        })
      }

      if (createdBlocks.length > 0) {
        await updateTask(taskId, {
          status: 'scheduled',
          scheduleBlocks: createdBlocks,
          scheduledStart: createdBlocks[0].start,
          scheduledEnd: createdBlocks[createdBlocks.length - 1].end,
          calendarEventId: createdBlocks[0].calendarEventId,
        })
        successfulSchedule.set(taskId, plan)
        successCount++
      }
    } catch (err) {
      for (const calendarId of createdCalendarIds) {
        await deleteEvent(calendarId!)
      }
      console.error(`Fehler beim Einplanen von Task "${task.title}":`, err)
      failCount++
    }
  }

  if (failCount > 0) {
    planningFeedback.value = `${successCount} Aufgaben eingeplant, ${failCount} fehlgeschlagen.`
  }

  const now = new Date()
  const rangeStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const rangeEnd = new Date(now.getFullYear(), now.getMonth() + 4, 0)
  await fetchEvents(rangeStart.toISOString(), rangeEnd.toISOString())

  return successfulSchedule
}

async function refreshCalendarEvents() {
  const now = new Date()
  const rangeStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const rangeEnd = new Date(now.getFullYear(), now.getMonth() + 4, 0)
  await fetchEvents(rangeStart.toISOString(), rangeEnd.toISOString())
  return [...calendarEvents.value]
}

async function removeProject(groupId: string) {
  const projectGroup = tasksByProject.value.find(group => group.id === groupId)
  if (!projectGroup || groupId === 'inbox') return

  const confirmed = window.confirm(`Projekt "${projectGroup.name}" wirklich loeschen? Alle zugehoerigen Aufgaben und geplanten Kalendereintraege werden entfernt.`)
  if (!confirmed) return

  try {
    for (const task of projectGroup.tasks) {
      const calendarIds = task.scheduleBlocks?.map(block => block.calendarEventId).filter(Boolean) || []
      if (calendarIds.length > 0) {
        for (const calendarId of calendarIds) {
          await deleteEvent(calendarId!)
        }
      } else if (task.calendarEventId) {
        await deleteEvent(task.calendarEventId)
      }
    }

    await deleteProjectWithTasks(groupId)

    try {
      await refreshCalendarEvents()
    } catch (refreshError) {
      console.warn('Kalender konnte nach Projektloeschung nicht neu geladen werden:', refreshError)
    }

    planningFeedback.value = `Projekt "${projectGroup.name}" wurde geloescht.`
  } catch (error) {
    console.error(`Fehler beim Loeschen des Projekts "${projectGroup.name}":`, error)
    planningFeedback.value = `Projekt "${projectGroup.name}" konnte nicht geloescht werden.`
  }
}
</script>

<template>
  <Transition name="sidebar">
    <div v-if="show" class="fixed inset-y-0 right-0 z-40 w-96 max-w-full bg-white shadow-2xl border-l border-gray-200 flex flex-col">
      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h2 class="text-lg font-semibold text-gray-900">Aufgaben</h2>
        <button
          class="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          @click="emit('close')"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Stats -->
      <div class="grid grid-cols-4 gap-2 px-4 py-3 border-b border-gray-100 text-center">
        <div>
          <div class="text-lg font-bold text-gray-900">{{ stats.total }}</div>
          <div class="text-xs text-gray-500">Gesamt</div>
        </div>
        <div>
          <div class="text-lg font-bold text-yellow-600">{{ stats.todo }}</div>
          <div class="text-xs text-gray-500">Offen</div>
        </div>
        <div>
          <div class="text-lg font-bold text-blue-600">{{ stats.scheduled }}</div>
          <div class="text-xs text-gray-500">Geplant</div>
        </div>
        <div>
          <div class="text-lg font-bold text-green-600">{{ stats.done }}</div>
          <div class="text-xs text-gray-500">Erledigt</div>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="px-4 py-3 border-b border-gray-100 space-y-2">
        <div class="flex gap-2">
          <button
            class="flex-1 px-3 py-2 text-sm font-medium bg-primary-50 text-primary-700 rounded-lg hover:bg-primary-100 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
            :disabled="isProcessing || stats.todo === 0"
            @click="handlePrioritize"
          >
            <svg v-if="isProcessing" class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            KI-Priorisierung
          </button>
          <button
            class="flex-1 px-3 py-2 text-sm font-medium bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50"
            :disabled="stats.unscheduled === 0"
            @click="handleAutoSchedule"
          >
            Auto-Planen
          </button>
        </div>
        <button
          class="w-full px-3 py-2 text-sm font-medium bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition-colors"
          @click="showProjectGenerator = true"
        >
          KI-Projekt generieren
        </button>
        <div class="flex flex-wrap gap-1 pt-1">
          <button
            v-for="filter in filterOptions"
            :key="filter.value"
            class="rounded-full px-2.5 py-1 text-xs font-medium transition-colors"
            :class="activeFilter === filter.value
              ? 'bg-gray-900 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'"
            @click="activeFilter = filter.value"
          >
            {{ filter.label }}
          </button>
        </div>
      </div>

      <!-- AI Error -->
      <div v-if="aiError" class="px-4 py-2">
        <div class="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-xs">
          {{ aiError }}
        </div>
      </div>

      <div v-if="priorityFeedback" class="px-4 py-2">
        <div class="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
          {{ priorityFeedback }}
        </div>
      </div>

      <div v-if="planningFeedback" class="px-4 py-2">
        <div class="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
          {{ planningFeedback }}
        </div>
      </div>

      <div v-if="planningDiagnostics.length > 0" class="px-4 pb-2">
        <div class="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <div class="flex items-center justify-between gap-2">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-amber-800">Planungsanalyse</h3>
            <div class="flex flex-wrap gap-1">
              <span
                v-for="code in [...new Set(planningDiagnostics.map(entry => entry.code))]"
                :key="code"
                class="rounded-full bg-white px-2 py-0.5 text-[11px] text-amber-700"
              >
                {{ diagnosisLabels[code] }}: {{ planningDiagnostics.filter(entry => entry.code === code).length }}
              </span>
            </div>
          </div>

          <div class="mt-3 space-y-2">
            <div
              v-for="entry in planningDiagnostics.slice(0, 5)"
              :key="entry.taskId"
              class="rounded-lg bg-white px-3 py-2"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="text-xs font-medium text-gray-900">{{ entry.title }}</span>
                <span class="rounded-full px-2 py-0.5 text-[11px]"
                  :class="entry.severity === 'high'
                    ? 'bg-red-100 text-red-700'
                    : entry.severity === 'medium'
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-gray-100 text-gray-600'"
                >
                  {{ entry.summary }}
                </span>
              </div>
              <p class="mt-1 text-xs text-gray-500">{{ entry.detail }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Task List -->
      <div class="flex-1 overflow-y-auto px-4 py-3">
        <div v-if="tasks.length === 0" class="text-center py-8">
          <p class="text-sm text-gray-500">Keine Aufgaben vorhanden.</p>
          <p class="text-xs text-gray-400 mt-1">Erstelle eine neue Aufgabe oder generiere ein KI-Projekt.</p>
        </div>

        <div v-else-if="filteredTaskGroups.length > 0" class="space-y-4">
          <section v-for="group in filteredTaskGroups" :key="group.id" class="space-y-2">
            <div class="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-gray-50">
              <button
                type="button"
                class="flex min-w-0 flex-1 items-center gap-2 text-left"
                @click="toggleGroup(group.id)"
              >
                <svg
                  class="h-4 w-4 flex-shrink-0 text-gray-400 transition-transform"
                  :class="{ 'rotate-90': !isGroupCollapsed(group.id) }"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
                <h3 class="truncate text-xs font-semibold uppercase tracking-wide text-gray-500">{{ group.name }}</h3>
              </button>
              <div class="flex items-center gap-2">
                <button
                  v-if="group.id !== 'inbox'"
                  type="button"
                  class="rounded-md px-2 py-1 text-[11px] text-red-600 transition hover:bg-red-50"
                  @click="removeProject(group.id)"
                >
                  Projekt loeschen
                </button>
                <span class="text-xs text-gray-400">{{ group.tasks.length }}</span>
              </div>
            </div>

            <div v-if="!isGroupCollapsed(group.id)" class="space-y-2">
              <div
                v-for="task in group.tasks"
                :key="task.id"
                class="p-3 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors cursor-pointer"
                :class="{ 'opacity-50': task.status === 'done' }"
                @click="emit('edit-task', task)"
              >
                <div class="flex items-start justify-between gap-2">
                  <div class="flex-1 min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="text-sm font-medium text-gray-900 truncate">{{ task.title }}</span>
                      <span
                        class="text-xs px-1.5 py-0.5 rounded-full flex-shrink-0"
                        :class="priorityColors[task.priority]"
                      >
                        {{ task.priority }}
                      </span>
                      <span class="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        {{ taskStatusLabel(task) }}
                      </span>
                    </div>

                    <div class="flex flex-wrap items-center gap-2 mt-1 text-xs text-gray-400">
                      <span>{{ task.estimatedMinutes }} Min.</span>
                      <span v-if="task.deadline">
                        Deadline: {{ new Date(task.deadline).toLocaleDateString('de-DE') }}
                      </span>
                      <span v-if="task.isDeepWork" class="text-purple-500">Deep Work</span>
                      <span v-if="task.prioritySource === 'ai'" class="text-indigo-500">KI-Vorschlag</span>
                      <span v-else-if="task.prioritySource === 'system'" class="text-red-500">Deadline-Druck</span>
                      <span v-else-if="task.prioritySource === 'manual'" class="text-gray-500">Manuell</span>
                    </div>

                    <div
                      v-if="getTaskInsight(task)?.riskLabels.length"
                      class="mt-2 flex flex-wrap gap-1"
                    >
                      <span
                        v-for="riskLabel in getTaskInsight(task)?.riskLabels"
                        :key="`${task.id}-${riskLabel}`"
                        class="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] text-rose-700"
                      >
                        {{ riskLabel }}
                      </span>
                    </div>

                    <div v-if="taskScheduleSummary(task)" class="mt-1 text-xs text-blue-500">
                      Geplant: {{ taskScheduleSummary(task) }}
                    </div>

                    <div v-if="task.priorityReason" class="mt-1 text-xs text-gray-500">
                      Grund: {{ task.priorityReason }}
                    </div>

                    <div
                      v-if="task.aiSuggestedPriority && task.aiSuggestedPriority !== task.priority"
                      class="mt-1 text-xs text-gray-500"
                    >
                      KI wollte {{ task.aiSuggestedPriority }}, lokal jetzt {{ task.priority }}.
                    </div>

                    <div
                      v-if="getTaskInsight(task)?.headline && getTaskInsight(task)?.headline !== task.priorityReason"
                      class="mt-1 text-xs text-gray-500"
                    >
                      Kontext: {{ getTaskInsight(task)?.headline }}
                    </div>

                    <div class="mt-2 flex flex-wrap gap-1.5" @click.stop>
                      <button
                        v-for="priorityOption in priorityOptions"
                        :key="priorityOption"
                        class="rounded-full border px-2 py-0.5 text-[11px] transition-colors"
                        :class="task.priority === priorityOption
                          ? 'border-primary-300 bg-primary-50 text-primary-700'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700'"
                        @click="changePriority(task, priorityOption)"
                      >
                        {{ priorityOption }}
                      </button>
                    </div>
                  </div>

                  <div class="flex items-center gap-1" @click.stop>
                    <button
                      v-if="task.status === 'scheduled'"
                      class="rounded px-2 py-1 text-xs text-amber-700 hover:bg-amber-50"
                      title="Nicht geschafft, neu einplanen"
                      @click="markMissed(task)"
                    >
                      Nicht geschafft
                    </button>
                    <button
                      v-if="task.status !== 'done'"
                      class="p-1 text-gray-400 hover:text-green-600 rounded"
                      title="Als erledigt markieren"
                      @click="markDone(task)"
                    >
                      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
        <div v-else class="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center">
          <p class="text-sm text-gray-500">Keine Aufgaben fuer den aktuellen Filter gefunden.</p>
        </div>
      </div>
    </div>
  </Transition>

  <!-- Project Generator Modal -->
  <ProjectGenerator
    :show="showProjectGenerator"
    @close="showProjectGenerator = false"
    @created="showProjectGenerator = false"
  />
</template>

<style scoped>
.sidebar-enter-active,
.sidebar-leave-active {
  transition: transform 0.3s ease;
}
.sidebar-enter-from,
.sidebar-leave-to {
  transform: translateX(100%);
}
</style>
