<script setup lang="ts">
import TaskModal from '~/components/TaskModalDialog.vue'
import CommandCenter from '~/components/CommandCenter.vue'
import type { CalendarEvent } from '~/composables/useCalendar'
import { resolveLifeAreaLabel } from '~/types/task'
import type { DailyPlanningMode, DailyReflectionTag, LifeArea, PlanningStyle, Task } from '~/types/task'

type WorkspaceSection = 'balance' | 'forecast' | 'review'
type AppSurface = 'calendar' | 'tasks' | 'planner' | 'insights' | 'settings' | 'more'

const { isLoggedIn, userProfile, error: authError, initClient } = useGoogleAuth()
const { events, isLoading, error: calError, fetchEvents, createEvent, updateEvent, deleteEvent } = useCalendar()
const { tasks, init: initTasks, createTask, updateTask, deleteTask: removeTask } = useTasks()
const { preferences, getPreferredHours, getSuggestedDeepWorkHours, getDailyCommit, setDailyCommit, clearDailyCommit, getDailyMode, setDailyMode, clearDailyMode, getDailyReflection, saveDailyReflection, getRecentDailyReflections } = usePreferences()
const { findFreeSlots } = useScheduler()
const { warnings, criticalCount } = useDeadlineWatcher()

const currentView = ref<'month' | 'week'>('month')
const currentDate = ref(new Date())
const calendarSectionRef = ref<HTMLElement | null>(null)
const showModal = ref(false)
const showTaskModal = ref(false)
const showPreferences = ref(false)
const showSidebar = ref(false)
const showPlanningChat = ref(false)
const showCommandCenter = ref(false)
const showWorkspacePanel = ref(false)
const activeWorkspaceSection = ref<WorkspaceSection>('forecast')
const selectedEvent = ref<CalendarEvent | null>(null)
const selectedTask = ref<Task | null>(null)
const selectedDate = ref<string | undefined>(undefined)
const todayActionFeedback = ref<string | null>(null)
const isRunningTodayAction = ref(false)
const selectedCommitTaskIds = ref<string[]>([])
const selectedReflectionTags = ref<DailyReflectionTag[]>([])
const dailyReflectionNote = ref('')
const dailyModeOptions: Array<{ value: DailyPlanningMode; label: string; description: string; accent: string }> = [
  { value: 'fokussiert', label: 'Fokussiert', description: 'Deep Work und wichtige Hebel zuerst.', accent: 'accent-purple-soft' },
  { value: 'entspannt', label: 'Entspannt', description: 'Weniger Druck, mehr machbare Schritte.', accent: 'accent-green' },
  { value: 'wenig-zeit', label: 'Wenig Zeit', description: 'Kurze, klare Aufgaben für enge Tage.', accent: 'accent-blue' },
  { value: 'aufholen', label: 'Aufholen', description: 'Deadline-Druck und Rückstände zuerst glätten.', accent: 'priority-high' },
]
const reflectionOptions: Array<{ value: DailyReflectionTag; label: string; description: string }> = [
  { value: 'geschafft', label: 'Geschafft', description: 'Der Tag war insgesamt gut machbar.' },
  { value: 'verschoben', label: 'Verschoben', description: 'Es musste spürbar umgeplant werden.' },
  { value: 'unrealistisch', label: 'Unrealistisch', description: 'Die Planung war für heute zu ambitioniert.' },
]
const lifeAreaColors: Record<LifeArea, string> = {
  arbeit: 'border-accent-blue/20 bg-accent-blue/10 text-accent-blue',
  privat: 'border-accent-purple/20 bg-accent-purple/10 text-accent-purple-soft',
  gesundheit: 'border-accent-green/20 bg-accent-green/10 text-accent-green',
  lernen: 'border-priority-high/20 bg-priority-high/10 text-priority-high',
  alltag: 'border-border-subtle bg-white/[0.04] text-text-secondary',
}

const todayRange = computed(() => {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date()
  end.setHours(23, 59, 59, 999)
  return { start, end }
})

const todayEvents = computed(() => {
  return events.value.filter((event) => {
    const value = event.start.dateTime || event.start.date
    if (!value) return false
    const eventStart = new Date(value)
    return eventStart >= todayRange.value.start && eventStart <= todayRange.value.end
  })
})

const todayPendingTasks = computed(() => {
  return tasks.value.filter(task => task.status !== 'done')
})

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

const lifeAreaSummary = computed(() => {
  const grouped = new Map<LifeArea, { area: LifeArea; total: number; urgent: number; deepWork: number }>()

  for (const task of todayPendingTasks.value) {
    const area = inferLifeArea(task)
    const current = grouped.get(area) || { area, total: 0, urgent: 0, deepWork: 0 }
    current.total += 1
    if (task.priority === 'critical' || task.priority === 'high') current.urgent += 1
    if (task.isDeepWork) current.deepWork += 1
    grouped.set(area, current)
  }

  return [...grouped.values()].sort((a, b) => {
    if (b.urgent !== a.urgent) return b.urgent - a.urgent
    return b.total - a.total
  })
})

const lifeAreaBalanceSummary = computed(() => {
  if (lifeAreaSummary.value.length === 0) {
    return 'Gerade ist keine offene Aufgabe aktiv. Neue Bereiche koennen entspannt entstehen.'
  }

  if (lifeAreaSummary.value.length === 1) {
    return `${resolveLifeAreaLabel(lifeAreaSummary.value[0].area)} dominiert den aktuellen Plan.`
  }

  const urgentAreas = lifeAreaSummary.value
    .filter(item => item.urgent > 0)
    .map(item => resolveLifeAreaLabel(item.area))

  if (urgentAreas.length > 0) {
    return `${urgentAreas.join(', ')} tragen gerade den meisten Druck. Die Balance bleibt dabei sichtbar.`
  }

  return `${lifeAreaSummary.value.length} Lebensbereiche sind aktuell parallel im Plan aktiv.`
})

function formatHourLabel(hour: number) {
  return `${hour.toString().padStart(2, '0')}:00`
}

const workspaceSectionOptions: Array<{ value: WorkspaceSection; label: string; detail: string }> = [
  { value: 'balance', label: 'Balance', detail: 'Lebensbereiche und aktuelle Gewichte' },
  { value: 'forecast', label: 'Wochenblick', detail: 'Druck, freie Zeit und Forecast' },
  { value: 'review', label: 'Rückblick', detail: 'Lernen, Signale und Morgenbrief' },
]

const activeWorkspaceMeta = computed(() =>
  workspaceSectionOptions.find(option => option.value === activeWorkspaceSection.value) || workspaceSectionOptions[0],
)

const activeSurface = computed<AppSurface>(() => {
  if (showPreferences.value) return 'settings'
  if (showPlanningChat.value) return 'planner'
  if (showSidebar.value) return 'tasks'
  if (showWorkspacePanel.value) return 'insights'
  if (showCommandCenter.value) return 'more'
  return 'calendar'
})

const todayCommit = computed(() => getDailyCommit())
const todayMode = computed(() => getDailyMode())
const activeDailyMode = computed<DailyPlanningMode | null>(() => todayMode.value.mode)
const todayReflection = computed(() => getDailyReflection())
const todayCommittedTasks = computed(() => {
  const committedIds = new Set(todayCommit.value.committedTaskIds)
  return todayPendingTasks.value.filter(task => committedIds.has(task.id))
})

const todayDeferredTasks = computed(() => {
  const deferredIds = new Set(todayCommit.value.deferredTaskIds)
  return todayPendingTasks.value.filter(task => deferredIds.has(task.id))
})

const todayFreeSlots = computed(() => {
  return findFreeSlots(
    todayRange.value.start,
    todayRange.value.end,
    events.value,
    effectiveTodayPreferences.value,
  )
})

const effectiveTodayPlanningStyle = computed<PlanningStyle>(() => {
  switch (activeDailyMode.value) {
    case 'fokussiert':
      return 'focus-first'
    case 'entspannt':
      return 'entspannt'
    case 'wenig-zeit':
      return 'normal'
    case 'aufholen':
      return 'deadline-first'
    default:
      return preferences.value.planningStyle
  }
})

const effectiveTodayPreferences = computed(() => ({
  ...preferences.value,
  planningStyle: effectiveTodayPlanningStyle.value,
}))

const todayFocusSlots = computed(() => {
  return todayFreeSlots.value
    .filter(slot => slot.isDeepWork)
    .slice(0, 3)
})

const todayFreeMinutes = computed(() => {
  return Math.round(
    todayFreeSlots.value.reduce((sum, slot) => sum + ((slot.end.getTime() - slot.start.getTime()) / 60000), 0),
  )
})

const nextBestTask = computed(() => {
  const priorityRank = { critical: 0, high: 1, medium: 2, low: 3 }
  const committedIds = new Set(todayCommit.value.committedTaskIds)
  const deferredIds = new Set(todayCommit.value.deferredTaskIds)

  const sourceTasks = todayPendingTasks.value
    .filter(task => !deferredIds.has(task.id))

  const committedTasks = sourceTasks.filter(task => committedIds.has(task.id))
  const candidateTasks = committedTasks.length > 0 ? committedTasks : sourceTasks

  return [...candidateTasks]
    .sort((a, b) => {
      const modeScoreDiff = getDailyModeTaskScore(b) - getDailyModeTaskScore(a)
      if (modeScoreDiff !== 0) return modeScoreDiff

      const aScheduled = a.scheduledStart ? new Date(a.scheduledStart).getTime() : Infinity
      const bScheduled = b.scheduledStart ? new Date(b.scheduledStart).getTime() : Infinity
      if (aScheduled !== bScheduled) return aScheduled - bScheduled

      const priorityDiff = priorityRank[a.priority] - priorityRank[b.priority]
      if (priorityDiff !== 0) return priorityDiff

      const aDeadline = a.deadline ? new Date(a.deadline).getTime() : Infinity
      const bDeadline = b.deadline ? new Date(b.deadline).getTime() : Infinity
      return aDeadline - bDeadline
    })[0] || null
})

const commitCandidateTasks = computed(() => {
  const priorityRank = { critical: 0, high: 1, medium: 2, low: 3 }
  return [...todayPendingTasks.value]
    .sort((a, b) => {
      const modeScoreDiff = getDailyModeTaskScore(b) - getDailyModeTaskScore(a)
      if (modeScoreDiff !== 0) return modeScoreDiff

      const aScheduled = a.scheduledStart ? new Date(a.scheduledStart).getTime() : Infinity
      const bScheduled = b.scheduledStart ? new Date(b.scheduledStart).getTime() : Infinity
      if (aScheduled !== bScheduled) return aScheduled - bScheduled

      const priorityDiff = priorityRank[a.priority] - priorityRank[b.priority]
      if (priorityDiff !== 0) return priorityDiff

      const aDeadline = a.deadline ? new Date(a.deadline).getTime() : Infinity
      const bDeadline = b.deadline ? new Date(b.deadline).getTime() : Infinity
      return aDeadline - bDeadline
    })
    .slice(0, 6)
})

