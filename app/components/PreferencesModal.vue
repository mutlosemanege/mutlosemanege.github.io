<script setup lang="ts">
import { v4 as uuidv4 } from 'uuid'
import type { CalendarEvent } from '~/composables/useCalendar'
import type { DeepWorkWindow, RoutineTemplate, RoutineRepeatMode, PlanningStyle, GermanHolidayRegion } from '~/types/task'
import { getGermanHolidayRegionOptions } from '~/utils/germanHolidays'

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
const { createEvent, fetchEvents, syncStatus, canRetryLastAction, isRetryingLastAction, retryLastAction, findPotentialDuplicates } = useCalendar()

const dayNames = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
const dayNamesShort = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']

// Lokale Kopie für das Formular
const form = reactive({
  planningStyle: 'normal' as PlanningStyle,
  respectPublicHolidays: true,
  publicHolidayRegion: 'DE' as GermanHolidayRegion,
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
  { value: 'entspannt', label: 'Entspannt', description: 'Plant später und mit mehr Luft.' },
  { value: 'normal', label: 'Normal', description: 'Ausgewogener Standardstil.' },
  { value: 'aggressiv', label: 'Aggressiv', description: 'Nimmt frühe Slots schneller mit.' },
  { value: 'deadline-first', label: 'Deadline-first', description: 'Zieht Aufgaben eher früh vor.' },
  { value: 'focus-first', label: 'Fokus-first', description: 'Bevorzugt starke Fokuszeiten.' },
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
const holidayRegionOptions = getGermanHolidayRegionOptions()
const importImagePreview = ref<string | null>(null)
const importImageName = ref<string | null>(null)
const importFeedback = ref<string | null>(null)
const isApplyingImport = ref(false)
const importReviewEntries = ref<ImportReviewEntry[]>([])

watch(() => props.show, (val) => {
  if (!val) return
  const p = preferences.value
  form.planningStyle = p.planningStyle
  form.respectPublicHolidays = p.respectPublicHolidays
  form.publicHolidayRegion = p.publicHolidayRegion
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
    importFeedback.value = 'Bild geladen. Prüfe jetzt die Einträge darunter und übernimm nur, was wirklich passt.'
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

            const createdFromWork = await createBlockedEvent('Arbeitsweg', commuteStart, commuteEnd, 'Rückweg von der Arbeit', tz)
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
    routineFeedback.value = `${createdEvents.length} Routinen wurden eingetragen.${skippedEvents > 0 ? ` ${skippedEvents} vorhandene Termine wurden übersprungen.` : ''}`
  } catch (error: any) {
    routineFeedback.value = error.message || 'Routinen konnten nicht eingetragen werden.'
  } finally {
    isApplyingRoutines.value = false
  }
}

async function applyImportEntries() {
  const selectedEntries = importReviewEntries.value.filter(entry => entry.enabled && entry.title.trim() && entry.startHour < entry.endHour)
  if (selectedEntries.length === 0) {
    importFeedback.value = 'Füge zuerst mindestens einen gültigen Import-Eintrag hinzu.'
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

    importFeedback.value = `${savedRoutines} Routinen gespeichert, ${createdEvents} feste Termine eingetragen.${skippedDuplicates > 0 ? ` ${skippedDuplicates} ähnliche Einträge wurden übersprungen.` : ''}`
  } catch (error: any) {
    importFeedback.value = error.message || 'Import-Einträge konnten nicht übernommen werden.'
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
    return hasMatchingRoutineTemplate(entry) ? 'Ähnliche Routine bereits vorhanden' : null
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
    ? 'Ähnlicher Termin bereits im Kalender'
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
    respectPublicHolidays: form.respectPublicHolidays,
    publicHolidayRegion: form.publicHolidayRegion,
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

async function handleRetryCalendarAction() {
  await retryLastAction()
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="show" class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
        <!-- Backdrop -->
        <div class="absolute inset-0" @click="emit('close')" />

        <!-- Modal -->
        <div class="glass-card-elevated relative w-full max-h-[100dvh] overflow-y-auto rounded-t-glass-xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-5 sm:max-h-[92vh] sm:max-w-5xl sm:rounded-glass-lg sm:p-6 sm:pb-6">
          <div class="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border-subtle bg-surface/88 pb-5 pt-3 backdrop-blur-glass sm:bg-transparent sm:pt-0">
            <div class="absolute left-1/2 top-2 h-1.5 w-14 -translate-x-1/2 rounded-full bg-white/12 sm:hidden" />
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.24em] text-accent-purple-soft">Planung und Routinen</p>
              <h2 class="mt-2 text-2xl font-semibold text-text-primary">Deine Planungsregeln</h2>
              <p class="mt-2 text-sm leading-6 text-text-secondary">
                Lege hier fest, wann du normalerweise arbeitest und welche Routinen du als Vorlagen schnell in den Kalender übernehmen willst.
              </p>
            </div>
            <button type="button" class="btn-secondary inline-flex h-10 w-10 items-center justify-center" @click="emit('close')">
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div class="rounded-glass border border-accent-blue/20 bg-accent-blue/10 px-4 py-3 text-xs text-accent-blue">
            Routinen werden jetzt auch direkt bei der Planung respektiert. Schlaf, Arbeitswege und gespeicherte Routinen blockieren passende Zeiten schon im Scheduler, auch wenn du sie nicht jedes Mal manuell in den Kalender einträgst.
          </div>

          <div class="rounded-glass border border-priority-high/20 bg-priority-high/10 px-4 py-3 text-xs text-priority-high">
            Harte Blocker: Schlaf, Arbeitsweg, Routinen und bestehende Kalendereinträge.
            Weiche Blocker: Mittagspause und Puffer. Wenn es eng wird, zeigt die Planung dafür flexible Alternativen an.
          </div>

          <div
            v-if="syncStatus"
            class="rounded-glass border px-4 py-3 text-xs"
            :class="syncStatus.state === 'error'
              ? 'border-priority-critical/30 bg-priority-critical/10 text-[#FFD3DC]'
              : syncStatus.state === 'success'
                ? 'border-accent-green/30 bg-accent-green/10 text-accent-green'
                : 'border-border-subtle bg-white/[0.04] text-text-secondary'"
          >
            <div class="flex items-center justify-between gap-3">
              <span>Kalenderstatus: {{ syncStatus.message }}</span>
              <button
                v-if="syncStatus.state === 'error' && canRetryLastAction"
                type="button"
                class="rounded-full border border-priority-critical/30 bg-priority-critical/10 px-3 py-1 text-xs font-medium text-[#FFD3DC] transition hover:bg-priority-critical/15 disabled:opacity-60"
                :disabled="isRetryingLastAction"
                @click="handleRetryCalendarAction"
              >
                {{ isRetryingLastAction ? 'Versuche erneut...' : 'Erneut versuchen' }}
              </button>
            </div>
          </div>

          <div class="glass-card p-4">
            <h3 class="text-sm font-medium text-text-primary">Planungsstil</h3>
            <p class="mt-1 text-xs text-text-secondary">
              Beeinflusst, welche freien Slots der Planer bevorzugt und wie stark er deine gelernten Tageszeiten nutzt.
            </p>
            <div class="mt-3 grid gap-2">
              <label
                v-for="option in planningStyleOptions"
                :key="option.value"
                class="flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition-colors"
                :class="form.planningStyle === option.value
                  ? 'border-accent-purple/30 bg-accent-purple/12'
                  : 'border-border-subtle bg-white/[0.04] hover:border-border-strong hover:bg-white/[0.06]'"
              >
                <input
                  v-model="form.planningStyle"
                  type="radio"
                  class="mt-1 border-border-subtle bg-transparent text-accent-purple focus:ring-accent-purple"
                  :value="option.value"
                >
                <div>
                  <div class="text-sm font-medium text-text-primary">{{ option.label }}</div>
                  <div class="mt-1 text-xs text-text-secondary">{{ option.description }}</div>
                </div>
              </label>
            </div>
          </div>

          <div class="glass-card border border-accent-green/20 p-4">
            <h3 class="text-sm font-medium text-accent-green">Gelernt aus deinem Verhalten</h3>
            <p class="mt-1 text-xs text-text-secondary">
              Die App merkt sich lokal, wann Aufgaben eher geschafft oder verschoben werden, und nutzt das für bessere Slot-Vorschläge.
            </p>
            <div class="mt-3 grid grid-cols-3 gap-2 text-center">
              <div class="rounded-glass border border-border-subtle bg-white/[0.05] px-3 py-2">
                <div class="text-lg font-semibold text-text-primary">{{ behaviorSummary.completions }}</div>
                <div class="text-[11px] text-text-muted">Erledigt</div>
              </div>
              <div class="rounded-glass border border-border-subtle bg-white/[0.05] px-3 py-2">
                <div class="text-lg font-semibold text-text-primary">{{ behaviorSummary.missed }}</div>
                <div class="text-[11px] text-text-muted">Nicht geschafft</div>
              </div>
              <div class="rounded-glass border border-border-subtle bg-white/[0.05] px-3 py-2">
                <div class="text-lg font-semibold text-text-primary">{{ behaviorSummary.rescheduled }}</div>
                <div class="text-[11px] text-text-muted">Neu geplant</div>
              </div>
            </div>
            <div class="mt-3">
              <div class="text-xs font-medium text-accent-green">Bevorzugte Zeiten</div>
              <div class="mt-2 flex flex-wrap gap-2">
                <span
                  v-for="label in behaviorSummary.topHours"
                  :key="label"
                  class="rounded-full border border-accent-green/20 bg-accent-green/10 px-2 py-0.5 text-[11px] text-accent-green"
                >
                  {{ label }}
                </span>
                <span v-if="behaviorSummary.topHours.length === 0" class="text-xs text-text-secondary">
                  Noch nicht genug Daten gesammelt.
                </span>
              </div>
            </div>
          </div>

          <!-- Arbeitszeiten -->
          <div>
            <h3 class="mb-2 text-sm font-medium text-text-primary">Arbeitszeiten</h3>
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label class="mb-1 block text-xs text-text-muted">Start</label>
                <select
                  v-model.number="form.workStartHour"
                  class="input-dark w-full px-3 py-2 text-sm"
                >
                  <option v-for="h in 24" :key="h - 1" :value="h - 1">
                    {{ String(h - 1).padStart(2, '0') }}:00
                  </option>
                </select>
              </div>
              <div>
                <label class="mb-1 block text-xs text-text-muted">Ende</label>
                <select
                  v-model.number="form.workEndHour"
                  class="input-dark w-full px-3 py-2 text-sm"
                >
                  <option v-for="h in 24" :key="h" :value="h">
                    {{ String(h).padStart(2, '0') }}:00
                  </option>
                </select>
              </div>
            </div>
          </div>

          <div>
            <h3 class="mb-2 text-sm font-medium text-text-primary">Persönliche Terminzeit</h3>
            <p class="mb-3 text-xs text-text-secondary">
              Diese Zeiten nutzt der Planungs-Chat für Treffen, private Termine und soziale Verabredungen statt deiner reinen Arbeitszeit.
            </p>
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label class="mb-1 block text-xs text-text-muted">Start</label>
                <select
                  v-model.number="form.personalStartHour"
                  class="input-dark w-full px-3 py-2 text-sm"
                >
                  <option v-for="h in 24" :key="`personal-start-${h - 1}`" :value="h - 1">
                    {{ String(h - 1).padStart(2, '0') }}:00
                  </option>
                </select>
              </div>
              <div>
                <label class="mb-1 block text-xs text-text-muted">Ende</label>
                <select
                  v-model.number="form.personalEndHour"
                  class="input-dark w-full px-3 py-2 text-sm"
                >
                  <option v-for="h in 24" :key="`personal-end-${h}`" :value="h">
                    {{ String(h).padStart(2, '0') }}:00
                  </option>
                </select>
              </div>
            </div>
            <div class="mt-3">
              <label class="mb-2 block text-xs text-text-muted">Tage für persönliche Termine</label>
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="day in 7"
                  :key="`personal-day-${day}`"
                  :class="[
                    'h-10 w-10 rounded-glass border text-xs font-medium transition-colors',
                    form.personalDays.includes(day % 7)
                      ? 'border-accent-green/25 bg-accent-green/15 text-accent-green'
                      : 'border-border-subtle bg-white/[0.04] text-text-secondary hover:border-border-strong hover:bg-white/[0.06]'
                  ]"
                  @click="togglePersonalDay(day % 7)"
                >
                  {{ dayNamesShort[day % 7] }}
                </button>
              </div>
            </div>
          </div>

          <div>
            <h3 class="mb-2 text-sm font-medium text-text-primary">Schlafzeiten</h3>
            <label class="mb-3 flex items-center gap-2 text-sm text-text-secondary">
              <input
                v-model="form.syncSleepSchedule"
                type="checkbox"
                class="rounded border-border-subtle bg-transparent text-accent-purple focus:ring-accent-purple"
              >
              Schlafzeiten beim Eintragen als blockierende Termine anlegen
            </label>
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label class="mb-1 block text-xs text-text-muted">Schlafen ab</label>
                <select
                  v-model.number="form.sleepStartHour"
                  class="input-dark w-full px-3 py-2 text-sm"
                >
                  <option v-for="h in 24" :key="`sleep-start-${h - 1}`" :value="h - 1">
                    {{ String(h - 1).padStart(2, '0') }}:00
                  </option>
                </select>
              </div>
              <div>
                <label class="mb-1 block text-xs text-text-muted">Aufstehen</label>
                <select
                  v-model.number="form.sleepEndHour"
                  class="input-dark w-full px-3 py-2 text-sm"
                >
                  <option v-for="h in 24" :key="`sleep-end-${h - 1}`" :value="h - 1">
                    {{ String(h - 1).padStart(2, '0') }}:00
                  </option>
                </select>
              </div>
            </div>
            <p class="mt-2 text-xs text-text-secondary">
              Wenn aktiv, werden Schlafzeiten beim Planen respektiert und können zusätzlich als Kalenderblöcke für die nächsten 4 Wochen eingetragen werden.
            </p>
          </div>

          <!-- Mittagspause -->
          <div>
            <h3 class="mb-2 text-sm font-medium text-text-primary">Mittagspause</h3>
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label class="mb-1 block text-xs text-text-muted">Von</label>
                <select
                  v-model.number="form.lunchStartHour"
                  class="input-dark w-full px-3 py-2 text-sm"
                >
                  <option v-for="h in 24" :key="h - 1" :value="h - 1">
                    {{ String(h - 1).padStart(2, '0') }}:00
                  </option>
                </select>
              </div>
              <div>
                <label class="mb-1 block text-xs text-text-muted">Bis</label>
                <select
                  v-model.number="form.lunchEndHour"
                  class="input-dark w-full px-3 py-2 text-sm"
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
            <h3 class="mb-2 text-sm font-medium text-text-primary">Arbeitstage</h3>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="day in 7"
                :key="day"
                :class="[
                  'h-10 w-10 rounded-glass border text-xs font-medium transition-colors',
                  form.workDays.includes(day % 7)
                    ? 'border-accent-purple/25 bg-accent-purple/15 text-accent-purple-soft'
                    : 'border-border-subtle bg-white/[0.04] text-text-secondary hover:border-border-strong hover:bg-white/[0.06]'
                ]"
                @click="toggleWorkDay(day % 7)"
              >
                {{ dayNamesShort[day % 7] }}
              </button>
            </div>
          </div>

          <div class="glass-card border border-accent-blue/20 p-4">
            <h3 class="text-sm font-medium text-accent-blue">Feiertage</h3>
            <p class="mt-1 text-xs text-text-secondary">
              Gesetzliche Feiertage können je nach Region automatisch als blockierende Planungstage berücksichtigt werden.
              Gemeinde-spezifische Ausnahmen sind dabei bewusst nicht enthalten.
            </p>
            <label class="mt-3 flex items-center gap-2 text-sm text-text-secondary">
              <input
                v-model="form.respectPublicHolidays"
                type="checkbox"
                class="rounded border-border-subtle bg-transparent text-accent-purple focus:ring-accent-purple"
              >
              Feiertage bei der Planung respektieren
            </label>
            <div class="mt-3">
              <label class="mb-1 block text-xs text-text-muted">Region</label>
              <select
                v-model="form.publicHolidayRegion"
                class="input-dark w-full px-3 py-2 text-sm"
                :disabled="!form.respectPublicHolidays"
              >
                <option
                  v-for="option in holidayRegionOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </div>
          </div>

          <!-- Deep Work Fenster -->
          <div>
            <h3 class="mb-2 text-sm font-medium text-text-primary">Deep-Work-Zeiten</h3>
            <p class="mb-3 text-xs text-text-secondary">
              Geschützte Fokuszeiten, in denen nur Deep-Work-Aufgaben eingeplant werden.
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
                    class="rounded border-border-subtle bg-transparent text-accent-purple focus:ring-accent-purple"
                    @change="toggleDeepWork(day)"
                  >
                  <span class="text-sm text-text-primary">{{ dayNames[day] }}</span>
                </label>
                <template v-if="getDeepWorkForDay(day)">
                  <select
                    :value="getDeepWorkForDay(day)!.startHour"
                    class="input-dark min-w-0 px-2 py-1 text-sm"
                    @change="updateDeepWorkHour(day, 'startHour', Number(($event.target as HTMLSelectElement).value))"
                  >
                    <option v-for="h in 24" :key="h - 1" :value="h - 1">
                      {{ String(h - 1).padStart(2, '0') }}:00
                    </option>
                  </select>
                  <span class="text-text-muted">-</span>
                  <select
                    :value="getDeepWorkForDay(day)!.endHour"
                    class="input-dark min-w-0 px-2 py-1 text-sm"
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
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label class="mb-1 block text-sm font-medium text-text-primary">Min. Deep-Work-Block</label>
              <select
                v-model.number="form.minDeepWorkBlockMinutes"
                class="input-dark w-full px-3 py-2 text-sm"
              >
                <option :value="30">30 Min.</option>
                <option :value="60">60 Min.</option>
                <option :value="90">90 Min.</option>
                <option :value="120">120 Min.</option>
              </select>
            </div>
            <div>
              <label class="mb-1 block text-sm font-medium text-text-primary">Puffer zwischen Aufgaben</label>
              <select
                v-model.number="form.taskBufferMinutes"
                class="input-dark w-full px-3 py-2 text-sm"
              >
                <option :value="0">Kein Puffer</option>
                <option :value="10">10 Min.</option>
                <option :value="15">15 Min.</option>
                <option :value="20">20 Min.</option>
                <option :value="30">30 Min.</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label class="mb-1 block text-sm font-medium text-text-primary">Deadline-Warnung</label>
              <select
                v-model.number="form.deadlineWarningDays"
                class="input-dark w-full px-3 py-2 text-sm"
              >
                <option :value="1">1 Tag vorher</option>
                <option :value="2">2 Tage vorher</option>
                <option :value="3">3 Tage vorher</option>
                <option :value="5">5 Tage vorher</option>
                <option :value="7">7 Tage vorher</option>
              </select>
            </div>
            <div>
              <label class="mb-1 block text-sm font-medium text-text-primary">Weg zur Arbeit</label>
              <select
                v-model.number="form.commuteToWorkMinutes"
                class="input-dark w-full px-3 py-2 text-sm"
              >
                <option :value="0">Kein Hinweg</option>
                <option :value="15">15 Min.</option>
                <option :value="30">30 Min.</option>
                <option :value="45">45 Min.</option>
                <option :value="60">60 Min.</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label class="mb-1 block text-sm font-medium text-text-primary">Rückweg von der Arbeit</label>
              <select
                v-model.number="form.commuteFromWorkMinutes"
                class="input-dark w-full px-3 py-2 text-sm"
              >
                <option :value="0">Kein Rückweg</option>
                <option :value="15">15 Min.</option>
                <option :value="30">30 Min.</option>
                <option :value="45">45 Min.</option>
                <option :value="60">60 Min.</option>
              </select>
            </div>
            <label class="rounded-glass border border-border-subtle bg-white/[0.04] px-3 py-2 text-xs text-text-secondary">
              <span class="flex items-center gap-2">
                <input
                  v-model="form.syncCommuteSchedule"
                  type="checkbox"
                  class="rounded border-border-subtle bg-transparent text-accent-purple focus:ring-accent-purple"
                >
                Arbeitswege beim Eintragen automatisch rund um deine Arbeitszeiten blocken
              </span>
            </label>
          </div>

          <div class="space-y-4 glass-card p-4">
            <div class="flex items-start justify-between gap-4">
              <div>
                <h3 class="text-sm font-medium text-text-primary">Feste Routinen</h3>
                <p class="mt-1 text-xs text-text-secondary">
                  Lege wiederkehrende Termine wie Uni, Gym oder Calls als Vorlagen an. Sie zählen sofort als Planungsregeln und können zusätzlich gesammelt in den Kalender eingetragen werden.
                </p>
              </div>
              <button
                class="btn-primary px-3 py-2 text-xs disabled:opacity-50"
                :disabled="isApplyingRoutines"
                @click="applyRoutineTemplates"
              >
                {{ isApplyingRoutines ? 'Trage ein...' : 'Nächste 4 Wochen eintragen' }}
              </button>
            </div>

            <div class="grid gap-2 md:grid-cols-2">
              <input
                v-model="routineDraft.title"
                type="text"
                class="input-dark w-full px-3 py-2 text-sm"
                placeholder="z.B. Vorlesung, Gym, Team Call"
              >
              <select
                v-model="routineDraft.repeatMode"
                class="input-dark w-full px-3 py-2 text-sm"
              >
                <option value="weekly">Wöchentlich</option>
                <option value="workdays">An Arbeitstagen</option>
              </select>
              <select
                v-if="routineDraft.repeatMode === 'weekly'"
                v-model.number="routineDraft.day"
                class="input-dark w-full px-3 py-2 text-sm"
              >
                <option v-for="(name, index) in dayNames" :key="name" :value="index">
                  {{ name }}
                </option>
              </select>
              <div
                v-else
                class="flex items-center rounded-glass border border-dashed border-border-strong px-3 py-2 text-sm text-text-secondary"
              >
                Gilt an deinen aktiven Arbeitstagen
              </div>
              <select
                v-model.number="routineDraft.startHour"
                class="input-dark w-full px-3 py-2 text-sm"
              >
                <option v-for="h in 24" :key="`start-${h}`" :value="h - 1">
                  Start {{ String(h - 1).padStart(2, '0') }}:00
                </option>
              </select>
              <select
                v-model.number="routineDraft.endHour"
                class="input-dark w-full px-3 py-2 text-sm"
              >
                <option v-for="h in 24" :key="`end-${h}`" :value="h">
                  Ende {{ String(h).padStart(2, '0') }}:00
                </option>
              </select>
            </div>

            <textarea
              v-model="routineDraft.description"
              rows="2"
              class="input-dark w-full px-3 py-2 text-sm"
              placeholder="Optionaler Hinweis, z.B. Raum, Link oder was du mitbringen musst"
            />

            <button
              class="btn-secondary px-3 py-2 text-sm"
              @click="addRoutine"
            >
              Routine hinzufügen
            </button>

            <div v-if="form.routineTemplates.length > 0" class="space-y-2">
              <div
                v-for="routine in form.routineTemplates"
                :key="routine.id"
                class="rounded-glass border border-border-subtle bg-white/[0.04] p-3"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0 flex-1">
                    <div class="text-sm font-medium text-text-primary">{{ routine.title }}</div>
                    <div class="mt-1 text-xs text-text-secondary">
                      {{ routineRepeatLabel(routine) }}
                    </div>
                    <div v-if="upcomingRoutineLabels(routine).length > 0" class="mt-1 flex flex-wrap gap-1">
                      <span
                        v-for="label in upcomingRoutineLabels(routine)"
                        :key="`${routine.id}-${label}`"
                        class="rounded-full border border-border-subtle bg-white/[0.04] px-2 py-0.5 text-[11px] text-text-secondary"
                      >
                        {{ label }}
                      </span>
                    </div>
                    <div v-if="routine.description" class="mt-1 text-xs text-text-muted">
                      {{ routine.description }}
                    </div>
                  </div>
                  <button
                    class="rounded-lg border border-priority-critical/20 bg-priority-critical/10 px-2 py-1 text-xs text-priority-critical transition hover:border-priority-critical/35 hover:bg-priority-critical/15"
                    @click="form.routineTemplates = form.routineTemplates.filter(entry => entry.id !== routine.id)"
                  >
                    Entfernen
                  </button>
                </div>
                <div class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <select
                    :value="routine.repeatMode || 'weekly'"
                    class="input-dark w-full px-3 py-2 text-sm"
                    @change="updateRoutineRepeatMode(routine.id, ($event.target as HTMLSelectElement).value as RoutineRepeatMode)"
                  >
                    <option value="weekly">Wöchentlich</option>
                    <option value="workdays">An Arbeitstagen</option>
                  </select>
                  <template v-if="(routine.repeatMode || 'weekly') === 'weekly'">
                    <select
                      :value="routine.day"
                      class="input-dark w-full px-3 py-2 text-sm"
                      @change="updateRoutineDay(routine.id, Number(($event.target as HTMLSelectElement).value))"
                    >
                      <option v-for="(name, index) in dayNames" :key="`${routine.id}-day-${name}`" :value="index">
                        {{ name }}
                      </option>
                    </select>
                  </template>
                  <div
                    v-else
                    class="flex items-center rounded-glass border border-dashed border-border-strong px-3 py-2 text-sm text-text-secondary"
                  >
                    Aktiv an Arbeitstagen
                  </div>
                </div>
                <div class="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <select
                    :value="routine.startHour"
                    class="input-dark w-full px-3 py-2 text-sm"
                    @change="updateRoutineHour(routine.id, 'startHour', Number(($event.target as HTMLSelectElement).value))"
                  >
                    <option v-for="h in 24" :key="`${routine.id}-start-${h}`" :value="h - 1">
                      Start {{ String(h - 1).padStart(2, '0') }}:00
                    </option>
                  </select>
                  <select
                    :value="routine.endHour"
                    class="input-dark w-full px-3 py-2 text-sm"
                    @change="updateRoutineHour(routine.id, 'endHour', Number(($event.target as HTMLSelectElement).value))"
                  >
                    <option v-for="h in 24" :key="`${routine.id}-end-${h}`" :value="h">
                      Ende {{ String(h).padStart(2, '0') }}:00
                    </option>
                  </select>
                </div>
                <div class="mt-3 rounded-glass border border-border-subtle bg-white/[0.04] p-3">
                  <div class="text-xs font-medium text-text-primary">Ausnahmen</div>
                  <p class="mt-1 text-xs text-text-secondary">
                    Einzelne Tage, an denen diese Routine die Planung nicht blockieren soll.
                  </p>
                  <div class="mt-2 flex gap-2">
                    <input
                      v-model="routineExceptionDrafts[routine.id]"
                      type="date"
                      class="input-dark flex-1 px-3 py-2 text-sm"
                    >
                    <button
                      class="btn-secondary px-3 py-2 text-sm"
                      @click="addRoutineException(routine.id)"
                    >
                      Ausnahme hinzufügen
                    </button>
                  </div>
                  <div v-if="(routine.skipDates || []).length > 0" class="mt-2 flex flex-wrap gap-2">
                    <button
                      v-for="skipDate in routine.skipDates"
                      :key="`${routine.id}-${skipDate}`"
                      class="rounded-full border border-border-subtle bg-white/[0.04] px-2 py-0.5 text-[11px] text-text-secondary transition hover:border-priority-critical/20 hover:bg-priority-critical/10 hover:text-priority-critical"
                      @click="removeRoutineException(routine.id, skipDate)"
                    >
                      {{ new Date(`${skipDate}T00:00:00`).toLocaleDateString('de-DE') }} entfernen
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="routineFeedback" class="rounded-glass border border-border-subtle bg-white/[0.04] px-3 py-2 text-xs text-text-secondary">
              {{ routineFeedback }}
            </div>
          </div>

          <div class="glass-card border border-accent-blue/20 p-4">
            <div class="flex items-start justify-between gap-4">
              <div>
                <h3 class="text-sm font-medium text-accent-blue">Bild-Import vorbereiten</h3>
                <p class="mt-1 text-xs text-text-secondary">
                  Lade einen Stundenplan oder Screenshot hoch und übernimm daraus feste Termine oder Routinen nach einer manuellen Review.
                </p>
              </div>
            </div>

            <div class="rounded-glass border border-accent-blue/20 bg-accent-blue/10 p-4">
              <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div class="text-sm font-medium text-text-primary">1. Bild hochladen</div>
                  <div class="mt-1 text-xs text-text-secondary">
                    Das Bild dient hier bewusst als Referenz. Die App importiert noch nichts automatisch ohne deine Prüfung.
                  </div>
                </div>
                <label class="btn-secondary inline-flex cursor-pointer items-center justify-center px-3 py-2 text-sm">
                  Bild auswählen
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
                  <div class="text-xs text-text-secondary">
                    Geladen: <span class="font-medium text-text-primary">{{ importImageName }}</span>
                  </div>
                  <button
                    class="rounded-lg border border-priority-critical/20 bg-priority-critical/10 px-2 py-1 text-xs text-priority-critical transition hover:border-priority-critical/35 hover:bg-priority-critical/15"
                    @click="clearImportImage"
                  >
                    Bild entfernen
                  </button>
                </div>
                <img
                  :src="importImagePreview"
                  alt="Import-Vorschau"
                  class="max-h-72 w-full rounded-xl border border-accent-blue/15 object-contain"
                >
              </div>
            </div>

            <div class="rounded-glass border border-accent-blue/20 bg-accent-blue/10 p-4">
              <div class="flex items-start justify-between gap-4">
                <div>
                  <div class="text-sm font-medium text-text-primary">2. Einträge reviewen</div>
                  <div class="mt-1 text-xs text-text-secondary">
                    Lege darunter die Einträge an, die du aus dem Bild übernehmen willst. Alles bleibt vor dem Übernehmen editierbar.
                  </div>
                </div>
                <button
                  class="btn-secondary px-3 py-2 text-sm"
                  @click="addImportReviewEntry"
                >
                  Eintrag hinzufügen
                </button>
              </div>

              <div v-if="importReviewEntries.length === 0" class="mt-3 rounded-glass border border-dashed border-border-strong bg-white/[0.03] px-4 py-5 text-center text-xs text-text-secondary">
                Noch keine Import-Einträge angelegt. Lade ein Bild hoch oder füge den ersten Eintrag manuell hinzu.
              </div>

              <div v-else class="mt-4 space-y-3">
                <div
                  v-for="entry in importReviewEntries"
                  :key="entry.id"
                  class="rounded-glass border border-border-subtle bg-white/[0.04] p-3"
                >
                  <div class="flex items-start justify-between gap-3">
                    <label class="flex items-center gap-2 text-xs font-medium text-text-primary">
                      <input v-model="entry.enabled" type="checkbox" class="rounded border-border-subtle bg-transparent text-accent-purple focus:ring-accent-purple">
                      Übernehmen
                    </label>
                    <button
                      class="rounded-lg border border-priority-critical/20 bg-priority-critical/10 px-2 py-1 text-xs text-priority-critical transition hover:border-priority-critical/35 hover:bg-priority-critical/15"
                      @click="removeImportReviewEntry(entry.id)"
                    >
                      Entfernen
                    </button>
                  </div>

                  <div class="mt-3 grid gap-2 md:grid-cols-2">
                    <input
                      v-model="entry.title"
                      type="text"
                      class="input-dark w-full px-3 py-2 text-sm"
                      placeholder="Titel aus dem Bild, z.B. Mathe, Team Call"
                    >
                    <select
                      v-model="entry.type"
                      class="input-dark w-full px-3 py-2 text-sm"
                    >
                      <option value="routine">Als Routine</option>
                      <option value="fixed-event">Als fester Termin</option>
                    </select>
                    <template v-if="entry.type === 'routine'">
                      <select
                        v-model="entry.repeatMode"
                        class="input-dark w-full px-3 py-2 text-sm"
                      >
                        <option value="weekly">Wöchentlich</option>
                        <option value="workdays">An Arbeitstagen</option>
                      </select>
                      <select
                        v-if="entry.repeatMode === 'weekly'"
                        v-model.number="entry.day"
                        class="input-dark w-full px-3 py-2 text-sm"
                      >
                        <option v-for="(name, index) in dayNames" :key="`${entry.id}-import-${name}`" :value="index">
                          {{ name }}
                        </option>
                      </select>
                      <div
                        v-else
                        class="flex items-center rounded-glass border border-dashed border-border-strong px-3 py-2 text-sm text-text-secondary"
                      >
                        Gilt an deinen aktiven Arbeitstagen
                      </div>
                    </template>
                    <input
                      v-else
                      v-model="entry.date"
                      type="date"
                      class="input-dark w-full px-3 py-2 text-sm"
                    >
                    <label
                      v-if="entry.type === 'routine'"
                      class="flex items-center gap-2 rounded-glass border border-border-subtle bg-white/[0.04] px-3 py-2 text-xs text-text-secondary"
                    >
                      <input
                        v-model="entry.alsoAddToCalendar"
                        type="checkbox"
                        class="rounded border-border-subtle bg-transparent text-accent-purple focus:ring-accent-purple"
                      >
                      Zusätzlich in den Kalender eintragen
                    </label>
                    <div v-else class="rounded-glass border border-border-subtle bg-white/[0.03] px-3 py-2 text-xs text-text-secondary">
                      Feste Termine werden direkt in den Kalender eingetragen.
                    </div>
                    <select
                      v-model.number="entry.startHour"
                      class="input-dark w-full px-3 py-2 text-sm"
                    >
                      <option v-for="h in 24" :key="`${entry.id}-import-start-${h}`" :value="h - 1">
                        Start {{ String(h - 1).padStart(2, '0') }}:00
                      </option>
                    </select>
                    <select
                      v-model.number="entry.endHour"
                      class="input-dark w-full px-3 py-2 text-sm"
                    >
                      <option v-for="h in 24" :key="`${entry.id}-import-end-${h}`" :value="h">
                        Ende {{ String(h).padStart(2, '0') }}:00
                      </option>
                    </select>
                  </div>

                  <textarea
                    v-model="entry.description"
                    rows="2"
                    class="input-dark mt-2 w-full px-3 py-2 text-sm"
                    placeholder="Optionaler Hinweis, z.B. Raum, Link oder Notiz aus dem Bild"
                  />

                  <div class="mt-2 flex flex-wrap gap-2">
                    <span
                      class="rounded-full border border-border-subtle bg-white/[0.04] px-2 py-0.5 text-[11px]"
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
                      Für feste Termine fehlt noch ein Datum
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div class="flex items-center justify-between gap-3">
              <p class="text-xs text-text-secondary">
                3. Übernimm nur die Einträge, die du geprüft hast. Routinen beeinflussen danach direkt das Auto-Planen.
              </p>
              <button
                class="btn-primary px-3 py-2 text-sm disabled:opacity-50"
                :disabled="isApplyingImport"
                @click="applyImportEntries"
              >
                {{ isApplyingImport ? 'Übernehme...' : 'Import-Einträge übernehmen' }}
              </button>
            </div>

            <div v-if="importFeedback" class="rounded-glass border border-accent-blue/20 bg-accent-blue/10 px-3 py-2 text-xs text-accent-blue">
              {{ importFeedback }}
            </div>
          </div>

          <!-- Actions -->
          <div class="flex items-center justify-between border-t border-border-subtle pt-5">
            <button
              class="rounded-xl px-3 py-2 text-sm text-text-muted transition hover:bg-white/[0.05] hover:text-text-primary"
              @click="handleReset"
            >
              Zurücksetzen
            </button>
            <div class="flex gap-2">
              <button
                class="btn-secondary px-4 py-2 text-sm"
                @click="emit('close')"
              >
                Abbrechen
              </button>
              <button
                class="btn-primary px-4 py-2 text-sm"
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







