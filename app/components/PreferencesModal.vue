<script setup lang="ts">
import { v4 as uuidv4 } from 'uuid'
import type { CalendarEvent } from '~/composables/useCalendar'
import type { DeepWorkWindow, RoutineTemplate, RoutineRepeatMode } from '~/types/task'

const props = defineProps<{
  show: boolean
  events?: readonly CalendarEvent[]
}>()

const emit = defineEmits<{
  close: []
}>()

const {
  preferences,
  updatePreferences,
  resetPreferences,
} = usePreferences()
const { createEvent, fetchEvents } = useCalendar()

const dayNames = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
const dayNamesShort = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']

// Lokale Kopie fuer das Formular
const form = reactive({
  workStartHour: 9,
  workEndHour: 17,
  sleepStartHour: 23,
  sleepEndHour: 7,
  syncSleepSchedule: false,
  commuteToWorkMinutes: 30,
  commuteFromWorkMinutes: 30,
  syncCommuteSchedule: false,
  lunchStartHour: 12,
  lunchEndHour: 13,
  minDeepWorkBlockMinutes: 90,
  taskBufferMinutes: 15,
  deadlineWarningDays: 3,
  workDays: [1, 2, 3, 4, 5] as number[],
  deepWorkWindows: [] as DeepWorkWindow[],
  routineTemplates: [] as RoutineTemplate[],
})

const routineDraft = reactive({
  title: '',
  repeatMode: 'weekly' as RoutineRepeatMode,
  day: 1,
  startHour: 9,
  endHour: 10,
  description: '',
})
const isApplyingRoutines = ref(false)
const routineFeedback = ref<string | null>(null)
const routineExceptionDrafts = ref<Record<string, string>>({})

watch(() => props.show, (val) => {
  if (!val) return
  const p = preferences.value
  form.workStartHour = p.workStartHour
  form.workEndHour = p.workEndHour
  form.sleepStartHour = p.sleepStartHour
  form.sleepEndHour = p.sleepEndHour
  form.syncSleepSchedule = p.syncSleepSchedule
  form.commuteToWorkMinutes = p.commuteToWorkMinutes
  form.commuteFromWorkMinutes = p.commuteFromWorkMinutes
  form.syncCommuteSchedule = p.syncCommuteSchedule
  form.lunchStartHour = p.lunchStartHour
  form.lunchEndHour = p.lunchEndHour
  form.minDeepWorkBlockMinutes = p.minDeepWorkBlockMinutes
  form.taskBufferMinutes = p.taskBufferMinutes
  form.deadlineWarningDays = p.deadlineWarningDays
  form.workDays = [...p.workDays]
  form.deepWorkWindows = p.deepWorkWindows.map(w => ({ ...w }))
  form.routineTemplates = p.routineTemplates.map(r => ({
    ...r,
    repeatMode: r.repeatMode || 'weekly',
    skipDates: [...(r.skipDates || [])],
  }))
  routineExceptionDrafts.value = {}
  routineFeedback.value = null
})

function toggleWorkDay(day: number) {
  const idx = form.workDays.indexOf(day)
  if (idx >= 0) {
    form.workDays.splice(idx, 1)
  } else {
    form.workDays.push(day)
    form.workDays.sort()
  }
}

function getDeepWorkForDay(day: number): DeepWorkWindow | undefined {
  return form.deepWorkWindows.find(w => w.day === day)
}

function toggleDeepWork(day: number) {
  const existing = getDeepWorkForDay(day)
  if (existing) {
    form.deepWorkWindows = form.deepWorkWindows.filter(w => w.day !== day)
  } else {
    form.deepWorkWindows.push({
      day,
      startHour: form.workStartHour,
      endHour: Math.min(form.workStartHour + 3, form.workEndHour),
    })
  }
}

function updateDeepWorkHour(day: number, field: 'startHour' | 'endHour', value: number) {
  const w = getDeepWorkForDay(day)
  if (w) w[field] = value
}