watch(commitCandidateTasks, (candidates) => {
  if (todayCommit.value.committedTaskIds.length > 0) return
  const validIds = new Set(candidates.map(task => task.id))
  const nextSelection = selectedCommitTaskIds.value.filter(id => validIds.has(id))
  if (nextSelection.length > 0) {
    selectedCommitTaskIds.value = nextSelection
    return
  }

  selectedCommitTaskIds.value = candidates.slice(0, 3).map(task => task.id)
}, { immediate: true })

const nextBestTaskReason = computed(() => {
  const task = nextBestTask.value
  if (!task) return 'Gerade ist nichts Dringendes offen.'
  if (todayCommit.value.committedTaskIds.includes(task.id)) return 'Teil deines heutigen bewussten Fokus-Commits.'
  if (activeDailyMode.value === 'fokussiert' && task.isDeepWork) return 'Passt heute am besten zu deinem fokussierten Tagesmodus.'
  if (activeDailyMode.value === 'wenig-zeit') return 'Wurde wegen deines engen Tages bewusst nach Machbarkeit und Kürze gewählt.'
  if (activeDailyMode.value === 'aufholen') return 'Wurde wegen deines Aufholmodus stärker nach Deadline-Druck und Rückstand gezogen.'
  if (activeDailyMode.value === 'entspannt') return 'Wurde als machbarer Schritt für einen entspannteren Tag ausgewählt.'
  if (task.scheduledStart) return `Schon eingeplant für ${formatDateTime(task.scheduledStart)}.`
  if (task.deadline) return `Deadline am ${new Date(task.deadline).toLocaleDateString('de-DE')}.`
  if (task.isDeepWork && preferredDeepWorkHours.value[0] !== undefined) {
    return `Passt zu deiner gelernten Fokuszeit rund um ${formatHourLabel(preferredDeepWorkHours.value[0])}.`
  }
  if (preferredCompletionHours.value[0] !== undefined) {
    return `Passt gerade gut zu deiner starken Abschlusszeit rund um ${formatHourLabel(preferredCompletionHours.value[0])}.`
  }
  if (task.priorityReason) return task.priorityReason
  if (lifeAreaSummary.value.length > 1) {
    return `${resolveLifeAreaLabel(inferLifeArea(task))} bekommt heute sichtbar Aufmerksamkeit im aktuellen Plan.`
  }
  return 'Aktuell die wichtigste offene Aufgabe.'
})
const todayDecisionWhy = computed(() => {
  const task = nextBestTask.value
  const reasons: string[] = []

  if (!task) {
    reasons.push('Gerade ist keine offene Aufgabe so dringend, dass sie deinen Tagesfokus dominieren muss.')
    return reasons
  }

  reasons.push(`"${task.title}" steht gerade vorne, weil Priorität, Deadline und aktuelle Planbarkeit zusammen am stärksten wirken.`)
  reasons.push(nextBestTaskReason.value)

  if (task.isDeepWork) {
    reasons.push('Die Aufgabe braucht Fokuszeit und profitiert besonders von einem ruhigen Block.')
  }

  return reasons
})

const todayDecisionAlternatives = computed(() => {
  if (!nextBestTask.value) {
    return [
      'Über den Planungs-Chat direkt einen neuen Termin oder eine Aufgabe anlegen.',
      'In der Aufgabenleiste per KI-Priorisierung neue Schwerpunkte setzen.',
    ]
  }

  return [
    'Heute neu planen, wenn du die Aufgabe noch aktiv angehen willst.',
    'Kleinere Lücke finden, wenn nur ein kurzer Slot realistisch ist.',
    'Für morgen schieben, wenn heute bewusst entlastet werden soll.',
  ]
})

const todayDecisionNextStep = computed(() => {
  if (!nextBestTask.value) return 'Nutze den Chat oder den Aufgabenbereich, um einen neuen klaren Fokus für die nächsten Tage anzulegen.'
  return nextBestTask.value.scheduledStart
    ? 'Öffne die Aufgabe und prüfe, ob der bestehende Termin noch passt oder heute bewusst angepasst werden soll.'
    : 'Entscheide jetzt bewusst, ob die Aufgabe heute neu eingeplant, in eine kleine Lücke gelegt oder auf morgen verschoben wird.'
})

const todayPressure = computed(() => {
  if (criticalCount.value > 0) {
    return `${criticalCount.value} kritische Deadline-Warnung${criticalCount.value > 1 ? 'en' : ''} brauchen heute Aufmerksamkeit.`
  }

  if (activeDailyMode.value === 'fokussiert') {
    return 'Heute ist ein fokussierter Tag. Die App bevorzugt wichtige Hebel und echte Fokusblöcke.'
  }

  if (activeDailyMode.value === 'entspannt') {
    return 'Heute ist ein entspannter Modus aktiv. Die App priorisiert machbare Schritte statt maximale Dichte.'
  }

  if (activeDailyMode.value === 'wenig-zeit') {
    return 'Heute ist wenig Zeit markiert. Die App sucht kürzere, klar abschließbare Schritte.'
  }

  if (activeDailyMode.value === 'aufholen') {
    return 'Heute läuft ein Aufholmodus. Die App zieht Rückstände und knappe Deadlines spürbar nach vorn.'
  }

  const openMinutes = todayPendingTasks.value
    .filter(task => !task.scheduledStart)
    .reduce((sum, task) => sum + task.estimatedMinutes, 0)

  if (openMinutes > todayFreeMinutes.value) {
    return 'Heute ist mehr offene Arbeit vorhanden, als freie Zeit sichtbar ist.'
  }

  if (todayFocusSlots.value.length === 0) {
    return 'Heute ist kein klarer Fokusblock mehr frei.'
  }

  return 'Heute wirkt der Plan machbar und es gibt noch nutzbare freie Blöcke.'
})

const weekForecastDays = computed(() => {
  const start = new Date()
  start.setHours(0, 0, 0, 0)

  return Array.from({ length: 7 }, (_, index) => {
    const dayStart = new Date(start)
    dayStart.setDate(start.getDate() + index)

    const dayEnd = new Date(dayStart)
    dayEnd.setHours(23, 59, 59, 999)

    const freeSlots = findFreeSlots(dayStart, dayEnd, events.value, preferences.value)
    const freeMinutes = Math.round(
      freeSlots.reduce((sum, slot) => sum + ((slot.end.getTime() - slot.start.getTime()) / 60000), 0),
    )

    const eventCount = events.value.filter((event) => {
      const value = event.start.dateTime || event.start.date
      if (!value) return false
      const eventStart = new Date(value)
      return eventStart >= dayStart && eventStart <= dayEnd
    }).length

    const dueTasks = tasks.value.filter((task) => {
      if (task.status === 'done' || !task.deadline) return false
      return isSameCalendarDay(new Date(task.deadline), dayStart)
    })

    const scheduledTasks = tasks.value.filter((task) => {
      if (task.status === 'done') return false
      const scheduledValue = task.scheduleBlocks?.[0]?.start || task.scheduledStart
      if (!scheduledValue) return false
      return isSameCalendarDay(new Date(scheduledValue), dayStart)
    })

    const cumulativeOpenMinutes = tasks.value
      .filter((task) => {
        if (task.status === 'done') return false
        if (task.scheduleBlocks?.length || task.scheduledStart) return false
        if (!task.deadline) return false
        return new Date(task.deadline) <= dayEnd
      })
      .reduce((sum, task) => sum + task.estimatedMinutes, 0)

    const overloadRatio = freeMinutes > 0 ? cumulativeOpenMinutes / freeMinutes : Infinity

    let status: 'critical' | 'warning' | 'ok' = 'ok'
    let statusLabel = 'Machbar'
    let detail = freeMinutes > 0
      ? `${Math.round((freeMinutes / 60) * 10) / 10}h frei`
      : 'Keine freie Zeit'

    if (dueTasks.length > 0) {
      detail = `${dueTasks.length} Deadline${dueTasks.length > 1 ? 's' : ''}`
    }

    if (dueTasks.length > 0 && overloadRatio > 1) {
      status = 'critical'
      statusLabel = 'Kritisch'
      detail = 'Deadline-Druck über freier Zeit'
    } else if (freeMinutes === 0 && (dueTasks.length > 0 || scheduledTasks.length > 0)) {
      status = 'critical'
      statusLabel = 'Voll'
      detail = 'Kein Puffer mehr sichtbar'
    } else if (overloadRatio > 1.25) {
      status = 'critical'
      statusLabel = 'Eng'
      detail = 'Offene Last kippt den Tag'
    } else if (dueTasks.length > 0 || overloadRatio > 0.8) {
      status = 'warning'
      statusLabel = 'Achten'
      detail = dueTasks.length > 0
        ? `${dueTasks.length} Aufgabe${dueTasks.length > 1 ? 'n' : ''} mit Deadline`
        : 'Wenig Puffer'
    }

    return {
      key: dayStart.toISOString(),
      dayStart,
      freeMinutes,
      eventCount,
      dueTasks,
      scheduledTasks,
      cumulativeOpenMinutes,
      status,
      statusLabel,
      detail,
    }
  })
})

