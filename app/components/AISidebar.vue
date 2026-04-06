<script setup lang="ts">
import { resolveLifeAreaLabel } from '~/types/task'
import type { LifeArea, PlanningStyle, Task, TaskPriority, UserPreferences } from '~/types/task'
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

const { tasks, projects, getPendingTasks, getUnscheduledTasks, createTask, updateTask, updateProject, deleteTask, deleteProjectWithTasks, archiveProject, restoreProject } = useTasks()
const { prioritizeTasks, isProcessing, aiError } = useAI()
const { scheduleTasks, findFreeSlots } = useScheduler()
const { events: calendarEvents, createEvent, fetchEvents, deleteEvent, syncStatus: calendarSyncStatus, canRetryLastAction, isRetryingLastAction, retryLastAction } = useCalendar()
const { preferences, recordTaskCompletion, recordTaskMiss, getPreferredHours, getDailyCommit, getDailyMode } = usePreferences()

const showProjectGenerator = ref(false)
const activeFilter = ref<'all' | 'open' | 'scheduled' | 'done' | 'missed'>('all')
const collapsedGroups = ref<string[]>([])
const showArchivedProjects = ref(false)
const planningFeedback = ref<string | null>(null)
const planningRecoveryHint = ref<string | null>(null)
const priorityFeedback = ref<string | null>(null)
const decisionTransparency = ref<DecisionTransparency | null>(null)
const isRefreshingPlanningInsights = ref(false)
const planningInsightProfile = ref<PlanningInsightProfile | null>(null)

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
const todayCommit = computed(() => getDailyCommit())
const todayMode = computed(() => getDailyMode())

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
  if (todayMode.value.mode === 'fokussiert') {
    return 'Heute ist ein fokussierter Modus aktiv. Ich ziehe wichtige Hebel und Deep-Work-Themen sichtbar nach vorn.'
  }

  if (todayMode.value.mode === 'entspannt') {
    return 'Heute läuft ein entspannter Modus. Ich bevorzuge machbare Schritte und etwas mehr Puffer.'
  }

  if (todayMode.value.mode === 'wenig-zeit') {
    return 'Heute ist wenig Zeit markiert. Ich denke stärker in kurzen, realistischen Schritten.'
  }

  if (todayMode.value.mode === 'aufholen') {
    return 'Heute läuft ein Aufholmodus. Ich schaue besonders auf Rückstände und enge Deadlines.'
  }

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
const lifeAreaColors: Record<LifeArea, string> = {
  arbeit: 'border-accent-blue/20 bg-accent-blue/10 text-accent-blue',
  privat: 'border-accent-purple/20 bg-accent-purple/10 text-accent-purple-soft',
  gesundheit: 'border-accent-green/20 bg-accent-green/10 text-accent-green',
  lernen: 'border-priority-high/20 bg-priority-high/10 text-priority-high',
  alltag: 'border-border-subtle bg-white/[0.04] text-text-secondary',
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

interface ConflictAction {
  id: 'shorten' | 'split' | 'weekend' | 'extend-deadline'
  label: string
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
  state?: 'preview' | 'recommendation' | 'applied'
  why: string[]
  uncertainty?: string | null
  alternatives: string[]
  nextStep?: string | null
}

interface PlanVariantPreview {
  style: PlanningStyle
  label: string
  description: string
  scheduledCount: number
  remainingCount: number
  highlight: string
}

interface ScheduleReviewItem {
  taskId: string
  title: string
  priority: TaskPriority
  blockCount: number
  totalMinutes: number
  firstStart?: string
  lastEnd?: string
  isDeepWork: boolean
}

interface ScheduleReviewPreview {
  source: 'auto-plan' | 'variant' | 'reschedule'
  label: string
  plannedSchedule: Map<string, ScheduledTaskPlan>
  tasksToSchedule: Task[]
  remainingTasks: Task[]
  items: ScheduleReviewItem[]
  totalBlocks: number
  totalMinutes: number
  contextText?: string
  rescheduleTaskId?: string
  rescheduleMode?: RescheduleMode
  previousStart?: string
}

interface AppliedScheduleResult {
  successfulSchedule: Map<string, ScheduledTaskPlan>
  successCount: number
  failureCount: number
  failedTaskTitles: string[]
  rollbackFailureCount: number
  recoveryHint?: string | null
}

interface PlanningInsightProfile {
  durationMs: number
  taskCount: number
  eventCount: number
}

interface TaskRestoreSnapshot {
  taskId: string
  title: string
  description?: string
  estimatedMinutes: number
  originalEstimatedMinutes?: number
  progressPercent?: number
  status: Task['status']
  scheduleBlocks?: Task['scheduleBlocks']
  scheduledStart?: string
  scheduledEnd?: string
  calendarEventId?: string
  isDeepWork: boolean
}

interface ActivityEntry {
  id: string
  title: string
  detail: string
  createdAt: string
  recoveryHint?: string
  category?: 'planung' | 'projekt' | 'aufgabe' | 'fokus'
  scope?: 'batch' | 'single'
  undoLabel?: string
  undo?: () => Promise<void>
}

interface RecoveryGroup {
  key: string
  label: string
  description: string
  entries: ActivityEntry[]
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
const scheduleReviewPreview = ref<ScheduleReviewPreview | null>(null)
const applyingVariantStyle = ref<PlanningStyle | null>(null)
const applyingAlternativeTaskId = ref<string | null>(null)
const applyingDisplacementId = ref<string | null>(null)
const applyingScheduleReview = ref(false)
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
        'Manuelle Prioritäten einzelner Aufgaben wieder freigeben.',
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
  const preview = buildScheduleReviewPreview(unscheduled, currentEvents, 'Auto-Planen', 'auto-plan')
  const remainingTasks = preview.remainingTasks

  const scheduledCount = preview.plannedSchedule.size
  const unscheduledCount = remainingTasks.length

  if (scheduledCount === 0) {
    await refreshSchedulingInsights(new Map(), remainingTasks, currentEvents)
    const topReasons = planningDiagnostics.value.slice(0, 3).map(entry => `${entry.title} (${entry.summary})`).join(', ')
    planningFeedback.value = `Es konnte aktuell keine Aufgabe in einen freien Slot eingeplant werden.${topReasons ? ` Hauptgruende: ${topReasons}` : ''}`
    addActivityEntry({
      title: 'Auto-Planen',
      detail: 'Keine Aufgabe konnte automatisch eingeplant werden.',
    })
    return
  }

  scheduleReviewPreview.value = preview
  planningFeedback.value = unscheduledCount > 0
    ? `Vorschau bereit: ${scheduledCount} Aufgaben koennten eingeplant werden, ${unscheduledCount} blieben noch offen.`
    : `Vorschau bereit: Alle ${scheduledCount} offenen Aufgaben koennten eingeplant werden.`
  decisionTransparency.value = buildScheduleReviewDecisionTransparency(preview)
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
  await previewReschedule(rescheduleTask.value, selectedRescheduleMode.value)
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

  const scheduleResult = await applyScheduleForTasks([{
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

  const modeLabel = rescheduleModeOptions.find(option => option.value === mode)?.label || 'Neuplanung'
  planningRecoveryHint.value = scheduleResult.recoveryHint || null

  if (scheduleResult.successfulSchedule.has(task.id)) {
    const newStart = scheduleResult.successfulSchedule.get(task.id)?.blocks[0]?.start
    const shiftLabel = describeRescheduleShift(previousStart, newStart)
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

async function previewReschedule(task: Task, mode: RescheduleMode = 'same-time') {
  const previousStart = task.scheduledStart || task.scheduleBlocks?.[0]?.start
  const currentEvents = await refreshCalendarEvents()
  const taskForPreview: Task = {
    ...task,
    status: 'todo',
    scheduleBlocks: undefined,
    scheduledStart: undefined,
    scheduledEnd: undefined,
    calendarEventId: undefined,
  }

  const modeLabel = rescheduleModeOptions.find(option => option.value === mode)?.label || 'Neuplanung'
  const preview = buildScheduleReviewPreview(
    [taskForPreview],
    currentEvents,
    `Neu einplanen (${modeLabel})`,
    'reschedule',
    {
      preferredStartByTaskId: {
        [task.id]: mode === 'same-time' ? previousStart : mode === 'today' ? new Date().toISOString() : undefined,
      },
      rescheduleModeByTaskId: {
        [task.id]: mode,
      },
    },
  )

  if (preview.plannedSchedule.size === 0) {
    planningFeedback.value = `"${task.title}" konnte im Modus "${modeLabel}" noch nicht automatisch neu eingeplant werden.`
    decisionTransparency.value = buildRescheduleDecisionTransparency(task, mode, false, previousStart)
    return
  }

  const previewStart = preview.plannedSchedule.get(task.id)?.blocks[0]?.start
  preview.contextText = previousStart && previewStart
    ? `Bisher ${formatTaskDateTime(previousStart)}, neu voraussichtlich ${formatTaskDateTime(previewStart.toISOString())}. ${describeRescheduleShift(previousStart, previewStart)}`
    : 'Die Aufgabe würde auf einen neuen freien Slot verschoben.'
  preview.rescheduleTaskId = task.id
  preview.rescheduleMode = mode
  preview.previousStart = previousStart

  scheduleReviewPreview.value = preview
  planningFeedback.value = `Vorschau bereit: "${task.title}" kann mit "${modeLabel}" neu eingeplant werden.`
  decisionTransparency.value = buildRescheduleDecisionTransparency(task, mode, true, previousStart, previewStart)
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
  const category = entry.category || inferActivityCategory(entry.title)
  const scope = entry.scope || inferActivityScope(entry.title)
  activityEntries.value = [
    {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      category,
      scope,
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

function formatActivityDate(value: string) {
  return new Date(value).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
  })
}

function inferActivityCategory(title: string): ActivityEntry['category'] {
  if (/projekt/i.test(title)) return 'projekt'
  if (/commit|tages/i.test(title)) return 'fokus'
  if (/planung|planvariante|neuplanung/i.test(title)) return 'planung'
  return 'aufgabe'
}

function inferActivityScope(title: string): ActivityEntry['scope'] {
  if (/auto-planen|planvariante|neuplanung/i.test(title)) return 'batch'
  return 'single'
}

function recoveryGroupMeta(groupKey: string) {
  if (groupKey === 'planung:batch') {
    return {
      label: 'Planungsbatches',
      description: 'Groessere Sammelaenderungen an Kalender und Aufgaben.',
    }
  }

  if (groupKey === 'projekt:single') {
    return {
      label: 'Projektzustand',
      description: 'Archivieren oder Wiederaktivieren von Projekten.',
    }
  }

  if (groupKey === 'aufgabe:single') {
    return {
      label: 'Aufgaben & Slots',
      description: 'Direkte Slot- oder Aufgabenentscheidungen.',
    }
  }

  if (groupKey === 'fokus:single') {
    return {
      label: 'Fokus & Tag',
      description: 'Bewusste Tagesentscheidungen und Fokuswechsel.',
    }
  }

  return {
    label: 'Wiederherstellbar',
    description: 'Letzte wiederherstellbare Aenderungen.',
  }
}

const restorableActivityGroups = computed<RecoveryGroup[]>(() => {
  const restorable = activityEntries.value.filter(entry => entry.undo)
  const grouped = new Map<string, ActivityEntry[]>()

  for (const entry of restorable) {
    const key = `${entry.category || 'aufgabe'}:${entry.scope || 'single'}`
    const entries = grouped.get(key) || []
    entries.push(entry)
    grouped.set(key, entries)
  }

  return [...grouped.entries()]
    .map(([key, entries]) => ({
      key,
      entries,
      ...recoveryGroupMeta(key),
    }))
    .sort((a, b) => {
      const aTime = new Date(a.entries[0]?.createdAt || 0).getTime()
      const bTime = new Date(b.entries[0]?.createdAt || 0).getTime()
      return bTime - aTime
    })
})

function summarizeFailedTitles(titles: readonly string[], maxCount = 2) {
  if (titles.length === 0) return null
  if (titles.length <= maxCount) return titles.join(', ')
  return `${titles.slice(0, maxCount).join(', ')} und ${titles.length - maxCount} weitere`
}

function buildRecoveryHint(result: Pick<AppliedScheduleResult, 'failureCount' | 'rollbackFailureCount' | 'failedTaskTitles'>) {
  if (result.failureCount === 0 && result.rollbackFailureCount === 0) return null

  const failedTitleSummary = summarizeFailedTitles(result.failedTaskTitles)
  if (result.rollbackFailureCount > 0) {
    return failedTitleSummary
      ? `Teilweise fehlgeschlagen bei ${failedTitleSummary}. Einige Kalenderblöcke konnten nicht sauber zurückgerollt werden. Prüfe den Kalenderstatus und nutze bei Bedarf "Erneut versuchen".`
      : 'Ein Teil der Kalenderänderungen konnte nicht sauber zurückgerollt werden. Prüfe den Kalenderstatus und nutze bei Bedarf "Erneut versuchen".'
  }

  return failedTitleSummary
    ? `Nicht alles konnte übernommen werden: ${failedTitleSummary}. Die restlichen Aufgaben bleiben lokal offen und können nach einem Sync erneut geprüft werden.`
    : 'Nicht alle Änderungen konnten übernommen werden. Die restlichen Aufgaben bleiben lokal offen und können nach einem Sync erneut geprüft werden.'
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
  const startedAt = Date.now()
  isRefreshingPlanningInsights.value = true

  try {
    const diagnostics = remainingTasks
      .map(task => diagnoseSchedulingIssue(task, existingEvents))
      .sort(sortSchedulingDiagnosis)

    planningDiagnostics.value = diagnostics
    decisionTransparency.value = buildSchedulingDecisionTransparency(schedule, [...remainingTasks], diagnostics)
    schedulingAlternatives.value = buildSchedulingAlternativesMap(remainingTasks, existingEvents)
    displacementSuggestions.value = buildDisplacementSuggestions(remainingTasks)
    await evaluatePlanVariants(remainingTasks, existingEvents)
    planningInsightProfile.value = {
      durationMs: Date.now() - startedAt,
      taskCount: remainingTasks.length,
      eventCount: existingEvents.length,
    }
  } finally {
    isRefreshingPlanningInsights.value = false
  }
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
    const preview = buildScheduleReviewPreview(
      unscheduled,
      currentEvents,
      variant?.label || style,
      'variant',
      {},
      buildPreferencesForStyle(style),
    )
    const scheduledCount = preview.plannedSchedule.size

    if (scheduledCount === 0) {
      await refreshSchedulingInsights(new Map(), preview.remainingTasks, currentEvents)
      planningFeedback.value = `${variant?.label || style} konnte aktuell keine weiteren Aufgaben einplanen.`
      addActivityEntry({
        title: 'Planvariante getestet',
        detail: `${variant?.label || style} konnte keine weiteren Aufgaben einplanen.`,
      })
      return
    }

    scheduleReviewPreview.value = preview
    planningFeedback.value = preview.remainingTasks.length > 0
      ? `${variant?.label || style} ist als Vorschau bereit: ${scheduledCount} Aufgaben koennten eingeplant werden, ${preview.remainingTasks.length} blieben noch offen.`
      : `${variant?.label || style} ist als Vorschau bereit und koennte alle restlichen Aufgaben einplanen.`
    decisionTransparency.value = buildScheduleReviewDecisionTransparency(preview)
  } finally {
    applyingVariantStyle.value = null
  }
}

function isRecommendedPlanVariant(style: PlanningStyle) {
  const best = planVariants.value[0]
  return best?.style === style && best.scheduledCount > 0
}

function buildScheduleReviewPreview(
  tasksToSchedule: readonly Task[],
  existingEvents: readonly CalendarEvent[],
  label: string,
  source: ScheduleReviewPreview['source'],
  options: ScheduleTaskOptions = {},
  prefsOverride: UserPreferences = preferences.value,
): ScheduleReviewPreview {
  const plannedSchedule = scheduleTasks(
    tasksToSchedule,
    existingEvents,
    prefsOverride,
    options,
  )

  const remainingTasks = tasksToSchedule.filter(task => !plannedSchedule.has(task.id))
  const items = [...plannedSchedule.entries()]
    .map(([taskId, plan]) => {
      const task = tasksToSchedule.find(entry => entry.id === taskId) || tasks.value.find(entry => entry.id === taskId)
      if (!task) return null

      const firstBlock = plan.blocks[0]
      const lastBlock = plan.blocks[plan.blocks.length - 1]
      const totalMinutes = Math.round(
        plan.blocks.reduce((sum, block) => sum + ((block.end.getTime() - block.start.getTime()) / 60000), 0),
      )

      return {
        taskId,
        title: task.title,
        priority: task.priority,
        blockCount: plan.blocks.length,
        totalMinutes,
        firstStart: firstBlock?.start.toISOString(),
        lastEnd: lastBlock?.end.toISOString(),
        isDeepWork: task.isDeepWork,
      } satisfies ScheduleReviewItem
    })
    .filter((item): item is ScheduleReviewItem => item !== null)
    .sort((a, b) => {
      const aStart = a.firstStart ? new Date(a.firstStart).getTime() : Infinity
      const bStart = b.firstStart ? new Date(b.firstStart).getTime() : Infinity
      return aStart - bStart
    })

  const totalBlocks = items.reduce((sum, item) => sum + item.blockCount, 0)
  const totalMinutes = items.reduce((sum, item) => sum + item.totalMinutes, 0)

  return {
    source,
    label,
    plannedSchedule,
    tasksToSchedule: [...tasksToSchedule],
    remainingTasks,
    items,
    totalBlocks,
    totalMinutes,
  }
}

function buildScheduleReviewDecisionTransparency(preview: ScheduleReviewPreview): DecisionTransparency {
  const why = [
    `${preview.items.length} Aufgaben würden mit ${preview.totalBlocks} Kalenderblock${preview.totalBlocks === 1 ? '' : 'en'} eingeplant.`,
    `In Summe würden etwa ${Math.round((preview.totalMinutes / 60) * 10) / 10} Stunden automatisch verteilt.`,
  ]

  if (preview.remainingTasks.length > 0) {
    why.push(`${preview.remainingTasks.length} Aufgaben bleiben trotz dieser Vorschau noch offen.`)
  }

  return {
    title: preview.source === 'reschedule' ? 'Warum diese Neuplanung?' : 'Warum diese Vorschau?',
    state: 'preview',
    why,
    uncertainty: preview.remainingTasks.length > 0
      ? 'Nicht alles passt im aktuellen Horizont. Prüfe die Restaufgaben danach gezielt weiter.'
      : null,
    alternatives: preview.source === 'variant'
      ? ['Andere Planvariante pruefen', 'Direkte Alternativ-Slots einzelner Aufgaben nutzen']
      : preview.source === 'reschedule'
        ? ['Anderen Neuplanungs-Modus waehlen', 'Aufgabe manuell bearbeiten', 'Spaeter erneut pruefen']
        : ['Planvarianten vergleichen', 'Vor dem Anwenden einzelne Aufgaben manuell anpassen'],
    nextStep: preview.remainingTasks.length > 0
      ? 'Vorschau anwenden und die offenen Restaufgaben danach gezielt mit Alternativen oder Planvarianten weiter auflösen.'
      : 'Wenn die Vorschau stimmig wirkt, kannst du die Änderungen jetzt gesammelt anwenden.',
  }
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
      recoveryHint: 'Der vorherige Zustand dieser Aufgabe kann direkt aus der Historie wiederhergestellt werden.',
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

function closeScheduleReview() {
  scheduleReviewPreview.value = null
}

async function confirmScheduleReview() {
  if (!scheduleReviewPreview.value) return

  const preview = scheduleReviewPreview.value
  applyingScheduleReview.value = true
  planningRecoveryHint.value = null

  try {
    const restoreSnapshots = captureTaskRestoreSnapshots(preview.tasksToSchedule.map(task => task.id))

    if (preview.source === 'reschedule' && preview.rescheduleTaskId) {
      const targetTask = tasks.value.find(task => task.id === preview.rescheduleTaskId)
      if (targetTask && preview.rescheduleMode) {
        await clearScheduledTaskBlocks(targetTask)
        recordTaskMiss(preview.previousStart ? new Date(preview.previousStart) : new Date())
        await updateTask(targetTask.id, {
          status: 'missed',
          scheduleBlocks: undefined,
          scheduledStart: undefined,
          scheduledEnd: undefined,
          calendarEventId: undefined,
        })
      }
    }

    const scheduleResult = await applyPlannedSchedule(preview.plannedSchedule, preview.tasksToSchedule)
    const schedule = scheduleResult.successfulSchedule

    if (preview.source === 'reschedule' && scheduleResult.successCount === 0 && scheduleResult.failureCount > 0) {
      await restoreTaskSnapshots(restoreSnapshots)
      const restoredEvents = await refreshCalendarEvents()
      await refreshSchedulingInsights(new Map(), getUnscheduledTasks(), restoredEvents)
      planningRecoveryHint.value = scheduleResult.recoveryHint || 'Die ursprüngliche Planung wurde wiederhergestellt, weil die Neuplanung nicht sauber gespeichert werden konnte.'
      planningFeedback.value = 'Die Neuplanung konnte nicht übernommen werden. Der vorherige Zustand wurde automatisch wiederhergestellt.'
      closeScheduleReview()
      return
    }

    const updatedEvents = [...calendarEvents.value]
    await refreshSchedulingInsights(schedule, preview.remainingTasks, updatedEvents)
    planningRecoveryHint.value = scheduleResult.recoveryHint || null

    if (preview.source === 'reschedule') {
      const item = preview.items[0]
      planningFeedback.value = item
        ? scheduleResult.failureCount > 0
          ? `"${item.title}" wurde nach Vorschau neu eingeplant, aber ${scheduleResult.failureCount} Teilfehler sind aufgetreten.`
          : `"${item.title}" wurde nach Vorschau neu eingeplant.`
        : 'Aufgabe wurde nach Vorschau neu eingeplant.'
    } else if (preview.remainingTasks.length > 0 || scheduleResult.failureCount > 0) {
      planningFeedback.value = `${preview.label} hat ${scheduleResult.successCount} Aufgaben eingeplant, ${preview.remainingTasks.length + scheduleResult.failureCount} bleiben noch offen.`
    } else {
      planningFeedback.value = `${preview.label} hat alle ${scheduleResult.successCount} Aufgaben erfolgreich eingeplant.`
    }

    addActivityEntry({
      title: preview.source === 'variant'
        ? 'Planvariante angewendet'
        : preview.source === 'reschedule'
          ? 'Neuplanung bestätigt'
          : 'Auto-Planen bestätigt',
      detail: preview.source === 'reschedule'
        ? scheduleResult.failureCount > 0
          ? `${preview.label}: neue Zeit übernommen, aber mit ${scheduleResult.failureCount} Teilfehlern.`
          : `${preview.label}: neue Zeit wurde nach Vorschau übernommen.`
        : preview.remainingTasks.length > 0
          ? `${preview.label}: ${scheduleResult.successCount} eingeplant, ${preview.remainingTasks.length + scheduleResult.failureCount} weiter offen.`
          : `${preview.label}: ${scheduleResult.successCount} Aufgaben erfolgreich eingeplant.`,
      recoveryHint: scheduleResult.recoveryHint || 'Diese Sammeländerung kann über die Historie zurück auf den vorherigen Task- und Kalenderzustand gesetzt werden.',
      undoLabel: 'Rückgängig',
      undo: async () => {
        await restoreTaskSnapshots(restoreSnapshots)
        const restoredEvents = await refreshCalendarEvents()
        await refreshSchedulingInsights(new Map(), getUnscheduledTasks(), restoredEvents)
      },
    })

    closeScheduleReview()
  } finally {
    applyingScheduleReview.value = false
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
      tasks: group.tasks
        .filter(matchesActiveFilter)
        .sort(sortTasksForDisplay),
    }))
    .filter(group => group.tasks.length > 0)
})

function sortTasksForDisplay(a: Task, b: Task) {
  const aCommitRank = getDailyCommitRank(a)
  const bCommitRank = getDailyCommitRank(b)
  if (aCommitRank !== bCommitRank) return aCommitRank - bCommitRank

  const statusOrder: Record<Task['status'], number> = {
    todo: 0,
    missed: 1,
    scheduled: 2,
    in_progress: 3,
    done: 4,
  }

  if (statusOrder[a.status] !== statusOrder[b.status]) {
    return statusOrder[a.status] - statusOrder[b.status]
  }

  const priorityDiff = priorityRank[b.priority] - priorityRank[a.priority]
  if (priorityDiff !== 0) return priorityDiff

  const aDeadline = a.deadline ? new Date(a.deadline).getTime() : Infinity
  const bDeadline = b.deadline ? new Date(b.deadline).getTime() : Infinity
  return aDeadline - bDeadline
}

function taskStatusLabel(task: Task) {
  if (task.status === 'done') return 'Erledigt'
  if (task.status === 'scheduled') return 'Eingeplant'
  if (task.status === 'missed') return 'Neu planen'
  return 'Offen'
}

function normalizeLifeAreaText(value: string) {
  return value
    .toLocaleLowerCase('de-DE')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
}

function inferLifeArea(task: Task): LifeArea {
  if (task.lifeArea) return task.lifeArea

  const haystack = normalizeLifeAreaText(`${task.title} ${task.description || ''}`)

  if (/(arzt|gym|sport|training|laufen|schlaf|gesund|routine|fitness)/.test(haystack)) return 'gesundheit'
  if (/(lernen|uni|schule|kurs|lesen|review|recherche|studium|pruefung)/.test(haystack)) return 'lernen'
  if (/(treffen|familie|freunde|essen|date|feier|privat|bro)/.test(haystack)) return 'privat'
  if (/(rechnung|haushalt|putzen|einkauf|orga|alltag|wohnung|kuche|kuendigen)/.test(haystack)) return 'alltag'

  return 'arbeit'
}

function formatHourLabel(hour: number) {
  return `${hour.toString().padStart(2, '0')}:00`
}

function getTaskPersonalHint(task: Task) {
  const preferredHours = getPreferredHours(task.isDeepWork)
  if (preferredHours.length === 0) return null

  const firstHour = preferredHours[0]
  const scheduledHour = task.scheduledStart ? new Date(task.scheduledStart).getHours() : null

  if (scheduledHour !== null && preferredHours.includes(scheduledHour)) {
    return `Persönlich: Dieser Slot liegt in deiner starken Zeit rund um ${formatHourLabel(scheduledHour)}.`
  }

  if (task.isDeepWork) {
    return `Persönlich: Fokusaufgaben gelingen dir oft rund um ${formatHourLabel(firstHour)}.`
  }

  return `Persönlich: Abschlüsse gelingen dir aktuell häufig rund um ${formatHourLabel(firstHour)}.`
}

const sidebarPersonalGuidance = computed(() => {
  const preferredHours = getPreferredHours(false)
  const deepHours = getPreferredHours(true)
  const visibleTasks = getPendingTasks().filter(task => task.status !== 'done')
  const grouped = new Map<LifeArea, number>()

  for (const task of visibleTasks) {
    const area = inferLifeArea(task)
    grouped.set(area, (grouped.get(area) || 0) + (task.priority === 'critical' || task.priority === 'high' ? 2 : 1))
  }

  const leadArea = [...grouped.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null

  if (!leadArea && preferredHours.length === 0 && deepHours.length === 0) {
    return null
  }

  const parts: string[] = []
  if (leadArea) {
    parts.push(`${resolveLifeAreaLabel(leadArea)} zieht heute sichtbar mehr Aufmerksamkeit.`)
  }
  if (preferredHours[0] !== undefined) {
    parts.push(`Starke Abschlusszeit: ${formatHourLabel(preferredHours[0])}.`)
  }
  if (deepHours[0] !== undefined) {
    parts.push(`Deep Work eher bei ${formatHourLabel(deepHours[0])}.`)
  }

  return parts.join(' ')
})

function getDailyCommitRank(task: Task) {
  if (todayCommit.value.committedTaskIds.includes(task.id)) return 0
  if (todayCommit.value.deferredTaskIds.includes(task.id)) return 2
  return 1
}

function isTodayCommitted(task: Task) {
  return todayCommit.value.committedTaskIds.includes(task.id)
}

function isTodayDeferred(task: Task) {
  return todayCommit.value.deferredTaskIds.includes(task.id)
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
    'Prioritäten manuell anpassen, wenn deine echte Reihenfolge anders ist.',
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
    state: 'recommendation',
    why,
    uncertainty,
    alternatives,
    nextStep: 'Prüfe danach per Auto-Planen, ob die Reihenfolge auch im Kalender wirklich tragfähig ist.',
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
    uncertainty = 'Die offenen Aufgaben sind nicht unmöglich, aber innerhalb der aktuellen Grenzen aus Deadline, Fokuszeit und Kalenderbelegung noch nicht sauber unterzubringen.'
  } else if (schedule.size > 0) {
    uncertainty = 'Mehrere Slots könnten ähnlich gut gewesen sein. Die aktuelle Planung ist die beste verfügbare Option im jetzigen Kalenderstand.'
  }

  return {
    title: remainingTasks.length > 0 ? 'Warum noch nicht alles eingeplant ist' : 'Warum diese Entscheidung?',
    state: remainingTasks.length > 0 ? 'recommendation' : 'applied',
    why,
    uncertainty,
    alternatives,
    nextStep: remainingTasks.length > 0
      ? 'Nutze Planvarianten oder direkte Alternativ-Slots für die offenen Aufgaben.'
      : 'Prüfe die neuen Kalenderblöcke kurz und arbeite dann mit der nächsten Fokusaufgabe weiter.',
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
    state: succeeded ? 'applied' : 'recommendation',
    why,
    uncertainty: succeeded
      ? 'Je nach späteren Kalenderänderungen könnten noch bessere Alternativen frei werden.'
      : 'Die aktuelle Zeitlage ist eng. Ein anderer Modus oder lockerere Rahmenbedingungen können noch helfen.',
    alternatives,
    nextStep: succeeded
      ? 'Wenn der neue Zeitpunkt nicht passt, kannst du direkt einen anderen Reschedule-Modus ausprobieren.'
      : 'Probiere einen anderen Reschedule-Modus oder lockere die Zeitgrenzen für diese Aufgabe.',
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

function getConflictActions(entry: SchedulingDiagnosis): ConflictAction[] {
  const task = tasks.value.find(candidate => candidate.id === entry.taskId)
  if (!task || task.status === 'done') return []

  const actions: ConflictAction[] = []

  if (task.estimatedMinutes >= 45) {
    actions.push({
      id: 'shorten',
      label: 'Aufgabe kürzen',
      detail: 'Reduziert den offenen Aufwand lokal um 25% und prüft danach erneut.',
    })
  }

  if (task.estimatedMinutes >= 90) {
    actions.push({
      id: 'split',
      label: 'In 2 Blöcke teilen',
      detail: 'Teilt die Aufgabe in zwei Schritte und macht sie dadurch planbarer.',
    })
  }

  if (entry.code === 'deadline' || entry.code === 'work-window' || entry.code === 'no-slot') {
    actions.push({
      id: 'weekend',
      label: 'Auf Wochenende legen',
      detail: 'Prüft einen Wochenend-Slot als Vorschau, ohne sofort etwas zu verändern.',
    })
  }

  if (task.deadline) {
    actions.push({
      id: 'extend-deadline',
      label: 'Deadline lockern',
      detail: 'Schiebt die Deadline lokal um einen Tag nach hinten.',
    })
  }

  return actions.slice(0, 4)
}

async function applyConflictAction(entry: SchedulingDiagnosis, actionId: ConflictAction['id']) {
  const task = tasks.value.find(candidate => candidate.id === entry.taskId)
  if (!task) return

  if (actionId === 'shorten') {
    const originalMinutes = task.originalEstimatedMinutes || task.estimatedMinutes
    const reducedMinutes = Math.max(30, Math.ceil((task.estimatedMinutes * 0.75) / 15) * 15)
    if (reducedMinutes >= task.estimatedMinutes) return

    await updateTask(task.id, {
      estimatedMinutes: reducedMinutes,
      originalEstimatedMinutes: originalMinutes,
    })
    const refreshedEvents = await refreshCalendarEvents()
    await refreshSchedulingInsights(new Map(), getUnscheduledTasks(), refreshedEvents)
    planningFeedback.value = `"${task.title}" wurde lokal auf ${reducedMinutes} Minuten gekürzt.`
    addActivityEntry({
      title: 'Aufgabe gekürzt',
      detail: `"${task.title}" wurde von ${task.estimatedMinutes} auf ${reducedMinutes} Minuten reduziert.`,
    })
    return
  }

  if (actionId === 'split') {
    const originalMinutes = task.originalEstimatedMinutes || task.estimatedMinutes
    const firstPartMinutes = Math.max(30, Math.ceil((task.estimatedMinutes / 2) / 15) * 15)
    const secondPartMinutes = Math.max(30, task.estimatedMinutes - firstPartMinutes)
    if (secondPartMinutes < 30) return

    await updateTask(task.id, {
      estimatedMinutes: firstPartMinutes,
      originalEstimatedMinutes: originalMinutes,
    })

    await createTask({
      title: `${task.title} (Teil 2)`,
      description: task.description,
      estimatedMinutes: secondPartMinutes,
      originalEstimatedMinutes: originalMinutes,
      progressPercent: 0,
      deadline: task.deadline,
      priority: task.priority,
      aiSuggestedPriority: task.aiSuggestedPriority,
      priorityReason: task.priorityReason,
      prioritySource: task.prioritySource,
      status: 'todo',
      projectId: task.projectId,
      dependencies: [...task.dependencies, task.id],
      scheduleBlocks: undefined,
      scheduledStart: undefined,
      scheduledEnd: undefined,
      calendarEventId: undefined,
      isDeepWork: task.isDeepWork,
    })

    const refreshedEvents = await refreshCalendarEvents()
    await refreshSchedulingInsights(new Map(), getUnscheduledTasks(), refreshedEvents)
    planningFeedback.value = `"${task.title}" wurde in zwei Schritte aufgeteilt.`
    addActivityEntry({
      title: 'Aufgabe geteilt',
      detail: `"${task.title}" wurde in ${firstPartMinutes} und ${secondPartMinutes} Minuten aufgeteilt.`,
    })
    return
  }

  if (actionId === 'extend-deadline') {
    if (!task.deadline) return
    const relaxedDeadline = new Date(task.deadline)
    relaxedDeadline.setDate(relaxedDeadline.getDate() + 1)
    await updateTask(task.id, { deadline: relaxedDeadline.toISOString() })
    const refreshedEvents = await refreshCalendarEvents()
    await refreshSchedulingInsights(new Map(), getUnscheduledTasks(), refreshedEvents)
    planningFeedback.value = `Die Deadline von "${task.title}" wurde lokal um einen Tag verschoben.`
    addActivityEntry({
      title: 'Deadline gelockert',
      detail: `"${task.title}" endet jetzt am ${relaxedDeadline.toLocaleDateString('de-DE')}.`,
    })
    return
  }

  if (actionId === 'weekend') {
    const currentEvents = await refreshCalendarEvents()
    const weekendPrefs: UserPreferences = {
      ...preferences.value,
      workDays: [...new Set([...preferences.value.workDays, 0, 6])].sort(),
    }
    const preview = buildScheduleReviewPreview(
      [{ ...task, status: 'todo' }],
      currentEvents,
      `Wochenend-Slot für ${task.title}`,
      'variant',
      {},
      weekendPrefs,
    )

    if (preview.plannedSchedule.size === 0) {
      planningFeedback.value = `Für "${task.title}" wurde selbst mit Wochenende noch kein sauberer Slot gefunden.`
      return
    }

    scheduleReviewPreview.value = preview
    planningFeedback.value = `Vorschau bereit: "${task.title}" könnte über das Wochenende eingeplant werden.`
    decisionTransparency.value = buildScheduleReviewDecisionTransparency(preview)
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
    return 'Auf einen späteren freien Slot heute verschoben.'
  }

  if (diffDays === 1) {
    return diffMs > 0 ? 'Auf den nächsten Tag verschoben.' : 'Einen Tag früher neu einsortiert.'
  }

  return `${diffDays} Tage ${diffMs > 0 ? 'später' : 'früher'} neu eingeplant.`
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

  return applyPlannedSchedule(plannedSchedule, tasksToSchedule)
}

async function clearScheduledTaskBlocks(task: Task) {
  const calendarIds = task.scheduleBlocks?.map(block => block.calendarEventId).filter(Boolean) || []

  if (calendarIds.length > 0) {
    for (const calendarId of calendarIds) {
      await deleteEvent(calendarId!)
    }
    return
  }

  if (task.calendarEventId) {
    await deleteEvent(task.calendarEventId)
  }
}

function captureTaskRestoreSnapshots(taskIds: readonly string[]): TaskRestoreSnapshot[] {
  return taskIds
    .map((taskId) => {
      const task = tasks.value.find(entry => entry.id === taskId)
      if (!task) return null

      return {
        taskId: task.id,
        title: task.title,
        description: task.description,
        estimatedMinutes: task.estimatedMinutes,
        originalEstimatedMinutes: task.originalEstimatedMinutes,
        progressPercent: task.progressPercent,
        status: task.status,
        scheduleBlocks: task.scheduleBlocks ? [...task.scheduleBlocks] : undefined,
        scheduledStart: task.scheduledStart,
        scheduledEnd: task.scheduledEnd,
        calendarEventId: task.calendarEventId,
        isDeepWork: task.isDeepWork,
      } satisfies TaskRestoreSnapshot
    })
    .filter((snapshot): snapshot is TaskRestoreSnapshot => snapshot !== null)
}

async function restoreTaskSnapshots(snapshots: readonly TaskRestoreSnapshot[]) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone

  for (const snapshot of snapshots) {
    const currentTask = tasks.value.find(task => task.id === snapshot.taskId)
    if (!currentTask) continue

    await clearScheduledTaskBlocks(currentTask)

    let restoredBlocks: Array<{ start: string; end: string; calendarEventId?: string }> | undefined
    let restoredCalendarEventId: string | undefined

    if (snapshot.scheduleBlocks && snapshot.scheduleBlocks.length > 0) {
      restoredBlocks = []

      for (const [index, block] of snapshot.scheduleBlocks.entries()) {
        const restoredEvent = await createEvent({
          summary: snapshot.scheduleBlocks.length > 1 ? `${snapshot.title} (${index + 1}/${snapshot.scheduleBlocks.length})` : snapshot.title,
          description: `[KALENDER-AI-TASK:${snapshot.taskId}]\n${snapshot.description || ''}`,
          start: { dateTime: block.start, timeZone: tz },
          end: { dateTime: block.end, timeZone: tz },
          colorId: snapshot.isDeepWork ? '3' : '9',
        })

        restoredBlocks.push({
          start: block.start,
          end: block.end,
          calendarEventId: restoredEvent?.id,
        })
      }

      restoredCalendarEventId = restoredBlocks[0]?.calendarEventId
    }

    await updateTask(snapshot.taskId, {
      status: snapshot.status,
      estimatedMinutes: snapshot.estimatedMinutes,
      originalEstimatedMinutes: snapshot.originalEstimatedMinutes,
      progressPercent: snapshot.progressPercent,
      scheduleBlocks: restoredBlocks,
      scheduledStart: snapshot.scheduledStart,
      scheduledEnd: snapshot.scheduledEnd,
      calendarEventId: restoredCalendarEventId,
    })
  }
}

async function applyPlannedSchedule(
  plannedSchedule: Map<string, ScheduledTaskPlan>,
  tasksToSchedule: readonly Task[],
): Promise<AppliedScheduleResult> {

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const successfulSchedule = new Map<string, ScheduledTaskPlan>()
  let successCount = 0
  let failCount = 0
  let rollbackFailureCount = 0
  const failedTaskTitles: string[] = []

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
        const rolledBack = await deleteEvent(calendarId!)
        if (!rolledBack) {
          rollbackFailureCount++
        }
      }
      console.error(`Fehler beim Einplanen von Task "${task.title}":`, err)
      failCount++
      failedTaskTitles.push(task.title)
    }
  }

  const now = new Date()
  const rangeStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const rangeEnd = new Date(now.getFullYear(), now.getMonth() + 4, 0)
  await fetchEvents(rangeStart.toISOString(), rangeEnd.toISOString())

  return {
    successfulSchedule,
    successCount,
    failureCount: failCount,
    failedTaskTitles,
    rollbackFailureCount,
    recoveryHint: buildRecoveryHint({
      failureCount: failCount,
      rollbackFailureCount,
      failedTaskTitles,
    }),
  }
}

async function refreshCalendarEvents() {
  const now = new Date()
  const rangeStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const rangeEnd = new Date(now.getFullYear(), now.getMonth() + 4, 0)
  const refreshed = await fetchEvents(rangeStart.toISOString(), rangeEnd.toISOString())
  if (!refreshed) {
    planningRecoveryHint.value = 'Der Kalender konnte nach der letzten Änderung nicht vollständig nachgeladen werden. Die lokale Aufgabenliste bleibt erhalten, aber prüfe den Sync-Status.'
  }
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
      recoveryHint: 'Das Projekt kann direkt aus der Historie wieder aktiviert werden.',
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
      recoveryHint: 'Falls das Projekt doch noch ruhen soll, kannst du es von hier erneut archivieren.',
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

async function handleRetryCalendarAction() {
  const retried = await retryLastAction()
  if (retried) {
    planningRecoveryHint.value = null
  }
}
</script>

<template>
  <Transition name="sidebar">
    <div
      v-if="show || props.persistent"
      :class="props.persistent ? 'relative h-full min-h-0 w-full' : 'fixed inset-0 z-40 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-stretch sm:justify-end'"
    >
      <div v-if="!props.persistent" class="absolute inset-0" @click="emit('close')" />

      <div
        :class="props.persistent
          ? 'relative flex h-full min-h-0 w-full flex-col border-l border-border-subtle bg-surface/55 backdrop-blur-glass'
          : 'relative flex h-[100dvh] w-full max-w-full flex-col overflow-hidden bg-surface/95 shadow-2xl sm:my-4 sm:mr-4 sm:h-[calc(100dvh-2rem)] sm:w-[420px] sm:rounded-glass-lg sm:border sm:border-border-subtle sm:bg-surface-secondary/85'"
      >
        <div class="sticky top-0 z-10 border-b border-border-subtle bg-surface/88 px-4 py-4 backdrop-blur-glass sm:bg-transparent sm:px-5">
          <div class="flex items-start justify-between gap-4">
            <div v-if="!props.persistent" class="absolute left-1/2 top-2 h-1.5 w-14 -translate-x-1/2 rounded-full bg-white/12 sm:hidden" />
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

          <div class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
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
            <div class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
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
              v-if="planningRecoveryHint"
              class="rounded-glass border border-priority-high/20 bg-priority-high/10 px-4 py-3 text-xs text-priority-high"
            >
              {{ planningRecoveryHint }}
            </div>

            <div
              v-if="isRefreshingPlanningInsights"
              class="rounded-glass border border-border-subtle bg-white/[0.04] px-4 py-3 text-xs text-text-secondary"
            >
              Planungsanalyse wird aktualisiert. Bei vielen Aufgaben und Kalenderevents kann das kurz dauern.
            </div>

            <div
              v-else-if="planningInsightProfile && planningInsightProfile.durationMs >= 250"
              class="rounded-glass border border-border-subtle bg-white/[0.03] px-4 py-3 text-[11px] text-text-muted"
            >
              Letzte Analyse: {{ planningInsightProfile.taskCount }} Aufgaben, {{ planningInsightProfile.eventCount }} Kalenderevents, {{ planningInsightProfile.durationMs }} ms.
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
              <div class="flex items-center justify-between gap-3">
                <span>Kalenderstatus: {{ calendarSyncStatus.message }}</span>
                <button
                  v-if="calendarSyncStatus.state === 'error' && canRetryLastAction"
                  type="button"
                  class="rounded-full border border-priority-critical/30 bg-priority-critical/10 px-3 py-1 text-[11px] font-medium text-[#FFD3DC] transition hover:bg-priority-critical/15 disabled:opacity-60"
                  :disabled="isRetryingLastAction"
                  @click="handleRetryCalendarAction"
                >
                  {{ isRetryingLastAction ? 'Versuche erneut...' : 'Erneut versuchen' }}
                </button>
              </div>
            </div>

            <DecisionSummaryCard
              v-if="decisionTransparency"
              :title="decisionTransparency.title"
              :mode-label="decisionTransparency.state === 'preview'
                ? 'Vorschau'
                : decisionTransparency.state === 'applied'
                  ? 'Angewendet'
                  : 'Empfehlung'"
              :tone="decisionTransparency.state === 'preview'
                ? 'preview'
                : decisionTransparency.state === 'applied'
                  ? 'success'
                  : 'neutral'"
              :why="decisionTransparency.why"
              :uncertainty="decisionTransparency.uncertainty"
              :alternatives="decisionTransparency.alternatives"
              :next-step="decisionTransparency.nextStep"
            />

            <div
              v-if="todayCommit.committedTaskIds.length > 0"
              class="rounded-glass border border-accent-purple/20 bg-accent-purple/10 px-4 py-3 text-xs text-text-secondary"
            >
              <div class="flex items-center justify-between gap-3">
                <div>
                  <div class="text-[11px] font-semibold uppercase tracking-wide text-accent-purple-soft">Tages-Commit aktiv</div>
                  <div class="mt-1">
                    {{ todayCommit.committedTaskIds.length }} Aufgabe{{ todayCommit.committedTaskIds.length === 1 ? '' : 'n' }} im Fokus,
                    {{ todayCommit.deferredTaskIds.length }} bewusst nicht für heute.
                  </div>
                </div>
                <span class="rounded-full border border-accent-purple/20 bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-purple-soft">
                  Heute
                </span>
              </div>
            </div>

            <div
              v-if="sidebarPersonalGuidance"
              class="rounded-glass border border-accent-blue/20 bg-accent-blue/10 px-4 py-3 text-xs text-text-secondary"
            >
              <div class="text-[11px] font-semibold uppercase tracking-wide text-accent-blue">Persönlicher Hinweis</div>
              <div class="mt-1 leading-5">{{ sidebarPersonalGuidance }}</div>
            </div>
          </div>
        </div>

      <div v-if="planningDiagnostics.length > 0" class="px-4 pb-2">
        <div class="glass-card border border-priority-high/20 p-3">
          <div class="flex items-center justify-between gap-2">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-priority-high">Planungsanalyse</h3>
            <div class="flex flex-wrap gap-1">
              <span
                v-for="code in [...new Set(planningDiagnostics.map(entry => entry.code))]"
                :key="code"
                class="rounded-full border border-priority-high/20 bg-priority-high/10 px-2 py-0.5 text-[11px] text-priority-high"
              >
                {{ diagnosisLabels[code] }}: {{ planningDiagnostics.filter(entry => entry.code === code).length }}
              </span>
            </div>
          </div>

          <div class="mt-3 space-y-2">
            <div
              v-for="entry in planningDiagnostics.slice(0, 5)"
              :key="entry.taskId"
              class="rounded-glass border border-border-subtle bg-white/[0.03] px-3 py-3"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="text-xs font-medium text-text-primary">{{ entry.title }}</span>
                <span class="rounded-full px-2 py-0.5 text-[11px]"
                  :class="entry.severity === 'high'
                    ? 'border border-priority-critical/20 bg-priority-critical/10 text-priority-critical'
                    : entry.severity === 'medium'
                      ? 'border border-priority-high/20 bg-priority-high/10 text-priority-high'
                      : 'border border-border-subtle bg-white/[0.04] text-text-secondary'"
                >
                  {{ entry.summary }}
                </span>
              </div>
              <p class="mt-1 text-xs text-text-secondary">{{ entry.detail }}</p>

              <div v-if="schedulingAlternatives[entry.taskId]?.length" class="mt-3 space-y-2">
                <div class="text-[11px] font-semibold uppercase tracking-wide text-accent-green">Direkte Alternativen</div>
                <div class="space-y-2">
                  <button
                    v-for="alternative in schedulingAlternatives[entry.taskId]"
                    :key="`${entry.taskId}-${alternative.start}`"
                    type="button"
                    class="w-full rounded-glass border border-accent-green/20 bg-accent-green/10 px-3 py-2 text-left transition hover:border-accent-green/35 hover:bg-accent-green/15 disabled:cursor-not-allowed disabled:opacity-50"
                    :disabled="applyingAlternativeTaskId === entry.taskId"
                    @click="applyAlternativeSlot(entry.taskId, alternative)"
                  >
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-xs font-medium text-text-primary">{{ alternative.label }}</span>
                      <span class="rounded-full border border-accent-green/25 bg-white/[0.06] px-2 py-0.5 text-[10px] uppercase tracking-wide text-accent-green">
                        Diesen Slot nehmen
                      </span>
                    </div>
                    <p class="mt-1 text-[11px] text-text-secondary">{{ alternative.detail }}</p>
                  </button>
                </div>
              </div>

              <div v-if="getConflictActions(entry).length" class="mt-3 space-y-2">
                <div class="text-[11px] font-semibold uppercase tracking-wide text-accent-purple-soft">Direkte Lösungen</div>
                <div class="grid gap-2">
                  <button
                    v-for="action in getConflictActions(entry)"
                    :key="`${entry.taskId}-${action.id}`"
                    type="button"
                    class="w-full rounded-glass border border-accent-purple/20 bg-accent-purple/10 px-3 py-2 text-left transition hover:border-accent-purple/35 hover:bg-accent-purple/15"
                    @click="applyConflictAction(entry, action.id)"
                  >
                    <div class="text-xs font-medium text-text-primary">{{ action.label }}</div>
                    <div class="mt-1 text-[11px] text-text-secondary">{{ action.detail }}</div>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="planVariants.length > 0" class="px-4 pb-2">
        <div class="glass-card border border-accent-green/20 p-3">
          <div class="flex items-center justify-between gap-2">
            <div>
              <h3 class="text-xs font-semibold uppercase tracking-wide text-accent-green">Planvarianten</h3>
              <p class="mt-1 text-xs text-text-secondary">Probier direkt eine andere Strategie für die restlichen Aufgaben aus.</p>
            </div>
            <span class="rounded-full border border-accent-green/20 bg-accent-green/10 px-2 py-0.5 text-[11px] text-accent-green">
              {{ planVariants.length }} Optionen
            </span>
          </div>

          <div class="mt-3 space-y-2">
            <div
              v-for="variant in planVariants"
              :key="variant.style"
              class="rounded-glass border border-border-subtle bg-white/[0.03] px-3 py-3"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="text-sm font-medium text-text-primary">{{ variant.label }}</span>
                    <span
                      v-if="isRecommendedPlanVariant(variant.style)"
                      class="rounded-full border border-accent-green/25 bg-accent-green/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-green"
                    >
                      Empfohlen
                    </span>
                  </div>
                  <p class="mt-1 text-xs text-text-secondary">{{ variant.description }}</p>
                  <div class="mt-2 flex flex-wrap gap-2 text-[11px] text-text-secondary">
                    <span class="rounded-full border border-accent-green/20 bg-accent-green/10 px-2 py-0.5 text-accent-green">
                      +{{ variant.scheduledCount }} weitere Aufgaben
                    </span>
                    <span class="rounded-full border border-border-subtle bg-white/[0.04] px-2 py-0.5 text-text-secondary">
                      {{ variant.remainingCount }} offen
                    </span>
                  </div>
                  <p class="mt-2 text-xs text-text-secondary">{{ variant.highlight }}</p>
                </div>

                <button
                  type="button"
                  class="btn-accent-green px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                  :disabled="applyingVariantStyle === variant.style"
                  @click="applyPlanVariant(variant.style)"
                >
                  {{ applyingVariantStyle === variant.style ? 'Prüft...' : 'Prüfen' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="displacementSuggestions.length > 0" class="px-4 pb-2">
        <div class="glass-card border border-accent-purple/20 p-3">
          <h3 class="text-xs font-semibold uppercase tracking-wide text-accent-purple-soft">Umplan-Vorschau</h3>
          <p class="mt-1 text-xs text-text-secondary">Wichtige Aufgaben können auf Wunsch niedrig priorisierte Slots übernehmen.</p>
          <div class="mt-3 space-y-2">
            <button
              v-for="suggestion in displacementSuggestions"
              :key="`${suggestion.incomingTaskId}-${suggestion.displacedTaskId}`"
              type="button"
              class="w-full rounded-glass border border-accent-purple/20 bg-accent-purple/10 px-3 py-2 text-left transition hover:border-accent-purple/35 hover:bg-accent-purple/15"
              @click="previewDisplacement = suggestion"
            >
              <div class="text-xs font-medium text-text-primary">{{ suggestion.incomingTitle }}</div>
              <div class="mt-1 text-[11px] text-text-secondary">
                würde {{ suggestion.displacedTitle }} am {{ formatTaskDateTime(suggestion.start) }} verdrängen
              </div>
            </button>
          </div>
        </div>
      </div>

      <div v-if="restorableActivityGroups.length > 0" class="px-4 pb-2">
        <div class="glass-card border border-accent-purple/20 p-3">
          <div class="flex items-center justify-between gap-2">
            <div>
              <h3 class="text-xs font-semibold uppercase tracking-wide text-accent-purple-soft">Wiederherstellen</h3>
              <p class="mt-1 text-xs text-text-muted">Groessere aenderungen sind hier thematisch gebuendelt, damit du nicht nur einzelne Zeilen suchen musst.</p>
            </div>
            <span class="rounded-full border border-accent-purple/20 bg-accent-purple/10 px-2 py-0.5 text-[11px] text-accent-purple-soft">
              {{ restorableActivityGroups.reduce((sum, group) => sum + group.entries.length, 0) }} Aktionen
            </span>
          </div>

          <div class="mt-3 space-y-3">
            <div
              v-for="group in restorableActivityGroups"
              :key="group.key"
              class="rounded-glass border border-border-subtle bg-white/[0.03] p-3"
            >
              <div class="flex items-start justify-between gap-3">
                <div>
                  <div class="text-xs font-medium text-text-primary">{{ group.label }}</div>
                  <div class="mt-1 text-[11px] text-text-muted">{{ group.description }}</div>
                </div>
                <span class="rounded-full border border-border-subtle bg-white/[0.04] px-2 py-0.5 text-[10px] uppercase tracking-wide text-text-secondary">
                  {{ group.entries.length }} {{ group.entries.length === 1 ? 'Eintrag' : 'Einträge' }}
                </span>
              </div>

              <div class="mt-3 space-y-2">
                <div
                  v-for="entry in group.entries.slice(0, 3)"
                  :key="entry.id"
                  class="rounded-glass border border-accent-purple/15 bg-accent-purple/8 px-3 py-2"
                >
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0 flex-1">
                      <div class="flex flex-wrap items-center gap-2">
                        <span class="text-xs font-medium text-text-primary">{{ entry.title }}</span>
                        <span class="text-[11px] text-text-muted">{{ formatActivityDate(entry.createdAt) }} · {{ formatActivityTime(entry.createdAt) }}</span>
                        <span
                          v-if="entry.scope === 'batch'"
                          class="rounded-full border border-accent-purple/20 bg-white/[0.06] px-2 py-0.5 text-[10px] uppercase tracking-wide text-accent-purple-soft"
                        >
                          Batch
                        </span>
                      </div>
                      <p class="mt-1 text-xs text-text-secondary">{{ entry.detail }}</p>
                      <p v-if="entry.recoveryHint" class="mt-1 text-[11px] text-text-muted">{{ entry.recoveryHint }}</p>
                    </div>

                    <button
                      type="button"
                      class="rounded-md border border-accent-purple/20 bg-accent-purple/10 px-2 py-1 text-[11px] text-accent-purple-soft transition hover:border-accent-purple/35 hover:bg-accent-purple/15"
                      @click="undoActivity(entry.id)"
                    >
                      {{ entry.undoLabel || 'Wiederherstellen' }}
                    </button>
                  </div>
                </div>

                <p v-if="group.entries.length > 3" class="text-[11px] text-text-muted">
                  Plus {{ group.entries.length - 3 }} weitere wiederherstellbare Schritte in dieser Gruppe.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="activityEntries.length > 0" class="px-4 pb-2">
        <div class="glass-card border border-border-subtle p-3">
          <div class="flex items-center justify-between gap-2">
            <div>
              <h3 class="text-xs font-semibold uppercase tracking-wide text-text-secondary">Letzte Änderungen</h3>
              <p class="mt-1 text-xs text-text-muted">So siehst du, was automatisch oder direkt verändert wurde und welche Schritte wiederherstellbar sind.</p>
            </div>
            <span class="rounded-full border border-border-subtle bg-white/[0.04] px-2 py-0.5 text-[11px] text-text-secondary">
              {{ activityEntries.length }} Einträge
            </span>
          </div>

          <div class="mt-3 space-y-2">
            <div
              v-for="entry in activityEntries.slice(0, 5)"
              :key="entry.id"
              class="rounded-glass border border-border-subtle bg-white/[0.03] px-3 py-2"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span class="text-xs font-medium text-text-primary">{{ entry.title }}</span>
                    <span class="text-[11px] text-text-muted">{{ formatActivityTime(entry.createdAt) }}</span>
                    <span
                      v-if="entry.undo"
                      class="rounded-full border border-accent-purple/20 bg-accent-purple/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent-purple-soft"
                    >
                      Wiederherstellbar
                    </span>
                  </div>
                  <p class="mt-1 text-xs text-text-secondary">{{ entry.detail }}</p>
                  <p v-if="entry.recoveryHint" class="mt-1 text-[11px] text-text-muted">{{ entry.recoveryHint }}</p>
                </div>

                <button
                  v-if="entry.undo"
                  type="button"
                  class="rounded-md border border-accent-purple/20 bg-accent-purple/10 px-2 py-1 text-[11px] text-accent-purple-soft transition hover:border-accent-purple/35 hover:bg-accent-purple/15"
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
        <div v-if="tasks.length === 0" class="py-8 text-center">
          <div class="glass-card border border-dashed border-border-strong px-4 py-8"><p class="text-sm text-text-secondary">Keine Aufgaben vorhanden.</p><p class="mt-1 text-xs text-text-muted">Erstelle eine neue Aufgabe oder generiere ein KI-Projekt.</p></div>
          
        </div>

        <div v-else class="space-y-4">
          <div v-if="filteredTaskGroups.length > 0" class="space-y-4">
            <section
              v-for="group in filteredTaskGroups"
              :key="group.id"
              v-memo="[group.id, group.tasks.length, group.reviewStatus, isGroupCollapsed(group.id), activeFilter]"
              class="space-y-2"
            >
              <div class="glass-card p-3">
                <div class="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    class="flex min-w-0 flex-1 items-start gap-2 text-left"
                    @click="toggleGroup(group.id)"
                  >
                    <svg
                      class="mt-0.5 h-4 w-4 flex-shrink-0 text-text-muted transition-transform"
                      :class="{ 'rotate-90': !isGroupCollapsed(group.id) }"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                    </svg>
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-2">
                        <h3 class="truncate text-xs font-semibold uppercase tracking-wide text-text-muted">{{ group.name }}</h3>
                        <span class="rounded-full border border-border-subtle bg-white/[0.04] px-2 py-0.5 text-[11px] text-text-secondary">
                          {{ projectProgress(group).done }}/{{ projectProgress(group).total }}
                        </span>
                      </div>
                      <div class="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.05]">
                        <div
                          class="h-full rounded-full bg-gradient-to-r from-accent-purple to-accent-blue transition-all"
                          :style="{ width: `${projectProgress(group).percent}%` }"
                        />
                      </div>
                      <div class="mt-2 flex flex-wrap gap-2 text-[11px] text-text-secondary">
                        <span>{{ projectProgress(group).percent }}% erledigt</span>
                        <span>{{ projectRemainingHours(group) }} h Restaufwand</span>
                        <span>{{ getGroupTasks(group).length }} Aufgaben</span>
                      </div>
                      <p v-if="projectNextStep(group)" class="mt-2 text-xs text-text-secondary">
                        Nächster Schritt: <span class="font-medium text-text-primary">{{ projectNextStep(group)?.title }}</span>
                      </p>
                      <p v-else class="mt-2 text-xs text-accent-green">
                        Projekt abgeschlossen und bereit zum Archivieren.
                      </p>
                      <div
                        v-if="isProjectReviewDue(group) || projectReviewLabel(group.reviewStatus)"
                        class="mt-3 rounded-glass border border-accent-blue/20 bg-accent-blue/10 px-3 py-2"
                      >
                        <p class="text-[11px] font-semibold uppercase tracking-wide text-accent-blue">Projekt-Review</p>
                        <p v-if="projectReviewLabel(group.reviewStatus)" class="mt-1 text-xs text-text-secondary">
                          {{ projectReviewLabel(group.reviewStatus) }}
                        </p>
                        <div v-else class="mt-2 flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            class="rounded-full border border-accent-blue/20 bg-white/[0.05] px-2 py-1 text-[11px] text-accent-blue"
                            @click.stop="applyProjectReview(group.id, 'too-big')"
                          >
                            Zu groß
                          </button>
                          <button
                            type="button"
                            class="rounded-full border border-accent-blue/20 bg-white/[0.05] px-2 py-1 text-[11px] text-accent-blue"
                            @click.stop="applyProjectReview(group.id, 'fit')"
                          >
                            Passend
                          </button>
                          <button
                            type="button"
                            class="rounded-full border border-accent-blue/20 bg-white/[0.05] px-2 py-1 text-[11px] text-accent-blue"
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
                      class="rounded-md border border-priority-high/20 bg-priority-high/10 px-2 py-1 text-[11px] text-priority-high transition hover:border-priority-high/35 hover:bg-priority-high/15"
                      @click="archiveProjectGroup(group.id)"
                    >
                      Archivieren
                    </button>
                    <button
                      v-if="group.id !== 'inbox'"
                      type="button"
                      class="rounded-md border border-priority-critical/20 bg-priority-critical/10 px-2 py-1 text-[11px] text-priority-critical transition hover:border-priority-critical/35 hover:bg-priority-critical/15"
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
                  v-memo="[task.id, task.status, task.priority, task.lifeArea, task.updatedAt, task.progressPercent, task.scheduleBlocks?.length || 0]"
                  class="cursor-pointer rounded-glass border border-border-subtle bg-white/[0.03] p-3 transition hover:-translate-y-0.5 hover:border-border-strong hover:bg-white/[0.05]"
                  :class="{ 'opacity-50': task.status === 'done' }"
                  @click="emit('edit-task', task)"
                >
                  <div class="flex items-start justify-between gap-2">
                    <div class="flex-1 min-w-0">
                      <div class="flex flex-wrap items-center gap-2">
                        <span class="text-sm font-medium text-text-primary truncate">{{ task.title }}</span>
                        <span
                          class="text-xs px-1.5 py-0.5 rounded-full flex-shrink-0"
                          :class="priorityColors[task.priority]"
                        >
                          {{ task.priority }}
                        </span>
                        <span class="rounded-full border border-border-subtle bg-white/[0.04] px-1.5 py-0.5 text-xs text-text-secondary">
                          {{ taskStatusLabel(task) }}
                        </span>
                        <span
                          v-if="isTodayCommitted(task)"
                          class="rounded-full border border-accent-purple/20 bg-accent-purple/10 px-1.5 py-0.5 text-xs text-accent-purple-soft"
                        >
                          Heute committed
                        </span>
                        <span
                          v-else-if="isTodayDeferred(task)"
                          class="rounded-full border border-border-subtle bg-white/[0.04] px-1.5 py-0.5 text-xs text-text-muted"
                        >
                          Nicht heute
                        </span>
                      </div>

                      <div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                        <span
                          class="rounded-full border px-1.5 py-0.5"
                          :class="lifeAreaColors[inferLifeArea(task)]"
                        >
                          {{ resolveLifeAreaLabel(inferLifeArea(task)) }}
                        </span>
                        <span>{{ task.estimatedMinutes }} Min.</span>
                        <span v-if="task.deadline">
                          Deadline: {{ new Date(task.deadline).toLocaleDateString('de-DE') }}
                        </span>
                        <span v-if="task.isDeepWork" class="text-accent-purple-soft">Deep Work</span>
                        <span v-if="task.prioritySource === 'ai'" class="text-accent-blue">KI-Vorschlag</span>
                        <span v-else-if="task.prioritySource === 'system'" class="text-priority-critical">Deadline-Druck</span>
                        <span v-else-if="task.prioritySource === 'manual'" class="text-text-secondary">Manuell</span>
                      </div>

                      <div
                        v-if="getTaskInsight(task)?.riskLabels.length"
                        class="mt-2 flex flex-wrap gap-1"
                      >
                        <span
                          v-for="riskLabel in getTaskInsight(task)?.riskLabels"
                          :key="`${task.id}-${riskLabel}`"
                          class="rounded-full border border-priority-critical/20 bg-priority-critical/10 px-2 py-0.5 text-[11px] text-priority-critical"
                        >
                          {{ riskLabel }}
                        </span>
                      </div>

                      <div v-if="taskScheduleSummary(task)" class="mt-1 text-xs text-accent-blue">
                        Geplant: {{ taskScheduleSummary(task) }}
                      </div>

                      <div v-if="task.priorityReason" class="mt-1 text-xs text-text-secondary">
                        Grund: {{ task.priorityReason }}
                      </div>

                      <div v-if="getTaskPersonalHint(task)" class="mt-1 text-xs text-accent-blue">
                        {{ getTaskPersonalHint(task) }}
                      </div>

                      <div v-if="taskProgressLabel(task)" class="mt-1 text-xs text-accent-blue">
                        {{ taskProgressLabel(task) }}
                      </div>

                      <div
                        v-if="task.aiSuggestedPriority && task.aiSuggestedPriority !== task.priority"
                        class="mt-1 text-xs text-text-secondary"
                      >
                        KI wollte {{ task.aiSuggestedPriority }}, lokal jetzt {{ task.priority }}.
                      </div>

                      <div
                        v-if="getTaskInsight(task)?.headline && getTaskInsight(task)?.headline !== task.priorityReason"
                        class="mt-1 text-xs text-text-secondary"
                      >
                        Kontext: {{ getTaskInsight(task)?.headline }}
                      </div>

                      <div class="mt-2 flex flex-wrap gap-1.5" @click.stop>
                        <button
                          v-for="priorityOption in priorityOptions"
                          :key="priorityOption"
                          class="rounded-full border px-2 py-0.5 text-[11px] transition-colors"
                          :class="task.priority === priorityOption
                            ? 'border-accent-purple/30 bg-accent-purple/15 text-accent-purple-soft'
                            : 'border-border-subtle bg-white/[0.03] text-text-secondary hover:border-border-strong hover:text-text-primary'"
                          @click="changePriority(task, priorityOption)"
                        >
                          {{ priorityOption }}
                        </button>
                      </div>
                    </div>

                    <div class="flex items-center gap-1" @click.stop>
                      <button
                        v-if="task.status === 'scheduled'"
                        class="rounded border border-priority-high/20 bg-priority-high/10 px-2 py-1 text-xs text-priority-high transition hover:border-priority-high/35 hover:bg-priority-high/15"
                        title="Nicht geschafft, neu einplanen"
                        @click="openRescheduleDialog(task)"
                      >
                        Nicht geschafft
                      </button>
                      <button
                        v-if="task.status !== 'done'"
                        class="rounded p-1 text-text-muted transition hover:bg-accent-green/10 hover:text-accent-green"
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
            class="glass-card border border-dashed border-border-strong px-4 py-8 text-center"
          >
            <p class="text-sm text-text-secondary">Keine Aufgaben für den aktuellen Filter gefunden.</p>
          </div>

          <section v-if="archivedTaskGroups.length > 0" class="glass-card p-3">
            <div class="flex items-center justify-between gap-3">
              <button
                type="button"
                class="flex min-w-0 flex-1 items-center gap-2 text-left"
                @click="showArchivedProjects = !showArchivedProjects"
              >
                <svg
                  class="h-4 w-4 flex-shrink-0 text-text-muted transition-transform"
                  :class="{ 'rotate-90': showArchivedProjects }"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
                <div>
                  <h3 class="text-xs font-semibold uppercase tracking-wide text-text-muted">Archivierte Projekte</h3>
                  <p class="mt-1 text-[11px] text-text-muted">{{ archivedTaskGroups.length }} archiviert</p>
                </div>
              </button>
            </div>

            <div v-if="showArchivedProjects" class="mt-3 space-y-2">
              <div
                v-for="group in archivedTaskGroups"
                :key="group.id"
                class="rounded-glass border border-border-subtle bg-white/[0.03] p-3"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <h4 class="text-sm font-medium text-text-primary">{{ group.name }}</h4>
                      <span class="rounded-full border border-border-subtle bg-white/[0.04] px-2 py-0.5 text-[11px] text-text-secondary">
                        {{ projectProgress(group).done }}/{{ projectProgress(group).total }}
                      </span>
                    </div>
                    <div class="mt-1 text-xs text-text-secondary">
                      Archiviert am {{ formatArchivedDate(group.archivedAt) || 'unbekannt' }}
                    </div>
                    <div class="mt-2 flex flex-wrap gap-2 text-[11px] text-text-secondary">
                      <span>{{ projectProgress(group).percent }}% erledigt</span>
                      <span>{{ projectRemainingHours(group) }} h Restaufwand</span>
                    </div>
                    <p v-if="projectNextStep(group)" class="mt-2 text-xs text-text-secondary">
                      Beim Wiederherstellen zuerst: <span class="font-medium text-text-primary">{{ projectNextStep(group)?.title }}</span>
                    </p>
                  </div>

                  <button
                    type="button"
                    class="rounded-md border border-accent-purple/20 bg-accent-purple/10 px-2 py-1 text-[11px] text-accent-purple-soft transition hover:border-accent-purple/35 hover:bg-accent-purple/15"
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
      <div v-if="scheduleReviewPreview" class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
        <div class="absolute inset-0" @click="closeScheduleReview" />

        <div class="glass-card-elevated relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-glass-xl sm:max-w-2xl sm:rounded-glass-lg">
          <div class="flex items-start justify-between gap-4 border-b border-border-subtle px-5 py-4">
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.24em] text-accent-green">Plan-Review</p>
              <h3 class="mt-2 text-lg font-semibold text-text-primary">{{ scheduleReviewPreview.label }}</h3>
              <p class="mt-1 text-sm text-text-secondary">
                Prüfe zuerst, was automatisch passieren würde, bevor Termine und Aufgaben wirklich verändert werden.
              </p>
            </div>
            <button type="button" class="btn-secondary inline-flex h-10 w-10 items-center justify-center" @click="closeScheduleReview">
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div class="flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <div
              v-if="scheduleReviewPreview.contextText"
              class="rounded-glass border border-accent-blue/20 bg-accent-blue/10 px-4 py-3 text-sm text-accent-blue"
            >
              {{ scheduleReviewPreview.contextText }}
            </div>

            <div class="grid gap-3 sm:grid-cols-4">
              <div class="rounded-glass border border-border-subtle bg-white/[0.04] px-3 py-3">
                <div class="text-lg font-semibold text-text-primary">{{ scheduleReviewPreview.items.length }}</div>
                <div class="text-[11px] uppercase tracking-wide text-text-muted">Aufgaben</div>
              </div>
              <div class="rounded-glass border border-border-subtle bg-white/[0.04] px-3 py-3">
                <div class="text-lg font-semibold text-accent-green">{{ scheduleReviewPreview.totalBlocks }}</div>
                <div class="text-[11px] uppercase tracking-wide text-text-muted">Kalenderblöcke</div>
              </div>
              <div class="rounded-glass border border-border-subtle bg-white/[0.04] px-3 py-3">
                <div class="text-lg font-semibold text-text-primary">{{ Math.round((scheduleReviewPreview.totalMinutes / 60) * 10) / 10 }}h</div>
                <div class="text-[11px] uppercase tracking-wide text-text-muted">Geplante Zeit</div>
              </div>
              <div class="rounded-glass border border-border-subtle bg-white/[0.04] px-3 py-3">
                <div class="text-lg font-semibold" :class="scheduleReviewPreview.remainingTasks.length > 0 ? 'text-priority-high' : 'text-accent-green'">
                  {{ scheduleReviewPreview.remainingTasks.length }}
                </div>
                <div class="text-[11px] uppercase tracking-wide text-text-muted">Weiter offen</div>
              </div>
            </div>

            <div class="glass-card p-4">
              <h4 class="text-xs font-semibold uppercase tracking-[0.22em] text-text-muted">Neue Blöcke</h4>
              <div class="mt-3 space-y-2">
                <div
                  v-for="item in scheduleReviewPreview.items.slice(0, 8)"
                  :key="item.taskId"
                  class="rounded-glass border border-border-subtle bg-white/[0.03] px-3 py-3"
                >
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0 flex-1">
                      <div class="flex flex-wrap items-center gap-2">
                        <span class="text-sm font-medium text-text-primary">{{ item.title }}</span>
                        <span class="rounded-full px-2 py-0.5 text-[11px]" :class="priorityColors[item.priority]">
                          {{ item.priority }}
                        </span>
                        <span v-if="item.isDeepWork" class="rounded-full border border-accent-purple/20 bg-accent-purple/10 px-2 py-0.5 text-[11px] text-accent-purple-soft">
                          Fokus
                        </span>
                      </div>
                      <p v-if="item.firstStart && item.lastEnd" class="mt-2 text-xs text-text-secondary">
                        {{ formatTaskDateTime(item.firstStart) }} bis {{ formatTaskDateTime(item.lastEnd) }}
                      </p>
                    </div>
                    <div class="text-right text-xs text-text-secondary">
                      <div>{{ item.blockCount }} Block{{ item.blockCount === 1 ? '' : 'e' }}</div>
                      <div class="mt-1">{{ item.totalMinutes }} Min.</div>
                    </div>
                  </div>
                </div>
              </div>
              <p v-if="scheduleReviewPreview.items.length > 8" class="mt-3 text-xs text-text-muted">
                {{ scheduleReviewPreview.items.length - 8 }} weitere Aufgaben würden ebenfalls eingeplant.
              </p>
            </div>

            <div v-if="scheduleReviewPreview.remainingTasks.length > 0" class="rounded-glass border border-priority-high/20 bg-priority-high/10 px-4 py-4">
              <h4 class="text-xs font-semibold uppercase tracking-[0.22em] text-priority-high">Bleibt noch offen</h4>
              <div class="mt-3 flex flex-wrap gap-2">
                <span
                  v-for="task in scheduleReviewPreview.remainingTasks.slice(0, 6)"
                  :key="task.id"
                  class="rounded-full border border-priority-high/20 bg-white/[0.05] px-2.5 py-1 text-[11px] text-text-secondary"
                >
                  {{ task.title }}
                </span>
              </div>
              <p class="mt-3 text-xs text-text-secondary">
                Diese Aufgaben kannst du danach mit Planvarianten, Alternativ-Slots oder manuellen Anpassungen weiter auflösen.
              </p>
            </div>
          </div>

          <div class="flex flex-col-reverse gap-3 border-t border-border-subtle px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" class="btn-secondary px-4 py-2 text-sm" @click="closeScheduleReview">
              Später prüfen
            </button>
            <button
              type="button"
              class="btn-accent-green px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="applyingScheduleReview"
              @click="confirmScheduleReview"
            >
              {{ applyingScheduleReview ? 'Plant ein...' : 'Jetzt anwenden' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
    <Transition name="modal">
      <div v-if="rescheduleTask" class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
        <div class="absolute inset-0" @click="closeRescheduleDialog" />

        <div class="glass-card-elevated relative w-full max-h-[92vh] overflow-y-auto rounded-t-glass-xl p-6 sm:max-w-md sm:rounded-glass-lg">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.24em] text-accent-purple-soft">Neu einplanen</p>
              <h3 class="mt-2 text-lg font-semibold text-text-primary">Neu einplanen</h3>
              <p class="mt-1 text-sm text-text-secondary">
                Wähle, wie <span class="font-medium text-text-primary">{{ rescheduleTask.title }}</span> neu geplant werden soll.
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
              Vorschau prüfen
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