function addRoutine() {
  if (!routineDraft.title.trim() || routineDraft.startHour >= routineDraft.endHour) return

  form.routineTemplates.push({
    id: uuidv4(),
    title: routineDraft.title.trim(),
    repeatMode: routineDraft.repeatMode,
    day: routineDraft.repeatMode === 'weekly' ? routineDraft.day : undefined,
    startHour: routineDraft.startHour,
    endHour: routineDraft.endHour,
    description: routineDraft.description.trim() || undefined,
    skipDates: [],
  })

  routineDraft.title = ''
  routineDraft.repeatMode = 'weekly'
  routineDraft.day = 1
  routineDraft.startHour = form.workStartHour
  routineDraft.endHour = Math.min(form.workStartHour + 1, form.workEndHour)
  routineDraft.description = ''
}

function updateRoutineHour(id: string, field: 'startHour' | 'endHour', value: number) {
  const routine = form.routineTemplates.find(entry => entry.id === id)
  if (routine) {
    routine[field] = value
  }
}

function updateRoutineDay(id: string, value: number) {
  const routine = form.routineTemplates.find(entry => entry.id === id)
  if (routine) {
    routine.day = value
  }
}

function updateRoutineRepeatMode(id: string, value: RoutineRepeatMode) {
  const routine = form.routineTemplates.find(entry => entry.id === id)
  if (!routine) return

  routine.repeatMode = value
  if (value === 'workdays') {
    routine.day = undefined
  } else if (typeof routine.day !== 'number') {
    routine.day = form.workDays[0] ?? 1
  }
}

function addRoutineException(id: string) {
  const nextDate = routineExceptionDrafts.value[id]
  if (!nextDate) return

  const routine = form.routineTemplates.find(entry => entry.id === id)
  if (!routine) return

  const existing = new Set(routine.skipDates || [])
  existing.add(nextDate)
  routine.skipDates = [...existing].sort()
  routineExceptionDrafts.value = {
    ...routineExceptionDrafts.value,
    [id]: '',
  }
}

function removeRoutineException(id: string, date: string) {
  const routine = form.routineTemplates.find(entry => entry.id === id)
  if (!routine) return

  routine.skipDates = (routine.skipDates || []).filter(entry => entry !== date)
}

async function applyRoutineTemplates() {
  isApplyingRoutines.value = true
  routineFeedback.value = null

  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    const createdEvents: string[] = []
    let skippedEvents = 0
    const now = new Date()

    for (const routine of form.routineTemplates) {
      for (const date of collectRoutineDates(routine, now, 28)) {
        const start = new Date(date)
        start.setHours(routine.startHour, 0, 0, 0)
        const end = new Date(date)
        end.setHours(routine.endHour, 0, 0, 0)
        if (routine.endHour <= routine.startHour) {
          end.setDate(end.getDate() + 1)
        }

        const created = await createBlockedEvent(routine.title, start, end, routine.description, tz)
        if (created === 'skipped') {
          skippedEvents++
        } else if (created) {
          createdEvents.push(created)
        }
      }
    }

    if (form.syncSleepSchedule) {
      for (let dayOffset = 0; dayOffset < 28; dayOffset++) {
        const sleepDate = new Date(now)
        sleepDate.setHours(0, 0, 0, 0)
        sleepDate.setDate(sleepDate.getDate() + dayOffset)

        const sleepStart = new Date(sleepDate)
        sleepStart.setHours(form.sleepStartHour, 0, 0, 0)
        const sleepEnd = new Date(sleepDate)
        sleepEnd.setHours(form.sleepEndHour, 0, 0, 0)
        if (form.sleepEndHour <= form.sleepStartHour) {
          sleepEnd.setDate(sleepEnd.getDate() + 1)
        }

        const createdSleep = await createBlockedEvent('Schlaf', sleepStart, sleepEnd, 'Automatisch aus Planung und Routinen eingetragen', tz)
        if (createdSleep === 'skipped') {
          skippedEvents++
        } else if (createdSleep) {
          createdEvents.push(createdSleep)
        }
      }
    }

    if (form.syncCommuteSchedule) {
      for (let weekOffset = 0; weekOffset < 4; weekOffset++) {
        for (const workDay of form.workDays) {
          const date = nextDateForWeekday(workDay, weekOffset, now)

          if (form.commuteToWorkMinutes > 0) {
            const commuteStart = new Date(date)
            commuteStart.setHours(form.workStartHour, 0, 0, 0)
            commuteStart.setMinutes(commuteStart.getMinutes() - form.commuteToWorkMinutes)
            const commuteEnd = new Date(date)
            commuteEnd.setHours(form.workStartHour, 0, 0, 0)

            const createdToWork = await createBlockedEvent('Arbeitsweg', commuteStart, commuteEnd, 'Hinweg zur Arbeit', tz)
            if (createdToWork === 'skipped') {
              skippedEvents++
            } else if (createdToWork) {
              createdEvents.push(createdToWork)
            }
          }

          if (form.commuteFromWorkMinutes > 0) {
            const commuteStart = new Date(date)
            commuteStart.setHours(form.workEndHour, 0, 0, 0)
            const commuteEnd = new Date(date)
            commuteEnd.setHours(form.workEndHour, 0, 0, 0)
            commuteEnd.setMinutes(commuteEnd.getMinutes() + form.commuteFromWorkMinutes)

            const createdFromWork = await createBlockedEvent('Arbeitsweg', commuteStart, commuteEnd, 'Rueckweg von der Arbeit', tz)
            if (createdFromWork === 'skipped') {
              skippedEvents++
            } else if (createdFromWork) {
              createdEvents.push(createdFromWork)
            }
          }
        }
      }
    }

    const rangeStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const rangeEnd = new Date(now.getFullYear(), now.getMonth() + 4, 0)
    await fetchEvents(rangeStart.toISOString(), rangeEnd.toISOString())
    routineFeedback.value = `${createdEvents.length} Routinen wurden eingetragen.${skippedEvents > 0 ? ` ${skippedEvents} vorhandene Termine wurden uebersprungen.` : ''}`
  } catch (error: any) {
    routineFeedback.value = error.message || 'Routinen konnten nicht eingetragen werden.'
  } finally {
    isApplyingRoutines.value = false
  }
}