const weekForecastSummary = computed(() => {
  const criticalDays = weekForecastDays.value.filter(day => day.status === 'critical').length
  const warningDays = weekForecastDays.value.filter(day => day.status === 'warning').length
  const totalFreeHours = Math.round(
    (weekForecastDays.value.reduce((sum, day) => sum + day.freeMinutes, 0) / 60) * 10,
  ) / 10

  if (criticalDays > 0) {
    return `${criticalDays} kritische Tag${criticalDays > 1 ? 'e' : ''}, ${warningDays} weitere mit engem Puffer bei ca. ${totalFreeHours} freien Stunden.`
  }

  if (warningDays > 0) {
    return `${warningDays} Tag${warningDays > 1 ? 'e' : ''} brauchen Aufmerksamkeit. Insgesamt sind noch ca. ${totalFreeHours} freie Stunden sichtbar.`
  }

  return `Die naechsten 7 Tage wirken aktuell stabil mit ca. ${totalFreeHours} freien Stunden im sichtbaren Plan.`
})
const preferredCompletionHours = computed(() => getPreferredHours(false))
const preferredDeepWorkHours = computed(() => getSuggestedDeepWorkHours())
const weekLifeAreaFocus = computed(() => {
  const weekEnd = new Date(todayRange.value.end)
  weekEnd.setDate(weekEnd.getDate() + 6)

  const grouped = new Map<LifeArea, { area: LifeArea; total: number; urgent: number; scheduled: number }>()

  for (const task of todayPendingTasks.value) {
    const relevantDate = task.scheduledStart || task.deadline
    if (relevantDate) {
      const date = new Date(relevantDate)
      if (date < todayRange.value.start || date > weekEnd) continue
    }

    const area = inferLifeArea(task)
    const current = grouped.get(area) || { area, total: 0, urgent: 0, scheduled: 0 }
    current.total += 1
    if (task.priority === 'critical' || task.priority === 'high') current.urgent += 1
    if (task.scheduledStart) current.scheduled += 1
    grouped.set(area, current)
  }

  return [...grouped.values()].sort((a, b) => {
    if (b.urgent !== a.urgent) return b.urgent - a.urgent
    if (b.total !== a.total) return b.total - a.total
    return b.scheduled - a.scheduled
  })
})
const personalGuidance = computed(() => {
  const leadArea = weekLifeAreaFocus.value[0] || null
  const stableArea = weekLifeAreaFocus.value.find(entry => entry.scheduled >= 2) || leadArea

  const why: string[] = []
  const alternatives: string[] = []

  if (preferredCompletionHours.value.length > 0) {
    why.push(`Deine staerksten Abschlusszeiten liegen aktuell bei ${preferredCompletionHours.value.map(formatHourLabel).join(', ')}.`)
  } else {
    why.push('Es sind noch wenig starke Abschlusszeiten gelernt. Heute zaehlt vor allem klares Feedback auf echte Abschluesse.')
  }

  if (preferredDeepWorkHours.value.length > 0) {
    why.push(`Deep-Work-Aufgaben gelingen dir bisher besonders rund um ${preferredDeepWorkHours.value.map(formatHourLabel).join(' und ')}.`)
  }

  if (leadArea) {
    why.push(`${resolveLifeAreaLabel(leadArea.area)} bekommt in den naechsten Tagen mehr Aufmerksamkeit, weil dort ${leadArea.total} offene Aufgabe${leadArea.total === 1 ? '' : 'n'} und ${leadArea.urgent} dringende Signale zusammenlaufen.`)
  }

  if (stableArea) {
    alternatives.push(`${resolveLifeAreaLabel(stableArea.area)} bewusst in deinen starken Stunden halten statt die Woche zu breit zu oeffnen.`)
  }

  if (preferredDeepWorkHours.value.length > 0) {
    alternatives.push(`Fokusaufgaben moeglichst in ${preferredDeepWorkHours.value.slice(0, 2).map(formatHourLabel).join(' oder ')} legen.`)
  } else {
    alternatives.push('Mit einem ehrlichen Deep-Work-Abschluss lernt die App schneller, wann echte Fokuszeit fuer dich passt.')
  }

  if (lifeAreaSummary.value.length > 1) {
    alternatives.push('Wenn ein Bereich zu viel Raum nimmt, nutze heute bewusst Commit oder Nicht-heute, um die Balance zu schuetzen.')
  }

  let uncertainty: string | null = null
  if (preferences.value.behaviorSignals.completionCount < 5) {
    uncertainty = 'Die Personalisierung basiert noch auf wenigen Abschluessen und wird mit den naechsten Tagen deutlich praeziser.'
  }

  const nextStep = leadArea
    ? `Halte heute besonders ${resolveLifeAreaLabel(leadArea.area)} im Blick, aber gib den anderen aktiven Bereichen bewusst nur so viel Raum wie wirklich noetig.`
    : 'Baue heute ein bis zwei ehrliche Abschluesse ein, damit die Personalisierung sichtbarer greifen kann.'

  return {
    leadArea,
    stableArea,
    why,
    alternatives,
    uncertainty,
    nextStep,
  }
})
const activeDailyModeMeta = computed(() => dailyModeOptions.find(option => option.value === activeDailyMode.value) || null)
const recentDailyReflections = computed(() => getRecentDailyReflections(5))
const reviewWindowStart = computed(() => {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - 6)
  return start
})

const learningReview = computed(() => {
  const recentTasks = tasks.value.filter(task => new Date(task.updatedAt) >= reviewWindowStart.value)
  const doneCount = recentTasks.filter(task => task.status === 'done').length
  const missedCount = recentTasks.filter(task => task.status === 'missed').length
  const scheduledCount = recentTasks.filter(task => task.status === 'scheduled').length
  const topHours = Object.entries(preferences.value.behaviorSignals.completedByHour)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([hour]) => `${hour}:00`)
  const deepWorkHours = Object.entries(preferences.value.behaviorSignals.deepWorkCompletedByHour)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([hour]) => `${hour}:00`)

  const why = [
    `${doneCount} Aufgaben wurden in den letzten 7 Tagen abgeschlossen, ${missedCount} landeten als verpasst oder mussten neu bewertet werden.`,
    `Insgesamt wurden bisher ${preferences.value.behaviorSignals.completionCount} Abschlüsse und ${preferences.value.behaviorSignals.rescheduledCount} Neuplanungen gelernt.`,
  ]

  if (topHours.length > 0) {
    why.push(`Deine stärksten Abschlusszeiten liegen aktuell vor allem bei ${topHours.join(', ')}.`)
  }

  const alternatives = [
    scheduledCount > 0
      ? 'Behalte die geplanten Blöcke im Blick und markiere ehrlich, was wirklich geschafft wurde.'
      : 'Nutze heute wieder bewusste Commit-Entscheidungen statt alles gleichzeitig zu planen.',
    deepWorkHours.length > 0
      ? `Lege Deep-Work-Aufgaben bevorzugt in ${deepWorkHours.join(' oder ')}.`
      : 'Sammle weiter ein paar Fokusabschlüsse, damit die Planung bessere Deep-Work-Zeiten lernen kann.',
  ]

  let uncertainty: string | null = null
  if (preferences.value.behaviorSignals.completionCount < 5) {
    uncertainty = 'Es sind noch wenig echte Verhaltensdaten vorhanden. Die Lernsignale werden mit den nächsten Tagen stabiler.'
  } else if (missedCount > doneCount) {
    uncertainty = 'Die letzte Woche war unruhig. Einzelne Lernsignale können daher stärker schwanken als sonst.'
  }

  const nextStep = missedCount > doneCount
    ? 'Plane heute bewusst nur wenige Aufgaben fest ein und nutze den Rest als flexible Optionen.'
    : 'Nutze die gelernten Uhrzeiten als Leitplanke und bestätige nur die Aufgaben, die du heute realistisch schaffen willst.'

  return {
    doneCount,
    missedCount,
    scheduledCount,
    topHours,
    deepWorkHours,
    why,
    alternatives,
    uncertainty,
    nextStep,
  }
})
const tomorrowForecast = computed(() => weekForecastDays.value[1] || null)
const morningBrief = computed(() => {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayReflection = getDailyReflection(yesterday)
  const tags = new Set(yesterdayReflection.tags)
  const tomorrow = tomorrowForecast.value
  const recentReflectionCount = recentDailyReflections.value.length

  const why: string[] = []
  if (tags.has('geschafft')) {
    why.push('Gestern war für dich insgesamt machbar. Morgen kann die App etwas ambitionierter, aber weiterhin klar priorisieren.')
  }
  if (tags.has('verschoben')) {
    why.push('Gestern musste einiges geschoben werden. Morgen lohnt sich ein engerer Fokus mit weniger gleichzeitigen Zusagen.')
  }
  if (tags.has('unrealistisch')) {
    why.push('Gestern wirkte die Planung zu dicht. Morgen sollte die KI bewusster mit Puffer und weniger Commit arbeiten.')
  }
  if (why.length === 0) {
    why.push('Es liegt noch kein kurzer Tagesabschluss vor. Die KI nutzt daher vor allem dein bisheriges Verhalten und den Wochenblick.')
  }

  if (tomorrow) {
    why.push(`Morgen wirken aktuell ${Math.round((tomorrow.freeMinutes / 60) * 10) / 10}h frei, ${tomorrow.eventCount} Termine und ${tomorrow.dueTasks.length} sichtbare Deadlines.`)
  }

  const alternatives = [
    activeDailyModeMeta.value
      ? `Starte morgen wieder bewusst mit einem Tagesmodus wie "${activeDailyModeMeta.value.label}" statt neutral loszulegen.`
      : 'Wähle morgen früh zuerst einen Tagesmodus, bevor du alles gleichzeitig planst.',
    learningReview.value.topHours[0]
      ? `Lege wichtige Abschlüsse möglichst rund um ${learningReview.value.topHours[0]} oder kurz davor.`
      : 'Nutze morgen einen klaren Fokusblock, damit die App stärkere Abschlusszeiten lernen kann.',
  ]

  let uncertainty: string | null = null
  if (recentReflectionCount < 2) {
    uncertainty = 'Es sind noch wenig explizite Tagesabschlüsse vorhanden. Der Morgenbrief wird mit ein paar echten Rückmeldungen deutlich präziser.'
  } else if (tags.has('unrealistisch')) {
    uncertainty = 'Wenn heute ähnlich voll wird wie gestern, sollte die KI eher konservativer planen als sonst.'
  }

  const nextStep = tags.has('unrealistisch')
    ? 'Plane morgen früh maximal drei klare Dinge fest ein und lass den Rest bewusst flexibel.'
    : tags.has('verschoben')
      ? 'Starte morgen mit einem kurzen Review der offenen Verschiebungen, bevor neue Aufgaben dazukommen.'
      : 'Nutze morgen den besten freien Block zuerst für die wichtigste Aufgabe statt mit Kleinkram zu starten.'

  return {
    why,
    alternatives,
    uncertainty,
    nextStep,
    yesterdayReflection,
  }
})

watch(todayReflection, (reflection) => {
  selectedReflectionTags.value = [...reflection.tags]
  dailyReflectionNote.value = reflection.note || ''
}, { immediate: true })

let desktopSidebarQuery: MediaQueryList | null = null
let onDesktopSidebarChange: ((event: MediaQueryListEvent) => void) | null = null

function updateDesktopSidebar(matches: boolean) {
  isDesktopSidebar.value = matches
  if (matches) {
    showSidebar.value = false
  }
}

onMounted(async () => {
  initClient()
  await initTasks()

  desktopSidebarQuery = window.matchMedia('(min-width: 1280px)')
  updateDesktopSidebar(desktopSidebarQuery.matches)
  onDesktopSidebarChange = (event) => updateDesktopSidebar(event.matches)
  desktopSidebarQuery.addEventListener('change', onDesktopSidebarChange)
})

onBeforeUnmount(() => {
  if (desktopSidebarQuery && onDesktopSidebarChange) {
    desktopSidebarQuery.removeEventListener('change', onDesktopSidebarChange)
  }
})

const timeRange = computed(() => {
  const d = currentDate.value
  const year = d.getFullYear()
  const month = d.getMonth()

  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month + 2, 0)

  return {
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
  }
})

watch([isLoggedIn, timeRange], ([loggedIn]) => {
  if (loggedIn) {
    fetchEvents(timeRange.value.timeMin, timeRange.value.timeMax)
  }
}, { immediate: true })

async function goToday() {
  currentDate.value = new Date()
  await nextTick()
  calendarSectionRef.value?.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  })
}

function goPrev() {
  const d = new Date(currentDate.value)
  if (currentView.value === 'month') {
    d.setMonth(d.getMonth() - 1)
  } else {
    d.setDate(d.getDate() - 7)
  }
  currentDate.value = d
}

function goNext() {
  const d = new Date(currentDate.value)
  if (currentView.value === 'month') {
    d.setMonth(d.getMonth() + 1)
  } else {
    d.setDate(d.getDate() + 7)
  }
  currentDate.value = d
}

function closeMobilePanels() {
  showSidebar.value = false
  showPlanningChat.value = false
  showPreferences.value = false
  showCommandCenter.value = false
}

function openCommandCenter() {
  closeMobilePanels()
  showCommandCenter.value = true
}

