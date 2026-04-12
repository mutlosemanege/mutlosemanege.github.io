<script setup lang="ts">
import type { CalendarEvent } from '~/composables/useCalendar'
import type { Task } from '~/types/task'

interface QuickAction {
  key: string
  label: string
  detail: string
  section: 'navigation' | 'ki' | 'workspace'
  action: () => void
}

const props = defineProps<{
  show: boolean
  tasks: readonly Task[]
  events: readonly CalendarEvent[]
}>()

const emit = defineEmits<{
  close: []
  goToday: []
  openTask: []
  openPlanner: []
  openSidebar: []
  openSettings: []
  openInsights: []
  selectTask: [task: Task]
  selectEvent: [event: CalendarEvent]
}>()

const query = ref('')

watch(() => props.show, (show) => {
  if (show) {
    query.value = ''
  }
})

function normalizeSearch(value: string) {
  return value
    .toLocaleLowerCase('de-DE')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
}

const quickActions = computed<QuickAction[]>(() => [
  {
    key: 'today',
    label: 'Zu heute springen',
    detail: 'Kalender auf den heutigen Tag fokussieren.',
    section: 'navigation',
    action: () => emit('goToday'),
  },
  {
    key: 'task',
    label: 'Neue Aufgabe',
    detail: 'Aufgabe direkt erfassen.',
    section: 'workspace',
    action: () => emit('openTask'),
  },
  {
    key: 'sidebar',
    label: 'Aufgabenraum öffnen',
    detail: 'Aufgaben, Planungsanalyse und Projekte.',
    section: 'workspace',
    action: () => emit('openSidebar'),
  },
  {
    key: 'planner',
    label: 'KI-Planer öffnen',
    detail: 'Planungs-Chat direkt starten.',
    section: 'ki',
    action: () => emit('openPlanner'),
  },
  {
    key: 'prioritize',
    label: 'KI-Priorisierung',
    detail: 'Im Aufgabenraum direkt zur Priorisierung gehen.',
    section: 'ki',
    action: () => emit('openSidebar'),
  },
  {
    key: 'auto-plan',
    label: 'Auto-Planen',
    detail: 'Freie Zeiten im Aufgabenraum prüfen.',
    section: 'ki',
    action: () => emit('openSidebar'),
  },
  {
    key: 'project-generator',
    label: 'Projekt generieren',
    detail: 'KI-Projektgenerator im Aufgabenraum öffnen.',
    section: 'ki',
    action: () => emit('openSidebar'),
  },
  {
    key: 'settings',
    label: 'Planung und Routinen',
    detail: 'Arbeitszeiten, Schlaf, Wege und Routinen anpassen.',
    section: 'workspace',
    action: () => emit('openSettings'),
  },
  {
    key: 'insights',
    label: 'Einblicke öffnen',
    detail: 'Wochenblick, Lebensbereiche und Lernsignale fokussiert ansehen.',
    section: 'workspace',
    action: () => emit('openInsights'),
  },
])

const searchNeedle = computed(() => normalizeSearch(query.value.trim()))

const filteredActions = computed(() => {
  if (!searchNeedle.value) return quickActions.value
  return quickActions.value.filter((action) => {
    return normalizeSearch(`${action.label} ${action.detail}`).includes(searchNeedle.value)
  })
})

const filteredTasks = computed(() => {
  const pendingTasks = [...props.tasks]
    .filter(task => task.status !== 'done')
    .sort((a, b) => {
      const aDeadline = a.deadline ? new Date(a.deadline).getTime() : Infinity
      const bDeadline = b.deadline ? new Date(b.deadline).getTime() : Infinity
      return aDeadline - bDeadline
    })

  if (!searchNeedle.value) {
    return pendingTasks.slice(0, 6)
  }

  return pendingTasks
    .filter((task) => normalizeSearch(`${task.title} ${task.description || ''}`).includes(searchNeedle.value))
    .slice(0, 8)
})

const filteredEvents = computed(() => {
  const upcomingEvents = [...props.events]
    .sort((a, b) => {
      const aStart = new Date(a.start.dateTime || `${a.start.date}T00:00:00`).getTime()
      const bStart = new Date(b.start.dateTime || `${b.start.date}T00:00:00`).getTime()
      return aStart - bStart
    })

  if (!searchNeedle.value) {
    return upcomingEvents.slice(0, 6)
  }

  return upcomingEvents
    .filter((event) => normalizeSearch(`${event.summary} ${event.description || ''}`).includes(searchNeedle.value))
    .slice(0, 8)
})

const actionSections = computed(() => [
  {
    key: 'navigation',
    title: 'Navigation',
    items: filteredActions.value.filter(action => action.section === 'navigation'),
  },
  {
    key: 'workspace',
    title: 'Workspace',
    items: filteredActions.value.filter(action => action.section === 'workspace'),
  },
  {
    key: 'ki',
    title: 'KI-Funktionen',
    items: filteredActions.value.filter(action => action.section === 'ki'),
  },
].filter(section => section.items.length > 0))

function formatEventTime(event: CalendarEvent) {
  const value = event.start.dateTime || event.start.date
  if (!value) return 'Ohne Zeit'
  const date = new Date(value)
  const hasTime = Boolean(event.start.dateTime)
  return date.toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    ...(hasTime
      ? {
          hour: '2-digit',
          minute: '2-digit',
        }
      : {}),
  })
}

function handleAction(action: QuickAction) {
  action.action()
  emit('close')
}

function handleTask(task: Task) {
  emit('selectTask', task)
  emit('close')
}

