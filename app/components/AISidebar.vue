<script setup lang="ts">
import type { PlanningStyle, Task, TaskPriority, UserPreferences } from '~/types/task'
import type { CalendarEvent } from '~/composables/useCalendar'
import type { ScheduledTaskPlan, ScheduleTaskOptions } from '~/composables/useScheduler'

const props = defineProps<{
  show: boolean
  persistent?: boolean
  events: readonly CalendarEvent[]
}>()

const emit = defineEmits<{
  close: []
  'edit-task': [task: Task]
}>()

const { tasks, projects, getPendingTasks, getUnscheduledTasks, updateTask, updateProject, deleteTask, deleteProjectWithTasks, archiveProject, restoreProject } = useTasks()
const { prioritizeTasks, isProcessing, aiError } = useAI()
const { scheduleTasks, findFreeSlots } = useScheduler()
const { events: calendarEvents, createEvent, fetchEvents, deleteEvent, syncStatus: calendarSyncStatus } = useCalendar()
const { preferences, recordTaskCompletion, recordTaskMiss, getPreferredHours } = usePreferences()

const showProjectGenerator = ref(false)
const activeFilter = ref<'all' | 'open' | 'scheduled' | 'done' | 'missed'>('all')
const collapsedGroups = ref<string[]>([])
const showArchivedProjects = ref(false)
const planningFeedback = ref<string | null>(null)
const priorityFeedback = ref<string | null>(null)
const decisionTransparency = ref<DecisionTransparency | null>(null)

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

const todayWindow = computed(() => {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setHours(23, 59, 59, 999)
  return { start, end }
})

const todayTasks = computed(() => {
  return tasks.value.filter((task) => {
    if (task.deadline) {
      const deadline = new Date(task.deadline)
      if (
        deadline.getFullYear() === todayWindow.value.start.getFullYear() &&
        deadline.getMonth() === todayWindow.value.start.getMonth() &&
        deadline.getDate() === todayWindow.value.start.getDate()
      ) {
        return true
      }
    }

    const taskStart = task.scheduleBlocks?.[0]?.start || task.scheduledStart
    if (taskStart) {
      const start = new Date(taskStart)
      if (
        start.getFullYear() === todayWindow.value.start.getFullYear() &&
        start.getMonth() === todayWindow.value.start.getMonth() &&
        start.getDate() === todayWindow.value.start.getDate()
      ) {
        return true
      }
    }

    return false
  })
})

const todayDueOrScheduledCount = computed(() => todayTasks.value.length)
const todayDoneCount = computed(() => todayTasks.value.filter(task => task.status === 'done').length)
const todayUpcomingEvent = computed(() => {
  const now = new Date()
  return [...props.events]
    .filter((event) => {
      const value = event.start.dateTime || event.start.date
      if (!value) return false
      const start = new Date(value)
      return start >= now && start <= todayWindow.value.end
    })
    .sort((a, b) => {
      const aStart = new Date(a.start.dateTime || a.start.date || '').getTime()
      const bStart = new Date(b.start.dateTime || b.start.date || '').getTime()
      return aStart - bStart
    })[0] || null
})

const todayRemainingWorkMinutes = computed(() => {
  const now = new Date()
  const slots = findFreeSlots(now, todayWindow.value.end, props.events, preferences.value)
  return Math.round(slots.reduce((sum, slot) => sum + ((slot.end.getTime() - slot.start.getTime()) / 60000), 0))
})

const aiHeaderMessage = computed(() => {
  if (stats.value.todo === 0 && stats.value.scheduled === 0) {
    return 'Heute sieht ruhig aus. Du kannst entspannt neu planen.'
  }

  if (todayDueOrScheduledCount.value > 0) {
    return `Heute stehen ${todayDueOrScheduledCount.value} Aufgaben im Fokus, ${stats.value.scheduled} davon sind bereits eingeplant.`
  }

  return `${stats.value.todo} offene Aufgaben warten auf eine Entscheidung.`
})

const priorityColors: Record<string, string> = {
  critical: 'border border-priority-critical/30 bg-priority-critical/15 text-priority-critical',
  high: 'border border-priority-high/30 bg-priority-high/15 text-priority-high',
  medium: 'border border-priority-medium/30 bg-priority-medium/15 text-priority-medium',
  low: 'border border-priority-low/30 bg-priority-low/15 text-priority-low',
}

const priorityOptions: Task['priority'][] = ['critical', 'high', 'medium', 'low']
const filterOptions = [
  { value: 'all' as const, label: 'Alle' },
  { value: 'open' as const, label: 'Offen' },
  { value: 'scheduled' as const, label: 'Geplant' },
  { value: 'done' as const, label: 'Erledigt' },
  { value: 'missed' as const, label: 'Verpasst' },
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

interface SlotAlternative {
  start: string
  end: string
  label: string
  detail: string
}

type RescheduleMode = 'same-time' | 'today' | 'next' | 'redistribute'

interface DecisionTransparency {
  title: string
  why: string[]
  uncertainty?: string | null
  alternatives: string[]
}

interface PlanVariantPreview {
  style: PlanningStyle
  label: string
  description: string
  scheduledCount: number
  remainingCount: number
  highlight: string
}

interface ActivityEntry {
  id: string
  title: string
  detail: string
  createdAt: string
  undoLabel?: string
  undo?: () => Promise<void>
}

interface DisplacementSuggestion {
  incomingTaskId: string
  incomingTitle: string
  displacedTaskId: string
  displacedTitle: string
  start: string
  end: string
}

const planningDiagnostics = ref<SchedulingDiagnosis[]>([])
const schedulingAlternatives = ref<Record<string, SlotAlternative[]>>({})
const planVariants = ref<PlanVariantPreview[]>([])
const activityEntries = ref<ActivityEntry[]>([])
const displacementSuggestions = ref<DisplacementSuggestion[]>([])
const previewDisplacement = ref<DisplacementSuggestion | null>(null)
const applyingVariantStyle = ref<PlanningStyle | null>(null)
const applyingAlternativeTaskId = ref<string | null>(null)
const applyingDisplacementId = ref<string | null>(null)
const rescheduleTask = ref<Task | null>(null)
const selectedRescheduleMode = ref<RescheduleMode>('same-time')
const diagnosisLabels: Record<SchedulingDiagnosis['code'], string> = {
  dependency: 'Dependency blockiert',
  deadline: 'Deadline unrealistisch',
  'deep-work': 'Zu wenig Fokuszeit',
  'work-window': 'Arbeitsfenster zu eng',
  'no-slot': 'Kein passender Slot',
}

const rescheduleModeOptions: Array<{
  value: RescheduleMode
  label: string
  description: string
}> = [
  {
    value: 'same-time',
    label: 'Ähnliche Uhrzeit',
    description: 'Versucht, möglichst nah an der alten Zeit neu zu planen.',
  },
  {
    value: 'today',
    label: 'Noch heute',
    description: 'Sucht zuerst heute einen Slot und fällt sonst auf den nächsten sinnvollen aus.',
  },
  {
    value: 'next',
    label: 'Nächster Slot',
    description: 'Nimmt einfach den nächsten sinnvollen freien Termin.',
  },
  {
    value: 'redistribute',
    label: 'Rest verteilen',
    description: 'Verteilt die Aufgabe möglichst flexibel über größere freie Blöcke.',
  },
]

const planVariantOptions: Array<{
  style: PlanningStyle
  label: string
  description: string
}> = [
  {
    style: 'aggressiv',
    label: 'Kompakt',
    description: 'Packt Aufgaben früher und dichter in freie Slots.',
  },
  {
    style: 'deadline-first',
    label: 'Deadline-first',
    description: 'Zieht Aufgaben mit naher Deadline bewusst weiter nach vorne.',
  },
  {
    style: 'focus-first',
    label: 'Fokusfreundlich',
    description: 'Bevorzugt starke Fokusblöcke für anspruchsvolle Aufgaben.',
  },
  {
    style: 'entspannt',
    label: 'Entspannt',
    description: 'Sucht luftigere Zeiträume mit mehr Puffer.',
  },
]

// KI-Priorisierung
async function handlePrioritize() {
  const pending = getPendingTasks()
  if (pending.length === 0) return
  priorityFeedback.value = null
  decisionTransparency.value = null

  const autoPrioritizable = pending.filter(task => task.prioritySource !== 'manual')
  const skippedManual = pending.length - autoPrioritizable.length
  if (autoPrioritizable.length === 0) {
    priorityFeedback.value = 'Alle offenen Aufgaben sind aktuell manuell fixiert.'
    decisionTransparency.value = {
      title: 'Warum diese Entscheidung?',
    why: ['Alle offenen Aufgaben sind aktuell manuell fixiert und wurden deshalb nicht automatisch überschrieben.'],
      uncertainty: null,
      alternatives: [
        'Manuelle Prioritaeten einzelner Aufgaben wieder freigeben.',
        'Nur neue oder offene Aufgaben ohne manuellen Schutz per KI priorisieren.',
      ],
    }
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
      parts.push(`${skippedManual} manuell geschützt`)
    }
    priorityFeedback.value = parts.join(', ') + '.'
    addActivityEntry({
      title: 'KI-Priorisierung',
      detail: parts.join(', '),
    })
  }

  decisionTransparency.value = buildPriorityDecisionTransparency({
    pendingCount: pending.length,
    appliedCount,
    escalatedBySystem,
    skippedManual,
    prioritizedTasks: autoPrioritizable,
  })
}