function openWorkspacePanel(section: WorkspaceSection = 'forecast') {
  activeWorkspaceSection.value = section
  showWorkspacePanel.value = true
}

function closeWorkspacePanel() {
  showWorkspacePanel.value = false
}

function surfaceButtonClass(surface: AppSurface) {
  return activeSurface.value === surface
    ? 'border-accent-blue/30 bg-accent-blue/12 text-text-primary shadow-glow-blue'
    : 'text-text-secondary hover:bg-white/[0.08] hover:text-text-primary'
}

function bottomNavItemClass(surface: AppSurface) {
  return activeSurface.value === surface ? 'text-text-primary' : 'text-text-muted'
}

function openTaskRoom() {
  showPlanningChat.value = false
  showPreferences.value = false
  showSidebar.value = true
}

function openPlannerRoom() {
  showSidebar.value = false
  showPreferences.value = false
  showPlanningChat.value = true
}

function goTodayInCalendar() {
  closeMobilePanels()
  goToday()
}

function toggleCalendarViewFromNav() {
  closeMobilePanels()
  currentView.value = currentView.value === 'month' ? 'week' : 'month'
}

function onSelectDate(dateStr: string) {
  selectedEvent.value = null
  selectedDate.value = dateStr
  showModal.value = true
}

function onSelectEvent(event: CalendarEvent) {
  selectedEvent.value = event
  selectedDate.value = undefined
  showModal.value = true
}

async function onSaveEvent(data: Omit<CalendarEvent, 'id'>) {
  let success: any
  if (selectedEvent.value?.id) {
    success = await updateEvent(selectedEvent.value.id, data)
  } else {
    success = await createEvent(data)
  }
  if (success) {
    showModal.value = false
    await fetchEvents(timeRange.value.timeMin, timeRange.value.timeMax)
  }
}

async function onDeleteEvent(eventId: string) {
  const success = await deleteEvent(eventId)
  if (success) {
    showModal.value = false
    await fetchEvents(timeRange.value.timeMin, timeRange.value.timeMax)
  }
}

function onOpenTask() {
  closeMobilePanels()
  selectedTask.value = null
  selectedDate.value = undefined
  showTaskModal.value = true
}

function onEditTask(task: Task) {
  selectedTask.value = task
  showTaskModal.value = true
}

async function onSaveTask(data: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) {
  if (selectedTask.value?.id) {
    await updateTask(selectedTask.value.id, data)
  } else {
    await createTask(data)
  }
  showTaskModal.value = false
}

async function onDeleteTask(taskId: string) {
  await removeTask(taskId)
  showTaskModal.value = false
}

async function onPlanningChatCreated() {
  await fetchEvents(timeRange.value.timeMin, timeRange.value.timeMax)
}

function onSelectTaskFromCommandCenter(task: Task) {
  closeMobilePanels()
  selectedTask.value = task
  selectedDate.value = undefined
  showTaskModal.value = true
}

function onSelectEventFromCommandCenter(event: CalendarEvent) {
  closeMobilePanels()
  selectedEvent.value = event
  selectedDate.value = undefined
  showModal.value = true
}

async function clearTaskSchedule(task: Task) {
  const calendarIds = task.scheduleBlocks?.map(block => block.calendarEventId).filter(Boolean) || []

  if (calendarIds.length > 0) {
    for (const calendarId of calendarIds) {
      await deleteEvent(calendarId!)
    }
  } else if (task.calendarEventId) {
    await deleteEvent(task.calendarEventId)
  }
}

function getDailyModeTaskScore(task: Task) {
  const now = Date.now()
  const deadlinePressure = task.deadline
    ? Math.max(0, 7 * 24 * 60 * 60 * 1000 - (new Date(task.deadline).getTime() - now))
    : 0

  switch (activeDailyMode.value) {
    case 'fokussiert':
      return (task.isDeepWork ? 5000 : 0) +
        (task.priority === 'critical' ? 3000 : task.priority === 'high' ? 2000 : 0) +
        deadlinePressure / (60 * 60 * 1000)
    case 'entspannt':
      return (task.isDeepWork ? -200 : 300) -
        Math.max(task.estimatedMinutes - 45, 0) +
        (task.scheduledStart ? 120 : 0)
    case 'wenig-zeit':
      return (task.estimatedMinutes <= 45 ? 2000 : task.estimatedMinutes <= 90 ? 1000 : 0) +
        (task.scheduledStart ? 200 : 0) -
        (task.isDeepWork ? 300 : 0)
    case 'aufholen':
      return deadlinePressure / (30 * 60 * 1000) +
        (task.priority === 'critical' ? 4000 : task.priority === 'high' ? 2000 : 0) +
        (task.status === 'missed' ? 1000 : 0)
    default:
      return 0
  }
}

function findSlotForTask(task: Task, start: Date, end: Date, preferSmallest = false) {
  const slots = findFreeSlots(start, end, events.value, effectiveTodayPreferences.value)
    .filter(slot => !task.isDeepWork || slot.isDeepWork)
    .filter(slot => ((slot.end.getTime() - slot.start.getTime()) / 60000) >= task.estimatedMinutes)

  if (slots.length === 0) return null

  const orderedSlots = [...slots].sort((a, b) => {
    const aDuration = a.end.getTime() - a.start.getTime()
    const bDuration = b.end.getTime() - b.start.getTime()
    if (preferSmallest && aDuration !== bDuration) {
      return aDuration - bDuration
    }
    if (!preferSmallest && a.start.getTime() !== b.start.getTime()) {
      return a.start.getTime() - b.start.getTime()
    }
    return aDuration - bDuration
  })

  return orderedSlots[0]
}

async function scheduleTaskIntoSlot(task: Task, slot: { start: Date; end: Date }, successMessage: string) {
  await clearTaskSchedule(task)

  const eventEnd = new Date(slot.start.getTime() + task.estimatedMinutes * 60000)
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const createdEvent = await createEvent({
    summary: task.title,
    description: `[KALENDER-AI-TASK:${task.id}]\n${task.description || ''}`,
    start: { dateTime: slot.start.toISOString(), timeZone: tz },
    end: { dateTime: eventEnd.toISOString(), timeZone: tz },
    colorId: task.isDeepWork ? '3' : '9',
  })

  if (!createdEvent?.id) {
    throw new Error('Kalendereintrag konnte nicht erstellt werden.')
  }

  await updateTask(task.id, {
    status: 'scheduled',
    scheduleBlocks: [{
      start: slot.start.toISOString(),
      end: eventEnd.toISOString(),
      calendarEventId: createdEvent.id,
    }],
    scheduledStart: slot.start.toISOString(),
    scheduledEnd: eventEnd.toISOString(),
    calendarEventId: createdEvent.id,
  })

  await fetchEvents(timeRange.value.timeMin, timeRange.value.timeMax)
  todayActionFeedback.value = successMessage
}

async function runTodayAction(action: () => Promise<void>) {
  if (isRunningTodayAction.value) return
  isRunningTodayAction.value = true
  todayActionFeedback.value = null
  try {
    await action()
  } catch (error: any) {
    todayActionFeedback.value = error?.message || 'Aktion konnte gerade nicht ausgeführt werden.'
  } finally {
    isRunningTodayAction.value = false
  }
}

function toggleCommitCandidate(taskId: string) {
  const current = new Set(selectedCommitTaskIds.value)
  if (current.has(taskId)) {
    current.delete(taskId)
  } else if (current.size < 3) {
    current.add(taskId)
  }
  selectedCommitTaskIds.value = [...current]
}

function toggleReflectionTag(tag: DailyReflectionTag) {
  const current = new Set(selectedReflectionTags.value)
  if (current.has(tag)) {
    current.delete(tag)
  } else {
    current.add(tag)
  }
  selectedReflectionTags.value = [...current]
}

function saveTodayReflectionSummary() {
  saveDailyReflection(selectedReflectionTags.value, dailyReflectionNote.value)
  const labels = reflectionOptions
    .filter(option => selectedReflectionTags.value.includes(option.value))
    .map(option => option.label.toLowerCase())

  todayActionFeedback.value = labels.length > 0
    ? `Tagesabschluss gespeichert: ${labels.join(', ')}. Der Morgenbrief wurde entsprechend geschärft.`
    : 'Tagesabschluss ohne Tags gespeichert. Die Notiz fließt trotzdem lokal in den Morgenbrief ein.'
}

function activateDailyMode(mode: DailyPlanningMode) {
  setDailyMode(mode)
  const meta = dailyModeOptions.find(option => option.value === mode)
  todayActionFeedback.value = meta
    ? `Tagesmodus aktiviert: ${meta.label}. ${meta.description}`
    : 'Tagesmodus wurde gespeichert.'
}

function resetDailyMode() {
  clearDailyMode()
  todayActionFeedback.value = 'Tagesmodus zurückgesetzt. Die Planung ist wieder neutral.'
}

function commitSelectedTasks() {
  const committedTaskIds = selectedCommitTaskIds.value.filter(taskId =>
    todayPendingTasks.value.some(task => task.id === taskId),
  ).slice(0, 3)

  if (committedTaskIds.length === 0) {
    todayActionFeedback.value = 'Wähle zuerst ein bis drei Aufgaben für deinen heutigen Commit aus.'
    return
  }

  const deferredTaskIds = todayPendingTasks.value
    .filter(task => !committedTaskIds.includes(task.id))
    .map(task => task.id)

  setDailyCommit(committedTaskIds, deferredTaskIds)
  todayActionFeedback.value = `Heute committed: ${committedTaskIds.length} Aufgabe${committedTaskIds.length === 1 ? '' : 'n'} im Fokus, ${deferredTaskIds.length} bewusst nicht für heute.`
}

function clearTodayCommit() {
  clearDailyCommit()
  selectedCommitTaskIds.value = commitCandidateTasks.value.slice(0, 3).map(task => task.id)
  todayActionFeedback.value = 'Der Tages-Commit wurde gelöst. Alle offenen Aufgaben sind wieder neutral.'
}

async function planNextTaskToday() {
  if (!nextBestTask.value) return

  const slot = findSlotForTask(nextBestTask.value, todayRange.value.start, todayRange.value.end)
  if (!slot) {
    throw new Error('Heute ist kein passender freier Block mehr für diese Aufgabe verfügbar.')
  }

  await scheduleTaskIntoSlot(
    nextBestTask.value,
    slot,
    `"${nextBestTask.value.title}" wurde heute neu eingeplant.`,
  )
}

async function fitNextTaskIntoSmallGap() {
  if (!nextBestTask.value) return

  const slot = findSlotForTask(nextBestTask.value, todayRange.value.start, todayRange.value.end, true)
  if (!slot) {
    throw new Error('Es gibt heute keine passende kleinere Lücke für diese Aufgabe.')
  }

  await scheduleTaskIntoSlot(
    nextBestTask.value,
    slot,
    `"${nextBestTask.value.title}" wurde in eine kleinere freie Lücke gesetzt.`,
  )
}