async function createBlockedEvent(summary: string, start: Date, end: Date, description: string | undefined, tz: string) {
  if (hasMatchingExistingEvent(summary, start, end)) {
    return 'skipped' as const
  }

  const created = await createEvent({
    summary,
    description,
    start: { dateTime: start.toISOString(), timeZone: tz },
    end: { dateTime: end.toISOString(), timeZone: tz },
  })

  return created?.id || null
}

function hasMatchingExistingEvent(summary: string, start: Date, end: Date) {
  return (props.events || []).some(event => {
    if (!event.start.dateTime || !event.end.dateTime) return false

    const normalizedSummary = event.summary?.trim().toLowerCase() || ''
    const normalizedRoutineTitle = summary.trim().toLowerCase()
    const titlesMatch = normalizedSummary === normalizedRoutineTitle ||
      normalizedSummary.includes(normalizedRoutineTitle) ||
      normalizedRoutineTitle.includes(normalizedSummary)
    if (!titlesMatch) return false

    const eventStart = new Date(event.start.dateTime)
    const eventEnd = new Date(event.end.dateTime)

    const sameDay = eventStart.getFullYear() === start.getFullYear() &&
      eventStart.getMonth() === start.getMonth() &&
      eventStart.getDate() === start.getDate()

    const startDiff = Math.abs(eventStart.getTime() - start.getTime())
    const endDiff = Math.abs(eventEnd.getTime() - end.getTime())

    return sameDay && startDiff <= 15 * 60 * 1000 && endDiff <= 15 * 60 * 1000
  })
}

function nextDateForWeekday(day: number, weekOffset: number, from: Date) {
  const base = new Date(from)
  base.setHours(0, 0, 0, 0)
  const currentDay = base.getDay()
  let diff = day - currentDay
  if (diff < 0) diff += 7
  base.setDate(base.getDate() + diff + weekOffset * 7)
  return base
}

function collectRoutineDates(routine: RoutineTemplate, from: Date, durationDays: number) {
  const dates: Date[] = []
  const cursor = new Date(from)
  cursor.setHours(0, 0, 0, 0)

  for (let offset = 0; offset < durationDays; offset++) {
    const date = new Date(cursor)
    date.setDate(cursor.getDate() + offset)

    const isWorkdayRoutine = (routine.repeatMode || 'weekly') === 'workdays'
    const applies = isWorkdayRoutine
      ? form.workDays.includes(date.getDay())
      : routine.day === date.getDay()

    if (!applies) continue
    if ((routine.skipDates || []).includes(toDateKey(date))) continue
    dates.push(date)
  }

  return dates
}

