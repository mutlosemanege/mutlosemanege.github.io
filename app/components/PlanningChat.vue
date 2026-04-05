<script setup lang="ts">
import type { Task } from '~/types/task'
import type { CalendarEvent } from '~/composables/useCalendar'

interface ParsedPlanningRequest {
  title: string
  durationMinutes: number
  dateFrom: Date
  dateTo: Date
  preferredPeriod: 'morning' | 'afternoon' | 'evening' | 'any'
  intent: 'event' | 'task'
}

const props = defineProps<{
  show: boolean
  events: readonly CalendarEvent[]
}>()

const emit = defineEmits<{
  close: []
  created: []
}>()

const { preferences } = usePreferences()
const { findFreeSlots } = useScheduler()
const { createEvent } = useCalendar()
const { createTask } = useTasks()

const prompt = ref('')
const durationMinutes = ref(60)
const intentMode = ref<'auto' | 'event' | 'task'>('auto')
const isPlanning = ref(false)
const error = ref<string | null>(null)
const previewEvent = ref<Omit<CalendarEvent, 'id'> | null>(null)
const previewTask = ref<Omit<Task, 'id' | 'createdAt' | 'updatedAt'> | null>(null)
const parsedDetails = ref<ParsedPlanningRequest | null>(null)

watch(() => props.show, (show) => {
  if (!show) return
  prompt.value = ''
  durationMinutes.value = 60
  intentMode.value = 'auto'
  isPlanning.value = false
  error.value = null
  previewEvent.value = null
  previewTask.value = null
  parsedDetails.value = null
})

async function handlePlan() {
  if (!prompt.value.trim()) return

  isPlanning.value = true
  error.value = null

  try {
    const parsed = parsePlanningPrompt(prompt.value.trim(), durationMinutes.value)
    parsedDetails.value = parsed

    if (parsed.intent === 'task') {
      previewTask.value = {
        title: parsed.title,
        description: `Erstellt aus Chat-Eingabe: "${prompt.value.trim()}"`,
        estimatedMinutes: parsed.durationMinutes,
        deadline: buildTaskDeadline(parsed),
        priority: inferTaskPriority(prompt.value.trim()),
        status: 'todo',
        projectId: undefined,
        dependencies: [],
        scheduledStart: undefined,
        scheduledEnd: undefined,
        calendarEventId: undefined,
        isDeepWork: parsed.durationMinutes >= preferences.value.minDeepWorkBlockMinutes,
      }
      previewEvent.value = null
      return
    }

    const slot = findBestSlot(parsed)

    if (!slot) {
      error.value = 'Ich habe in deinem aktuellen Planungsfenster keinen freien Termin gefunden.'
      previewEvent.value = null
      previewTask.value = null
      return
    }

    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    previewEvent.value = {
      summary: parsed.title,
      description: `Geplant aus Chat-Eingabe: "${prompt.value.trim()}"`,
      start: {
        dateTime: slot.start.toISOString(),
        timeZone: tz,
      },
      end: {
        dateTime: slot.end.toISOString(),
        timeZone: tz,
      },
    }
    previewTask.value = null
  } catch (err: any) {
    error.value = err.message || 'Planung fehlgeschlagen.'
    previewEvent.value = null
    previewTask.value = null
  } finally {
    isPlanning.value = false
  }
}

async function handleCreate() {
  if (!previewEvent.value) return

  isPlanning.value = true
  error.value = null

  try {
    const created = await createEvent(previewEvent.value)
    if (!created?.id) {
      throw new Error('Termin konnte nicht erstellt werden.')
    }

    emit('created')
    emit('close')
  } catch (err: any) {
    error.value = err.message || 'Termin konnte nicht erstellt werden.'
  } finally {
    isPlanning.value = false
  }
}

async function handleCreateTask() {
  if (!previewTask.value) return

  isPlanning.value = true
  error.value = null

  try {
    await createTask(previewTask.value)
    emit('created')
    emit('close')
  } catch (err: any) {
    error.value = err.message || 'Aufgabe konnte nicht erstellt werden.'
  } finally {
    isPlanning.value = false
  }
}