async function moveNextTaskToTomorrow() {
  if (!nextBestTask.value) return

  const tomorrowStart = new Date(todayRange.value.start)
  tomorrowStart.setDate(tomorrowStart.getDate() + 1)
  const tomorrowEnd = new Date(todayRange.value.end)
  tomorrowEnd.setDate(tomorrowEnd.getDate() + 1)

  const slot = findSlotForTask(nextBestTask.value, tomorrowStart, tomorrowEnd)
  if (!slot) {
    throw new Error('Morgen gibt es aktuell keinen passenden freien Slot für diese Aufgabe.')
  }

  await scheduleTaskIntoSlot(
    nextBestTask.value,
    slot,
    `"${nextBestTask.value.title}" wurde auf morgen verschoben.`,
  )
}

function formatDateTime(value?: string) {
  if (!value) return ''
  return new Date(value).toLocaleString('de-DE', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatSlotRange(start: Date, end: Date) {
  return `${start.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} bis ${end.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`
}

function isSameCalendarDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}
</script>

<template>
  <div class="flex min-h-screen bg-base text-text-primary">
    <aside class="ambient-glow-purple hidden w-20 flex-shrink-0 flex-col items-center border-r border-border-subtle bg-surface/85 px-2 py-4 xl:w-56 xl:items-stretch xl:px-3 lg:flex">
      <div class="relative z-10 flex h-10 w-10 items-center justify-center rounded-glass bg-gradient-to-br from-accent-purple to-accent-blue text-white shadow-glow-purple">
        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z" />
        </svg>
      </div>

      <div class="relative z-10 mt-8 flex flex-col items-center gap-2 xl:items-stretch">
        <button
          type="button"
          class="btn-secondary inline-flex h-11 w-11 items-center justify-center xl:w-full xl:justify-start xl:gap-3 xl:px-3"
          :class="surfaceButtonClass('calendar')"
          title="Heute"
          @click="goToday"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5.5v-6h-5v6H4a1 1 0 0 1-1-1v-9.5Z" />
          </svg>
          <span class="hidden xl:inline text-sm">Heute</span>
        </button>
        <button
          type="button"
          class="btn-secondary inline-flex h-11 w-11 items-center justify-center xl:w-full xl:justify-start xl:gap-3 xl:px-3"
          :class="surfaceButtonClass('calendar')"
          title="Kalender"
          @click="currentView = currentView === 'month' ? 'week' : 'month'"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z" />
          </svg>
          <span class="hidden xl:inline text-sm">Kalender</span>
        </button>
        <button
          type="button"
          class="btn-secondary inline-flex h-11 w-11 items-center justify-center xl:w-full xl:justify-start xl:gap-3 xl:px-3"
          :class="surfaceButtonClass('tasks')"
          title="Aufgaben"
          @click="openTaskRoom"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />
          </svg>
          <span class="hidden xl:inline text-sm">Aufgaben</span>
        </button>
        <button
          type="button"
          class="btn-secondary inline-flex h-11 w-11 items-center justify-center xl:w-full xl:justify-start xl:gap-3 xl:px-3"
          :class="surfaceButtonClass('planner')"
          title="KI Planer"
          @click="openPlannerRoom"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 3l2.4 4.86L20 10l-4 3.89L17 20l-5-2.67L7 20l1-6.11L4 10l5.6-2.14L12 3Z" />
          </svg>
          <span class="hidden xl:inline text-sm">KI</span>
        </button>
        <button
          type="button"
          class="btn-secondary inline-flex h-11 w-11 items-center justify-center xl:w-full xl:justify-start xl:gap-3 xl:px-3"
          :class="surfaceButtonClass('insights')"
          title="Einblicke"
          @click="openWorkspacePanel('forecast')"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M4 19h16M7 16V9m5 7V5m5 11v-6" />
          </svg>
          <span class="hidden xl:inline text-sm">Einblicke</span>
        </button>
      </div>

      <div class="relative z-10 mt-auto flex flex-col items-center gap-2 xl:items-stretch">
        <button
          type="button"
          class="btn-secondary inline-flex h-11 w-11 items-center justify-center xl:w-full xl:justify-start xl:gap-3 xl:px-3"
          :class="surfaceButtonClass('settings')"
          title="Planung und Routinen"
          @click="showPreferences = true"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M10.5 6h9m-9 6h9m-9 6h9M4.5 6h.008v.008H4.5V6Zm0 6h.008v.008H4.5V12Zm0 6h.008v.008H4.5V18Z" />
          </svg>
          <span class="hidden xl:inline text-sm">Planung</span>
        </button>
        <img
          v-if="userProfile"
          :src="userProfile.picture"
          :alt="userProfile.name"
          class="h-10 w-10 rounded-full border border-border-subtle object-cover xl:mx-auto"
          referrerpolicy="no-referrer"
        >
      </div>
    </aside>

    <div class="flex min-w-0 flex-1 flex-col">
      <NavBar
        :current-view="currentView"
        :current-date="currentDate"
        :warnings-count="criticalCount"
        @update:current-view="currentView = $event"
        @open-settings="showPreferences = true"
        @open-task="onOpenTask"
        @open-planner="showPlanningChat = true"
        @toggle-sidebar="showSidebar = !showSidebar"
        @open-command-center="openCommandCenter"
        @go-today="goToday"
        @go-prev="goPrev"
        @go-next="goNext"
      />

      <DeadlineWarning />

      <div v-if="authError || calError" class="px-4 pt-3 lg:px-6">
        <div class="glass-card border border-priority-critical/30 bg-priority-critical/10 px-4 py-3 text-sm text-[#FFD3DC]">
          {{ authError || calError }}
        </div>
      </div>

      <div v-if="!isLoggedIn" class="flex flex-1 items-center justify-center px-4 pb-24 pt-8 lg:px-6 lg:pb-8">
        <div class="glass-card-elevated ambient-glow-purple relative z-10 w-full max-w-2xl overflow-hidden p-8 text-center">
          <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-glass bg-gradient-to-br from-accent-purple to-accent-blue text-white shadow-glow-purple">
            <svg class="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z" />
            </svg>
          </div>
          <h1 class="mt-6 text-3xl font-semibold text-text-primary">Kalender AI Workspace</h1>
          <p class="mx-auto mt-3 max-w-xl text-base leading-7 text-text-secondary">
            Verbinde dein Google-Konto und steuere Termine, Aufgaben, Routinen und KI-Planung in einer ruhigen Premium-Oberfläche.
          </p>
          <div class="mt-8 grid gap-3 text-left sm:grid-cols-3">
            <div class="rounded-glass border border-border-subtle bg-white/[0.04] p-4">
              <p class="text-xs uppercase tracking-[0.24em] text-accent-purple-soft">Planen</p>
              <p class="mt-2 text-sm text-text-secondary">Monats- und Wochenansicht mit Fokus auf freie Blöcke und Tagesdruck.</p>
            </div>
            <div class="rounded-glass border border-border-subtle bg-white/[0.04] p-4">
              <p class="text-xs uppercase tracking-[0.24em] text-accent-blue">KI</p>
              <p class="mt-2 text-sm text-text-secondary">Priorisierung, Projektgenerator und natürlicher Planungs-Chat bleiben vollständig erhalten.</p>
            </div>
            <div class="rounded-glass border border-border-subtle bg-white/[0.04] p-4">
              <p class="text-xs uppercase tracking-[0.24em] text-accent-green">Struktur</p>
              <p class="mt-2 text-sm text-text-secondary">Routinen, Deep Work, Schlaf- und Pendelzeiten werden weiterhin in die Planung einbezogen.</p>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="flex min-h-0 flex-1 overflow-hidden">
        <main class="min-w-0 flex-1 overflow-y-auto px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-4 lg:px-6 lg:pb-8">
          <div class="mobile-dashboard-stack">
            <div class="mobile-dashboard-panel grid gap-4 xl:grid-cols-[1.25fr,0.95fr,0.9fr]">
            <section class="glass-card ambient-glow-purple relative overflow-hidden p-5">
              <div class="relative z-10 flex items-start justify-between gap-4">
                <div>
                  <p class="text-xs font-semibold uppercase tracking-[0.24em] text-accent-purple-soft">Heute</p>
                  <h2 class="mt-2 text-2xl font-semibold text-text-primary">
                    {{ new Date().toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long' }) }}
                  </h2>
                  <p class="mt-2 max-w-xl text-sm leading-6 text-text-secondary">{{ todayPressure }}</p>
                </div>
                <button class="btn-primary px-4 py-2 text-sm" @click="showPlanningChat = true">
                  Neu planen
                </button>
              </div>

              <div class="relative z-10 mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div class="rounded-glass border border-border-subtle bg-white/[0.04] px-4 py-3">
                  <div class="text-lg font-semibold text-text-primary">{{ todayEvents.length }}</div>
                  <div class="text-xs text-text-muted">Termine heute</div>
                </div>
                <div class="rounded-glass border border-border-subtle bg-white/[0.04] px-4 py-3">
                  <div class="text-lg font-semibold text-text-primary">{{ todayPendingTasks.length }}</div>
                  <div class="text-xs text-text-muted">Offene Aufgaben</div>
                </div>
                <div class="rounded-glass border border-border-subtle bg-white/[0.04] px-4 py-3">
                  <div class="text-lg font-semibold text-text-primary">{{ Math.round(todayFreeMinutes / 60 * 10) / 10 }}h</div>
                  <div class="text-xs text-text-muted">Freie Zeit heute</div>
                </div>
                <div class="rounded-glass border border-border-subtle bg-white/[0.04] px-4 py-3">
                  <div class="text-lg font-semibold" :class="criticalCount > 0 ? 'text-priority-critical' : 'text-text-primary'">{{ criticalCount }}</div>
                  <div class="text-xs text-text-muted">Kritische Warnungen</div>
                </div>
              </div>

              <div class="relative z-10 mt-4 rounded-glass border border-accent-blue/15 bg-white/[0.03] p-4">
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p class="text-xs font-semibold uppercase tracking-[0.2em] text-accent-blue">Tagesmodus</p>
                    <p class="mt-2 text-sm leading-6 text-text-secondary">
                      Gib der KI für heute einen klaren Arbeitsmodus statt stiller Annahmen.
                    </p>
                  </div>
                  <button
                    v-if="activeDailyMode"
                    type="button"
                    class="btn-secondary px-3 py-2 text-sm"
                    @click="resetDailyMode"
                  >
                    Modus lösen
                  </button>
                </div>

                <div class="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  <button
                    v-for="option in dailyModeOptions"
                    :key="option.value"
                    type="button"
                    class="rounded-glass border px-3 py-3 text-left transition"
                    :class="activeDailyMode === option.value
                      ? 'border-accent-blue/30 bg-accent-blue/12'
                      : 'border-border-subtle bg-white/[0.04] hover:border-border-strong hover:bg-white/[0.06]'"
                    @click="activateDailyMode(option.value)"
                  >
                    <div class="flex items-center justify-between gap-2">
                      <div class="text-sm font-medium text-text-primary">{{ option.label }}</div>
                      <span
                        class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                        :class="activeDailyMode === option.value
                          ? 'bg-accent-blue/15 text-accent-blue'
                          : 'bg-white/[0.06] text-text-muted'"
                      >
                        {{ activeDailyMode === option.value ? 'aktiv' : 'wählbar' }}
                      </span>
                    </div>
                    <div class="mt-2 text-xs text-text-secondary">{{ option.description }}</div>
                  </button>
                </div>
              </div>

              <div v-if="todayActionFeedback" class="relative z-10 mt-4 rounded-glass border border-accent-green/25 bg-accent-green/10 px-4 py-3 text-sm text-accent-green">
                {{ todayActionFeedback }}
              </div>
            </section>

            <section class="glass-card p-5">
              <p class="text-xs font-semibold uppercase tracking-[0.24em] text-accent-green">Nächster bester Schritt</p>
              <div v-if="nextBestTask" class="mt-4">
                <h3 class="text-lg font-semibold text-text-primary">{{ nextBestTask.title }}</h3>
                <p class="mt-2 text-sm leading-6 text-text-secondary">{{ nextBestTaskReason }}</p>
                <div class="mt-4 flex flex-wrap gap-2">
                  <span class="rounded-full bg-white/[0.05] px-3 py-1 text-xs text-text-secondary">{{ nextBestTask.priority }}</span>
                  <span
                    class="rounded-full border px-3 py-1 text-xs"
                    :class="lifeAreaColors[inferLifeArea(nextBestTask)]"
                  >
                    {{ resolveLifeAreaLabel(inferLifeArea(nextBestTask)) }}
                  </span>
                  <span v-if="activeDailyModeMeta" class="rounded-full bg-accent-blue/10 px-3 py-1 text-xs text-accent-blue">
                    Modus {{ activeDailyModeMeta.label }}
                  </span>
                  <span v-if="nextBestTask.deadline" class="rounded-full bg-priority-high/10 px-3 py-1 text-xs text-priority-high">
                    Deadline {{ new Date(nextBestTask.deadline).toLocaleDateString('de-DE') }}
                  </span>
                  <span v-if="nextBestTask.scheduledStart" class="rounded-full bg-accent-blue/10 px-3 py-1 text-xs text-accent-blue">
                    Geplant {{ formatDateTime(nextBestTask.scheduledStart) }}
                  </span>
                </div>
                <button class="btn-secondary mt-4 px-4 py-2 text-sm" @click="onEditTask(nextBestTask)">
                  Aufgabe öffnen
                </button>
                <DecisionSummaryCard
                  class="mt-4"
                  title="Warum dieser Fokus?"
                  mode-label="Empfehlung"
                  tone="neutral"
                  :why="todayDecisionWhy"
                  :alternatives="todayDecisionAlternatives"
                  :next-step="todayDecisionNextStep"
                />
                <div class="mt-4 rounded-glass border border-accent-purple/20 bg-accent-purple/10 p-4">
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <div class="text-xs font-semibold uppercase tracking-[0.2em] text-accent-purple-soft">Diese 3 Dinge heute</div>
                      <p class="mt-2 text-sm leading-6 text-text-secondary">
                        Triff eine bewusste Tagesentscheidung: maximal drei Aufgaben aktiv committen, den Rest sichtbar als nicht-heute markieren.
                      </p>
                    </div>
                    <span class="rounded-full border border-accent-purple/20 bg-white/[0.06] px-2.5 py-1 text-[11px] text-accent-purple-soft">
                      {{ todayCommit.committedTaskIds.length }}/3 gewählt
                    </span>
                  </div>

                  <div v-if="todayCommittedTasks.length > 0" class="mt-4 space-y-2">
                    <div
                      v-for="task in todayCommittedTasks"
                      :key="`commit-${task.id}`"
                      class="rounded-glass border border-accent-purple/20 bg-white/[0.05] px-3 py-3"
                    >
                      <div class="flex items-center justify-between gap-2">
                        <div class="min-w-0">
                          <div class="text-sm font-medium text-text-primary">{{ task.title }}</div>
                          <div class="mt-1 text-xs text-text-secondary">{{ task.priority }}<span v-if="task.deadline"> · Deadline {{ new Date(task.deadline).toLocaleDateString('de-DE') }}</span></div>
                        </div>
                        <span class="rounded-full bg-accent-purple/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-purple-soft">
                          committed
                        </span>
                      </div>
                    </div>
                    <div class="flex flex-wrap items-center justify-between gap-3 pt-1">
                      <div class="text-xs text-text-secondary">{{ todayDeferredTasks.length }} weitere Aufgaben sind bewusst als nicht-heute markiert.</div>
                      <button class="btn-secondary px-3 py-2 text-sm" @click="clearTodayCommit">
                        Commit lösen
                      </button>
                    </div>
                  </div>

                  <div v-else class="mt-4 space-y-3">
                    <div class="grid gap-2">
                      <button
                        v-for="task in commitCandidateTasks"
                        :key="`candidate-${task.id}`"
                        type="button"
                        class="rounded-glass border px-3 py-3 text-left transition"
                        :class="selectedCommitTaskIds.includes(task.id)
                          ? 'border-accent-purple/30 bg-white/[0.07]'
                          : 'border-border-subtle bg-white/[0.04] hover:border-border-strong hover:bg-white/[0.06]'"
                        @click="toggleCommitCandidate(task.id)"
                      >
                        <div class="flex items-center justify-between gap-3">
                          <div class="min-w-0">
                            <div class="text-sm font-medium text-text-primary">{{ task.title }}</div>
                            <div class="mt-1 text-xs text-text-secondary">
                              {{ task.priority }}<span v-if="task.deadline"> · Deadline {{ new Date(task.deadline).toLocaleDateString('de-DE') }}</span>
                            </div>
                          </div>
                          <span
                            class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                            :class="selectedCommitTaskIds.includes(task.id)
                              ? 'bg-accent-purple/15 text-accent-purple-soft'
                              : 'bg-white/[0.06] text-text-muted'"
                          >
                            {{ selectedCommitTaskIds.includes(task.id) ? 'gewählt' : 'optional' }}
                          </span>
                        </div>
                      </button>
                    </div>
                    <div class="flex flex-wrap items-center justify-between gap-3">
                      <div class="text-xs text-text-secondary">
                        Bis zu drei Aufgaben aktiv wählen. Alles andere wird für heute bewusst entlastet.
                      </div>
                      <button class="btn-primary px-4 py-2 text-sm" @click="commitSelectedTasks">
                        Diese Auswahl committen
                      </button>
                    </div>
                  </div>
                </div>
                <div class="mt-4 flex flex-wrap gap-2">
                  <button class="btn-primary px-4 py-2 text-sm disabled:opacity-50" :disabled="isRunningTodayAction" @click="runTodayAction(planNextTaskToday)">
                    Heute neu planen
                  </button>
                  <button class="btn-secondary px-4 py-2 text-sm disabled:opacity-50" :disabled="isRunningTodayAction" @click="runTodayAction(fitNextTaskIntoSmallGap)">
                    Kleinere Lücke finden
                  </button>
                  <button class="btn-secondary px-4 py-2 text-sm disabled:opacity-50" :disabled="isRunningTodayAction" @click="runTodayAction(moveNextTaskToTomorrow)">
                    Für morgen schieben
                  </button>
                </div>
              </div>
              <p v-else class="mt-4 text-sm leading-6 text-text-secondary">
                Gerade ist nichts offen. Du kannst entspannt neue Aufgaben oder Termine planen.
              </p>
              <DecisionSummaryCard
                v-if="!nextBestTask"
                class="mt-4"
                title="Warum gerade kein Fokus?"
                mode-label="Empfehlung"
                tone="success"
                :why="todayDecisionWhy"
                :alternatives="todayDecisionAlternatives"
                :next-step="todayDecisionNextStep"
              />
            </section>

            <section class="glass-card p-5">
              <p class="text-xs font-semibold uppercase tracking-[0.24em] text-accent-blue">Freie Fokusblöcke</p>
              <div v-if="todayFocusSlots.length > 0" class="mt-4 space-y-3">
                <div
                  v-for="slot in todayFocusSlots"
                  :key="slot.start.toISOString()"
                  class="rounded-glass border border-accent-purple/15 bg-accent-purple/8 px-4 py-3"
                >
                  <div class="text-sm font-medium text-text-primary">{{ formatSlotRange(slot.start, slot.end) }}</div>
                  <div class="mt-1 text-xs text-text-secondary">
                    {{ Math.round((slot.end.getTime() - slot.start.getTime()) / 60000) }} Minuten ruhige Zeit
                  </div>
                </div>
              </div>
              <p v-else class="mt-4 text-sm leading-6 text-text-secondary">
                Heute ist kein längerer Fokusblock mehr frei. Kleinere Slots sind aber noch möglich.
              </p>
            </section>
            </div>

          <section class="glass-card mt-4 p-5">
            <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p class="text-xs font-semibold uppercase tracking-[0.24em] text-accent-blue">Einblicke</p>
                <h2 class="mt-2 text-xl font-semibold text-text-primary">Analyse nur dann, wenn du sie gerade brauchst</h2>
                <p class="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">
                  Die Startseite bleibt auf Tagesfokus und Kalender konzentriert. Wochenblick, Lebensbereiche und Rückblick öffnest du gezielt als eigenen Workspace-Bereich.
                </p>
              </div>
              <div class="rounded-full border border-border-subtle bg-white/[0.04] px-3 py-1 text-[11px] text-text-secondary">
                {{ showWorkspacePanel ? `${activeWorkspaceMeta.label} offen` : 'Standardansicht aktiv' }}
              </div>
            </div>

            <div class="mt-4 flex flex-wrap gap-2">
              <button
                v-for="option in workspaceSectionOptions"
                :key="option.value"
                type="button"
                class="rounded-full border px-3 py-2 text-left text-xs transition"
                :class="showWorkspacePanel && activeWorkspaceSection === option.value
                  ? 'border-accent-blue/30 bg-accent-blue/12 text-accent-blue'
                  : 'border-border-subtle bg-white/[0.04] text-text-secondary hover:border-border-strong hover:bg-white/[0.06] hover:text-text-primary'"
                @click="openWorkspacePanel(option.value)"
              >
                <span class="font-medium">{{ option.label }}</span>
                <span class="ml-1 hidden sm:inline">{{ option.detail }}</span>
              </button>

              <button
                v-if="showWorkspacePanel"
                type="button"
                class="btn-secondary px-4 py-2 text-sm"
                @click="closeWorkspacePanel"
              >
                Einblicke ausblenden
              </button>
            </div>
          </section>

          <section v-if="showWorkspacePanel && activeWorkspaceSection === 'focus'" class="mobile-dashboard-panel glass-card mt-4 p-5">
            <div class="flex items-start justify-between gap-4">
              <div>
                <p class="text-xs font-semibold uppercase tracking-[0.24em] text-accent-blue">Freie Fokusblöcke</p>
                <h2 class="mt-2 text-xl font-semibold text-text-primary">Ruhige Zeitfenster für echte Hebel</h2>
                <p class="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">
                  Hier siehst du gezielt die Blöcke, in denen Deep Work heute oder als nächster Schritt realistisch ist.
                </p>
              </div>
              <div class="rounded-full border border-border-subtle bg-white/[0.04] px-3 py-1 text-[11px] text-text-secondary">
                {{ todayFocusSlots.length }} sichtbar
              </div>
            </div>

            <div v-if="todayFocusSlots.length > 0" class="mt-5 grid gap-3 md:grid-cols-3">
              <div
                v-for="slot in todayFocusSlots"
                :key="`workspace-focus-${slot.start.toISOString()}`"
                class="rounded-glass border border-accent-purple/15 bg-accent-purple/8 px-4 py-3"
              >
                <div class="text-sm font-medium text-text-primary">{{ formatSlotRange(slot.start, slot.end) }}</div>
                <div class="mt-1 text-xs text-text-secondary">
                  {{ Math.round((slot.end.getTime() - slot.start.getTime()) / 60000) }} Minuten ruhige Zeit
                </div>
              </div>
            </div>

            <p v-else class="mt-5 text-sm leading-6 text-text-secondary">
              Heute ist kein längerer Fokusblock mehr frei. Kleinere Slots sind aber noch möglich.
            </p>

            <DecisionSummaryCard
              class="mt-5"
              title="Wie du den Fokusbereich nutzen solltest"
              mode-label="Einblicke"
              tone="preview"
              :why="[
                'Die Landing Page bleibt bewusst kompakt. Fokusfenster liegen deshalb nur noch im Workspace statt dauerhaft im Sichtfluss.',
                todayFocusSlots.length > 0
                  ? `Gerade sind ${todayFocusSlots.length} fokustaugliche Slots sichtbar.`
                  : 'Heute ist aktuell kein langer Deep-Work-Block mehr frei.'
              ]"
              :alternatives="[
                'Direkt in den Aufgabenraum wechseln und Auto-Planen prüfen.',
                'Im KI-Planer einen Termin oder Fokusblock per Sprache anlegen.'
              ]"
              next-step="Öffne danach eine wichtige Aufgabe oder plane sie gezielt in einen der sichtbaren Fokusblöcke."
            />
          </section>

          <section v-if="showWorkspacePanel && activeWorkspaceSection === 'balance'" class="mobile-dashboard-panel glass-card mt-4 p-5">
            <div class="flex items-start justify-between gap-4">
              <div>
                <p class="text-xs font-semibold uppercase tracking-[0.24em] text-accent-purple-soft">Lebensbereiche</p>
                <h2 class="mt-2 text-xl font-semibold text-text-primary">Balance im aktuellen Plan</h2>
                <p class="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">{{ lifeAreaBalanceSummary }}</p>
              </div>
              <div class="rounded-full border border-border-subtle bg-white/[0.04] px-3 py-1 text-[11px] text-text-secondary">
                {{ lifeAreaSummary.length }} aktiv
              </div>
            </div>

            <div v-if="lifeAreaSummary.length > 0" class="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <div
                v-for="entry in lifeAreaSummary"
                :key="entry.area"
                class="rounded-glass border p-4"
                :class="lifeAreaColors[entry.area]"
              >
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <div class="text-sm font-semibold">{{ resolveLifeAreaLabel(entry.area) }}</div>
                    <div class="mt-1 text-xs opacity-80">{{ entry.total }} offene Aufgabe{{ entry.total === 1 ? '' : 'n' }}</div>
                  </div>
                  <span class="rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                    {{ entry.urgent }} dringend
                  </span>
                </div>
                <div class="mt-4 flex items-center justify-between text-xs opacity-80">
                  <span>{{ entry.deepWork }} Fokusblock{{ entry.deepWork === 1 ? '' : 'e' }}</span>
                  <span>{{ Math.round((entry.total / Math.max(todayPendingTasks.length, 1)) * 100) }}%</span>
                </div>
              </div>
            </div>

            <p v-else class="mt-5 text-sm leading-6 text-text-secondary">
              Sobald offene Aufgaben da sind, zeigt dir die App hier die Balance zwischen Arbeit, Privatleben, Gesundheit, Lernen und Alltag.
            </p>
          </section>

          <section v-if="showWorkspacePanel && activeWorkspaceSection === 'forecast'" class="mobile-dashboard-panel glass-card mt-4 p-5">
            <div class="flex items-start justify-between gap-4">
              <div>
                <p class="text-xs font-semibold uppercase tracking-[0.24em] text-accent-blue">Wochenblick</p>
                <h2 class="mt-2 text-xl font-semibold text-text-primary">Nächste 7 Tage</h2>
                <p class="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">{{ weekForecastSummary }}</p>
              </div>
              <div class="rounded-full border border-border-subtle bg-white/[0.04] px-3 py-1 text-[11px] text-text-secondary">
                Forecast
              </div>
            </div>

            <div class="mt-5 overflow-x-auto">
              <div class="grid min-w-[720px] gap-3 md:grid-cols-7">
                <div
                  v-for="day in weekForecastDays"
                  :key="day.key"
                  class="rounded-glass border p-4"
                  :class="day.status === 'critical'
                    ? 'border-priority-critical/25 bg-priority-critical/10'
                    : day.status === 'warning'
                      ? 'border-priority-high/25 bg-priority-high/10'
                      : 'border-border-subtle bg-white/[0.03]'"
                >
                  <div class="flex items-start justify-between gap-2">
                    <div>
                      <p class="text-[11px] uppercase tracking-[0.22em] text-text-muted">
                        {{ day.dayStart.toLocaleDateString('de-DE', { weekday: 'short' }) }}
                      </p>
                      <div class="mt-2 text-lg font-semibold text-text-primary">
                        {{ day.dayStart.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) }}
                      </div>
                    </div>
                    <span
                      class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                      :class="day.status === 'critical'
                        ? 'bg-priority-critical/15 text-priority-critical'
                        : day.status === 'warning'
                          ? 'bg-priority-high/15 text-priority-high'
                          : 'bg-accent-green/15 text-accent-green'"
                    >
                      {{ day.statusLabel }}
                    </span>
                  </div>

                  <div class="mt-4 space-y-2 text-xs text-text-secondary">
                    <div>{{ Math.round((day.freeMinutes / 60) * 10) / 10 }}h frei</div>
                    <div>{{ day.eventCount }} Termin{{ day.eventCount === 1 ? '' : 'e' }}</div>
                    <div>{{ day.scheduledTasks.length }} geplante Aufgabe{{ day.scheduledTasks.length === 1 ? '' : 'n' }}</div>
                    <div>{{ day.dueTasks.length }} Deadline{{ day.dueTasks.length === 1 ? '' : 's' }}</div>
                  </div>

                  <p class="mt-4 text-xs leading-5"
                    :class="day.status === 'critical'
                      ? 'text-priority-critical'
                      : day.status === 'warning'
                        ? 'text-priority-high'
                        : 'text-text-secondary'"
                  >
                    {{ day.detail }}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section v-if="showWorkspacePanel && activeWorkspaceSection === 'review'" class="mobile-dashboard-panel glass-card mt-4 p-5">
            <div class="flex items-start justify-between gap-4">
              <div>
                <p class="text-xs font-semibold uppercase tracking-[0.24em] text-accent-green">Rückblick</p>
                <h2 class="mt-2 text-xl font-semibold text-text-primary">Lernen aus den letzten Tagen</h2>
                <p class="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">
                  So wird sichtbar, was die App aus echten Abschlüssen, Verschiebungen und Fokuszeiten gelernt hat.
                </p>
              </div>
              <div class="rounded-full border border-border-subtle bg-white/[0.04] px-3 py-1 text-[11px] text-text-secondary">
                Verhalten
              </div>
            </div>

            <div class="mt-5 grid gap-3 md:grid-cols-3">
              <div class="rounded-glass border border-border-subtle bg-white/[0.04] px-4 py-3">
                <div class="text-lg font-semibold text-text-primary">{{ learningReview.doneCount }}</div>
                <div class="text-xs text-text-muted">Diese Woche erledigt</div>
              </div>
              <div class="rounded-glass border border-border-subtle bg-white/[0.04] px-4 py-3">
                <div class="text-lg font-semibold" :class="learningReview.missedCount > learningReview.doneCount ? 'text-priority-high' : 'text-text-primary'">
                  {{ learningReview.missedCount }}
                </div>
                <div class="text-xs text-text-muted">Diese Woche verpasst</div>
              </div>
              <div class="rounded-glass border border-border-subtle bg-white/[0.04] px-4 py-3">
                <div class="text-lg font-semibold text-text-primary">{{ learningReview.topHours[0] || 'noch offen' }}</div>
                <div class="text-xs text-text-muted">Stärkste Abschlusszeit</div>
              </div>
            </div>

            <div class="mt-5 rounded-glass border border-accent-blue/20 bg-accent-blue/10 p-4">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-xs font-semibold uppercase tracking-[0.2em] text-accent-blue">Persönliche Signale</p>
                  <p class="mt-2 text-sm leading-6 text-text-secondary">
                    So fließen deine gelernten Zeiten und aktuellen Bereichsschwerpunkte heute konkret in die Empfehlungen ein.
                  </p>
                </div>
                <span class="rounded-full border border-accent-blue/20 bg-white/[0.06] px-2.5 py-1 text-[11px] text-accent-blue">
                  Personalisiert
                </span>
              </div>

              <div class="mt-4 grid gap-3 md:grid-cols-3">
                <div class="rounded-glass border border-border-subtle bg-white/[0.04] px-4 py-3">
                  <div class="text-lg font-semibold text-text-primary">
                    {{ preferredCompletionHours[0] !== undefined ? formatHourLabel(preferredCompletionHours[0]) : 'noch offen' }}
                  </div>
                  <div class="text-xs text-text-muted">Starke Stunden</div>
                </div>
                <div class="rounded-glass border border-border-subtle bg-white/[0.04] px-4 py-3">
                  <div class="text-lg font-semibold text-text-primary">
                    {{ preferredDeepWorkHours[0] !== undefined ? formatHourLabel(preferredDeepWorkHours[0]) : 'noch offen' }}
                  </div>
                  <div class="text-xs text-text-muted">Deep-Work-Zeit</div>
                </div>
                <div class="rounded-glass border border-border-subtle bg-white/[0.04] px-4 py-3">
                  <div class="text-lg font-semibold text-text-primary">
                    {{ personalGuidance.leadArea ? resolveLifeAreaLabel(personalGuidance.leadArea.area) : 'Ausgleich' }}
                  </div>
                  <div class="text-xs text-text-muted">Heute bevorzugt</div>
                </div>
              </div>

              <div class="mt-4 flex flex-wrap gap-2">
                <span
                  v-if="preferredCompletionHours[0] !== undefined"
                  class="rounded-full border border-accent-blue/20 bg-white/[0.06] px-3 py-1 text-xs text-accent-blue"
                >
                  {{ formatHourLabel(preferredCompletionHours[0]) }} stark
                </span>
                <span
                  v-if="preferredDeepWorkHours[0] !== undefined"
                  class="rounded-full border border-accent-purple/20 bg-white/[0.06] px-3 py-1 text-xs text-accent-purple-soft"
                >
                  Deep Work {{ formatHourLabel(preferredDeepWorkHours[0]) }}
                </span>
                <span
                  v-if="personalGuidance.leadArea"
                  class="rounded-full border px-3 py-1 text-xs"
                  :class="lifeAreaColors[personalGuidance.leadArea.area]"
                >
                  Heute: {{ resolveLifeAreaLabel(personalGuidance.leadArea.area) }}
                </span>
                <span
                  v-if="personalGuidance.stableArea && personalGuidance.stableArea.area !== personalGuidance.leadArea?.area"
                  class="rounded-full border px-3 py-1 text-xs"
                  :class="lifeAreaColors[personalGuidance.stableArea.area]"
                >
                  Mehrtagig: {{ resolveLifeAreaLabel(personalGuidance.stableArea.area) }}
                </span>
              </div>

              <DecisionSummaryCard
                class="mt-4"
                title="Warum die App heute so gewichtet"
                mode-label="Personalisierung"
                tone="neutral"
                :why="personalGuidance.why"
                :uncertainty="personalGuidance.uncertainty"
                :alternatives="personalGuidance.alternatives"
                :next-step="personalGuidance.nextStep"
              />
            </div>

            <DecisionSummaryCard
              class="mt-5"
              title="Was die Planung gerade über dich lernt"
              mode-label="Rückblick"
              :tone="learningReview.missedCount > learningReview.doneCount ? 'warning' : 'success'"
              :why="learningReview.why"
              :uncertainty="learningReview.uncertainty"
              :alternatives="learningReview.alternatives"
              :next-step="learningReview.nextStep"
            />

            <div class="mt-5 grid gap-4 xl:grid-cols-[1.05fr,0.95fr]">
              <div class="rounded-glass border border-accent-purple/20 bg-accent-purple/10 p-4">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="text-xs font-semibold uppercase tracking-[0.2em] text-accent-purple-soft">Abendabschluss</p>
                    <p class="mt-2 text-sm leading-6 text-text-secondary">
                      Ein kurzer ehrlicher Check hilft der KI, den nächsten Tag realistischer vorzubereiten.
                    </p>
                  </div>
                  <span class="rounded-full border border-accent-purple/20 bg-white/[0.06] px-2.5 py-1 text-[11px] text-accent-purple-soft">
                    Heute
                  </span>
                </div>

                <div class="mt-4 flex flex-wrap gap-2">
                  <button
                    v-for="option in reflectionOptions"
                    :key="option.value"
                    type="button"
                    class="rounded-full border px-3 py-2 text-left text-xs transition"
                    :class="selectedReflectionTags.includes(option.value)
                      ? 'border-accent-purple/30 bg-white/[0.08] text-text-primary'
                      : 'border-border-subtle bg-white/[0.04] text-text-secondary hover:border-border-strong hover:bg-white/[0.06]'"
                    @click="toggleReflectionTag(option.value)"
                  >
                    <span class="font-medium">{{ option.label }}</span>
                    <span class="ml-1">{{ option.description }}</span>
                  </button>
                </div>

                <textarea
                  v-model="dailyReflectionNote"
                  rows="3"
                  class="input-dark mt-4 w-full resize-none px-4 py-3"
                  placeholder="Optional: Was war heute der eigentliche Knackpunkt?"
                />

                <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div class="text-xs text-text-secondary">
                    Letzter Status: {{ todayReflection.tags.length > 0 ? todayReflection.tags.join(', ') : 'noch offen' }}
                  </div>
                  <button class="btn-primary px-4 py-2 text-sm" @click="saveTodayReflectionSummary">
                    Tagesabschluss speichern
                  </button>
                </div>
              </div>

              <div class="rounded-glass border border-accent-blue/20 bg-accent-blue/10 p-4">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="text-xs font-semibold uppercase tracking-[0.2em] text-accent-blue">Morgenbrief</p>
                    <p class="mt-2 text-sm leading-6 text-text-secondary">
                      So würde die KI den nächsten Tag gerade vorbereiten.
                    </p>
                  </div>
                  <span class="rounded-full border border-accent-blue/20 bg-white/[0.06] px-2.5 py-1 text-[11px] text-accent-blue">
                    Für morgen
                  </span>
                </div>

                <div v-if="tomorrowForecast" class="mt-4 grid gap-3 sm:grid-cols-3">
                  <div class="rounded-glass border border-border-subtle bg-white/[0.04] px-3 py-3">
                    <div class="text-lg font-semibold text-text-primary">{{ Math.round((tomorrowForecast.freeMinutes / 60) * 10) / 10 }}h</div>
                    <div class="text-xs text-text-muted">Freie Zeit</div>
                  </div>
                  <div class="rounded-glass border border-border-subtle bg-white/[0.04] px-3 py-3">
                    <div class="text-lg font-semibold text-text-primary">{{ tomorrowForecast.eventCount }}</div>
                    <div class="text-xs text-text-muted">Termine</div>
                  </div>
                  <div class="rounded-glass border border-border-subtle bg-white/[0.04] px-3 py-3">
                    <div class="text-lg font-semibold" :class="tomorrowForecast.status === 'critical' ? 'text-priority-high' : 'text-text-primary'">
                      {{ tomorrowForecast.statusLabel }}
                    </div>
                    <div class="text-xs text-text-muted">Tagesdruck</div>
                  </div>
                </div>

                <DecisionSummaryCard
                  class="mt-4"
                  title="Was morgen anders laufen sollte"
                  mode-label="Morgenbrief"
                  :tone="selectedReflectionTags.includes('unrealistisch') ? 'warning' : 'preview'"
                  :why="morningBrief.why"
                  :uncertainty="morningBrief.uncertainty"
                  :alternatives="morningBrief.alternatives"
                  :next-step="morningBrief.nextStep"
                />
              </div>
            </div>
          </section>
          </div>

          <div class="mt-6 flex items-center justify-between gap-3">
            <div class="rounded-full border border-border-subtle bg-white/[0.04] px-4 py-2 text-xs uppercase tracking-[0.24em] text-text-muted">
              {{ currentView === 'month' ? 'Monatsansicht' : 'Wochenansicht' }}
            </div>
            <div v-if="isLoading" class="flex items-center gap-2 text-sm text-text-muted">
              <svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Kalender wird geladen
            </div>
          </div>

          <div ref="calendarSectionRef" class="mt-6 scroll-mt-24 lg:scroll-mt-28">
            <CalendarGrid
              v-if="currentView === 'month'"
              :current-date="currentDate"
              :events="events"
              @select-date="onSelectDate"
              @select-event="onSelectEvent"
            />
            <WeekView
              v-else
              :current-date="currentDate"
              :events="events"
              @select-date="onSelectDate"
              @select-event="onSelectEvent"
            />
          </div>
        </main>

        <aside v-if="isDesktopSidebar" class="hidden w-[380px] flex-shrink-0 border-l border-border-subtle bg-surface/35 xl:block">
          <AISidebar
            :show="true"
            :persistent="true"
            :events="events"
            @edit-task="onEditTask"
          />
        </aside>
      </div>
    </div>

    <nav class="fixed bottom-0 left-0 right-0 z-30 flex min-h-16 items-center justify-around border-t border-border-subtle bg-surface/90 px-2 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur-glass-heavy lg:hidden">
      <button type="button" class="flex flex-col items-center gap-1 text-xs" :class="bottomNavItemClass('calendar')" @click="goTodayInCalendar">
        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5.5v-6h-5v6H4a1 1 0 0 1-1-1v-9.5Z" />
        </svg>
        Heute
      </button>
      <button type="button" class="flex flex-col items-center gap-1 text-xs" :class="bottomNavItemClass('calendar')" @click="toggleCalendarViewFromNav">
        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z" />
        </svg>
        Kalender
      </button>
      <button type="button" class="flex h-12 w-12 -translate-y-4 items-center justify-center rounded-full bg-gradient-to-br from-accent-purple to-accent-blue text-white shadow-glow-purple" title="Neue Aufgabe" @click="onOpenTask">
        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 5v14m7-7H5" />
        </svg>
      </button>
      <button type="button" class="flex flex-col items-center gap-1 text-xs" :class="bottomNavItemClass('tasks')" @click="openTaskRoom">
        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />
        </svg>
        Aufgaben
      </button>
      <button type="button" class="flex flex-col items-center gap-1 text-xs" :class="bottomNavItemClass('more')" @click="openCommandCenter">
        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M4 7h16M4 12h16M4 17h16" />
        </svg>
        Mehr
      </button>
    </nav>

    <EventModal
      :show="showModal"
      :event="selectedEvent"
      :default-date="selectedDate"
      @close="showModal = false"
      @save="onSaveEvent"
      @delete="onDeleteEvent"
    />

    <TaskModal
      :show="showTaskModal"
      :task="selectedTask"
      :default-date="selectedDate"
      @close="showTaskModal = false"
      @save="onSaveTask"
      @delete="onDeleteTask"
    />

    <PreferencesModal
      :show="showPreferences"
      :events="events"
      @close="showPreferences = false"
    />

    <AISidebar
      v-if="!isDesktopSidebar"
      :show="showSidebar"
      :events="events"
      @close="showSidebar = false"
      @edit-task="onEditTask"
    />

    <PlanningChat
      :show="showPlanningChat"
      :events="events"
      @close="showPlanningChat = false"
      @created="onPlanningChatCreated"
    />

    <CommandCenter
      :show="showCommandCenter"
      :tasks="tasks"
      :events="events"
      @close="showCommandCenter = false"
      @go-today="goToday"
      @open-task="onOpenTask"
      @open-planner="openPlannerRoom"
      @open-sidebar="openTaskRoom"
      @open-settings="showPreferences = true"
      @open-insights="openWorkspacePanel()"
      @select-task="onSelectTaskFromCommandCenter"
      @select-event="onSelectEventFromCommandCenter"
    />
  </div>
