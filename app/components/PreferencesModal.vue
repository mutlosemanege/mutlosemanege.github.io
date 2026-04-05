<script setup lang="ts">
import { v4 as uuidv4 } from 'uuid'
import type { CalendarEvent } from '~/composables/useCalendar'
import type { DeepWorkWindow, RoutineTemplate, RoutineRepeatMode, PlanningStyle } from '~/types/task'

type ImportEntryType = 'routine' | 'fixed-event'

interface ImportReviewEntry {
  id: string
  enabled: boolean
  title: string
  type: ImportEntryType
  repeatMode: RoutineRepeatMode
  day: number
  date: string
  startHour: number
  endHour: number
  description: string
  alsoAddToCalendar: boolean
}

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
const { createEvent, fetchEvents, syncStatus, findPotentialDuplicates } = useCalendar()

const dayNames = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
const dayNamesShort = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']

// Lokale Kopie fuer das Formular
const form = reactive({
  planningStyle: 'normal' as PlanningStyle,
  workStartHour: 9,
  workEndHour: 17,
  personalStartHour: 17,
  personalEndHour: 22,
  personalDays: [0, 1, 2, 3, 4, 5, 6] as number[],
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
const planningStyleOptions: Array<{ value: PlanningStyle; label: string; description: string }> = [
  { value: 'entspannt', label: 'Entspannt', description: 'Plant spaeter und mit mehr Luft.' },
  { value: 'normal', label: 'Normal', description: 'Ausgewogener Standardstil.' },
  { value: 'aggressiv', label: 'Aggressiv', description: 'Nimmt fruehe Slots schneller mit.' },
  { value: 'deadline-first', label: 'Deadline-first', description: 'Zieht Aufgaben eher frueh vor.' },
  { value: 'focus-first', label: 'Focus-first', description: 'Bevorzugt starke Fokuszeiten.' },
]
const behaviorSummary = computed(() => {
  const signals = preferences.value.behaviorSignals
  const topHours = Object.entries(signals.completedByHour)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([hour]) => `${hour}:00`)

  return {
    topHours,
    completions: signals.completionCount,
    missed: signals.missedCount,
    rescheduled: signals.rescheduledCount,
  }
})
const importImagePreview = ref<string | null>(null)
const importImageName = ref<string | null>(null)
const importFeedback = ref<string | null>(null)
const isApplyingImport = ref(false)
const importReviewEntries = ref<ImportReviewEntry[]>([])

watch(() => props.show, (val) => {
  if (!val) return
  const p = preferences.value
  form.planningStyle = p.planningStyle
  form.workStartHour = p.workStartHour
  form.workEndHour = p.workEndHour
  form.personalStartHour = p.personalStartHour
  form.personalEndHour = p.personalEndHour
  form.personalDays = [...p.personalDays]
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
  importImagePreview.value = null
  importImageName.value = null
  importReviewEntries.value = []
  importFeedback.value = null
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

function togglePersonalDay(day: number) {
  const idx = form.personalDays.indexOf(day)
  if (idx >= 0) {
    form.personalDays.splice(idx, 1)
  } else {
    form.personalDays.push(day)
    form.personalDays.sort()
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

function addImportReviewEntry() {
  importReviewEntries.value = [
    ...importReviewEntries.value,
    createImportReviewEntry(),
  ]
}

function removeImportReviewEntry(id: string) {
  importReviewEntries.value = importReviewEntries.value.filter(entry => entry.id !== id)
}

function createImportReviewEntry(): ImportReviewEntry {
  const nextWorkDay = form.workDays[0] ?? 1
  return {
    id: uuidv4(),
    enabled: true,
    title: '',
    type: 'routine',
    repeatMode: 'weekly',
    day: nextWorkDay,
    date: '',
    startHour: form.workStartHour,
    endHour: Math.min(form.workStartHour + 1, form.workEndHour),
    description: '',
    alsoAddToCalendar: false,
  }
}

function handleImportImageChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = () => {
    importImagePreview.value = typeof reader.result === 'string' ? reader.result : null
    importImageName.value = file.name
    importFeedback.value = 'Bild geladen. Pruefe jetzt die Eintraege darunter und uebernimm nur, was wirklich passt.'
    if (importReviewEntries.value.length === 0) {
      importReviewEntries.value = [createImportReviewEntry()]
    }
  }
  reader.readAsDataURL(file)
  input.value = ''
}

function clearImportImage() {
  importImagePreview.value = null
  importImageName.value = null
  importFeedback.value = null
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

async function applyImportEntries() {
  const selectedEntries = importReviewEntries.value.filter(entry => entry.enabled && entry.title.trim() && entry.startHour < entry.endHour)
  if (selectedEntries.length === 0) {
    importFeedback.value = 'Fuege zuerst mindestens einen gueltigen Import-Eintrag hinzu.'
    return
  }

  isApplyingImport.value = true
  importFeedback.value = null

  try {
    let savedRoutines = 0
    let createdEvents = 0
    let skippedDuplicates = 0
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone

    for (const entry of selectedEntries) {
      if (entry.type === 'routine') {
        if (hasMatchingRoutineTemplate(entry)) {
          skippedDuplicates++
          continue
        }

        const routine: RoutineTemplate = {
          id: uuidv4(),
          title: entry.title.trim(),
          repeatMode: entry.repeatMode,
          day: entry.repeatMode === 'weekly' ? entry.day : undefined,
          startHour: entry.startHour,
          endHour: entry.endHour,
          description: entry.description.trim() || undefined,
          skipDates: [],
        }

        form.routineTemplates.push(routine)
        savedRoutines++

        if (entry.alsoAddToCalendar) {
          for (const date of collectRoutineDates(routine, new Date(), 28)) {
            const start = new Date(date)
            start.setHours(routine.startHour, 0, 0, 0)
            const end = new Date(date)
            end.setHours(routine.endHour, 0, 0, 0)
            if (routine.endHour <= routine.startHour) {
              end.setDate(end.getDate() + 1)
            }

            const created = await createBlockedEvent(routine.title, start, end, routine.description, tz)
            if (created === 'skipped') {
              skippedDuplicates++
            } else if (created) {
              createdEvents++
            }
          }
        }
        continue
      }

      if (!entry.date) {
        continue
      }

      const start = new Date(`${entry.date}T00:00:00`)
      start.setHours(entry.startHour, 0, 0, 0)
      const end = new Date(`${entry.date}T00:00:00`)
      end.setHours(entry.endHour, 0, 0, 0)
      if (entry.endHour <= entry.startHour) {
        end.setDate(end.getDate() + 1)
      }

      const created = await createBlockedEvent(entry.title.trim(), start, end, entry.description.trim() || undefined, tz)
      if (created === 'skipped') {
        skippedDuplicates++
      } else if (created) {
        createdEvents++
      }
    }

    if (createdEvents > 0) {
      const now = new Date()
      const rangeStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const rangeEnd = new Date(now.getFullYear(), now.getMonth() + 4, 0)
      await fetchEvents(rangeStart.toISOString(), rangeEnd.toISOString())
    }

    importFeedback.value = `${savedRoutines} Routinen gespeichert, ${createdEvents} feste Termine eingetragen.${skippedDuplicates > 0 ? ` ${skippedDuplicates} aehnliche Eintraege wurden uebersprungen.` : ''}`
  } catch (error: any) {
    importFeedback.value = error.message || 'Import-Eintraege konnten nicht uebernommen werden.'
  } finally {
    isApplyingImport.value = false
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
  return findPotentialDuplicates({ summary, start, end }, props.events || [])
    .some(entry => entry.kind === 'exact-match')
}

function hasMatchingRoutineTemplate(entry: ImportReviewEntry) {
  const normalizedTitle = entry.title.trim().toLowerCase()

  return form.routineTemplates.some(routine => {
    const routineTitle = routine.title.trim().toLowerCase()
    if (routineTitle !== normalizedTitle) return false
    if ((routine.repeatMode || 'weekly') !== entry.repeatMode) return false
    if ((routine.repeatMode || 'weekly') === 'weekly' && routine.day !== entry.day) return false
    return routine.startHour === entry.startHour && routine.endHour === entry.endHour
  })
}

function importEntryDuplicateHint(entry: ImportReviewEntry) {
  if (!entry.title.trim()) return null

  if (entry.type === 'routine') {
    return hasMatchingRoutineTemplate(entry) ? 'Aehnliche Routine bereits vorhanden' : null
  }

  if (!entry.date) return null

  const start = new Date(`${entry.date}T00:00:00`)
  start.setHours(entry.startHour, 0, 0, 0)
  const end = new Date(`${entry.date}T00:00:00`)
  end.setHours(entry.endHour, 0, 0, 0)
  if (entry.endHour <= entry.startHour) {
    end.setDate(end.getDate() + 1)
  }

  return hasMatchingExistingEvent(entry.title.trim(), start, end)
    ? 'Aehnlicher Termin bereits im Kalender'
    : null
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
    planningStyle: form.planningStyle,
    workStartHour: form.workStartHour,
    workEndHour: form.workEndHour,
    personalStartHour: form.personalStartHour,
    personalEndHour: form.personalEndHour,
    personalDays: [...form.personalDays],
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

          <div
            v-if="syncStatus"
            class="rounded-xl border px-4 py-3 text-xs"
            :class="syncStatus.state === 'error'
              ? 'border-red-200 bg-red-50 text-red-700'
              : syncStatus.state === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-slate-200 bg-slate-50 text-slate-700'"
          >
            Kalenderstatus: {{ syncStatus.message }}
          </div>

          <div class="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <h3 class="text-sm font-medium text-gray-700">Planungsstil</h3>
            <p class="mt-1 text-xs text-gray-500">
              Beeinflusst, welche freien Slots der Planer bevorzugt und wie stark er deine gelernten Tageszeiten nutzt.
            </p>
            <div class="mt-3 grid gap-2">
              <label
                v-for="option in planningStyleOptions"
                :key="option.value"
                class="flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition-colors"
                :class="form.planningStyle === option.value
                  ? 'border-primary-300 bg-white'
                  : 'border-gray-200 bg-white/80 hover:border-gray-300'"
              >
                <input
                  v-model="form.planningStyle"
                  type="radio"
                  class="mt-1 border-gray-300 text-primary-600 focus:ring-primary-500"
                  :value="option.value"
                >
                <div>
                  <div class="text-sm font-medium text-gray-900">{{ option.label }}</div>
                  <div class="mt-1 text-xs text-gray-500">{{ option.description }}</div>
                </div>
              </label>
            </div>
          </div>

          <div class="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <h3 class="text-sm font-medium text-emerald-800">Gelernt aus deinem Verhalten</h3>
            <p class="mt-1 text-xs text-emerald-700">
              Die App merkt sich lokal, wann Aufgaben eher geschafft oder verschoben werden, und nutzt das fuer bessere Slot-Vorschlaege.
            </p>
            <div class="mt-3 grid grid-cols-3 gap-2 text-center">
              <div class="rounded-lg bg-white px-3 py-2">
                <div class="text-lg font-semibold text-gray-900">{{ behaviorSummary.completions }}</div>
                <div class="text-[11px] text-gray-500">Erledigt</div>
              </div>
              <div class="rounded-lg bg-white px-3 py-2">
                <div class="text-lg font-semibold text-gray-900">{{ behaviorSummary.missed }}</div>
                <div class="text-[11px] text-gray-500">Nicht geschafft</div>
              </div>
              <div class="rounded-lg bg-white px-3 py-2">
                <div class="text-lg font-semibold text-gray-900">{{ behaviorSummary.rescheduled }}</div>
                <div class="text-[11px] text-gray-500">Neu geplant</div>
              </div>
            </div>
            <div class="mt-3">
              <div class="text-xs font-medium text-emerald-800">Bevorzugte Zeiten</div>
              <div class="mt-2 flex flex-wrap gap-2">
                <span
                  v-for="label in behaviorSummary.topHours"
                  :key="label"
                  class="rounded-full bg-white px-2 py-0.5 text-[11px] text-emerald-700"
                >
                  {{ label }}
                </span>
                <span v-if="behaviorSummary.topHours.length === 0" class="text-xs text-emerald-700">
                  Noch nicht genug Daten gesammelt.
                </span>
              </div>
            </div>
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
            <h3 class="text-sm font-medium text-gray-700 mb-2">Persönliche Terminzeit</h3>
            <p class="mb-3 text-xs text-gray-500">
              Diese Zeiten nutzt der Planungs-Chat für Treffen, private Termine und soziale Verabredungen statt deiner reinen Arbeitszeit.
            </p>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs text-gray-500 mb-1">Start</label>
                <select
                  v-model.number="form.personalStartHour"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                >
                  <option v-for="h in 24" :key="`personal-start-${h - 1}`" :value="h - 1">
                    {{ String(h - 1).padStart(2, '0') }}:00
                  </option>
                </select>
              </div>
              <div>
                <label class="block text-xs text-gray-500 mb-1">Ende</label>
                <select
                  v-model.number="form.personalEndHour"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                >
                  <option v-for="h in 24" :key="`personal-end-${h}`" :value="h">
                    {{ String(h).padStart(2, '0') }}:00
                  </option>
                </select>
              </div>
            </div>
            <div class="mt-3">
              <label class="block text-xs text-gray-500 mb-2">Tage für persönliche Termine</label>
              <div class="flex gap-1.5">
                <button
                  v-for="day in 7"
                  :key="`personal-day-${day}`"
                  :class="[
                    'w-10 h-10 rounded-lg text-xs font-medium transition-colors',
                    form.personalDays.includes(day % 7)
                      ? 'bg-emerald-600 text-white'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  ]"
                  @click="togglePersonalDay(day % 7)"
                >
                  {{ dayNamesShort[day % 7] }}
                </button>
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

          <div class="space-y-4 rounded-xl border border-sky-200 bg-sky-50 p-4">
            <div class="flex items-start justify-between gap-4">
              <div>
                <h3 class="text-sm font-medium text-sky-900">Bild-Import vorbereiten</h3>
                <p class="mt-1 text-xs text-sky-800">
                  Lade einen Stundenplan oder Screenshot hoch und uebernimm daraus feste Termine oder Routinen nach einer manuellen Review.
                </p>
              </div>
            </div>

            <div class="rounded-xl border border-sky-200 bg-white p-4">
              <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div class="text-sm font-medium text-gray-900">1. Bild hochladen</div>
                  <div class="mt-1 text-xs text-gray-500">
                    Das Bild dient hier bewusst als Referenz. Die App importiert noch nichts automatisch ohne deine Pruefung.
                  </div>
                </div>
                <label class="inline-flex cursor-pointer items-center justify-center rounded-lg border border-sky-200 bg-sky-100 px-3 py-2 text-sm font-medium text-sky-800 transition hover:bg-sky-200">
                  Bild auswaehlen
                  <input
                    type="file"
                    accept="image/*"
                    class="hidden"
                    @change="handleImportImageChange"
                  >
                </label>
              </div>

              <div v-if="importImagePreview" class="mt-4 space-y-3">
                <div class="flex items-center justify-between gap-3">
                  <div class="text-xs text-gray-500">
                    Geladen: <span class="font-medium text-gray-700">{{ importImageName }}</span>
                  </div>
                  <button
                    class="rounded-lg px-2 py-1 text-xs text-red-600 transition hover:bg-red-50"
                    @click="clearImportImage"
                  >
                    Bild entfernen
                  </button>
                </div>
                <img
                  :src="importImagePreview"
                  alt="Import-Vorschau"
                  class="max-h-72 w-full rounded-xl border border-sky-100 object-contain"
                >
              </div>
            </div>

            <div class="rounded-xl border border-sky-200 bg-white p-4">
              <div class="flex items-start justify-between gap-4">
                <div>
                  <div class="text-sm font-medium text-gray-900">2. Eintraege reviewen</div>
                  <div class="mt-1 text-xs text-gray-500">
                    Lege darunter die Eintraege an, die du aus dem Bild uebernehmen willst. Alles bleibt vor dem Uebernehmen editierbar.
                  </div>
                </div>
                <button
                  class="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-800 transition hover:bg-sky-100"
                  @click="addImportReviewEntry"
                >
                  Eintrag hinzufuegen
                </button>
              </div>

              <div v-if="importReviewEntries.length === 0" class="mt-3 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-center text-xs text-gray-500">
                Noch keine Import-Eintraege angelegt. Lade ein Bild hoch oder fuege den ersten Eintrag manuell hinzu.
              </div>

              <div v-else class="mt-4 space-y-3">
                <div
                  v-for="entry in importReviewEntries"
                  :key="entry.id"
                  class="rounded-xl border border-gray-200 bg-gray-50 p-3"
                >
                  <div class="flex items-start justify-between gap-3">
                    <label class="flex items-center gap-2 text-xs font-medium text-gray-700">
                      <input v-model="entry.enabled" type="checkbox" class="rounded border-gray-300 text-primary-600 focus:ring-primary-500">
                      Uebernehmen
                    </label>
                    <button
                      class="rounded-lg px-2 py-1 text-xs text-red-600 transition hover:bg-red-50"
                      @click="removeImportReviewEntry(entry.id)"
                    >
                      Entfernen
                    </button>
                  </div>

                  <div class="mt-3 grid gap-2 md:grid-cols-2">
                    <input
                      v-model="entry.title"
                      type="text"
                      class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500"
                      placeholder="Titel aus dem Bild, z.B. Mathe, Team Call"
                    >
                    <select
                      v-model="entry.type"
                      class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="routine">Als Routine</option>
                      <option value="fixed-event">Als fester Termin</option>
                    </select>
                    <template v-if="entry.type === 'routine'">
                      <select
                        v-model="entry.repeatMode"
                        class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500"
                      >
                        <option value="weekly">Woechentlich</option>
                        <option value="workdays">An Arbeitstagen</option>
                      </select>
                      <select
                        v-if="entry.repeatMode === 'weekly'"
                        v-model.number="entry.day"
                        class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500"
                      >
                        <option v-for="(name, index) in dayNames" :key="`${entry.id}-import-${name}`" :value="index">
                          {{ name }}
                        </option>
                      </select>
                      <div
                        v-else
                        class="flex items-center rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-500"
                      >
                        Gilt an deinen aktiven Arbeitstagen
                      </div>
                    </template>
                    <input
                      v-else
                      v-model="entry.date"
                      type="date"
                      class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500"
                    >
                    <label
                      v-if="entry.type === 'routine'"
                      class="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600"
                    >
                      <input
                        v-model="entry.alsoAddToCalendar"
                        type="checkbox"
                        class="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      >
                      Zusaetzlich in den Kalender eintragen
                    </label>
                    <div v-else class="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-500">
                      Feste Termine werden direkt in den Kalender eingetragen.
                    </div>
                    <select
                      v-model.number="entry.startHour"
                      class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500"
                    >
                      <option v-for="h in 24" :key="`${entry.id}-import-start-${h}`" :value="h - 1">
                        Start {{ String(h - 1).padStart(2, '0') }}:00
                      </option>
                    </select>
                    <select
                      v-model.number="entry.endHour"
                      class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500"
                    >
                      <option v-for="h in 24" :key="`${entry.id}-import-end-${h}`" :value="h">
                        Ende {{ String(h).padStart(2, '0') }}:00
                      </option>
                    </select>
                  </div>

                  <textarea
                    v-model="entry.description"
                    rows="2"
                    class="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500"
                    placeholder="Optionaler Hinweis, z.B. Raum, Link oder Notiz aus dem Bild"
                  />

                  <div class="mt-2 flex flex-wrap gap-2">
                    <span
                      class="rounded-full bg-white px-2 py-0.5 text-[11px]"
                      :class="importEntryDuplicateHint(entry) ? 'text-amber-700' : 'text-emerald-700'"
                    >
                      {{ importEntryDuplicateHint(entry) || 'Sieht nach einem neuen Eintrag aus' }}
                    </span>
                    <span
                      v-if="entry.startHour >= entry.endHour"
                      class="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] text-rose-700"
                    >
                      Ende muss nach dem Start liegen
                    </span>
                    <span
                      v-if="entry.type === 'fixed-event' && !entry.date"
                      class="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] text-rose-700"
                    >
                      Fuer feste Termine fehlt noch ein Datum
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div class="flex items-center justify-between gap-3">
              <p class="text-xs text-sky-800">
                3. Uebernimm nur die Eintraege, die du geprueft hast. Routinen beeinflussen danach direkt das Auto-Planen.
              </p>
              <button
                class="rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-sky-700 disabled:opacity-50"
                :disabled="isApplyingImport"
                @click="applyImportEntries"
              >
                {{ isApplyingImport ? 'Uebernehme...' : 'Import-Eintraege uebernehmen' }}
              </button>
            </div>

            <div v-if="importFeedback" class="rounded-lg border border-sky-200 bg-white px-3 py-2 text-xs text-sky-800">
              {{ importFeedback }}
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