function parsePlanningPrompt(text: string, fallbackDuration: number): ParsedPlanningRequest {
  const normalized = text.toLowerCase()
  const now = new Date()
  const dateFrom = new Date(now)
  const dateTo = new Date(now)
  dateTo.setDate(dateTo.getDate() + 7)

  let preferredPeriod: ParsedPlanningRequest['preferredPeriod'] = 'any'
  if (normalized.includes('morgens') || normalized.includes('vormittag')) preferredPeriod = 'morning'
  if (normalized.includes('nachmittag')) preferredPeriod = 'afternoon'
  if (normalized.includes('abend') || normalized.includes('abends')) preferredPeriod = 'evening'

  if (normalized.includes('heute')) {
    dateTo.setDate(dateFrom.getDate())
  } else if (normalized.includes('morgen')) {
    dateFrom.setDate(dateFrom.getDate() + 1)
    dateTo.setTime(dateFrom.getTime())
  } else if (normalized.includes('uebermorgen') || normalized.includes('übermorgen')) {
    dateFrom.setDate(dateFrom.getDate() + 2)
    dateTo.setTime(dateFrom.getTime())
  } else if (normalized.includes('naechste woche') || normalized.includes('nächste woche')) {
    const day = dateFrom.getDay()
    const daysUntilNextMonday = day === 0 ? 1 : 8 - day
    dateFrom.setDate(dateFrom.getDate() + daysUntilNextMonday)
    dateTo.setTime(dateFrom.getTime())
    dateTo.setDate(dateTo.getDate() + 6)
  } else if (normalized.includes('diese woche')) {
    dateTo.setDate(dateFrom.getDate() + (7 - (dateFrom.getDay() || 7)))
  } else if (normalized.includes('wochenende')) {
    const day = dateFrom.getDay()
    const daysUntilSaturday = day <= 6 ? 6 - day : 6
    dateFrom.setDate(dateFrom.getDate() + daysUntilSaturday)
    dateTo.setTime(dateFrom.getTime())
    dateTo.setDate(dateTo.getDate() + 1)
  }

  const explicitDuration = extractDuration(text)
  const title = text
    .replace(/\b(heute|morgen|uebermorgen|übermorgen|naechste woche|nächste woche|diese woche|wochenende)\b/gi, '')
    .replace(/\b(morgens|vormittag|nachmittag|abend|abends)\b/gi, '')
    .replace(/\b\d+\s*(min|minute|minuten|h|std|stunden)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()

  return {
    title: title || 'Neuer Termin',
    durationMinutes: explicitDuration ?? fallbackDuration,
    dateFrom,
    dateTo,
    preferredPeriod,
    intent: detectIntent(text),
  }
}

function detectIntent(text: string): 'event' | 'task' {
  if (intentMode.value === 'event') return 'event'
  if (intentMode.value === 'task') return 'task'

  const normalized = text.toLowerCase()
  const taskHints = ['lernen', 'schneiden', 'bearbeiten', 'vorbereiten', 'schreiben', 'bauen', 'erledigen', 'planen', 'review', 'recherche']
  const eventHints = ['treffen', 'call', 'meeting', 'mittag', 'essen', 'arzt', 'termin', 'date', 'party']

  if (eventHints.some(hint => normalized.includes(hint))) return 'event'
  if (taskHints.some(hint => normalized.includes(hint))) return 'task'
  return 'event'
}

function inferTaskPriority(text: string): Task['priority'] {
  const normalized = text.toLowerCase()
  if (normalized.includes('dringend') || normalized.includes('asap') || normalized.includes('wichtig')) return 'high'
  return 'medium'
}

function buildTaskDeadline(parsed: ParsedPlanningRequest) {
  const deadline = new Date(parsed.dateTo)
  deadline.setHours(23, 59, 59, 999)
  return deadline.toISOString()
}

function extractDuration(text: string): number | null {
  const hourMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(h|std|stunden)/i)
  if (hourMatch) {
    return Math.round(Number(hourMatch[1].replace(',', '.')) * 60)
  }

  const minuteMatch = text.match(/(\d+)\s*(min|minute|minuten)/i)
  if (minuteMatch) {
    return Number(minuteMatch[1])
  }

  return null
}

function findBestSlot(parsed: ParsedPlanningRequest) {
  const slots = findFreeSlots(parsed.dateFrom, parsed.dateTo, props.events, preferences.value)
  const matchingSlots = slots
    .map(slot => {
      const start = new Date(slot.start)
      const end = new Date(start.getTime() + parsed.durationMinutes * 60 * 1000)
      if (end > slot.end) return null
      if (!matchesPeriod(start, parsed.preferredPeriod)) return null
      return { start, end }
    })
    .filter((slot): slot is { start: Date; end: Date } => slot !== null)

  if (matchingSlots.length > 0) return matchingSlots[0]

  for (const slot of slots) {
    const start = new Date(slot.start)
    const end = new Date(start.getTime() + parsed.durationMinutes * 60 * 1000)
    if (end <= slot.end) {
      return { start, end }
    }
  }

  return null
}

function matchesPeriod(start: Date, period: ParsedPlanningRequest['preferredPeriod']) {
  const hour = start.getHours()
  if (period === 'any') return true
  if (period === 'morning') return hour < 12
  if (period === 'afternoon') return hour >= 12 && hour < 17
  return hour >= 17
}