</template>

<style scoped>
@media (max-width: 1279px) {
  .mobile-dashboard-stack {
    display: flex;
    gap: 1rem;
    min-width: 0;
    margin-inline: 0;
    padding-left: max(1rem, env(safe-area-inset-left));
    padding-right: max(1rem, env(safe-area-inset-right));
    padding-bottom: 0.5rem;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scroll-padding-left: max(1rem, env(safe-area-inset-left));
    scroll-padding-right: max(1rem, env(safe-area-inset-right));
    -webkit-overflow-scrolling: touch;
    touch-action: pan-x;
    scrollbar-width: thin;
    scrollbar-color: rgba(96, 165, 250, 0.75) rgba(255, 255, 255, 0.08);
  }

  .mobile-dashboard-stack::-webkit-scrollbar {
    height: 8px;
  }

  .mobile-dashboard-stack::-webkit-scrollbar-track {
    border-radius: 9999px;
    background: rgba(255, 255, 255, 0.08);
  }

  .mobile-dashboard-stack::-webkit-scrollbar-thumb {
    border-radius: 9999px;
    background: linear-gradient(90deg, rgba(168, 85, 247, 0.85), rgba(96, 165, 250, 0.85));
  }

  .mobile-dashboard-panel {
    width: calc(100vw - 2rem - env(safe-area-inset-left) - env(safe-area-inset-right));
    min-width: calc(100vw - 2rem - env(safe-area-inset-left) - env(safe-area-inset-right));
    max-width: 100%;
    flex-shrink: 0;
    scroll-snap-align: center;
    margin-top: 0 !important;
  }
}
</style>