function routineRepeatLabel(routine: RoutineTemplate) {
  if ((routine.repeatMode || 'weekly') === 'workdays') {
    return 'An Arbeitstagen'
  }

  return dayNames[routine.day ?? 1]
}

function upcomingRoutineLabels(routine: RoutineTemplate) {
  return collectRoutineDates(routine, new Date(), 21)
    .slice(0, 3)
    .map(date => `${date.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })}`)
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function handleSave() {
  updatePreferences({
    workStartHour: form.workStartHour,
    workEndHour: form.workEndHour,
    sleepStartHour: form.sleepStartHour,
    sleepEndHour: form.sleepEndHour,
    syncSleepSchedule: form.syncSleepSchedule,
    commuteToWorkMinutes: form.commuteToWorkMinutes,
    commuteFromWorkMinutes: form.commuteFromWorkMinutes,
    syncCommuteSchedule: form.syncCommuteSchedule,
    lunchStartHour: form.lunchStartHour,
    lunchEndHour: form.lunchEndHour,
    minDeepWorkBlockMinutes: form.minDeepWorkBlockMinutes,
    taskBufferMinutes: form.taskBufferMinutes,
    deadlineWarningDays: form.deadlineWarningDays,
    workDays: [...form.workDays],
    deepWorkWindows: form.deepWorkWindows.map(w => ({ ...w })),
    routineTemplates: form.routineTemplates.map(r => ({
      ...r,
      repeatMode: r.repeatMode || 'weekly',
      skipDates: [...(r.skipDates || [])],
    })),
  })
  emit('close')
}

function handleReset() {
  resetPreferences()
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/40" @click="emit('close')" />

        <!-- Modal -->
        <div class="relative bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 space-y-5 max-h-[90vh] overflow-y-auto">
          <h2 class="text-lg font-semibold text-gray-900">Planung und Routinen</h2>
          <p class="text-sm text-gray-500">
            Lege hier fest, wann du normalerweise arbeitest und welche Routinen du als Vorlagen schnell in den Kalender uebernehmen willst.
          </p>
          <div class="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-700">
            Routinen werden jetzt auch direkt bei der Planung respektiert. Schlaf, Arbeitswege und gespeicherte Routinen blockieren passende Zeiten schon im Scheduler, auch wenn du sie nicht jedes Mal manuell in den Kalender eintraegst.
          </div>

          <!-- Arbeitszeiten -->
          <div>
            <h3 class="text-sm font-medium text-gray-700 mb-2">Arbeitszeiten</h3>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs text-gray-500 mb-1">Start</label>
                <select
                  v-model.number="form.workStartHour"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                >
                  <option v-for="h in 24" :key="h - 1" :value="h - 1">
                    {{ String(h - 1).padStart(2, '0') }}:00
                  </option>
                </select>
              </div>
              <div>
                <label class="block text-xs text-gray-500 mb-1">Ende</label>
                <select
                  v-model.number="form.workEndHour"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                >
                  <option v-for="h in 24" :key="h" :value="h">
                    {{ String(h).padStart(2, '0') }}:00
                  </option>
                </select>
              </div>
            </div>
          </div>

          <div>
            <h3 class="text-sm font-medium text-gray-700 mb-2">Schlafzeiten</h3>
            <label class="mb-3 flex items-center gap-2 text-sm text-gray-600">
              <input
                v-model="form.syncSleepSchedule"
                type="checkbox"
                class="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              >
              Schlafzeiten beim Eintragen als blockierende Termine anlegen
            </label>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs text-gray-500 mb-1">Schlafen ab</label>
                <select
                  v-model.number="form.sleepStartHour"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                >
                  <option v-for="h in 24" :key="`sleep-start-${h - 1}`" :value="h - 1">
                    {{ String(h - 1).padStart(2, '0') }}:00
                  </option>
                </select>
              </div>
              <div>
                <label class="block text-xs text-gray-500 mb-1">Aufstehen</label>
                <select
                  v-model.number="form.sleepEndHour"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                >
                  <option v-for="h in 24" :key="`sleep-end-${h - 1}`" :value="h - 1">
                    {{ String(h - 1).padStart(2, '0') }}:00
                  </option>
                </select>
              </div>
            </div>
            <p class="mt-2 text-xs text-gray-500">
              Wenn aktiv, werden Schlafzeiten beim Planen respektiert und koennen zusaetzlich als Kalenderbloecke fuer die naechsten 4 Wochen eingetragen werden.
            </p>
          </div>

          <!-- Mittagspause -->
          <div>
            <h3 class="text-sm font-medium text-gray-700 mb-2">Mittagspause</h3>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs text-gray-500 mb-1">Von</label>
                <select
                  v-model.number="form.lunchStartHour"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                >
                  <option v-for="h in 24" :key="h - 1" :value="h - 1">
                    {{ String(h - 1).padStart(2, '0') }}:00
                  </option>
                </select>
              </div>
              <div>
                <label class="block text-xs text-gray-500 mb-1">Bis</label>
                <select
                  v-model.number="form.lunchEndHour"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                >
                  <option v-for="h in 24" :key="h" :value="h">
                    {{ String(h).padStart(2, '0') }}:00
                  </option>
                </select>
              </div>
            </div>
          </div>

          <!-- Arbeitstage -->
          <div>
            <h3 class="text-sm font-medium text-gray-700 mb-2">Arbeitstage</h3>
            <div class="flex gap-1.5">
              <button
                v-for="day in 7"
                :key="day"
                :class="[
                  'w-10 h-10 rounded-lg text-xs font-medium transition-colors',
                  form.workDays.includes(day % 7)
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                ]"
                @click="toggleWorkDay(day % 7)"
              >
                {{ dayNamesShort[day % 7] }}
              </button>
            </div>
          </div>

          <!-- Deep Work Fenster -->
          <div>
            <h3 class="text-sm font-medium text-gray-700 mb-2">Deep-Work-Zeiten</h3>
            <p class="text-xs text-gray-500 mb-3">
              Geschuetzte Fokuszeiten, in denen nur Deep-Work-Aufgaben eingeplant werden.
            </p>
            <div class="space-y-2">
              <div
                v-for="day in form.workDays"
                :key="day"
                class="flex items-center gap-3"
              >
                <label class="flex items-center gap-2 w-24 cursor-pointer">
                  <input
                    type="checkbox"
                    :checked="!!getDeepWorkForDay(day)"
                    class="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    @change="toggleDeepWork(day)"
                  >
                  <span class="text-sm text-gray-700">{{ dayNames[day] }}</span>
                </label>
                <template v-if="getDeepWorkForDay(day)">
                  <select
                    :value="getDeepWorkForDay(day)!.startHour"
                    class="px-2 py-1 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                    @change="updateDeepWorkHour(day, 'startHour', Number(($event.target as HTMLSelectElement).value))"
                  >
                    <option v-for="h in 24" :key="h - 1" :value="h - 1">
                      {{ String(h - 1).padStart(2, '0') }}:00
                    </option>
                  </select>
                  <span class="text-gray-400">-</span>
                  <select
                    :value="getDeepWorkForDay(day)!.endHour"
                    class="px-2 py-1 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                    @change="updateDeepWorkHour(day, 'endHour', Number(($event.target as HTMLSelectElement).value))"
                  >
                    <option v-for="h in 24" :key="h" :value="h">
                      {{ String(h).padStart(2, '0') }}:00
                    </option>
                  </select>
                </template>
              </div>
            </div>
          </div>

          <!-- Weitere Einstellungen -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Min. Deep-Work-Block</label>
              <select
                v-model.number="form.minDeepWorkBlockMinutes"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              >
                <option :value="30">30 Min.</option>
                <option :value="60">60 Min.</option>
                <option :value="90">90 Min.</option>
                <option :value="120">120 Min.</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Puffer zwischen Aufgaben</label>
              <select
                v-model.number="form.taskBufferMinutes"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              >
                <option :value="0">Kein Puffer</option>
                <option :value="10">10 Min.</option>
                <option :value="15">15 Min.</option>
                <option :value="20">20 Min.</option>
                <option :value="30">30 Min.</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Deadline-Warnung</label>
              <select
                v-model.number="form.deadlineWarningDays"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              >
                <option :value="1">1 Tag vorher</option>
                <option :value="2">2 Tage vorher</option>
                <option :value="3">3 Tage vorher</option>
                <option :value="5">5 Tage vorher</option>
                <option :value="7">7 Tage vorher</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Weg zur Arbeit</label>
              <select
                v-model.number="form.commuteToWorkMinutes"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              >
                <option :value="0">Kein Hinweg</option>
                <option :value="15">15 Min.</option>
                <option :value="30">30 Min.</option>
                <option :value="45">45 Min.</option>
                <option :value="60">60 Min.</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Rueckweg von der Arbeit</label>
              <select
                v-model.number="form.commuteFromWorkMinutes"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              >
                <option :value="0">Kein Rueckweg</option>
                <option :value="15">15 Min.</option>
                <option :value="30">30 Min.</option>
                <option :value="45">45 Min.</option>
                <option :value="60">60 Min.</option>
              </select>
            </div>
            <label class="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
              <span class="flex items-center gap-2">
                <input
                  v-model="form.syncCommuteSchedule"
                  type="checkbox"
                  class="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                >
                Arbeitswege beim Eintragen automatisch rund um deine Arbeitszeiten blocken
              </span>
            </label>
          </div>

          <div class="space-y-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div class="flex items-start justify-between gap-4">
              <div>
                <h3 class="text-sm font-medium text-gray-700">Feste Routinen</h3>
                <p class="text-xs text-gray-500 mt-1">
                  Lege wiederkehrende Termine wie Uni, Gym oder Calls als Vorlagen an. Sie zaehlen sofort als Planungsregeln und koennen zusaetzlich gesammelt in den Kalender eingetragen werden.
                </p>
              </div>
              <button
                class="rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-black disabled:opacity-50"
                :disabled="isApplyingRoutines"
                @click="applyRoutineTemplates"
              >
                {{ isApplyingRoutines ? 'Trage ein...' : 'Naechste 4 Wochen eintragen' }}
              </button>
            </div>

            <div class="grid gap-2 md:grid-cols-2">
              <input
                v-model="routineDraft.title"
                type="text"
                class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500"
                placeholder="z.B. Vorlesung, Gym, Team Call"
              >
              <select
                v-model="routineDraft.repeatMode"
                class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500"
              >
                <option value="weekly">Woechentlich</option>
                <option value="workdays">An Arbeitstagen</option>
              </select>
              <select
                v-if="routineDraft.repeatMode === 'weekly'"
                v-model.number="routineDraft.day"
                class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500"
              >
                <option v-for="(name, index) in dayNames" :key="name" :value="index">
                  {{ name }}
                </option>
              </select>
              <div
                v-else
                class="flex items-center rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-500"
              >
                Gilt an deinen aktiven Arbeitstagen
              </div>
              <select
                v-model.number="routineDraft.startHour"
                class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500"
              >
                <option v-for="h in 24" :key="`start-${h}`" :value="h - 1">
                  Start {{ String(h - 1).padStart(2, '0') }}:00
                </option>
              </select>
              <select
                v-model.number="routineDraft.endHour"
                class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500"
              >
                <option v-for="h in 24" :key="`end-${h}`" :value="h">
                  Ende {{ String(h).padStart(2, '0') }}:00
                </option>
              </select>
            </div>

            <textarea
              v-model="routineDraft.description"
              rows="2"
              class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500"
              placeholder="Optionaler Hinweis, z.B. Raum, Link oder was du mitbringen musst"
            />

            <button
              class="rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-sm font-medium text-primary-700 transition hover:bg-primary-100"
              @click="addRoutine"
            >
              Routine hinzufuegen
            </button>

            <div v-if="form.routineTemplates.length > 0" class="space-y-2">
              <div
                v-for="routine in form.routineTemplates"
                :key="routine.id"
                class="rounded-xl border border-gray-200 bg-white p-3"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0 flex-1">
                    <div class="text-sm font-medium text-gray-900">{{ routine.title }}</div>
                    <div class="mt-1 text-xs text-gray-500">
                      {{ routineRepeatLabel(routine) }}
                    </div>
                    <div v-if="upcomingRoutineLabels(routine).length > 0" class="mt-1 flex flex-wrap gap-1">
                      <span
                        v-for="label in upcomingRoutineLabels(routine)"
                        :key="`${routine.id}-${label}`"
                        class="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600"
                      >
                        {{ label }}
                      </span>
                    </div>
                    <div v-if="routine.description" class="mt-1 text-xs text-gray-400">
                      {{ routine.description }}
                    </div>
                  </div>
                  <button
                    class="rounded-lg px-2 py-1 text-xs text-red-600 transition hover:bg-red-50"
                    @click="form.routineTemplates = form.routineTemplates.filter(entry => entry.id !== routine.id)"
                  >
                    Entfernen
                  </button>
                </div>
                <div class="mt-3 grid grid-cols-2 gap-2">
                  <select
                    :value="routine.repeatMode || 'weekly'"
                    class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500"
                    @change="updateRoutineRepeatMode(routine.id, ($event.target as HTMLSelectElement).value as RoutineRepeatMode)"
                  >
                    <option value="weekly">Woechentlich</option>
                    <option value="workdays">An Arbeitstagen</option>
                  </select>
                  <template v-if="(routine.repeatMode || 'weekly') === 'weekly'">
                    <select
                      :value="routine.day"
                      class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500"
                      @change="updateRoutineDay(routine.id, Number(($event.target as HTMLSelectElement).value))"
                    >
                      <option v-for="(name, index) in dayNames" :key="`${routine.id}-day-${name}`" :value="index">
                        {{ name }}
                      </option>
                    </select>
                  </template>
                  <div
                    v-else
                    class="flex items-center rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-500"
                  >
                    Aktiv an Arbeitstagen
                  </div>
                </div>
                <div class="mt-2 grid grid-cols-2 gap-2">
                  <select
                    :value="routine.startHour"
                    class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500"
                    @change="updateRoutineHour(routine.id, 'startHour', Number(($event.target as HTMLSelectElement).value))"
                  >
                    <option v-for="h in 24" :key="`${routine.id}-start-${h}`" :value="h - 1">
                      Start {{ String(h - 1).padStart(2, '0') }}:00
                    </option>
                  </select>
                  <select
                    :value="routine.endHour"
                    class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500"
                    @change="updateRoutineHour(routine.id, 'endHour', Number(($event.target as HTMLSelectElement).value))"
                  >
                    <option v-for="h in 24" :key="`${routine.id}-end-${h}`" :value="h">
                      Ende {{ String(h).padStart(2, '0') }}:00
                    </option>
                  </select>
                </div>
                <div class="mt-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <div class="text-xs font-medium text-gray-700">Ausnahmen</div>
                  <p class="mt-1 text-xs text-gray-500">
                    Einzelne Tage, an denen diese Routine die Planung nicht blockieren soll.
                  </p>
                  <div class="mt-2 flex gap-2">
                    <input
                      v-model="routineExceptionDrafts[routine.id]"
                      type="date"
                      class="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500"
                    >
                    <button
                      class="rounded-lg border border-primary-200 bg-white px-3 py-2 text-sm text-primary-700 transition hover:bg-primary-50"
                      @click="addRoutineException(routine.id)"
                    >
                      Ausnahme hinzufuegen
                    </button>
                  </div>
                  <div v-if="(routine.skipDates || []).length > 0" class="mt-2 flex flex-wrap gap-2">
                    <button
                      v-for="skipDate in routine.skipDates"
                      :key="`${routine.id}-${skipDate}`"
                      class="rounded-full bg-white px-2 py-0.5 text-[11px] text-gray-600 transition hover:bg-red-50 hover:text-red-600"
                      @click="removeRoutineException(routine.id, skipDate)"
                    >
                      {{ new Date(`${skipDate}T00:00:00`).toLocaleDateString('de-DE') }} entfernen
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="routineFeedback" class="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
              {{ routineFeedback }}
            </div>
          </div>

          <!-- Actions -->
          <div class="flex items-center justify-between pt-2">
            <button
              class="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              @click="handleReset"
            >
              Zuruecksetzen
            </button>
            <div class="flex gap-2">
              <button
                class="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                @click="emit('close')"
              >
                Abbrechen
              </button>
              <button
                class="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                @click="handleSave"
              >
                Speichern
              </button>
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