function handleEvent(event: CalendarEvent) {
  emit('selectEvent', event)
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="show"
        class="fixed inset-0 z-[70] flex items-start justify-center bg-black/65 px-4 py-6 backdrop-blur-md sm:py-10"
      >
        <div class="absolute inset-0" @click="emit('close')" />

        <div class="relative z-10 flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-glass-lg border border-border-subtle bg-surface-secondary/92 shadow-2xl">
          <div class="border-b border-border-subtle bg-surface/88 px-4 py-4 backdrop-blur-glass sm:px-6">
            <div class="flex items-start justify-between gap-4">
              <div>
                <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent-blue">Schnellzugriff</p>
                <h2 class="mt-2 text-xl font-semibold text-text-primary">Suchen, springen, direkt handeln</h2>
                <p class="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
                  Kalender, Aufgaben und KI-Funktionen liegen jetzt an einem Ort statt verteilt im Header.
                </p>
              </div>
              <button
                type="button"
                class="btn-secondary inline-flex h-10 w-10 items-center justify-center"
                @click="emit('close')"
              >
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div class="mt-4">
              <label class="sr-only" for="workspace-search">Suchen</label>
              <input
                id="workspace-search"
                v-model="query"
                type="text"
                class="input-dark w-full px-4 py-3"
                placeholder="Suche nach Aufgaben, Terminen oder Funktionen"
                autofocus
              >
            </div>
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
            <div class="grid gap-5 xl:grid-cols-[1.15fr,0.85fr]">
              <div class="space-y-5">
                <section
                  v-for="section in actionSections"
                  :key="section.key"
                  class="rounded-glass border border-border-subtle bg-white/[0.03] p-4"
                >
                  <div class="flex items-center justify-between gap-3">
                    <h3 class="text-sm font-semibold text-text-primary">{{ section.title }}</h3>
                    <span class="rounded-full border border-border-subtle bg-white/[0.05] px-2.5 py-1 text-[10px] uppercase tracking-wide text-text-muted">
                      {{ section.items.length }}
                    </span>
                  </div>

                  <div class="mt-3 grid gap-3 sm:grid-cols-2">
                    <button
                      v-for="action in section.items"
                      :key="action.key"
                      type="button"
                      class="rounded-glass border border-border-subtle bg-white/[0.04] px-4 py-3 text-left transition hover:-translate-y-0.5 hover:border-accent-blue/30 hover:bg-white/[0.07]"
                      @click="handleAction(action)"
                    >
                      <div class="text-sm font-medium text-text-primary">{{ action.label }}</div>
                      <div class="mt-1 text-xs leading-5 text-text-secondary">{{ action.detail }}</div>
                    </button>
                  </div>
                </section>
              </div>

              <div class="space-y-5">
                <section class="rounded-glass border border-border-subtle bg-white/[0.03] p-4">
                  <div class="flex items-center justify-between gap-3">
                    <h3 class="text-sm font-semibold text-text-primary">Aufgaben</h3>
                    <span class="text-[11px] text-text-muted">{{ filteredTasks.length }} sichtbar</span>
                  </div>
                  <div v-if="filteredTasks.length > 0" class="mt-3 space-y-2">
                    <button
                      v-for="task in filteredTasks"
                      :key="task.id"
                      type="button"
                      class="w-full rounded-glass border border-border-subtle bg-white/[0.04] px-4 py-3 text-left transition hover:border-accent-purple/30 hover:bg-white/[0.07]"
                      @click="handleTask(task)"
                    >
                      <div class="flex items-center justify-between gap-3">
                        <div class="truncate text-sm font-medium text-text-primary">{{ task.title }}</div>
                        <span class="rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide"
                          :class="task.priority === 'critical'
                            ? 'bg-priority-critical/15 text-priority-critical'
                            : task.priority === 'high'
                              ? 'bg-priority-high/15 text-priority-high'
                              : task.priority === 'medium'
                                ? 'bg-priority-medium/15 text-priority-medium'
                                : 'bg-priority-low/15 text-priority-low'"
                        >
                          {{ task.priority }}
                        </span>
                      </div>
                      <div class="mt-1 text-xs text-text-secondary">
                        {{ task.deadline ? `Deadline ${new Date(task.deadline).toLocaleDateString('de-DE')}` : 'Keine Deadline' }}
                      </div>
                    </button>
                  </div>
                  <p v-else class="mt-3 text-sm text-text-secondary">Keine passenden Aufgaben gefunden.</p>
                </section>

                <section class="rounded-glass border border-border-subtle bg-white/[0.03] p-4">
                  <div class="flex items-center justify-between gap-3">
                    <h3 class="text-sm font-semibold text-text-primary">Kalender</h3>
                    <span class="text-[11px] text-text-muted">{{ filteredEvents.length }} sichtbar</span>
                  </div>
                  <div v-if="filteredEvents.length > 0" class="mt-3 space-y-2">
                    <button
                      v-for="event in filteredEvents"
                      :key="event.id || `${event.summary}-${event.start.dateTime || event.start.date}`"
                      type="button"
                      class="w-full rounded-glass border border-border-subtle bg-white/[0.04] px-4 py-3 text-left transition hover:border-accent-green/30 hover:bg-white/[0.07]"
                      @click="handleEvent(event)"
                    >
                      <div class="truncate text-sm font-medium text-text-primary">{{ event.summary }}</div>
                      <div class="mt-1 text-xs text-text-secondary">{{ formatEventTime(event) }}</div>
                    </button>
                  </div>
                  <p v-else class="mt-3 text-sm text-text-secondary">Keine passenden Termine gefunden.</p>
                </section>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
