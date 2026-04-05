<script setup lang="ts">
import type { CalendarEvent } from '~/composables/useCalendar'
import type { Task } from '~/types/task'

const { isLoggedIn, error: authError, initClient } = useGoogleAuth()
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

// Initialize Google auth and tasks on mount
onMounted(async () => {
  initClient()
  await initTasks()
})

// Fetch events when logged in or date changes
const timeRange = computed(() => {
  const d = currentDate.value
  const year = d.getFullYear()
  const month = d.getMonth()

  // Fetch a wider range to cover week view edges
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month + 2, 0)

  return {
    timeMin: start.toISOString(),
    timeMax: end.toISOString()
  }
})

watch([isLoggedIn, timeRange], ([loggedIn]) => {
  if (loggedIn) {
    fetchEvents(timeRange.value.timeMin, timeRange.value.timeMax)
  }
}, { immediate: true })

// Navigation
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

// Event handlers
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

// Task handlers
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
  <div class="min-h-screen bg-gray-50">
    <NavBar
      :current-view="currentView"
      @update:current-view="currentView = $event"
      @open-settings="showPreferences = true"
      @open-task="onOpenTask"
      @open-planner="showPlanningChat = true"
      @toggle-sidebar="showSidebar = !showSidebar"
    />

    <!-- Deadline Warnings -->
    <DeadlineWarning />

    <!-- Error messages -->
    <div v-if="authError || calError" class="max-w-7xl mx-auto px-4 mt-4">
      <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
        {{ authError || calError }}
      </div>
    </div>

    <!-- Not logged in -->
    <div v-if="!isLoggedIn" class="max-w-7xl mx-auto px-4 mt-20">
      <div class="text-center space-y-4">
        <svg class="mx-auto w-16 h-16 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <h2 class="text-2xl font-semibold text-gray-700">Willkommen bei Kalender AI</h2>
        <p class="text-gray-500 max-w-md mx-auto">
          Melde dich mit deinem Google-Konto an, um Termine, Aufgaben und KI-Planung in einem Workspace zu steuern.
        </p>
      </div>
    </div>

    <!-- Calendar content -->
    <div v-else class="max-w-7xl mx-auto px-4 py-6">
      <div class="mb-6 grid gap-4 lg:grid-cols-[1.2fr,0.9fr,0.9fr]">
        <section class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="text-xs font-semibold uppercase tracking-wide text-primary-600">Heute</p>
              <h2 class="mt-1 text-xl font-semibold text-gray-900">
                {{ new Date().toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long' }) }}
              </h2>
              <p class="mt-1 text-sm text-gray-500">{{ todayPressure }}</p>
            </div>
            <button
              class="rounded-xl bg-gray-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-black"
              @click="showPlanningChat = true"
            >
              Neu planen
            </button>
          </div>

          <div class="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <div class="rounded-xl bg-gray-50 px-3 py-3">
              <div class="text-lg font-semibold text-gray-900">{{ todayEvents.length }}</div>
              <div class="text-xs text-gray-500">Termine heute</div>
            </div>
            <div class="rounded-xl bg-gray-50 px-3 py-3">
              <div class="text-lg font-semibold text-gray-900">{{ todayPendingTasks.length }}</div>
              <div class="text-xs text-gray-500">Offene Aufgaben</div>
            </div>
            <div class="rounded-xl bg-gray-50 px-3 py-3">
              <div class="text-lg font-semibold text-gray-900">{{ Math.round(todayFreeMinutes / 60 * 10) / 10 }}h</div>
              <div class="text-xs text-gray-500">Freie Zeit heute</div>
            </div>
            <div class="rounded-xl bg-gray-50 px-3 py-3">
              <div class="text-lg font-semibold" :class="criticalCount > 0 ? 'text-red-600' : 'text-gray-900'">{{ criticalCount }}</div>
              <div class="text-xs text-gray-500">Kritische Warnungen</div>
            </div>
          </div>
        </section>

        <section class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p class="text-xs font-semibold uppercase tracking-wide text-emerald-600">Nächster Bester Schritt</p>
          <div v-if="nextBestTask" class="mt-3">
            <h3 class="text-lg font-semibold text-gray-900">{{ nextBestTask.title }}</h3>
            <p class="mt-2 text-sm text-gray-500">{{ nextBestTaskReason }}</p>
            <div class="mt-3 flex flex-wrap gap-2">
              <span class="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600">
                {{ nextBestTask.priority }}
              </span>
              <span v-if="nextBestTask.deadline" class="rounded-full bg-amber-50 px-2.5 py-1 text-xs text-amber-700">
                Deadline {{ new Date(nextBestTask.deadline).toLocaleDateString('de-DE') }}
              </span>
              <span v-if="nextBestTask.scheduledStart" class="rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-700">
                Geplant {{ formatDateTime(nextBestTask.scheduledStart) }}
              </span>
            </div>
            <button
              class="mt-4 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              @click="onEditTask(nextBestTask)"
            >
              Aufgabe öffnen
            </button>
          </div>
          <p v-else class="mt-3 text-sm text-gray-500">
            Gerade ist nichts offen. Du kannst entspannt neue Aufgaben oder Termine planen.
          </p>
        </section>

        <section class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p class="text-xs font-semibold uppercase tracking-wide text-violet-600">Freie Fokusblöcke</p>
          <div v-if="todayFocusSlots.length > 0" class="mt-3 space-y-2">
            <div
              v-for="slot in todayFocusSlots"
              :key="slot.start.toISOString()"
              class="rounded-xl bg-violet-50 px-3 py-3"
            >
              <div class="text-sm font-medium text-violet-900">{{ formatSlotRange(slot.start, slot.end) }}</div>
              <div class="mt-1 text-xs text-violet-700">
                {{ Math.round((slot.end.getTime() - slot.start.getTime()) / 60000) }} Minuten ruhige Zeit
              </div>
            </div>
          </div>
          <p v-else class="mt-3 text-sm text-gray-500">
            Heute ist kein längerer Fokusblock mehr frei. Kleinere Slots sind aber noch möglich.
          </p>
        </section>
      </div>

      <!-- Navigation controls -->
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-2">
          <button
            class="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            @click="goToday"
          >
            Heute
          </button>
          <button
            class="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            @click="goPrev"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            class="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            @click="goNext"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        <!-- Loading indicator -->
        <div v-if="isLoading" class="flex items-center gap-2 text-sm text-gray-500">
          <svg class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Laden...
        </div>
      </div>

      <!-- Views -->
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

    <!-- Event Modal -->
    <EventModal
      :show="showModal"
      :event="selectedEvent"
      :default-date="selectedDate"
      @close="showModal = false"
      @save="onSaveEvent"
      @delete="onDeleteEvent"
    />

    <!-- Task Modal -->
    <TaskModal
      :show="showTaskModal"
      :task="selectedTask"
      :default-date="selectedDate"
      @close="showTaskModal = false"
      @save="onSaveTask"
      @delete="onDeleteTask"
    />

    <!-- Preferences Modal -->
    <PreferencesModal
      :show="showPreferences"
      :events="events"
      @close="showPreferences = false"
    />

    <!-- AI Sidebar -->
    <AISidebar
      :show="showSidebar"
      :events="events"
      @close="showSidebar = false"
      @edit-task="(task) => { selectedTask = task; showTaskModal = true }"
    />

    <PlanningChat
      :show="showPlanningChat"
      :events="events"
      @close="showPlanningChat = false"
      @created="onPlanningChatCreated"
    />
  </div>
</template>
