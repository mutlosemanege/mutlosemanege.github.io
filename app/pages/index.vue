<script setup lang="ts">
import type { CalendarEvent } from '~/composables/useCalendar'
import type { Task } from '~/types/task'

const { isLoggedIn, error: authError, initClient } = useGoogleAuth()
const { events, isLoading, error: calError, fetchEvents, createEvent, updateEvent, deleteEvent } = useCalendar()
const { tasks, init: initTasks, createTask, updateTask, deleteTask: removeTask } = useTasks()

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
      @created="fetchEvents(timeRange.timeMin, timeRange.timeMax)"
    />
  </div>
</template>