// Auto-Scheduling
async function handleAutoSchedule() {
  const unscheduled = getUnscheduledTasks()
  if (unscheduled.length === 0) return

  planningFeedback.value = null
  planningDiagnostics.value = []
  schedulingAlternatives.value = {}
  planVariants.value = []
  decisionTransparency.value = null

  const currentEvents = await refreshCalendarEvents()
  const schedule = await applyScheduleForTasks(unscheduled, currentEvents)
  const updatedEvents = [...calendarEvents.value]
  const remainingTasks = unscheduled.filter(task => !schedule.has(task.id))
  await refreshSchedulingInsights(schedule, remainingTasks, updatedEvents)

  const scheduledCount = schedule.size
  const unscheduledCount = remainingTasks.length

  if (scheduledCount === 0) {
    const topReasons = planningDiagnostics.value.slice(0, 3).map(entry => `${entry.title} (${entry.summary})`).join(', ')
    planningFeedback.value = `Es konnte aktuell keine Aufgabe in einen freien Slot eingeplant werden.${topReasons ? ` Hauptgruende: ${topReasons}` : ''}`
    addActivityEntry({
      title: 'Auto-Planen',
      detail: 'Keine Aufgabe konnte automatisch eingeplant werden.',
    })
    return
  }

  if (unscheduledCount > 0) {
    const remainingTitles = planningDiagnostics.value
      .slice(0, 3)
      .map(entry => `${entry.title} (${entry.summary})`)
      .join(', ')

    planningFeedback.value = `${scheduledCount} Aufgaben eingeplant, ${unscheduledCount} noch offen. ${remainingTitles ? `Noch offen: ${remainingTitles}` : ''}`
    addActivityEntry({
      title: 'Auto-Planen',
      detail: `${scheduledCount} eingeplant, ${unscheduledCount} offen geblieben.`,
    })
    return
  }

  planningFeedback.value = `Alle ${scheduledCount} offenen Aufgaben wurden eingeplant.`
  addActivityEntry({
    title: 'Auto-Planen',
    detail: `Alle ${scheduledCount} offenen Aufgaben wurden eingeplant.`,
  })
}

async function markDone(task: Task) {
  const completionReference = task.scheduleBlocks?.[0]?.start || task.scheduledStart
  recordTaskCompletion(completionReference ? new Date(completionReference) : new Date(), task.isDeepWork)

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
    progressPercent: 100,
    originalEstimatedMinutes: task.originalEstimatedMinutes || task.estimatedMinutes,
    scheduleBlocks: undefined,
    scheduledStart: undefined,
    scheduledEnd: undefined,
    calendarEventId: undefined,
  })

  await refreshCalendarEvents()
  addActivityEntry({
    title: 'Aufgabe erledigt',
    detail: `"${task.title}" wurde als erledigt markiert.`,
  })
}

function openRescheduleDialog(task: Task) {
  rescheduleTask.value = task
  selectedRescheduleMode.value = 'same-time'
}

function closeRescheduleDialog() {
  rescheduleTask.value = null
  selectedRescheduleMode.value = 'same-time'
}

async function confirmReschedule() {
  if (!rescheduleTask.value) return
  await markMissed(rescheduleTask.value, selectedRescheduleMode.value)
  closeRescheduleDialog()
}

