<script setup lang="ts">
import type { Task } from '~/types/task'
import type { CalendarEvent } from '~/composables/useCalendar'

const props = defineProps<{
  show: boolean
  events: readonly CalendarEvent[]
}>()

const emit = defineEmits<{
  close: []
  'edit-task': [task: Task]
}>()

const { tasks, getPendingTasks, getUnscheduledTasks, updateTask, loadTasks } = useTasks()
const { prioritizeTasks, isProcessing, aiError } = useAI()
const { scheduleTasks } = useScheduler()
const { createEvent, fetchEvents } = useCalendar()
const { preferences } = usePreferences()

const showProjectGenerator = ref(false)
const activeTab = ref<'tasks' | 'schedule'>('tasks')

// Aufgaben-Statistiken
const stats = computed(() => {
  const all = tasks.value
  return {
    total: all.length,
    todo: all.filter(t => t.status === 'todo').length,
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

// KI-Priorisierung
async function handlePrioritize() {
  const pending = getPendingTasks()
  if (pending.length === 0) return

  const rankings = await prioritizeTasks(pending)

  for (const ranking of rankings) {
    await updateTask(ranking.taskId, { priority: ranking.priority })
  }
}

// Auto-Scheduling
async function handleAutoSchedule() {
  const unscheduled = getUnscheduledTasks()
  if (unscheduled.length === 0) return

  const schedule = scheduleTasks(
    unscheduled,
    props.events,
    preferences.value,
  )

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone

  // Tasks in Google Calendar eintragen
  for (const [taskId, slot] of schedule) {
    const task = tasks.value.find(t => t.id === taskId)
    if (!task) continue

    const calEvent = await createEvent({
      summary: task.title,
      description: `[KALENDER-AI-TASK:${taskId}]\n${task.description || ''}`,
      start: { dateTime: slot.start.toISOString(), timeZone: tz },
      end: { dateTime: slot.end.toISOString(), timeZone: tz },
      colorId: task.isDeepWork ? '3' : '9', // Lila fuer Deep Work, Indigo fuer normal
    })

    if (calEvent?.id) {
      await updateTask(taskId, {
        status: 'scheduled',
        scheduledStart: slot.start.toISOString(),
        scheduledEnd: slot.end.toISOString(),
        calendarEventId: calEvent.id,
      })
    }
  }

  // Kalender neu laden
  const now = new Date()
  const rangeStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const rangeEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0)
  await fetchEvents(rangeStart.toISOString(), rangeEnd.toISOString())
}

async function markDone(task: Task) {
  await updateTask(task.id, { status: 'done' })
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
      </div>

      <!-- AI Error -->
      <div v-if="aiError" class="px-4 py-2">
        <div class="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-xs">
          {{ aiError }}
        </div>
      </div>

      <!-- Task List -->
      <div class="flex-1 overflow-y-auto px-4 py-3">
        <div v-if="tasks.length === 0" class="text-center py-8">
          <p class="text-sm text-gray-500">Keine Aufgaben vorhanden.</p>
          <p class="text-xs text-gray-400 mt-1">Erstelle eine neue Aufgabe oder generiere ein KI-Projekt.</p>
        </div>

        <div v-else class="space-y-2">
          <div
            v-for="task in tasks"
            :key="task.id"
            class="p-3 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors cursor-pointer"
            :class="{ 'opacity-50': task.status === 'done' }"
            @click="emit('edit-task', task)"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium text-gray-900 truncate">{{ task.title }}</span>
                  <span
                    class="text-xs px-1.5 py-0.5 rounded-full flex-shrink-0"
                    :class="priorityColors[task.priority]"
                  >
                    {{ task.priority }}
                  </span>
                </div>
                <div class="flex items-center gap-2 mt-1 text-xs text-gray-400">
                  <span>{{ task.estimatedMinutes }} Min.</span>
                  <span v-if="task.deadline">
                    Deadline: {{ new Date(task.deadline).toLocaleDateString('de-DE') }}
                  </span>
                  <span v-if="task.isDeepWork" class="text-purple-500">Deep Work</span>
                </div>
                <div v-if="task.scheduledStart" class="mt-1 text-xs text-blue-500">
                  Geplant: {{ new Date(task.scheduledStart).toLocaleDateString('de-DE') }}
                  {{ new Date(task.scheduledStart).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) }}
                </div>
              </div>
              <button
                v-if="task.status !== 'done'"
                class="p-1 text-gray-400 hover:text-green-600 rounded"
                title="Als erledigt markieren"
                @click.stop="markDone(task)"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                </svg>
              </button>
            </div>
          </div>
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
