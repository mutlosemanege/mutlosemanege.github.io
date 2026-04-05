<script setup lang="ts">
import type { Task } from '~/types/task'
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

const { tasks, projects, getPendingTasks, getUnscheduledTasks, updateTask, deleteTask, deleteProject } = useTasks()
const { prioritizeTasks, isProcessing, aiError } = useAI()
const { scheduleTasks } = useScheduler()
const { events: calendarEvents, createEvent, fetchEvents, deleteEvent } = useCalendar()
const { preferences } = usePreferences()

const showProjectGenerator = ref(false)
const activeFilter = ref<'all' | 'open' | 'scheduled' | 'done'>('all')
const collapsedGroups = ref<string[]>([])
const planningFeedback = ref<string | null>(null)

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

// KI-Priorisierung
async function handlePrioritize() {
  const pending = getPendingTasks()
  if (pending.length === 0) return

  const rankings = await prioritizeTasks(pending)

  for (const ranking of rankings) {
    await updateTask(ranking.taskId, {
      priority: ranking.priority,
      aiSuggestedPriority: ranking.priority,
      priorityReason: ranking.reason,
      prioritySource: 'ai',
    })
  }
}

// Auto-Scheduling
async function handleAutoSchedule() {
  const unscheduled = getUnscheduledTasks()
  if (unscheduled.length === 0) return

  planningFeedback.value = null

  const currentEvents = await refreshCalendarEvents()
  const schedule = await applyScheduleForTasks(unscheduled, currentEvents)

  const scheduledCount = schedule.size
  const unscheduledCount = unscheduled.length - scheduledCount

  if (scheduledCount === 0) {
    planningFeedback.value = 'Es konnte aktuell keine Aufgabe in einen freien Slot eingeplant werden.'
    return
  }

  if (unscheduledCount > 0) {
    const remainingTitles = unscheduled
      .filter(task => !schedule.has(task.id))
      .slice(0, 3)
      .map(task => `${task.title} (${explainUnscheduledTask(task)})`)
      .join(', ')

    planningFeedback.value = `${scheduledCount} Aufgaben eingeplant, ${unscheduledCount} noch offen. ${remainingTitles ? `Noch offen: ${remainingTitles}` : ''}`
    return
  }

  planningFeedback.value = `Alle ${scheduledCount} offenen Aufgaben wurden eingeplant.`
}

function explainUnscheduledTask(task: Task) {
  if (task.dependencies.length > 0) {
    const blockingDependency = task.dependencies
      .map(depId => tasks.value.find(candidate => candidate.id === depId))
      .find(candidate => candidate && candidate.status !== 'done' && candidate.status !== 'scheduled')

    if (blockingDependency) {
      return `wartet auf ${blockingDependency.title}`
    }
  }

  if (task.isDeepWork) {
    return 'braucht Fokuszeit'
  }

  if (task.deadline) {
    return 'vor Deadline kein passender Slot'
  }

  return 'aktuell kein passender Slot'
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

  for (const task of projectGroup.tasks) {
    const calendarIds = task.scheduleBlocks?.map(block => block.calendarEventId).filter(Boolean) || []
    if (calendarIds.length > 0) {
      for (const calendarId of calendarIds) {
        await deleteEvent(calendarId!)
      }
    } else if (task.calendarEventId) {
      await deleteEvent(task.calendarEventId)
    }
    await deleteTask(task.id)
  }

  await deleteProject(groupId)
  await refreshCalendarEvents()
  planningFeedback.value = `Projekt "${projectGroup.name}" wurde geloescht.`
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

      <div v-if="planningFeedback" class="px-4 py-2">
        <div class="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
          {{ planningFeedback }}
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
            <button
              class="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left hover:bg-gray-50"
              @click="toggleGroup(group.id)"
            >
              <div class="flex items-center gap-2">
                <svg
                  class="h-4 w-4 text-gray-400 transition-transform"
                  :class="{ 'rotate-90': !isGroupCollapsed(group.id) }"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
                <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500">{{ group.name }}</h3>
              </div>
              <div class="flex items-center gap-2">
                <button
                  v-if="group.id !== 'inbox'"
                  class="rounded-md px-2 py-1 text-[11px] text-red-600 transition hover:bg-red-50"
                  @click.stop="removeProject(group.id)"
                >
                  Projekt loeschen
                </button>
                <span class="text-xs text-gray-400">{{ group.tasks.length }}</span>
              </div>
            </button>

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
                      <span v-else-if="task.prioritySource === 'manual'" class="text-gray-500">Manuell</span>
                    </div>

                    <div v-if="taskScheduleSummary(task)" class="mt-1 text-xs text-blue-500">
                      Geplant: {{ taskScheduleSummary(task) }}
                    </div>

                    <div v-if="task.priorityReason" class="mt-1 text-xs text-gray-500">
                      Grund: {{ task.priorityReason }}
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