function formatPreview(date: string | undefined) {
  if (!date) return ''
  return new Date(date).toLocaleString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/40" @click="emit('close')" />

        <div class="relative w-full max-w-2xl rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h2 class="text-xl font-semibold text-gray-900">Planungs-Chat</h2>
              <p class="mt-1 text-sm text-gray-500">
                Schreib einfach, was du unterbringen willst. Ich suche dir den naechsten passenden freien Slot.
              </p>
            </div>
            <button
              class="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              @click="emit('close')"
            >
              <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div class="mt-5 grid gap-4 lg:grid-cols-[1.5fr,0.9fr]">
            <div class="space-y-4">
              <div class="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <label class="block text-sm font-medium text-gray-700">Was moechtest du einplanen?</label>
                <textarea
                  v-model="prompt"
                  rows="5"
                  class="mt-2 w-full resize-none rounded-xl border border-gray-300 bg-white px-3 py-3 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500"
                  placeholder="z.B. Treffen mit Bro morgen Abend oder 2h Videoschnitt naechste Woche vormittags"
                />
              </div>

              <div class="rounded-2xl border border-gray-200 p-4">
                <label class="block text-sm font-medium text-gray-700">Typ</label>
                <div class="mt-2 grid grid-cols-3 gap-2">
                  <button
                    v-for="mode in [
                      { value: 'auto', label: 'Automatisch' },
                      { value: 'event', label: 'Termin' },
                      { value: 'task', label: 'Aufgabe' },
                    ]"
                    :key="mode.value"
                    class="rounded-xl px-3 py-2 text-sm font-medium transition-colors"
                    :class="intentMode === mode.value
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'"
                    @click="intentMode = mode.value as 'auto' | 'event' | 'task'"
                  >
                    {{ mode.label }}
                  </button>
                </div>
              </div>

              <div class="rounded-2xl border border-gray-200 p-4">
                <label class="block text-sm font-medium text-gray-700">Standarddauer</label>
                <select
                  v-model.number="durationMinutes"
                  class="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500"
                >
                  <option :value="30">30 Minuten</option>
                  <option :value="60">1 Stunde</option>
                  <option :value="90">1,5 Stunden</option>
                  <option :value="120">2 Stunden</option>
                  <option :value="180">3 Stunden</option>
                </select>
              </div>

              <div class="flex gap-2">
                <button
                  class="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-primary-700 disabled:opacity-50"
                  :disabled="!prompt.trim() || isPlanning"
                  @click="handlePlan"
                >
                  <svg v-if="isPlanning" class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Vorschlag suchen
                </button>
                <button
                  class="rounded-xl px-4 py-3 text-sm text-gray-600 transition hover:bg-gray-100"
                  @click="emit('close')"
                >
                  Schliessen
                </button>
              </div>
            </div>

            <div class="space-y-4">
              <div class="rounded-2xl border border-dashed border-gray-200 bg-white p-4">
                <h3 class="text-sm font-semibold text-gray-900">Beispiele</h3>
                <div class="mt-3 space-y-2 text-sm text-gray-500">
                  <p>`Treffen mit Bro morgen Abend`</p>
                  <p>`2h Videoschnitt naechste Woche vormittags`</p>
                  <p>`Lernsession diese Woche nachmittag`</p>
                </div>
              </div>

              <div class="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <h3 class="text-sm font-semibold text-gray-900">Vorschlag</h3>
                <div v-if="previewEvent && parsedDetails" class="mt-3 space-y-3">
                  <div class="rounded-xl bg-white p-3 shadow-sm">
                    <p class="text-sm font-medium text-gray-900">{{ parsedDetails.title }}</p>
                    <p class="mt-1 text-sm text-gray-500">
                      {{ parsedDetails.durationMinutes }} Minuten
                    </p>
                    <p class="mt-2 text-sm text-primary-700">
                      {{ formatPreview(previewEvent.start.dateTime) }} bis
                      {{ formatPreview(previewEvent.end.dateTime) }}
                    </p>
                  </div>

                  <button
                    class="w-full rounded-xl bg-gray-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-black disabled:opacity-50"
                    :disabled="isPlanning"
                    @click="handleCreate"
                  >
                    Termin erstellen
                  </button>
                </div>
                <div v-else-if="previewTask && parsedDetails" class="mt-3 space-y-3">
                  <div class="rounded-xl bg-white p-3 shadow-sm">
                    <p class="text-sm font-medium text-gray-900">{{ previewTask.title }}</p>
                    <p class="mt-1 text-sm text-gray-500">
                      {{ previewTask.estimatedMinutes }} Minuten, Prioritaet {{ previewTask.priority }}
                    </p>
                    <p class="mt-2 text-sm text-primary-700">
                      Deadline: {{ previewTask.deadline ? new Date(previewTask.deadline).toLocaleDateString('de-DE') : 'keine' }}
                    </p>
                  </div>

                  <button
                    class="w-full rounded-xl bg-gray-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-black disabled:opacity-50"
                    :disabled="isPlanning"
                    @click="handleCreateTask"
                  >
                    Aufgabe erstellen
                  </button>
                </div>
                <p v-else class="mt-3 text-sm text-gray-500">
                  Noch kein Vorschlag vorhanden.
                </p>
              </div>

              <div v-if="error" class="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {{ error }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