async function markMissed(task: Task, mode: RescheduleMode = 'same-time') {
  const previousStart = task.scheduledStart
  recordTaskMiss(previousStart ? new Date(previousStart) : new Date())
  decisionTransparency.value = null
  schedulingAlternatives.value = {}
  planVariants.value = []
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
      [task.id]: mode === 'same-time' ? previousStart : mode === 'today' ? new Date().toISOString() : undefined,
    },
    rescheduleModeByTaskId: {
      [task.id]: mode,
    },
  })

  if (schedule.has(task.id)) {
    const newStart = schedule.get(task.id)?.blocks[0]?.start
    const shiftLabel = describeRescheduleShift(previousStart, newStart)
    const modeLabel = rescheduleModeOptions.find(option => option.value === mode)?.label || 'Neuplanung'
    planningFeedback.value = `"${task.title}" wurde neu eingeplant (${modeLabel}). ${shiftLabel}`
    decisionTransparency.value = buildRescheduleDecisionTransparency(task, mode, true, previousStart, newStart)
    addActivityEntry({
      title: 'Neu eingeplant',
      detail: `"${task.title}" wurde mit "${modeLabel}" neu eingeplant.`,
    })
  } else {
    planningFeedback.value = `"${task.title}" konnte im Modus "${rescheduleModeOptions.find(option => option.value === mode)?.label || mode}" noch nicht automatisch neu eingeplant werden.`
    decisionTransparency.value = buildRescheduleDecisionTransparency(task, mode, false, previousStart)
    addActivityEntry({
      title: 'Neuplanung fehlgeschlagen',
      detail: `"${task.title}" konnte mit "${modeLabel}" noch nicht neu eingeplant werden.`,
    })
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

function addActivityEntry(entry: Omit<ActivityEntry, 'id' | 'createdAt'>) {
  activityEntries.value = [
    {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      ...entry,
    },
    ...activityEntries.value,
  ].slice(0, 8)
}

function formatActivityTime(value: string) {
  return new Date(value).toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function undoActivity(entryId: string) {
  const entry = activityEntries.value.find(item => item.id === entryId)
  if (!entry?.undo) return

  try {
    await entry.undo()
    activityEntries.value = activityEntries.value.filter(item => item.id !== entryId)
    planningFeedback.value = `"${entry.title}" wurde rückgängig gemacht.`
  } catch (error) {
    console.error(`Fehler beim Rückgängig machen von "${entry.title}":`, error)
    planningFeedback.value = `"${entry.title}" konnte nicht rückgängig gemacht werden.`
  }
}

async function evaluatePlanVariants(
  remainingTasks: readonly Task[],
  occupiedEvents: readonly CalendarEvent[],
) {
  if (remainingTasks.length === 0) {
    planVariants.value = []
    return
  }

  const previews = planVariantOptions.map(option => {
    const variantPrefs = buildPreferencesForStyle(option.style)
    const simulated = scheduleTasks(remainingTasks, occupiedEvents, variantPrefs)
    const scheduledCount = simulated.size
    const remainingCount = remainingTasks.length - scheduledCount

    return {
      style: option.style,
      label: option.label,
      description: option.description,
      scheduledCount,
      remainingCount,
      highlight: buildVariantHighlight(option.style, scheduledCount, remainingTasks.length),
    } satisfies PlanVariantPreview
  })

  planVariants.value = previews.sort((a, b) => {
    if (a.scheduledCount !== b.scheduledCount) {
      return b.scheduledCount - a.scheduledCount
    }

    const styleOrder = planVariantOptions.map(option => option.style)
    return styleOrder.indexOf(a.style) - styleOrder.indexOf(b.style)
  })
}

function buildPreferencesForStyle(style: PlanningStyle): UserPreferences {
  return {
    ...preferences.value,
    planningStyle: style,
  }
}

function buildVariantHighlight(
  style: PlanningStyle,
  scheduledCount: number,
  totalTasks: number,
) {
  if (scheduledCount === 0) {
    return 'Loest die aktuellen Engpaesse voraussichtlich nicht.'
  }

  if (scheduledCount === totalTasks) {
    return 'Kann die restlichen Aufgaben komplett unterbringen.'
  }

  switch (style) {
    case 'aggressiv':
      return 'Nutzen wir, wenn wir freie Luecken dichter ausreizen wollen.'
    case 'deadline-first':
      return 'Hilft besonders bei knappen Deadlines und Zeitdruck.'
    case 'focus-first':
      return 'Sinnvoll, wenn Deep-Work-Aufgaben aktuell blockieren.'
    case 'entspannt':
      return 'Gut, wenn mehr Puffer wichtiger ist als maximale Auslastung.'
    default:
      return 'Bietet eine alternative Planungslogik für die Restaufgaben.'
  }
}

async function refreshSchedulingInsights(
  schedule: Map<string, ScheduledTaskPlan>,
  remainingTasks: readonly Task[],
  existingEvents: readonly CalendarEvent[],
) {
  const diagnostics = remainingTasks
    .map(task => diagnoseSchedulingIssue(task, existingEvents))
    .sort(sortSchedulingDiagnosis)

  planningDiagnostics.value = diagnostics
  decisionTransparency.value = buildSchedulingDecisionTransparency(schedule, [...remainingTasks], diagnostics)
  schedulingAlternatives.value = buildSchedulingAlternativesMap(remainingTasks, existingEvents)
  displacementSuggestions.value = buildDisplacementSuggestions(remainingTasks)
  await evaluatePlanVariants(remainingTasks, existingEvents)
}

async function applyPlanVariant(style: PlanningStyle) {
  const unscheduled = getUnscheduledTasks()
  if (unscheduled.length === 0) return

  applyingVariantStyle.value = style
  planningFeedback.value = null
  planningDiagnostics.value = []
  schedulingAlternatives.value = {}
  decisionTransparency.value = null

  try {
    const variant = planVariantOptions.find(option => option.style === style)
    const currentEvents = await refreshCalendarEvents()
    const schedule = await applyScheduleForTasks(unscheduled, currentEvents, {}, buildPreferencesForStyle(style))
    const remainingTasks = unscheduled.filter(task => !schedule.has(task.id))
    const updatedEvents = [...calendarEvents.value]
    await refreshSchedulingInsights(schedule, remainingTasks, updatedEvents)
    const scheduledCount = schedule.size

    if (scheduledCount === 0) {
      planningFeedback.value = `${variant?.label || style} konnte aktuell keine weiteren Aufgaben einplanen.`
      addActivityEntry({
        title: 'Planvariante getestet',
        detail: `${variant?.label || style} konnte keine weiteren Aufgaben einplanen.`,
      })
      return
    }

    if (remainingTasks.length > 0) {
      planningFeedback.value = `${variant?.label || style} hat ${scheduledCount} weitere Aufgaben eingeplant, ${remainingTasks.length} bleiben noch offen.`
      addActivityEntry({
        title: 'Planvariante angewendet',
        detail: `${variant?.label || style}: ${scheduledCount} weitere Aufgaben eingeplant, ${remainingTasks.length} offen.`,
      })
      return
    }

    planningFeedback.value = `${variant?.label || style} konnte alle restlichen Aufgaben einplanen.`
    addActivityEntry({
      title: 'Planvariante angewendet',
      detail: `${variant?.label || style} konnte alle restlichen Aufgaben einplanen.`,
    })
  } finally {
    applyingVariantStyle.value = null
  }
}

function isRecommendedPlanVariant(style: PlanningStyle) {
  const best = planVariants.value[0]
  return best?.style === style && best.scheduledCount > 0
}

function buildSchedulingAlternativesMap(
  sourceTasks: readonly Task[],
  existingEvents: readonly CalendarEvent[],
) {
  const alternatives: Record<string, SlotAlternative[]> = {}

  for (const task of sourceTasks) {
    const slots = suggestAlternativeSlots(task, existingEvents)
    if (slots.length > 0) {
      alternatives[task.id] = slots
    }
  }

  return alternatives
}

function suggestAlternativeSlots(task: Task, existingEvents: readonly CalendarEvent[]) {
  if (getBlockingDependency(task)) {
    return []
  }

  const earliestReadyAt = getEarliestReadyAt(task)
  const deadline = task.deadline ? new Date(task.deadline) : undefined
  const searchEnd = deadline
    ? addDays(deadline, 7)
    : addDays(earliestReadyAt, 14)

  const strictSlots = findFreeSlots(earliestReadyAt, searchEnd, existingEvents, preferences.value)
  const flexibleSlots = strictSlots.length > 0
    ? strictSlots
    : findFreeSlots(earliestReadyAt, searchEnd, existingEvents, preferences.value, { ignoreSoftBlockers: true })

  const viableSlots = flexibleSlots
    .filter(slot => !task.isDeepWork || slot.isDeepWork)
    .map(slot => {
      const start = new Date(Math.max(slot.start.getTime(), earliestReadyAt.getTime()))
      const end = new Date(start.getTime() + task.estimatedMinutes * 60000)
      return {
        start,
        end,
        fits: end <= slot.end,
        usesSoftFlex: strictSlots.length === 0,
      }
    })
    .filter(slot => slot.fits)
    .slice(0, 2)

  return viableSlots.map(slot => ({
    start: slot.start.toISOString(),
    end: slot.end.toISOString(),
    label: formatAlternativeSlotLabel(slot.start, slot.end),
    detail: slot.usesSoftFlex
      ? 'Würde nur mit weichen Blockern wie Pause oder Puffer funktionieren.'
      : deadline && slot.end > deadline
      ? 'Würde erst nach der aktuellen Deadline stattfinden.'
      : task.isDeepWork
        ? 'Passt in ein freies Fokusfenster.'
        : 'Nächster freier Block ohne Kollision.',
  }))
}

function formatAlternativeSlotLabel(start: Date, end: Date) {
  const sameDay = start.toDateString() === end.toDateString()
  const dateLabel = start.toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  })
  const startLabel = start.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  })
  const endLabel = end.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  })

  if (sameDay) {
    return `${dateLabel}, ${startLabel} - ${endLabel}`
  }

  return `${dateLabel}, ${startLabel} bis ${endLabel}`
}

async function applyAlternativeSlot(taskId: string, alternative: SlotAlternative) {
  const task = tasks.value.find(entry => entry.id === taskId)
  if (!task) return

  applyingAlternativeTaskId.value = taskId
  planningFeedback.value = null
  const previousTaskState = {
    ...task,
    dependencies: [...task.dependencies],
    scheduleBlocks: task.scheduleBlocks ? [...task.scheduleBlocks] : undefined,
  }

  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    const createdEvent = await createEvent({
      summary: task.title,
      description: `[KALENDER-AI-TASK:${task.id}]\n${task.description || ''}`,
      start: { dateTime: alternative.start, timeZone: tz },
      end: { dateTime: alternative.end, timeZone: tz },
      colorId: task.isDeepWork ? '3' : '9',
    })

    if (!createdEvent?.id) {
      throw new Error('Kalendereintrag konnte nicht erstellt werden.')
    }

    await updateTask(task.id, {
      status: 'scheduled',
      scheduleBlocks: [{
        start: alternative.start,
        end: alternative.end,
        calendarEventId: createdEvent.id,
      }],
      scheduledStart: alternative.start,
      scheduledEnd: alternative.end,
      calendarEventId: createdEvent.id,
    })

    const updatedEvents = await refreshCalendarEvents()
    const remainingTasks = getUnscheduledTasks()
    await refreshSchedulingInsights(new Map(), remainingTasks, updatedEvents)
    planningFeedback.value = `"${task.title}" wurde auf ${alternative.label} eingeplant.`
    addActivityEntry({
      title: 'Alternativ-Slot übernommen',
      detail: `"${task.title}" wurde auf ${alternative.label} gelegt.`,
      undoLabel: 'Rückgängig',
      undo: async () => {
        await deleteEvent(createdEvent.id!)
        await updateTask(task.id, {
          ...previousTaskState,
          scheduleBlocks: previousTaskState.scheduleBlocks,
        })
        const restoredEvents = await refreshCalendarEvents()
        await refreshSchedulingInsights(new Map(), getUnscheduledTasks(), restoredEvents)
      },
    })
  } catch (error) {
    console.error(`Fehler beim Anwenden eines Alternativ-Slots für "${task.title}":`, error)
    planningFeedback.value = `"${task.title}" konnte nicht auf den vorgeschlagenen Slot eingeplant werden.`
  } finally {
    applyingAlternativeTaskId.value = null
  }
}

function buildDisplacementSuggestions(sourceTasks: readonly Task[]) {
  const candidates = sourceTasks
    .filter(task => ['critical', 'high'].includes(task.priority))
    .filter(task => !getBlockingDependency(task))
    .sort((a, b) => priorityRank[b.priority] - priorityRank[a.priority])

  const scheduledLowTasks = tasks.value
    .filter(task => task.status === 'scheduled' && task.priority === 'low')
    .filter(task => (task.scheduleBlocks?.length || 0) === 1)

  const suggestions: DisplacementSuggestion[] = []
  for (const incoming of candidates) {
    const suggestion = scheduledLowTasks.find(task => {
      const block = task.scheduleBlocks?.[0]
      if (!block) return false
      const start = new Date(block.start)
      const end = new Date(block.end)
      const durationMinutes = (end.getTime() - start.getTime()) / 60000
      if (durationMinutes < incoming.estimatedMinutes) return false
      if (incoming.deadline && start > new Date(incoming.deadline)) return false
      return true
    })

    if (!suggestion?.scheduleBlocks?.[0]) continue
    suggestions.push({
      incomingTaskId: incoming.id,
      incomingTitle: incoming.title,
      displacedTaskId: suggestion.id,
      displacedTitle: suggestion.title,
      start: suggestion.scheduleBlocks[0].start,
      end: suggestion.scheduleBlocks[0].end,
    })
  }

  return suggestions.slice(0, 3)
}

