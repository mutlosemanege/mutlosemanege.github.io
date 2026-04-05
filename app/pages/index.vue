<script setup lang="ts">
import type { CalendarEvent } from '~/composables/useCalendar'
import type { Task } from '~/types/task'

const { isLoggedIn, userProfile, error: authError, initClient } = useGoogleAuth()
const { events, isLoading, error: calError, fetchEvents, createEvent, updateEvent, deleteEvent } = useCalendar()
const { tasks, init: initTasks, createTask, updateTask, deleteTask: removeTask } = useTasks()
const { preferences } = usePreferences()
const { findFreeSlots } = useScheduler()
const { warnings, criticalCount } = useDeadlineWatcher()

const currentView = ref<'month' | 'week'>('month')
const currentDate = ref(new Date())
const showModal = ref(false)
const showTaskModal = ref(false)
const showPreferences = ref(false)
const showSidebar = ref(false)
const showPlanningChat = ref(false)
const selectedEvent = ref<CalendarEvent | null>(null)
const selectedTask = ref<Task | null>(null)
const selectedDate = ref<string | undefined>(undefined)
const todayActionFeedback = ref<string | null>(null)
const isRunningTodayAction = ref(false)

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

const todayFreeSlots = computed(() => {
  return findFreeSlots(
    todayRange.value.start,
    todayRange.value.end,
    events.value,
    preferences.value,
  )
})

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

  return [...todayPendingTasks.value]
    .sort((a, b) => {
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

const nextBestTaskReason = computed(() => {
  const task = nextBestTask.value
  if (!task) return 'Gerade ist nichts Dringendes offen.'
  if (task.scheduledStart) return `Schon eingeplant für ${formatDateTime(task.scheduledStart)}.`
  if (task.deadline) return `Deadline am ${new Date(task.deadline).toLocaleDateString('de-DE')}.`
  if (task.priorityReason) return task.priorityReason
  return 'Aktuell die wichtigste offene Aufgabe.'
})

const todayPressure = computed(() => {
  if (criticalCount.value > 0) {
    return `${criticalCount.value} kritische Deadline-Warnung${criticalCount.value > 1 ? 'en' : ''} brauchen heute Aufmerksamkeit.`
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

function goToday() {
  currentDate.value = new Date()
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

function findSlotForTask(task: Task, start: Date, end: Date, preferSmallest = false) {
  const slots = findFreeSlots(start, end, events.value, preferences.value)
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
</script>

<template>
  <div class="flex min-h-screen bg-base text-text-primary">
    <aside class="ambient-glow-purple hidden w-16 flex-shrink-0 flex-col items-center border-r border-border-subtle bg-surface/85 py-4 lg:flex">
      <div class="relative z-10 flex h-10 w-10 items-center justify-center rounded-glass bg-gradient-to-br from-accent-purple to-accent-blue text-white shadow-glow-purple">
        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z" />
        </svg>
      </div>

      <div class="relative z-10 mt-8 flex flex-col items-center gap-2">
        <button type="button" class="btn-secondary inline-flex h-11 w-11 items-center justify-center" title="Heute" @click="goToday">
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5.5v-6h-5v6H4a1 1 0 0 1-1-1v-9.5Z" />
          </svg>
        </button>
        <button type="button" class="btn-secondary inline-flex h-11 w-11 items-center justify-center" title="Kalender" @click="currentView = currentView === 'month' ? 'week' : 'month'">
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z" />
          </svg>
        </button>
        <button type="button" class="btn-secondary inline-flex h-11 w-11 items-center justify-center" title="Aufgaben" @click="showSidebar = true">
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />
          </svg>
        </button>
        <button type="button" class="btn-secondary inline-flex h-11 w-11 items-center justify-center" title="KI Planer" @click="showPlanningChat = true">
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 3l2.4 4.86L20 10l-4 3.89L17 20l-5-2.67L7 20l1-6.11L4 10l5.6-2.14L12 3Z" />
          </svg>
        </button>
      </div>

      <div class="relative z-10 mt-auto flex flex-col items-center gap-2">
        <button type="button" class="btn-secondary inline-flex h-11 w-11 items-center justify-center" title="Planung und Routinen" @click="showPreferences = true">
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M10.5 6h9m-9 6h9m-9 6h9M4.5 6h.008v.008H4.5V6Zm0 6h.008v.008H4.5V12Zm0 6h.008v.008H4.5V18Z" />
          </svg>
        </button>
        <img
          v-if="userProfile"
          :src="userProfile.picture"
          :alt="userProfile.name"
          class="h-10 w-10 rounded-full border border-border-subtle object-cover"
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
        <main class="flex-1 overflow-y-auto px-4 pb-24 pt-4 lg:px-6 lg:pb-8">
          <div class="grid gap-4 xl:grid-cols-[1.25fr,0.95fr,0.9fr]">
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

              <div class="relative z-10 mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
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

          <div class="mt-6">
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

    <nav class="fixed bottom-0 left-0 right-0 z-30 flex h-16 items-center justify-around border-t border-border-subtle bg-surface/90 px-2 backdrop-blur-glass-heavy lg:hidden">
      <button type="button" class="flex flex-col items-center gap-1 text-xs text-text-muted" @click="goToday">
        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5.5v-6h-5v6H4a1 1 0 0 1-1-1v-9.5Z" />
        </svg>
        Heute
      </button>
      <button type="button" class="flex flex-col items-center gap-1 text-xs text-text-muted" @click="currentView = currentView === 'month' ? 'week' : 'month'">
        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z" />
        </svg>
        Kalender
      </button>
      <button type="button" class="flex h-12 w-12 -translate-y-4 items-center justify-center rounded-full bg-gradient-to-br from-accent-purple to-accent-blue text-white shadow-glow-purple" @click="onOpenTask">
        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 5v14m7-7H5" />
        </svg>
      </button>
      <button type="button" class="flex flex-col items-center gap-1 text-xs text-text-muted" @click="showSidebar = true">
        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />
        </svg>
        Aufgaben
      </button>
      <button type="button" class="flex flex-col items-center gap-1 text-xs text-text-muted" @click="showPlanningChat = true">
        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 3l2.4 4.86L20 10l-4 3.89L17 20l-5-2.67L7 20l1-6.11L4 10l5.6-2.14L12 3Z" />
        </svg>
        KI
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
  </div>
</template>