async function applyProjectReview(groupId: string, reviewStatus: 'too-big' | 'fit' | 'too-small') {
  const projectGroup = tasksByProject.value.find(group => group.id === groupId)
  if (!projectGroup) return

  await updateProject(groupId, {
    reviewStatus,
  })

  planningFeedback.value = `Projekt-Review für "${projectGroup.name}" gespeichert.`
  addActivityEntry({
    title: 'Projekt-Review',
    detail: `"${projectGroup.name}": ${projectReviewLabel(reviewStatus)}`,
  })
}

async function applyDisplacementSuggestion(suggestion: DisplacementSuggestion) {
  const incoming = tasks.value.find(task => task.id === suggestion.incomingTaskId)
  const displaced = tasks.value.find(task => task.id === suggestion.displacedTaskId)
  if (!incoming || !displaced) return

  applyingDisplacementId.value = suggestion.incomingTaskId

  try {
    const displacedIds = displaced.scheduleBlocks?.map(block => block.calendarEventId).filter(Boolean) || []
    for (const calendarId of displacedIds) {
      await deleteEvent(calendarId!)
    }

    await updateTask(displaced.id, {
      status: 'todo',
      scheduleBlocks: undefined,
      scheduledStart: undefined,
      scheduledEnd: undefined,
      calendarEventId: undefined,
    })

    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    const createdEvent = await createEvent({
      summary: incoming.title,
      description: `[KALENDER-AI-TASK:${incoming.id}]\n${incoming.description || ''}`,
      start: { dateTime: suggestion.start, timeZone: tz },
      end: { dateTime: suggestion.end, timeZone: tz },
      colorId: incoming.isDeepWork ? '3' : '9',
    })

    if (!createdEvent?.id) {
      throw new Error('Kalendereintrag konnte nicht erstellt werden.')
    }

    await updateTask(incoming.id, {
      status: 'scheduled',
      scheduleBlocks: [{
        start: suggestion.start,
        end: suggestion.end,
        calendarEventId: createdEvent.id,
      }],
      scheduledStart: suggestion.start,
      scheduledEnd: suggestion.end,
      calendarEventId: createdEvent.id,
    })

    const updatedEvents = await refreshCalendarEvents()
    await refreshSchedulingInsights(new Map(), getUnscheduledTasks(), updatedEvents)
    previewDisplacement.value = null
    planningFeedback.value = `"${incoming.title}" hat den Slot von "${displaced.title}" übernommen.`
    addActivityEntry({
      title: 'Slot verdrängt',
      detail: `"${incoming.title}" wurde vor "${displaced.title}" eingeplant.`,
    })
  } catch (error) {
    console.error('Verdrängung konnte nicht angewendet werden:', error)
    planningFeedback.value = 'Die Verdrängung konnte nicht sauber angewendet werden.'
  } finally {
    applyingDisplacementId.value = null
  }
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
  const groups = projects.value
    .filter(project => !project.archivedAt)
    .map(project => ({
      id: project.id,
      name: project.name,
      archivedAt: project.archivedAt,
      reviewAfterDate: project.reviewAfterDate,
      reviewStatus: project.reviewStatus,
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

const archivedTaskGroups = computed(() => {
  return projects.value
    .filter(project => Boolean(project.archivedAt))
    .map(project => ({
      id: project.id,
      name: project.name,
      archivedAt: project.archivedAt,
      reviewAfterDate: project.reviewAfterDate,
      reviewStatus: project.reviewStatus,
      tasks: tasks.value.filter(task => task.projectId === project.id),
    }))
})

const filteredTaskGroups = computed(() => {
  return tasksByProject.value
    .map(group => ({
      ...group,
      fullTasks: group.tasks,
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

function getGroupTasks(group: { tasks: Task[]; fullTasks?: Task[] }) {
  return group.fullTasks || group.tasks
}

function projectProgress(group: { tasks: Task[]; fullTasks?: Task[] }) {
  const sourceTasks = getGroupTasks(group)
  const total = sourceTasks.length
  const done = sourceTasks.filter(task => task.status === 'done').length
  const percent = total === 0 ? 0 : Math.round((done / total) * 100)
  return { total, done, percent }
}

function projectRemainingHours(group: { tasks: Task[]; fullTasks?: Task[] }) {
  const remainingMinutes = getGroupTasks(group)
    .filter(task => task.status !== 'done')
    .reduce((sum, task) => sum + task.estimatedMinutes, 0)
  return Math.round((remainingMinutes / 60) * 10) / 10
}

function projectNextStep(group: { tasks: Task[]; fullTasks?: Task[] }) {
  const openTasks = getGroupTasks(group)
    .filter(task => task.status !== 'done')
    .sort((a, b) => {
      const priorityDiff = priorityRank[b.priority] - priorityRank[a.priority]
      if (priorityDiff !== 0) return priorityDiff

      const aDeadline = a.deadline ? new Date(a.deadline).getTime() : Infinity
      const bDeadline = b.deadline ? new Date(b.deadline).getTime() : Infinity
      return aDeadline - bDeadline
    })

  return openTasks[0] || null
}

function isProjectCompleted(group: { tasks: Task[]; fullTasks?: Task[] }) {
  const sourceTasks = getGroupTasks(group)
  return sourceTasks.length > 0 && sourceTasks.every(task => task.status === 'done')
}

function taskScheduleSummary(task: Task) {
  if (!task.scheduleBlocks || task.scheduleBlocks.length === 0) return null

  const firstBlock = task.scheduleBlocks[0]
  const label = `${new Date(firstBlock.start).toLocaleDateString('de-DE')} ${new Date(firstBlock.start).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`

  if (task.scheduleBlocks.length === 1) return label
  return `${label} + ${task.scheduleBlocks.length - 1} weitere Bloecke`
}

function formatTaskDateTime(value?: string) {
  if (!value) return null

  return new Date(value).toLocaleString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatArchivedDate(value?: string) {
  if (!value) return null

  return new Date(value).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function taskProgressLabel(task: Task) {
  if (!task.progressPercent || task.progressPercent <= 0) return null
  const original = task.originalEstimatedMinutes || task.estimatedMinutes
  return `${task.progressPercent}% erledigt · ${task.estimatedMinutes} von ${original} Min. offen`
}

function isProjectReviewDue(group: { reviewAfterDate?: string; reviewStatus?: string }) {
  if (!group.reviewAfterDate || group.reviewStatus) return false
  return new Date(group.reviewAfterDate) <= new Date()
}

function projectReviewLabel(status?: 'too-big' | 'fit' | 'too-small') {
  if (status === 'fit') return 'Plan war passend'
  if (status === 'too-big') return 'Plan war zu groß'
  if (status === 'too-small') return 'Plan war zu klein'
  return null
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
      explanationParts.push('Deadline in den nächsten 3 Tagen')
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

  const preferredHours = getPreferredHours(task.isDeepWork)
  if (preferredHours.length > 0) {
    riskLabels.push(`Lernt ${preferredHours.map(hour => `${String(hour).padStart(2, '0')}:00`).join(', ')}`)
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

function buildPriorityDecisionTransparency(input: {
  pendingCount: number
  appliedCount: number
  escalatedBySystem: number
  skippedManual: number
  prioritizedTasks: Task[]
}): DecisionTransparency {
  const blockerCount = input.prioritizedTasks.filter(task => Boolean(getBlockingDependency(task))).length
  const deadlinePressureCount = input.prioritizedTasks.filter(task => {
    if (!task.deadline) return false
    const hoursUntilDeadline = (new Date(task.deadline).getTime() - Date.now()) / (60 * 60 * 1000)
    return hoursUntilDeadline <= 72
  }).length

  const why = [
    `${input.appliedCount} von ${input.pendingCount} offenen Aufgaben wurden mit KI-Vorschlag und lokaler Kontextlogik bewertet.`,
  ]

  if (input.escalatedBySystem > 0) {
    why.push(`${input.escalatedBySystem} Aufgaben wurden lokal wegen Deadline-Druck oder fehlender Planungsreserve nach oben gezogen.`)
  }

  if (blockerCount > 0) {
    why.push(`${blockerCount} Aufgaben haben noch offene Abhängigkeiten und wurden vorsichtiger einsortiert.`)
  }

  const alternatives = [
    'Prioritaeten manuell anpassen, wenn deine echte Reihenfolge anders ist.',
    'Danach direkt Auto-Planen starten, um die Reihenfolge gegen den Kalender zu pruefen.',
  ]

  if (input.skippedManual > 0) {
    alternatives.unshift(`${input.skippedManual} manuell geschützte Aufgaben gezielt wieder für die KI freigeben.`)
  }

  let uncertainty: string | null = null
  if (input.skippedManual > 0) {
    uncertainty = 'Manuell geschützte Aufgaben können die Gesamtpriorisierung verschieben, auch wenn die KI den Rest sauber bewertet hat.'
  } else if (deadlinePressureCount > 0 && blockerCount > 0) {
    uncertainty = 'Deadline-Druck und Abhängigkeiten wirken gleichzeitig. Einzelne Reihenfolgen bleiben deshalb eher heuristisch als absolut.'
  }

  return {
    title: 'Warum diese Entscheidung?',
    why,
    uncertainty,
    alternatives,
  }
}

function buildSchedulingDecisionTransparency(
  schedule: Map<string, ScheduledTaskPlan>,
  remainingTasks: Task[],
  diagnostics: SchedulingDiagnosis[],
): DecisionTransparency {
  const why = [`${schedule.size} Aufgaben wurden in freie Slots eingeplant, ohne bestehende Termine und Routinen zu stören.`]
  const topCodes = [...new Set(diagnostics.map(entry => entry.code))].slice(0, 3)

  if (remainingTasks.length > 0) {
    why.push(`${remainingTasks.length} Aufgaben blieben offen, weil aktuell nicht genug passende Slots oder Voraussetzungen vorhanden sind.`)
  }

  if (topCodes.length > 0) {
    why.push(`Die wichtigsten Hindernisse waren ${topCodes.map(code => diagnosisLabels[code]).join(', ')}.`)
  }

  const alternatives = topCodes
    .map(buildDiagnosisAlternative)
    .filter((value, index, array) => array.indexOf(value) === index)

  if (alternatives.length === 0) {
    alternatives.push('Planungsstil anpassen oder einzelne Aufgaben manuell verschieben.')
  }

  let uncertainty: string | null = null
  if (remainingTasks.length > 0) {
    uncertainty = 'Die offenen Aufgaben sind nicht unmoeglich, aber innerhalb der aktuellen Grenzen aus Deadline, Fokuszeit und Kalenderbelegung noch nicht sauber unterzubringen.'
  } else if (schedule.size > 0) {
    uncertainty = 'Mehrere Slots könnten ähnlich gut gewesen sein. Die aktuelle Planung ist die beste verfügbare Option im jetzigen Kalenderstand.'
  }

  return {
    title: remainingTasks.length > 0 ? 'Warum noch nicht alles eingeplant ist' : 'Warum diese Entscheidung?',
    why,
    uncertainty,
    alternatives,
  }
}

function buildRescheduleDecisionTransparency(
  task: Task,
  mode: RescheduleMode,
  succeeded: boolean,
  previousStart?: string,
  newStart?: Date,
): DecisionTransparency {
  const modeLabel = rescheduleModeOptions.find(option => option.value === mode)?.label || mode
  const why = [`"${task.title}" wurde mit dem Modus "${modeLabel}" neu bewertet.`]

  if (succeeded && previousStart && newStart) {
    why.push(describeRescheduleShift(previousStart, newStart))
  } else {
    why.push('Im aktuellen Kalender wurde für diesen Modus noch kein passender Slot gefunden.')
  }

  const alternatives = rescheduleModeOptions
    .filter(option => option.value !== mode)
    .slice(0, 3)
    .map(option => `${option.label}: ${option.description}`)

  return {
    title: succeeded ? 'Warum diese Entscheidung?' : 'Warum noch nicht neu eingeplant',
    why,
    uncertainty: succeeded
      ? 'Je nach spaeteren Kalenderaenderungen koennten noch bessere Alternativen frei werden.'
      : 'Die aktuelle Zeitlage ist eng. Ein anderer Modus oder lockerere Rahmenbedingungen koennen noch helfen.',
    alternatives,
  }
}

function buildDiagnosisAlternative(code: SchedulingDiagnosis['code']) {
  switch (code) {
    case 'dependency':
      return 'Zuerst die blockierende Aufgabe abschließen oder ohne diese Abhängigkeit weiterplanen.'
    case 'deadline':
      return 'Deadline verschieben, Umfang reduzieren oder die Aufgabe manuell hoch priorisieren.'
    case 'deep-work':
      return 'Mehr Fokuszeit freimachen oder den Planungsstil auf Focus-first stellen.'
    case 'work-window':
      return 'Arbeitsfenster erweitern oder Routine-, Schlaf- und Pufferzeiten pruefen.'
    case 'no-slot':
      return 'Den nächsten freien Termin akzeptieren oder die Aufgabe in kleinere Blöcke teilen.'
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
        detail: `Es gibt genug freie Zeit, aber nicht genug Deep-Work-Fenster für ${task.estimatedMinutes} Minuten.`,
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
      detail: `Bis zur Deadline fehlen freie ${task.isDeepWork ? 'Fokus-' : ''}Minuten für ${task.estimatedMinutes} Minuten Aufwand.`,
    }
  }

  return {
    taskId: task.id,
    title: task.title,
    code: 'no-slot',
    severity: 'low',
    summary: 'Kein passender Slot',
    detail: 'Aktuell wurde kein passender freier Block für diese Aufgabe gefunden.',
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

function describeRescheduleShift(previousStart?: string, nextStart?: Date) {
  if (!previousStart || !nextStart) return 'Neuer Termin gesetzt.'

  const oldDate = new Date(previousStart)
  const diffMs = nextStart.getTime() - oldDate.getTime()
  const diffHours = Math.round(Math.abs(diffMs) / (60 * 60 * 1000))
  const diffDays = Math.floor(Math.abs(diffMs) / (24 * 60 * 60 * 1000))

  if (isSameCalendarDay(oldDate, nextStart)) {
    if (diffHours === 0) return 'Fast gleiche Uhrzeit wie vorher.'
    return `Am selben Tag um ca. ${diffHours}h verschoben.`
  }

  if (diffDays === 0) {
    return 'Auf einen spaeteren freien Slot heute verschoben.'
  }

  if (diffDays === 1) {
    return diffMs > 0 ? 'Auf den nächsten Tag verschoben.' : 'Einen Tag früher neu einsortiert.'
  }

  return `${diffDays} Tage ${diffMs > 0 ? 'spaeter' : 'frueher'} neu eingeplant.`
}

function isSameCalendarDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

function matchesActiveFilter(task: Task) {
  if (activeFilter.value === 'all') return true
  if (activeFilter.value === 'open') {
    return task.status === 'todo' || task.status === 'missed' || task.status === 'in_progress'
  }
  if (activeFilter.value === 'scheduled') return task.status === 'scheduled'
  if (activeFilter.value === 'missed') return task.status === 'missed'
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
  prefsOverride: UserPreferences = preferences.value,
) {
  const plannedSchedule = scheduleTasks(
    tasksToSchedule,
    existingEvents,
    prefsOverride,
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

  const confirmed = window.confirm(`Projekt "${projectGroup.name}" wirklich löschen? Alle zugehörigen Aufgaben und geplanten Kalendereinträge werden entfernt.`)
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
      console.warn('Kalender konnte nach Projektlöschung nicht neu geladen werden:', refreshError)
    }

    planningFeedback.value = `Projekt "${projectGroup.name}" wurde gelöscht.`
    addActivityEntry({
      title: 'Projekt gelöscht',
      detail: `"${projectGroup.name}" wurde endgültig gelöscht.`,
    })
  } catch (error) {
    console.error(`Fehler beim Löschen des Projekts "${projectGroup.name}":`, error)
    planningFeedback.value = `Projekt "${projectGroup.name}" konnte nicht gelöscht werden.`
  }
}

async function archiveProjectGroup(groupId: string) {
  const projectGroup = tasksByProject.value.find(group => group.id === groupId)
  if (!projectGroup || groupId === 'inbox') return

  try {
    await archiveProject(groupId)
    planningFeedback.value = `Projekt "${projectGroup.name}" wurde archiviert.`
    addActivityEntry({
      title: 'Projekt archiviert',
      detail: `"${projectGroup.name}" wurde ins Archiv verschoben.`,
      undoLabel: 'Wiederherstellen',
      undo: async () => {
        await restoreProject(groupId)
      },
    })
  } catch (error) {
    console.error(`Fehler beim Archivieren des Projekts "${projectGroup.name}":`, error)
    planningFeedback.value = `Projekt "${projectGroup.name}" konnte nicht archiviert werden.`
  }
}

async function restoreArchivedProject(groupId: string) {
  const projectGroup = archivedTaskGroups.value.find(group => group.id === groupId)
  if (!projectGroup) return

  try {
    await restoreProject(groupId)
    planningFeedback.value = `Projekt "${projectGroup.name}" wurde wieder aktiviert.`
    addActivityEntry({
      title: 'Projekt wiederhergestellt',
      detail: `"${projectGroup.name}" ist wieder aktiv.`,
      undoLabel: 'Erneut archivieren',
      undo: async () => {
        await archiveProject(groupId)
      },
    })
  } catch (error) {
    console.error(`Fehler beim Wiederherstellen des Projekts "${projectGroup.name}":`, error)
    planningFeedback.value = `Projekt "${projectGroup.name}" konnte nicht wiederhergestellt werden.`
  }
}
</script>

<template>
  <Transition name="sidebar">
    <div
      v-if="show || props.persistent"
      :class="props.persistent ? 'relative h-full min-h-0 w-full' : 'fixed inset-0 z-40 flex justify-end bg-black/60 backdrop-blur-sm'"
    >
      <div v-if="!props.persistent" class="absolute inset-0" @click="emit('close')" />

      <div
        :class="props.persistent
          ? 'relative flex h-full min-h-0 w-full flex-col border-l border-border-subtle bg-surface/55 backdrop-blur-glass'
          : 'relative flex h-full w-full max-w-full flex-col border-l border-border-subtle bg-surface/90 shadow-2xl sm:my-4 sm:mr-4 sm:w-[420px] sm:rounded-glass-lg sm:border sm:bg-surface-secondary/85'"
      >
        <div class="border-b border-border-subtle px-4 py-4 sm:px-5">
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span class="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-purple/25 to-accent-blue/20 text-accent-purple shadow-glow-purple">
                  <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 3l2.4 4.86L20 10l-4 3.89L17 20l-5-2.67L7 20l1-6.11L4 10l5.6-2.14L12 3Z" />
                  </svg>
                </span>
                <div>
                  <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent-purple-soft">KI Assistent</p>
                  <h2 class="mt-1 text-lg font-semibold text-text-primary">Aufgabenraum</h2>
                </div>
              </div>
              <p class="mt-3 text-sm leading-6 text-text-secondary">{{ aiHeaderMessage }}</p>
            </div>

            <button
              v-if="!props.persistent"
              type="button"
              class="btn-secondary inline-flex h-10 w-10 items-center justify-center"
              @click="emit('close')"
            >
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div class="mt-4 grid grid-cols-4 gap-2">
            <div class="rounded-glass border border-border-subtle bg-white/[0.04] px-3 py-2 text-center">
              <div class="text-base font-semibold text-text-primary">{{ stats.total }}</div>
              <div class="text-[11px] text-text-muted">Gesamt</div>
            </div>
            <div class="rounded-glass border border-border-subtle bg-white/[0.04] px-3 py-2 text-center">
              <div class="text-base font-semibold text-priority-high">{{ stats.todo }}</div>
              <div class="text-[11px] text-text-muted">Offen</div>
            </div>
            <div class="rounded-glass border border-border-subtle bg-white/[0.04] px-3 py-2 text-center">
              <div class="text-base font-semibold text-accent-blue">{{ stats.scheduled }}</div>
              <div class="text-[11px] text-text-muted">Geplant</div>
            </div>
            <div class="rounded-glass border border-border-subtle bg-white/[0.04] px-3 py-2 text-center">
              <div class="text-base font-semibold text-accent-green">{{ stats.done }}</div>
              <div class="text-[11px] text-text-muted">Erledigt</div>
            </div>
          </div>

          <div class="mt-4 rounded-glass border border-border-subtle bg-white/[0.03] px-3 py-3">
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent-blue">Heute</p>
                <h3 class="mt-2 text-base font-semibold text-text-primary">
                  {{ new Date().toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long' }) }}
                </h3>
              </div>
              <div class="rounded-full border border-border-subtle bg-white/[0.04] px-3 py-1 text-[11px] text-text-secondary">
                {{ todayDoneCount }}/{{ todayDueOrScheduledCount || todayDoneCount }} erledigt
              </div>
            </div>
            <div class="mt-3 grid grid-cols-2 gap-3">
              <div class="rounded-glass border border-border-subtle bg-white/[0.04] px-3 py-3">
                <div class="text-lg font-semibold text-text-primary">{{ todayDueOrScheduledCount }}</div>
                <div class="text-[11px] uppercase tracking-wide text-text-muted">Aufgaben heute</div>
              </div>
              <div class="rounded-glass border border-border-subtle bg-white/[0.04] px-3 py-3">
                <div class="text-lg font-semibold text-accent-green">{{ Math.round((todayRemainingWorkMinutes / 60) * 10) / 10 }}h</div>
                <div class="text-[11px] uppercase tracking-wide text-text-muted">Freie Zeit</div>
              </div>
            </div>
            <div class="mt-3 rounded-glass border border-border-subtle bg-white/[0.04] px-3 py-3">
              <div class="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Nächster Termin</div>
              <p v-if="todayUpcomingEvent" class="mt-2 text-sm font-medium text-text-primary">{{ todayUpcomingEvent.summary }}</p>
              <p v-if="todayUpcomingEvent" class="mt-1 text-xs text-text-secondary">
                {{ formatTaskDateTime(todayUpcomingEvent.start.dateTime || `${todayUpcomingEvent.start.date}T00:00:00`) }}
              </p>
              <p v-else class="mt-2 text-sm text-text-secondary">Heute ist noch kein weiterer Termin im Kalender sichtbar.</p>
            </div>
          </div>
        </div>

        <div class="px-4 py-4 sm:px-5">
          <div class="space-y-3">
            <button
              type="button"
              class="btn-primary flex w-full items-start justify-between gap-4 px-4 py-4 text-left disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="isProcessing || stats.todo === 0"
              @click="handlePrioritize"
            >
              <div>
                <div class="text-sm font-semibold">KI-Priorisierung</div>
                <div class="mt-1 text-xs text-white/80">Aufgaben nach Dringlichkeit sortieren</div>
              </div>
              <svg v-if="isProcessing" class="mt-0.5 h-4 w-4 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </button>

            <button
              type="button"
              class="btn-accent-green flex w-full items-start justify-between gap-4 px-4 py-4 text-left disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="stats.unscheduled === 0"
              @click="handleAutoSchedule"
            >
              <div>
                <div class="text-sm font-semibold">Auto-Planen</div>
                <div class="mt-1 text-xs text-[#0B1020]/80">Freie Zeitslots automatisch füllen</div>
              </div>
              <span class="rounded-full bg-black/10 px-2 py-1 text-[11px] font-medium text-[#0B1020]">
                {{ stats.unscheduled }} offen
              </span>
            </button>

            <button
              type="button"
              class="glass-card group w-full border border-accent-purple/20 p-4 text-left transition hover:-translate-y-0.5 hover:border-accent-purple/35 hover:shadow-glass-hover"
              @click="showProjectGenerator = true"
            >
              <div class="flex items-start justify-between gap-4">
                <div>
                  <div class="text-sm font-semibold text-text-primary">Projekt generieren</div>
                  <div class="mt-1 text-xs text-text-secondary">KI erstellt Aufgaben aus einer Projektbeschreibung</div>
                </div>
                <svg class="h-4 w-4 flex-shrink-0 text-accent-purple transition group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M5 12h14m-6-6 6 6-6 6" />
                </svg>
              </div>
            </button>

            <div class="flex items-center gap-2 overflow-x-auto pb-1">
              <button
                v-for="filter in filterOptions"
                :key="filter.value"
                type="button"
                class="whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
                :class="activeFilter === filter.value
                  ? 'bg-accent-purple/20 text-accent-purple-soft'
                  : 'bg-white/[0.05] text-text-secondary hover:bg-white/[0.08] hover:text-text-primary'"
                @click="activeFilter = filter.value"
              >
                {{ filter.label }}
              </button>
            </div>

            <div
              v-if="aiError"
              class="rounded-glass border border-priority-critical/25 bg-priority-critical/10 px-4 py-3 text-xs text-[#FFD3DC]"
            >
              {{ aiError }}
            </div>

            <div
              v-if="priorityFeedback"
              class="rounded-glass border border-accent-purple/25 bg-accent-purple/10 px-4 py-3 text-xs text-accent-purple-soft"
            >
              {{ priorityFeedback }}
            </div>

            <div
              v-if="planningFeedback"
              class="rounded-glass border border-accent-blue/20 bg-accent-blue/10 px-4 py-3 text-xs text-accent-blue"
            >
              {{ planningFeedback }}
            </div>

            <div
              v-if="calendarSyncStatus"
              class="rounded-glass border px-4 py-3 text-xs"
              :class="calendarSyncStatus.state === 'error'
                ? 'border-priority-critical/25 bg-priority-critical/10 text-[#FFD3DC]'
                : calendarSyncStatus.state === 'success'
                  ? 'border-accent-green/25 bg-accent-green/10 text-accent-green'
                  : 'border-border-subtle bg-white/[0.04] text-text-secondary'"
            >
              Kalenderstatus: {{ calendarSyncStatus.message }}
            </div>

            <div v-if="decisionTransparency" class="glass-card p-4">
              <h3 class="text-xs font-semibold uppercase tracking-[0.22em] text-text-muted">{{ decisionTransparency.title }}</h3>

              <div class="mt-3 space-y-3">
                <div>
                  <div class="text-[11px] font-semibold uppercase tracking-wide text-accent-blue">Warum?</div>
                  <ul class="mt-2 space-y-1 text-xs text-text-secondary">
                    <li v-for="reason in decisionTransparency.why" :key="reason">
                      {{ reason }}
                    </li>
                  </ul>
                </div>

                <div
                  v-if="decisionTransparency.uncertainty"
                  class="rounded-glass border border-priority-high/20 bg-priority-high/10 px-3 py-2 text-xs text-priority-high"
                >
                  Unsicherheit: {{ decisionTransparency.uncertainty }}
                </div>

                <div v-if="decisionTransparency.alternatives.length > 0">
                  <div class="text-[11px] font-semibold uppercase tracking-wide text-accent-green">Alternativen</div>
                  <div class="mt-2 flex flex-wrap gap-1.5">
                    <span
                      v-for="alternative in decisionTransparency.alternatives"
                      :key="alternative"
                      class="rounded-full border border-border-subtle bg-white/[0.04] px-2.5 py-1 text-[11px] text-text-secondary"
                    >
                      {{ alternative }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
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

              <div v-if="schedulingAlternatives[entry.taskId]?.length" class="mt-3 space-y-2">
                <div class="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Direkte Alternativen</div>
                <div class="space-y-2">
                  <button
                    v-for="alternative in schedulingAlternatives[entry.taskId]"
                    :key="`${entry.taskId}-${alternative.start}`"
                    type="button"
                    class="w-full rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-left transition hover:border-emerald-300 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                    :disabled="applyingAlternativeTaskId === entry.taskId"
                    @click="applyAlternativeSlot(entry.taskId, alternative)"
                  >
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-xs font-medium text-emerald-900">{{ alternative.label }}</span>
                      <span class="rounded-full bg-white px-2 py-0.5 text-[10px] uppercase tracking-wide text-emerald-700">
                        Diesen Slot nehmen
                      </span>
                    </div>
                    <p class="mt-1 text-[11px] text-emerald-800">{{ alternative.detail }}</p>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="planVariants.length > 0" class="px-4 pb-2">
        <div class="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <div class="flex items-center justify-between gap-2">
            <div>
              <h3 class="text-xs font-semibold uppercase tracking-wide text-emerald-800">Planvarianten</h3>
              <p class="mt-1 text-xs text-emerald-700">Probier direkt eine andere Strategie für die restlichen Aufgaben aus.</p>
            </div>
            <span class="rounded-full bg-white px-2 py-0.5 text-[11px] text-emerald-700">
              {{ planVariants.length }} Optionen
            </span>
          </div>

          <div class="mt-3 space-y-2">
            <div
              v-for="variant in planVariants"
              :key="variant.style"
              class="rounded-lg border border-emerald-100 bg-white px-3 py-3"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="text-sm font-medium text-gray-900">{{ variant.label }}</span>
                    <span
                      v-if="isRecommendedPlanVariant(variant.style)"
                      class="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800"
                    >
                      Empfohlen
                    </span>
                  </div>
                  <p class="mt-1 text-xs text-gray-500">{{ variant.description }}</p>
                  <div class="mt-2 flex flex-wrap gap-2 text-[11px] text-gray-600">
                    <span class="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">
                      +{{ variant.scheduledCount }} weitere Aufgaben
                    </span>
                    <span class="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">
                      {{ variant.remainingCount }} offen
                    </span>
                  </div>
                  <p class="mt-2 text-xs text-gray-600">{{ variant.highlight }}</p>
                </div>

                <button
                  type="button"
                  class="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  :disabled="applyingVariantStyle === variant.style"
                  @click="applyPlanVariant(variant.style)"
                >
                  {{ applyingVariantStyle === variant.style ? 'Prüft...' : 'Anwenden' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="displacementSuggestions.length > 0" class="px-4 pb-2">
        <div class="rounded-xl border border-violet-200 bg-violet-50 p-3">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-violet-800">Umplan-Vorschau</h3>
          <p class="mt-1 text-xs text-violet-700">Wichtige Aufgaben können auf Wunsch niedrig priorisierte Slots übernehmen.</p>
          <div class="mt-3 space-y-2">
            <button
              v-for="suggestion in displacementSuggestions"
              :key="`${suggestion.incomingTaskId}-${suggestion.displacedTaskId}`"
              type="button"
              class="w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-left transition hover:bg-violet-100"
              @click="previewDisplacement = suggestion"
            >
              <div class="text-xs font-medium text-gray-900">{{ suggestion.incomingTitle }}</div>
              <div class="mt-1 text-[11px] text-violet-800">
                würde {{ suggestion.displacedTitle }} am {{ formatTaskDateTime(suggestion.start) }} verdrängen
              </div>
            </button>
          </div>
        </div>
      </div>

      <div v-if="activityEntries.length > 0" class="px-4 pb-2">
        <div class="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div class="flex items-center justify-between gap-2">
            <div>
              <h3 class="text-xs font-semibold uppercase tracking-wide text-slate-700">Letzte Änderungen</h3>
              <p class="mt-1 text-xs text-slate-500">So siehst du, was automatisch oder direkt verändert wurde.</p>
            </div>
            <span class="rounded-full bg-white px-2 py-0.5 text-[11px] text-slate-600">
              {{ activityEntries.length }} Einträge
            </span>
          </div>

          <div class="mt-3 space-y-2">
            <div
              v-for="entry in activityEntries.slice(0, 5)"
              :key="entry.id"
              class="rounded-lg border border-slate-200 bg-white px-3 py-2"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span class="text-xs font-medium text-slate-900">{{ entry.title }}</span>
                    <span class="text-[11px] text-slate-400">{{ formatActivityTime(entry.createdAt) }}</span>
                  </div>
                  <p class="mt-1 text-xs text-slate-600">{{ entry.detail }}</p>
                </div>

                <button
                  v-if="entry.undo"
                  type="button"
                  class="rounded-md px-2 py-1 text-[11px] text-primary-700 transition hover:bg-primary-50"
                  @click="undoActivity(entry.id)"
                >
                  {{ entry.undoLabel || 'Rückgängig' }}
                </button>
              </div>
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

        <div v-else class="space-y-4">
          <div v-if="filteredTaskGroups.length > 0" class="space-y-4">
            <section v-for="group in filteredTaskGroups" :key="group.id" class="space-y-2">
              <div class="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
                <div class="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    class="flex min-w-0 flex-1 items-start gap-2 text-left"
                    @click="toggleGroup(group.id)"
                  >
                    <svg
                      class="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400 transition-transform"
                      :class="{ 'rotate-90': !isGroupCollapsed(group.id) }"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                    </svg>
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-2">
                        <h3 class="truncate text-xs font-semibold uppercase tracking-wide text-gray-500">{{ group.name }}</h3>
                        <span class="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">
                          {{ projectProgress(group).done }}/{{ projectProgress(group).total }}
                        </span>
                      </div>
                      <div class="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
                        <div
                          class="h-full rounded-full bg-primary-500 transition-all"
                          :style="{ width: `${projectProgress(group).percent}%` }"
                        />
                      </div>
                      <div class="mt-2 flex flex-wrap gap-2 text-[11px] text-gray-500">
                        <span>{{ projectProgress(group).percent }}% erledigt</span>
                        <span>{{ projectRemainingHours(group) }} h Restaufwand</span>
                        <span>{{ getGroupTasks(group).length }} Aufgaben</span>
                      </div>
                      <p v-if="projectNextStep(group)" class="mt-2 text-xs text-gray-600">
                        Nächster Schritt: <span class="font-medium text-gray-800">{{ projectNextStep(group)?.title }}</span>
                      </p>
                      <p v-else class="mt-2 text-xs text-green-700">
                        Projekt abgeschlossen und bereit zum Archivieren.
                      </p>
                      <div
                        v-if="isProjectReviewDue(group) || projectReviewLabel(group.reviewStatus)"
                        class="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2"
                      >
                        <p class="text-[11px] font-semibold uppercase tracking-wide text-sky-800">Projekt-Review</p>
                        <p v-if="projectReviewLabel(group.reviewStatus)" class="mt-1 text-xs text-sky-700">
                          {{ projectReviewLabel(group.reviewStatus) }}
                        </p>
                        <div v-else class="mt-2 flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            class="rounded-full bg-white px-2 py-1 text-[11px] text-sky-700"
                            @click.stop="applyProjectReview(group.id, 'too-big')"
                          >
                            Zu groß
                          </button>
                          <button
                            type="button"
                            class="rounded-full bg-white px-2 py-1 text-[11px] text-sky-700"
                            @click.stop="applyProjectReview(group.id, 'fit')"
                          >
                            Passend
                          </button>
                          <button
                            type="button"
                            class="rounded-full bg-white px-2 py-1 text-[11px] text-sky-700"
                            @click.stop="applyProjectReview(group.id, 'too-small')"
                          >
                            Zu klein
                          </button>
                        </div>
                      </div>
                    </div>
                  </button>
                  <div class="flex flex-shrink-0 items-center gap-1">
                    <button
                      v-if="group.id !== 'inbox' && isProjectCompleted(group)"
                      type="button"
                      class="rounded-md px-2 py-1 text-[11px] text-amber-700 transition hover:bg-amber-50"
                      @click="archiveProjectGroup(group.id)"
                    >
                      Archivieren
                    </button>
                    <button
                      v-if="group.id !== 'inbox'"
                      type="button"
                      class="rounded-md px-2 py-1 text-[11px] text-red-600 transition hover:bg-red-50"
                      @click="removeProject(group.id)"
                    >
                      Löschen
                    </button>
                  </div>
                </div>
              </div>

              <div v-if="!isGroupCollapsed(group.id)" class="space-y-2">
                <div
                  v-for="task in group.tasks"
                  :key="task.id"
                  class="rounded-lg border border-gray-200 p-3 transition-colors hover:border-gray-300 cursor-pointer"
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

                      <div v-if="taskProgressLabel(task)" class="mt-1 text-xs text-sky-600">
                        {{ taskProgressLabel(task) }}
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
                        @click="openRescheduleDialog(task)"
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

          <div
            v-else
            class="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center"
          >
            <p class="text-sm text-gray-500">Keine Aufgaben für den aktuellen Filter gefunden.</p>
          </div>

          <section v-if="archivedTaskGroups.length > 0" class="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <div class="flex items-center justify-between gap-3">
              <button
                type="button"
                class="flex min-w-0 flex-1 items-center gap-2 text-left"
                @click="showArchivedProjects = !showArchivedProjects"
              >
                <svg
                  class="h-4 w-4 flex-shrink-0 text-gray-400 transition-transform"
                  :class="{ 'rotate-90': showArchivedProjects }"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
                <div>
                  <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500">Archivierte Projekte</h3>
                  <p class="mt-1 text-[11px] text-gray-400">{{ archivedTaskGroups.length }} archiviert</p>
                </div>
              </button>
            </div>

            <div v-if="showArchivedProjects" class="mt-3 space-y-2">
              <div
                v-for="group in archivedTaskGroups"
                :key="group.id"
                class="rounded-lg border border-gray-200 bg-white p-3"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <h4 class="text-sm font-medium text-gray-900">{{ group.name }}</h4>
                      <span class="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">
                        {{ projectProgress(group).done }}/{{ projectProgress(group).total }}
                      </span>
                    </div>
                    <div class="mt-1 text-xs text-gray-500">
                      Archiviert am {{ formatArchivedDate(group.archivedAt) || 'unbekannt' }}
                    </div>
                    <div class="mt-2 flex flex-wrap gap-2 text-[11px] text-gray-500">
                      <span>{{ projectProgress(group).percent }}% erledigt</span>
                      <span>{{ projectRemainingHours(group) }} h Restaufwand</span>
                    </div>
                    <p v-if="projectNextStep(group)" class="mt-2 text-xs text-gray-600">
                      Beim Wiederherstellen zuerst: <span class="font-medium text-gray-800">{{ projectNextStep(group)?.title }}</span>
                    </p>
                  </div>

                  <button
                    type="button"
                    class="rounded-md px-2 py-1 text-[11px] text-primary-700 transition hover:bg-primary-50"
                    @click="restoreArchivedProject(group.id)"
                  >
                    Wiederherstellen
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  </div>
  </Transition>

  <!-- Project Generator Modal -->
  <ProjectGenerator
    :show="showProjectGenerator"
    :events="events"
    @close="showProjectGenerator = false"
    @created="showProjectGenerator = false"
  />

  <Teleport to="body">
    <Transition name="modal">
      <div v-if="rescheduleTask" class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
        <div class="absolute inset-0" @click="closeRescheduleDialog" />

        <div class="glass-card-elevated relative w-full max-h-[92vh] overflow-y-auto rounded-t-glass-xl p-6 sm:max-w-md sm:rounded-glass-lg">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.24em] text-accent-purple-soft">Neu einplanen</p>
              <h3 class="mt-2 text-lg font-semibold text-text-primary">Neu einplanen</h3>
              <p class="mt-1 text-sm text-text-secondary">
                Wähle, wie <span class="font-medium text-gray-700">{{ rescheduleTask.title }}</span> neu geplant werden soll.
              </p>
              <p v-if="formatTaskDateTime(rescheduleTask.scheduledStart || rescheduleTask.scheduleBlocks?.[0]?.start)" class="mt-2 text-xs text-text-muted">
                Bisher: {{ formatTaskDateTime(rescheduleTask.scheduledStart || rescheduleTask.scheduleBlocks?.[0]?.start) }}
              </p>
            </div>
            <button class="btn-secondary inline-flex h-10 w-10 items-center justify-center" @click="closeRescheduleDialog">
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div class="mt-4 space-y-2">
            <label
              v-for="option in rescheduleModeOptions"
              :key="option.value"
              class="flex cursor-pointer items-start gap-3 rounded-glass border px-3 py-3 transition-colors"
              :class="selectedRescheduleMode === option.value
                ? 'border-accent-purple/30 bg-accent-purple/12'
                : 'border-border-subtle bg-white/[0.03] hover:border-border-strong hover:bg-white/[0.05]'"
            >
              <input
                v-model="selectedRescheduleMode"
                type="radio"
                class="mt-1 border-border-subtle bg-transparent text-accent-purple focus:ring-accent-purple"
                :value="option.value"
              >
              <div>
                <div class="flex items-center gap-2 text-sm font-medium text-text-primary">
                  <span>{{ option.label }}</span>
                  <span
                    v-if="option.value === 'same-time'"
                    class="rounded-full bg-accent-purple/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-purple-soft"
                  >
                    empfohlen
                  </span>
                </div>
                <div class="mt-1 text-xs text-text-secondary">{{ option.description }}</div>
              </div>
            </label>
          </div>

          <div class="mt-5 flex justify-end gap-2">
            <button
              class="btn-secondary px-4 py-2 text-sm"
              @click="closeRescheduleDialog"
            >
              Abbrechen
            </button>
            <button
              class="btn-primary px-4 py-2 text-sm"
              @click="confirmReschedule"
            >
              Neu einplanen
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <Teleport to="body">
    <Transition name="modal">
      <div v-if="previewDisplacement" class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
        <div class="absolute inset-0" @click="previewDisplacement = null" />

        <div class="glass-card-elevated relative w-full max-h-[92vh] overflow-y-auto rounded-t-glass-xl p-6 sm:max-w-md sm:rounded-glass-lg">
          <p class="text-xs font-semibold uppercase tracking-[0.24em] text-accent-purple-soft">Änderungsvorschau</p>
          <h3 class="mt-2 text-lg font-semibold text-text-primary">Umplanung prüfen</h3>
          <p class="mt-1 text-sm text-text-secondary">
            {{ previewDisplacement.incomingTitle }} würde {{ previewDisplacement.displacedTitle }} verdrängen.
          </p>

          <div class="mt-4 space-y-3">
            <div class="rounded-glass border border-border-subtle bg-white/[0.03] p-3">
              <div class="text-xs font-semibold uppercase tracking-wide text-text-muted">Wird frei gemacht</div>
              <p class="mt-1 text-sm font-medium text-text-primary">{{ previewDisplacement.displacedTitle }}</p>
              <p class="mt-1 text-xs text-text-secondary">{{ formatTaskDateTime(previewDisplacement.start) }}</p>
            </div>

            <div class="rounded-glass border border-accent-purple/20 bg-accent-purple/10 p-3">
              <div class="text-xs font-semibold uppercase tracking-wide text-accent-purple-soft">Wird eingeplant</div>
              <p class="mt-1 text-sm font-medium text-text-primary">{{ previewDisplacement.incomingTitle }}</p>
              <p class="mt-1 text-xs text-text-secondary">{{ formatTaskDateTime(previewDisplacement.start) }}</p>
            </div>
          </div>

          <div class="mt-5 flex justify-end gap-2">
            <button
              class="btn-secondary px-4 py-2 text-sm"
              @click="previewDisplacement = null"
            >
              Abbrechen
            </button>
            <button
              class="btn-primary px-4 py-2 text-sm disabled:opacity-50"
              :disabled="applyingDisplacementId === previewDisplacement.incomingTaskId"
              @click="applyDisplacementSuggestion(previewDisplacement)"
            >
              {{ applyingDisplacementId === previewDisplacement.incomingTaskId ? 'Plant um...' : 'Jetzt umplanen' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
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

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
