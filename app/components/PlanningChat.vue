<script setup lang="ts">
import { v4 as uuidv4 } from 'uuid'
import type { CalendarEvent } from '~/composables/useCalendar'
import type { RoutineTemplate, Task } from '~/types/task'
import { parsePlanningPrompt as parsePlanningPromptCore } from '~/utils/planningChatCore'

type PlanningIntent = 'event' | 'task' | 'routine'
type PreferredPeriod = 'morning' | 'afternoon' | 'evening' | 'any'
type SlotStrategy = 'time-and-period' | 'time-only' | 'period-only' | 'any'

interface PlanningTimePreference {
  startMinutes?: number
  endMinutes?: number
  exactStartMinutes?: number
  label: string
}

interface ParsedPlanningRequest {
  title: string
  durationMinutes: number
  dateFrom: Date
  dateTo: Date
  hasExplicitDate: boolean
  preferredPeriod: PreferredPeriod
  intent: PlanningIntent
  recurrenceDay?: number
  recurrenceLabel?: string
  timePreference?: PlanningTimePreference
}

interface SlotSuggestion {
  start: Date
  end: Date
  reason: string
}

interface SlotCandidate extends SlotSuggestion {
  score: number
  strategy: SlotStrategy
}

interface PreviewAlternative {
  key: string
  label: string
  reason: string
  start: Date
  end: Date
  isPrimary?: boolean
}

interface RoutinePreview {
  template: RoutineTemplate
  nextStart: Date
  nextEnd: Date
  roundedToHour: boolean
  reason: string
}

const props = defineProps<{
  show: boolean
  events: readonly CalendarEvent[]
}>()

const emit = defineEmits<{
  close: []
  created: []
}>()

const { preferences, updatePreferences } = usePreferences()
const { findFreeSlots } = useScheduler()
const { createEvent, error: calendarError, syncStatus, findPotentialDuplicates } = useCalendar()
const { createTask, updateTask } = useTasks()

const prompt = ref('')
const durationMinutes = ref(60)
const intentMode = ref<'auto' | PlanningIntent>('auto')
const isPlanning = ref(false)
const error = ref<string | null>(null)
const previewEvent = ref<Omit<CalendarEvent, 'id'> | null>(null)
const previewTask = ref<Omit<Task, 'id' | 'createdAt' | 'updatedAt'> | null>(null)
const previewRoutine = ref<RoutinePreview | null>(null)
const parsedDetails = ref<ParsedPlanningRequest | null>(null)
const previewTaskSlot = ref<{ start: Date; end: Date } | null>(null)
const previewReason = ref<string | null>(null)
const previewUncertainty = ref<string | null>(null)
const previewAlternatives = ref<PreviewAlternative[]>([])
const previewAvailabilityLabel = ref<string | null>(null)
const selectedPreviewSuggestionKey = ref<string | null>(null)
const examplePrompts = [
  'Treffen mit Bro morgen Abend',
  '2h Videoschnitt zwischen 14 und 17 Uhr',
  'jeden Mittwoch Gym 18 bis 20 Uhr',
]

const previewDuplicateWarnings = computed(() => {
  if (previewEvent.value?.start.dateTime && previewEvent.value?.end.dateTime) {
    return findPotentialDuplicates({
      summary: previewEvent.value.summary,
      start: new Date(previewEvent.value.start.dateTime),
      end: new Date(previewEvent.value.end.dateTime),
    }, props.events)
  }

  if (previewTask.value && previewTaskSlot.value) {
    return findPotentialDuplicates({
      summary: previewTask.value.title,
      start: previewTaskSlot.value.start,
      end: previewTaskSlot.value.end,
    }, props.events)
  }

  return []
})

const routineDuplicateWarnings = computed(() => {
  if (!previewRoutine.value) return []

  const warnings: Array<{ label: string; reason: string }> = []
  for (let weekOffset = 0; weekOffset < 4; weekOffset++) {
    const baseDate = nextDateForWeekday(previewRoutine.value.template.day, weekOffset, new Date())
    const start = new Date(baseDate)
    start.setHours(previewRoutine.value.template.startHour, 0, 0, 0)
    const end = new Date(baseDate)
    end.setHours(previewRoutine.value.template.endHour, 0, 0, 0)
    if (previewRoutine.value.template.endHour <= previewRoutine.value.template.startHour) {
      end.setDate(end.getDate() + 1)
    }

    const duplicates = findPotentialDuplicates({
      summary: previewRoutine.value.template.title,
      start,
      end,
    }, props.events)

    if (duplicates.length > 0) {
      warnings.push({
        label: formatPreview(start.toISOString()),
        reason: duplicates[0].reason,
      })
    }
  }

  return warnings.slice(0, 3)
})

watch(() => props.show, (show) => {
  if (!show) return
  prompt.value = ''
  durationMinutes.value = 60
  intentMode.value = 'auto'
  isPlanning.value = false
  error.value = null
  previewEvent.value = null
  previewTask.value = null
  previewRoutine.value = null
  parsedDetails.value = null
  previewTaskSlot.value = null
  previewReason.value = null
  previewUncertainty.value = null
  previewAlternatives.value = []
  previewAvailabilityLabel.value = null
  selectedPreviewSuggestionKey.value = null
})

async function handlePlan() {
  if (!prompt.value.trim()) return

  isPlanning.value = true
  error.value = null
  previewEvent.value = null
  previewTask.value = null
  previewRoutine.value = null
  previewTaskSlot.value = null
  previewReason.value = null
  previewUncertainty.value = null
  previewAlternatives.value = []
  previewAvailabilityLabel.value = null
  selectedPreviewSuggestionKey.value = null

  try {
    const parsed = parsePlanningPromptCore(prompt.value.trim(), durationMinutes.value, intentMode.value)
    parsedDetails.value = parsed

    if (parsed.intent === 'routine') {
      const routine = buildRoutinePreview(parsed)
      previewRoutine.value = routine
      previewReason.value = routine.reason
      previewUncertainty.value = buildPreviewUncertainty(parsed, true, routine.roundedToHour)
      return
    }

    const previewSuggestions = buildPreviewSuggestions(parsed)
    const suggestion = previewSuggestions[0] || null
    previewReason.value = suggestion?.reason || buildNoSlotReason(parsed)
    previewAlternatives.value = previewSuggestions
    previewUncertainty.value = buildPreviewUncertainty(parsed, Boolean(suggestion))
    previewAvailabilityLabel.value = suggestion ? availabilityLabelForSuggestion(suggestion.start, parsed.intent) : null
    selectedPreviewSuggestionKey.value = suggestion?.key || null

    if (parsed.intent === 'task') {
      previewTaskSlot.value = suggestion ? { start: suggestion.start, end: suggestion.end } : null
      previewTask.value = {
        title: parsed.title,
        description: `Erstellt aus Chat-Eingabe: "${prompt.value.trim()}"`,
        estimatedMinutes: parsed.durationMinutes,
        deadline: buildTaskDeadline(parsed),
        priority: inferTaskPriority(prompt.value.trim()),
        aiSuggestedPriority: undefined,
        priorityReason: suggestion
          ? 'Erstellt aus Planungs-Chat und direkt terminiert'
          : 'Erstellt aus Planungs-Chat ohne direkten Slot',
        prioritySource: 'manual',
        status: suggestion ? 'scheduled' : 'todo',
        projectId: undefined,
        dependencies: [],
        scheduleBlocks: suggestion
          ? [{ start: suggestion.start.toISOString(), end: suggestion.end.toISOString() }]
          : undefined,
        scheduledStart: suggestion?.start.toISOString(),
        scheduledEnd: suggestion?.end.toISOString(),
        calendarEventId: undefined,
        isDeepWork: parsed.durationMinutes >= preferences.value.minDeepWorkBlockMinutes,
      }
      return
    }

    if (!suggestion) {
      error.value = buildNoSlotReason(parsed)
      return
    }

    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    previewEvent.value = {
      summary: parsed.title,
      description: `Geplant aus Chat-Eingabe: "${prompt.value.trim()}"`,
      start: {
        dateTime: suggestion.start.toISOString(),
        timeZone: tz,
      },
      end: {
        dateTime: suggestion.end.toISOString(),
        timeZone: tz,
      },
    }
  } catch (err: any) {
    error.value = err.message || 'Planung fehlgeschlagen.'
  } finally {
    isPlanning.value = false
  }
}

async function handleCreate() {
  if (!previewEvent.value) return

  isPlanning.value = true
  error.value = null

  try {
    if (previewDuplicateWarnings.value.some(entry => entry.kind === 'exact-match')) {
      throw new Error('Ein sehr ähnlicher Termin ist bereits im Kalender vorhanden.')
    }

    const created = await createEvent(previewEvent.value)
    if (!created?.id) {
      throw new Error(calendarError.value || 'Termin konnte nicht erstellt werden.')
    }

    emit('created')
    emit('close')
  } catch (err: any) {
    error.value = err.message || calendarError.value || 'Termin konnte nicht erstellt werden.'
  } finally {
    isPlanning.value = false
  }
}

async function handleCreateTask() {
  if (!previewTask.value) return

  isPlanning.value = true
  error.value = null

  try {
    if (previewTaskSlot.value && previewDuplicateWarnings.value.some(entry => entry.kind === 'exact-match')) {
      throw new Error('Ein sehr ähnlicher Kalendereintrag für diese Aufgabe ist bereits vorhanden.')
    }

    const task = await createTask(previewTask.value)

    if (previewTaskSlot.value) {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
      const createdEvent = await createEvent({
        summary: task.title,
        description: `[KALENDER-AI-TASK:${task.id}]\n${task.description || ''}`,
        start: {
          dateTime: previewTaskSlot.value.start.toISOString(),
          timeZone: tz,
        },
        end: {
          dateTime: previewTaskSlot.value.end.toISOString(),
          timeZone: tz,
        },
        colorId: task.isDeepWork ? '3' : '9',
      })

      if (!createdEvent?.id) {
        throw new Error(calendarError.value || 'Aufgabe wurde erstellt, aber der Kalendereintrag konnte nicht angelegt werden.')
      }

      await updateTask(task.id, {
        status: 'scheduled',
        scheduleBlocks: [{
          start: previewTaskSlot.value.start.toISOString(),
          end: previewTaskSlot.value.end.toISOString(),
          calendarEventId: createdEvent.id,
        }],
        scheduledStart: previewTaskSlot.value.start.toISOString(),
        scheduledEnd: previewTaskSlot.value.end.toISOString(),
        calendarEventId: createdEvent.id,
      })
    }

    emit('created')
    emit('close')
  } catch (err: any) {
    error.value = err.message || calendarError.value || 'Aufgabe konnte nicht erstellt werden.'
  } finally {
    isPlanning.value = false
  }
}

async function handleCreateRoutine() {
  if (!previewRoutine.value) return

  isPlanning.value = true
  error.value = null

  try {
    const existingRoutine = preferences.value.routineTemplates.find(entry =>
      entry.title.trim().toLowerCase() === previewRoutine.value!.template.title.trim().toLowerCase() &&
      entry.day === previewRoutine.value!.template.day &&
      entry.startHour === previewRoutine.value!.template.startHour &&
      entry.endHour === previewRoutine.value!.template.endHour,
    )

    if (!existingRoutine) {
      updatePreferences({
        routineTemplates: [
          ...preferences.value.routineTemplates,
          previewRoutine.value.template,
        ],
      })
    }

    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    const transientEvents: Array<{ summary: string; start: Date; end: Date }> = []

    for (let weekOffset = 0; weekOffset < 4; weekOffset++) {
      const baseDate = nextDateForWeekday(previewRoutine.value.template.day, weekOffset, new Date())
      const start = new Date(baseDate)
      start.setHours(previewRoutine.value.template.startHour, 0, 0, 0)
      const end = new Date(baseDate)
      end.setHours(previewRoutine.value.template.endHour, 0, 0, 0)
      if (previewRoutine.value.template.endHour <= previewRoutine.value.template.startHour) {
        end.setDate(end.getDate() + 1)
      }

      if (hasMatchingExistingEvent(previewRoutine.value.template.title, start, end, transientEvents)) {
        continue
      }

      const created = await createEvent({
        summary: previewRoutine.value.template.title,
        description: previewRoutine.value.template.description || 'Aus Planungs-Chat als Routine angelegt',
        start: { dateTime: start.toISOString(), timeZone: tz },
        end: { dateTime: end.toISOString(), timeZone: tz },
      })

      if (created?.id) {
        transientEvents.push({
          summary: previewRoutine.value.template.title,
          start,
          end,
        })
      }
    }

    emit('created')
    emit('close')
  } catch (err: any) {
    error.value = err.message || calendarError.value || 'Routine konnte nicht erstellt werden.'
  } finally {
    isPlanning.value = false
  }
}

function parsePlanningPrompt(text: string, fallbackDuration: number): ParsedPlanningRequest {
  const normalized = normalizeText(text)
  const now = new Date()
  const dateFrom = new Date(now)
  const dateTo = new Date(now)
  dateTo.setDate(dateTo.getDate() + 7)

  const recurrence = extractRecurrence(normalized)
  const timePreference = extractTimePreference(normalized, fallbackDuration)
  const preferredPeriod = extractPreferredPeriod(normalized)
  const weekday = recurrence?.day ?? extractWeekday(normalized)
  let hasExplicitDate = false
  let rangeMode: 'exact-day' | 'next-week' | 'this-week' | 'weekend' | 'open' = 'open'

  if (normalized.includes('uebermorgen')) {
    hasExplicitDate = true
    rangeMode = 'exact-day'
    dateFrom.setDate(dateFrom.getDate() + 2)
    dateTo.setTime(dateFrom.getTime())
  } else if (normalized.includes('heute')) {
    hasExplicitDate = true
    rangeMode = 'exact-day'
    dateTo.setDate(dateFrom.getDate())
  } else if (normalized.includes('morgen')) {
    hasExplicitDate = true
    rangeMode = 'exact-day'
    dateFrom.setDate(dateFrom.getDate() + 1)
    dateTo.setTime(dateFrom.getTime())
  } else if (normalized.includes('naechste woche')) {
    hasExplicitDate = true
    rangeMode = 'next-week'
    const day = dateFrom.getDay()
    const daysUntilNextMonday = day === 0 ? 1 : 8 - day
    dateFrom.setDate(dateFrom.getDate() + daysUntilNextMonday)
    dateTo.setTime(dateFrom.getTime())
    dateTo.setDate(dateTo.getDate() + 6)
  } else if (normalized.includes('diese woche')) {
    hasExplicitDate = true
    rangeMode = 'this-week'
    dateTo.setDate(dateTo.getDate() + (7 - (dateFrom.getDay() || 7)))
  } else if (normalized.includes('wochenende')) {
    hasExplicitDate = true
    rangeMode = 'weekend'
    const day = dateFrom.getDay()
    const daysUntilSaturday = day <= 6 ? 6 - day : 6
    dateFrom.setDate(dateFrom.getDate() + daysUntilSaturday)
    dateTo.setTime(dateFrom.getTime())
    dateTo.setDate(dateTo.getDate() + 1)
  }

  if (weekday !== null) {
    const targetDate = rangeMode === 'next-week' || rangeMode === 'this-week' || rangeMode === 'weekend'
      ? findWeekdayInRange(dateFrom, dateTo, weekday)
      : nextDateForWeekday(weekday, 0, now)

    if (targetDate) {
      hasExplicitDate = true
      dateFrom.setTime(targetDate.getTime())
      dateTo.setTime(targetDate.getTime())
    }
  }

  const explicitDuration = extractDuration(text)
  const title = buildCleanTitle(text)
  const intent = detectIntent(text, recurrence)

  return {
    title: title || 'Neuer Eintrag',
    durationMinutes: explicitDuration ?? fallbackDuration,
    dateFrom,
    dateTo,
    hasExplicitDate,
    preferredPeriod,
    intent,
    recurrenceDay: recurrence?.day,
    recurrenceLabel: recurrence?.label,
    timePreference,
  }
}

function detectIntent(text: string, recurrence: { day: number; label: string } | null): PlanningIntent {
  if (intentMode.value === 'event') return 'event'
  if (intentMode.value === 'task') return 'task'
  if (intentMode.value === 'routine') return 'routine'

  const normalized = normalizeText(text)
  const taskHints = ['lernen', 'schnitt', 'schneiden', 'bearbeiten', 'vorbereiten', 'schreiben', 'bauen', 'erledigen', 'review', 'recherche', 'arbeiten']
  const eventHints = ['treffen', 'call', 'meeting', 'mittag', 'essen', 'arzt', 'termin', 'party', 'date', 'feier']

  if (recurrence) return 'routine'

  const taskMatches = taskHints.filter(hint => normalized.includes(hint)).length
  const eventMatches = eventHints.filter(hint => normalized.includes(hint)).length

  if (taskMatches === 0 && eventMatches === 0) {
    const explicitDuration = extractDuration(text)
    return explicitDuration && explicitDuration >= 90 ? 'task' : 'event'
  }

  return taskMatches > eventMatches ? 'task' : 'event'
}

function inferTaskPriority(text: string): Task['priority'] {
  const normalized = normalizeText(text)
  if (normalized.includes('dringend') || normalized.includes('asap') || normalized.includes('wichtig')) return 'high'
  return 'medium'
}

function buildTaskDeadline(parsed: ParsedPlanningRequest) {
  if (!parsed.hasExplicitDate) return undefined
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

function extractPreferredPeriod(text: string): PreferredPeriod {
  if (/(morgens|vormittag|vormittags|frueh)/.test(text)) return 'morning'
  if (/(nachmittag|nachmittags|mittags)/.test(text)) return 'afternoon'
  if (/(abend|abends|spaet)/.test(text)) return 'evening'
  return 'any'
}

function extractRecurrence(text: string) {
  if (!/(jeden|jede|immer|woechentlich|regelmaessig)/.test(text)) return null
  const day = extractWeekday(text)
  if (day === null) return null

  return {
    day,
    label: `Jede Woche ${weekdayLabel(day)}`,
  }
}

function extractWeekday(text: string): number | null {
  const weekdayMap: Record<string, number> = {
    sonntag: 0,
    montag: 1,
    dienstag: 2,
    mittwoch: 3,
    donnerstag: 4,
    freitag: 5,
    samstag: 6,
  }

  for (const [name, day] of Object.entries(weekdayMap)) {
    if (text.includes(name)) {
      return day
    }
  }

  return null
}

function extractTimePreference(text: string, fallbackDuration: number): PlanningTimePreference | undefined {
  const betweenMatch = text.match(/zwischen\s+(\d{1,2})(?::(\d{2}))?\s*(?:uhr)?\s*(?:und|-|bis)\s*(\d{1,2})(?::(\d{2}))?\s*(?:uhr)?/)
  if (betweenMatch) {
    const startMinutes = toMinutes(betweenMatch[1], betweenMatch[2])
    const endMinutes = toMinutes(betweenMatch[3], betweenMatch[4])
    return {
      startMinutes,
      endMinutes,
      label: `${formatClockMinutes(startMinutes)}-${formatClockMinutes(endMinutes)}`,
    }
  }

  const rangeMatch = text.match(/(?:von\s+)?(\d{1,2})(?::(\d{2}))?\s*(?:-|bis)\s*(\d{1,2})(?::(\d{2}))?\s*uhr?/)
  if (rangeMatch) {
    const startMinutes = toMinutes(rangeMatch[1], rangeMatch[2])
    const endMinutes = toMinutes(rangeMatch[3], rangeMatch[4])
    return {
      startMinutes,
      endMinutes,
      label: `${formatClockMinutes(startMinutes)}-${formatClockMinutes(endMinutes)}`,
    }
  }

  const exactMatch = text.match(/(?:\bum\s+|\b)(\d{1,2})(?::(\d{2}))?\s*uhr\b/)
  if (exactMatch) {
    const exactStartMinutes = toMinutes(exactMatch[1], exactMatch[2])
    return {
      exactStartMinutes,
      startMinutes: exactStartMinutes,
      endMinutes: exactStartMinutes + fallbackDuration,
      label: `um ${formatClockMinutes(exactStartMinutes)}`,
    }
  }

  const afterMatch = text.match(/\bab\s+(\d{1,2})(?::(\d{2}))?\s*uhr?\b/)
  if (afterMatch) {
    const startMinutes = toMinutes(afterMatch[1], afterMatch[2])
    return {
      startMinutes,
      label: `ab ${formatClockMinutes(startMinutes)}`,
    }
  }

  const beforeMatch = text.match(/\bbis\s+(\d{1,2})(?::(\d{2}))?\s*uhr?\b/)
  if (beforeMatch) {
    const endMinutes = toMinutes(beforeMatch[1], beforeMatch[2])
    return {
      endMinutes,
      label: `bis ${formatClockMinutes(endMinutes)}`,
    }
  }

  return undefined
}

function buildCleanTitle(text: string) {
  return text
    .replace(/\b(jeden|jede|immer|woechentlich|w�chentlich|regelmaessig|regelm��ig|heute|morgen|uebermorgen|�bermorgen|naechste woche|n�chste woche|diese woche|wochenende|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b/gi, '')
    .replace(/\b(morgens|vormittag|vormittags|nachmittag|nachmittags|mittags|abend|abends|frueh|sp�t|spaet)\b/gi, '')
    .replace(/\b(zwischen|um|ab|bis|von|und)\b/gi, '')
    .replace(/\b\d{1,2}(?::\d{2})?\s*(uhr)?\b/gi, '')
    .replace(/\b\d+(?:[.,]\d+)?\s*(min|minute|minuten|h|std|stunden)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildRoutinePreview(parsed: ParsedPlanningRequest): RoutinePreview {
  if (parsed.recurrenceDay === undefined) {
    throw new Error('Für eine Routine brauche ich einen Wochentag wie "jeden Mittwoch".')
  }

  const baseStartMinutes = parsed.timePreference?.exactStartMinutes ??
    parsed.timePreference?.startMinutes ??
    defaultStartMinutesForPeriod(parsed.preferredPeriod)
  const baseEndMinutes = parsed.timePreference?.endMinutes ?? (baseStartMinutes + parsed.durationMinutes)
  const startHour = Math.max(0, Math.min(23, Math.floor(baseStartMinutes / 60)))
  const endHour = Math.max(startHour + 1, Math.min(24, Math.ceil(baseEndMinutes / 60)))
  const roundedToHour = baseStartMinutes % 60 !== 0 || baseEndMinutes % 60 !== 0
  const nextDate = nextDateForWeekday(parsed.recurrenceDay, 0, new Date())
  const nextStart = new Date(nextDate)
  nextStart.setHours(startHour, 0, 0, 0)
  const nextEnd = new Date(nextDate)
  nextEnd.setHours(endHour, 0, 0, 0)
  if (endHour <= startHour) {
    nextEnd.setDate(nextEnd.getDate() + 1)
  }

  return {
    template: {
      id: uuidv4(),
      title: parsed.title,
      day: parsed.recurrenceDay,
      startHour,
      endHour,
      description: `Aus Planungs-Chat erstellt: "${prompt.value.trim()}"`,
    },
    nextStart,
    nextEnd,
    roundedToHour,
    reason: buildRoutineReason(parsed, nextStart, roundedToHour),
  }
}

function findBestSlot(parsed: ParsedPlanningRequest): SlotSuggestion | null {
  return collectSlotCandidates(parsed)[0] || null
}

function buildSlotStrategies(parsed: ParsedPlanningRequest): SlotStrategy[] {
  const hasTimePreference = Boolean(parsed.timePreference)
  const hasPeriodPreference = parsed.preferredPeriod !== 'any'
  const strategies: SlotStrategy[] = []

  if (hasTimePreference && hasPeriodPreference) strategies.push('time-and-period')
  if (hasTimePreference) strategies.push('time-only')
  if (hasPeriodPreference) strategies.push('period-only')
  strategies.push('any')

  return [...new Set(strategies)]
}

function buildSlotCandidate(slot: { start: Date; end: Date }, parsed: ParsedPlanningRequest, strategy: SlotStrategy) {
  const strictTime = strategy === 'time-and-period' || strategy === 'time-only'
  const strictPeriod = strategy === 'time-and-period' || strategy === 'period-only'
  const durationMs = parsed.durationMinutes * 60 * 1000
  const slotDay = new Date(slot.start)
  slotDay.setHours(0, 0, 0, 0)
  const dayWindow = buildDayWindow(slotDay, parsed, strictTime, strictPeriod)
  if (dayWindow.end <= dayWindow.start) return null

  let start = new Date(slot.start)

  if (strictTime && parsed.timePreference?.exactStartMinutes !== undefined) {
    start = setDayMinutes(slotDay, parsed.timePreference.exactStartMinutes)
  } else if (dayWindow.start > start) {
    start = new Date(dayWindow.start)
  }

  const end = new Date(start.getTime() + durationMs)
  const latestAllowedEnd = minDate(slot.end, dayWindow.end)

  if (start < slot.start || end > latestAllowedEnd) return null

  const score = buildCandidateScore(parsed, start, strategy)
  return {
    start,
    end,
    reason: buildSlotReason(parsed, start, strategy),
    score,
    strategy,
  }
}

function collectSlotCandidates(parsed: ParsedPlanningRequest): SlotSuggestion[] {
  const slots = findFreeSlots(parsed.dateFrom, parsed.dateTo, props.events, buildChatPlanningPreferences(parsed))
  const candidates: SlotCandidate[] = []

  for (const strategy of buildSlotStrategies(parsed)) {
    candidates.push(
      ...slots
        .map(slot => buildSlotCandidate(slot, parsed, strategy))
        .filter((candidate): candidate is SlotCandidate => candidate !== null),
    )
  }

  const seen = new Set<string>()

  return candidates
    .sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score
      return a.start.getTime() - b.start.getTime()
    })
    .filter(candidate => {
      const key = `${candidate.start.toISOString()}-${candidate.end.toISOString()}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function buildChatPlanningPreferences(parsed: ParsedPlanningRequest) {
  const base = preferences.value

  if (parsed.intent !== 'event') {
    return base
  }

  if (parsed.timePreference) {
    const preferredStart = parsed.timePreference.exactStartMinutes
      ?? parsed.timePreference.startMinutes
      ?? base.personalStartHour * 60
    const preferredEnd = parsed.timePreference.endMinutes
      ?? (preferredStart + parsed.durationMinutes)

    return {
      ...base,
      workDays: [0, 1, 2, 3, 4, 5, 6],
      workStartHour: Math.max(0, Math.floor(preferredStart / 60)),
      workEndHour: Math.min(24, Math.max(Math.ceil(preferredEnd / 60), Math.floor(preferredStart / 60) + 1)),
      lunchStartHour: Math.min(24, Math.max(Math.ceil(preferredEnd / 60), Math.floor(preferredStart / 60) + 1)),
      lunchEndHour: Math.min(24, Math.max(Math.ceil(preferredEnd / 60), Math.floor(preferredStart / 60) + 1)),
    }
  }

  let workStartHour = base.personalStartHour
  let workEndHour = base.personalEndHour
  let workDays = [...base.personalDays]

  if (parsed.preferredPeriod === 'morning') {
    workStartHour = 6
    workEndHour = 13
  } else if (parsed.preferredPeriod === 'afternoon') {
    workStartHour = 11
    workEndHour = 19
  } else if (parsed.preferredPeriod === 'evening') {
    workStartHour = 17
    workEndHour = 23
  }

  return {
    ...base,
    workDays,
    workStartHour,
    workEndHour,
    lunchStartHour: workEndHour,
    lunchEndHour: workEndHour,
  }
}

function availabilityLabelForSuggestion(start: Date, intent: PlanningIntent) {
  const day = start.getDay()
  const hour = start.getHours() + (start.getMinutes() / 60)
  const inWorkWindow = preferences.value.workDays.includes(day) &&
    hour >= preferences.value.workStartHour &&
    hour < preferences.value.workEndHour
  const inPersonalWindow = preferences.value.personalDays.includes(day) &&
    hour >= preferences.value.personalStartHour &&
    hour < preferences.value.personalEndHour

  if (intent === 'event') {
    if (inPersonalWindow && !inWorkWindow) return 'Freizeit-Slot'
    if (inWorkWindow) return 'Arbeitsnaher Slot'
    return 'Persönlicher Termin-Slot'
  }

  if (inWorkWindow) return 'Arbeits-Slot'
  if (inPersonalWindow) return 'Außerhalb der Arbeitszeit'
  return 'Sonder-Slot'
}

function buildPreviewSuggestions(parsed: ParsedPlanningRequest) {
  const suggestions: PreviewAlternative[] = []
  const seen = new Set<string>()

  const pushCandidates = (
    candidates: SlotSuggestion[],
    suffixReason?: string,
  ) => {
    for (const candidate of candidates) {
      const key = `${candidate.start.toISOString()}-${candidate.end.toISOString()}`
      if (seen.has(key)) continue
      seen.add(key)
      suggestions.push({
        key,
        label: `${formatPreview(candidate.start.toISOString())} bis ${formatPreview(candidate.end.toISOString())}`,
        reason: suffixReason ? `${candidate.reason} ${suffixReason}` : candidate.reason,
        start: candidate.start,
        end: candidate.end,
        isPrimary: suggestions.length === 0,
      })
      if (suggestions.length >= 5) return
    }
  }

  pushCandidates(collectSlotCandidates(parsed))

  if (suggestions.length < 3) {
    const extendedParsed = {
      ...parsed,
      dateTo: addPreviewDays(parsed.dateTo, 14),
      hasExplicitDate: false,
    }
    pushCandidates(
      collectSlotCandidates(extendedParsed),
      'Alternative auf einem späteren freien Tag mit ähnlicher Zeitlage.',
    )
  }

  if (suggestions.length < 3 && parsed.timePreference) {
    const relaxedTimeParsed = {
      ...parsed,
      timePreference: undefined,
      dateTo: addPreviewDays(parsed.dateTo, 21),
      hasExplicitDate: false,
    }
    pushCandidates(
      collectSlotCandidates(relaxedTimeParsed),
      'Lockerere Alternative ohne feste Uhrzeit, falls dein Wunschslot belegt ist.',
    )
  }

  return suggestions.slice(0, Math.max(3, Math.min(5, suggestions.length)))
}

function applyAlternativeSuggestion(alternative: PreviewAlternative) {
  if (!parsedDetails.value) return

  selectedPreviewSuggestionKey.value = alternative.key
  previewReason.value = `${alternative.reason} Diesen Alternativ-Slot hast du manuell ausgewählt.`
  previewAvailabilityLabel.value = availabilityLabelForSuggestion(alternative.start, parsedDetails.value.intent)
  previewUncertainty.value = buildPreviewUncertainty(parsedDetails.value, true)

  if (parsedDetails.value.intent === 'task' && previewTask.value) {
    previewTaskSlot.value = { start: alternative.start, end: alternative.end }
    previewTask.value = {
      ...previewTask.value,
      status: 'scheduled',
      priorityReason: 'Erstellt aus Planungs-Chat und mit Alternativ-Slot terminiert',
      scheduleBlocks: [{ start: alternative.start.toISOString(), end: alternative.end.toISOString() }],
      scheduledStart: alternative.start.toISOString(),
      scheduledEnd: alternative.end.toISOString(),
    }
    return
  }

  if (parsedDetails.value.intent === 'event') {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    previewEvent.value = {
      summary: parsedDetails.value.title,
      description: `Geplant aus Chat-Eingabe: "${prompt.value.trim()}"`,
      start: {
        dateTime: alternative.start.toISOString(),
        timeZone: tz,
      },
      end: {
        dateTime: alternative.end.toISOString(),
        timeZone: tz,
      },
    }
  }
}

function addPreviewDays(date: Date, days: number) {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

function buildDayWindow(day: Date, parsed: ParsedPlanningRequest, strictTime: boolean, strictPeriod: boolean) {
  let start = setDayMinutes(day, 0)
  let end = setDayMinutes(day, 24 * 60)

  if (strictTime && parsed.timePreference) {
    if (parsed.timePreference.exactStartMinutes !== undefined) {
      start = setDayMinutes(day, parsed.timePreference.exactStartMinutes)
      end = setDayMinutes(day, parsed.timePreference.exactStartMinutes + parsed.durationMinutes)
    } else {
      if (parsed.timePreference.startMinutes !== undefined) {
        start = setDayMinutes(day, parsed.timePreference.startMinutes)
      }
      if (parsed.timePreference.endMinutes !== undefined) {
        end = setDayMinutes(day, parsed.timePreference.endMinutes)
      }
    }
  }

  if (strictPeriod && parsed.preferredPeriod !== 'any') {
    const periodWindow = periodBounds(parsed.preferredPeriod)
    const periodStart = setDayMinutes(day, periodWindow.startMinutes)
    const periodEnd = setDayMinutes(day, periodWindow.endMinutes)
    if (periodStart > start) start = periodStart
    if (periodEnd < end) end = periodEnd
  }

  return { start, end }
}

function buildCandidateScore(parsed: ParsedPlanningRequest, start: Date, strategy: SlotStrategy) {
  let score = start.getTime()
  const dayBase = new Date(start)
  dayBase.setHours(0, 0, 0, 0)

  if (parsed.timePreference?.exactStartMinutes !== undefined) {
    score += Math.abs(start.getTime() - setDayMinutes(dayBase, parsed.timePreference.exactStartMinutes).getTime())
  } else if (parsed.timePreference?.startMinutes !== undefined) {
    score += Math.abs(start.getTime() - setDayMinutes(dayBase, parsed.timePreference.startMinutes).getTime())
  }

  if (strategy === 'time-and-period') score -= 5000000
  if (strategy === 'time-only') score -= 3000000
  if (strategy === 'period-only') score -= 1000000

  return score
}

function buildSlotReason(parsed: ParsedPlanningRequest, start: Date, strategy: SlotStrategy) {
  const reasons: string[] = []

  if ((strategy === 'time-and-period' || strategy === 'time-only') && parsed.timePreference) {
    reasons.push(`er in dein Zeitfenster ${parsed.timePreference.label} passt`)
  } else if (parsed.timePreference?.exactStartMinutes !== undefined) {
    reasons.push('die genaue Wunschzeit belegt war und ich den nächsten sinnvollen freien Slot gesucht habe')
  }

  if ((strategy === 'time-and-period' || strategy === 'period-only') && parsed.preferredPeriod !== 'any') {
    reasons.push(`er zu deinem Wunsch "${periodLabel(parsed.preferredPeriod)}" passt`)
  }

  if (parsed.hasExplicitDate) {
    reasons.push(`er am ${start.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit' })} frei ist`)
  } else {
    reasons.push('es der früheste freie Slot ist')
  }

  return `Gewählt, weil ${reasons.join(' und ')} und dort ${parsed.durationMinutes} Minuten frei waren.`
}

function buildNoSlotReason(parsed: ParsedPlanningRequest) {
  if (parsed.timePreference && parsed.hasExplicitDate) {
    return `Ich habe in ${parsed.timePreference.label} rund um deinen gewünschten Zeitraum keinen freien Slot gefunden.`
  }
  if (parsed.preferredPeriod !== 'any' && parsed.hasExplicitDate) {
    return `Ich habe in deinem bevorzugten Zeitraum "${periodLabel(parsed.preferredPeriod)}" keinen freien Slot gefunden.`
  }
  if (parsed.hasExplicitDate) {
    return 'Ich habe in deinem gewünschten Zeitraum keinen freien Slot gefunden.'
  }
  return 'Ich habe aktuell keinen passenden freien Slot gefunden.'
}

function buildRoutineReason(parsed: ParsedPlanningRequest, nextStart: Date, roundedToHour: boolean) {
  const reasons = [
    `${parsed.recurrenceLabel || 'Wiederkehrung'} erkannt`,
    `nächste Ausführung ${formatPreview(nextStart.toISOString())}`,
  ]

  if (parsed.timePreference) {
    reasons.push(`Zeitfenster ${parsed.timePreference.label}`)
  } else if (parsed.preferredPeriod !== 'any') {
    reasons.push(`orientiert an ${periodLabel(parsed.preferredPeriod)}`)
  }

  if (roundedToHour) {
    reasons.push('für Routinen aktuell auf volle Stunden gerundet')
  }

  return `Routine-Vorschlag: ${reasons.join(', ')}. Sie wird als Vorlage gespeichert und für die nächsten 4 Wochen in den Kalender eingetragen.`
}

function buildPreviewUncertainty(
  parsed: ParsedPlanningRequest,
  hasSuggestion: boolean,
  roundedRoutine = false,
) {
  if (roundedRoutine) {
    return 'Die Routine wurde auf volle Stunden gerundet, weil Routinen aktuell keine Minutenwerte speichern.'
  }

  if (!hasSuggestion) {
    return 'Es gibt aktuell keinen sicheren passenden Slot im gewünschten Fenster.'
  }

  if (intentMode.value === 'auto') {
    return `Der Typ wurde automatisch als ${intentLabel(parsed.intent).toLowerCase()} erkannt. Wenn das nicht passt, kannst du ihn oben manuell umstellen.`
  }

  if (!parsed.hasExplicitDate && !parsed.timePreference && parsed.preferredPeriod === 'any') {
    return 'Es wurde kein fester Zeitpunkt erkannt, deshalb nutze ich den frühesten sinnvollen freien Slot.'
  }

  return null
}

function hasMatchingExistingEvent(
  summary: string,
  start: Date,
  end: Date,
  transientEvents: Array<{ summary: string; start: Date; end: Date }> = [],
) {
  const persistentDuplicate = findPotentialDuplicates({ summary, start, end }, props.events)
    .some(entry => entry.kind === 'exact-match')
  if (persistentDuplicate) return true

  return [...props.events, ...transientEvents.map(event => ({
    summary: event.summary,
    start: { dateTime: event.start.toISOString() },
    end: { dateTime: event.end.toISOString() },
  }))].some(event => {
    if (!event.start.dateTime || !event.end.dateTime) return false

    const normalizedSummary = event.summary?.trim().toLowerCase() || ''
    const expectedSummary = summary.trim().toLowerCase()
    if (normalizedSummary !== expectedSummary) return false

    const eventStart = new Date(event.start.dateTime)
    const eventEnd = new Date(event.end.dateTime)

    const sameDay = eventStart.getFullYear() === start.getFullYear() &&
      eventStart.getMonth() === start.getMonth() &&
      eventStart.getDate() === start.getDate()

    return sameDay &&
      Math.abs(eventStart.getTime() - start.getTime()) <= 15 * 60 * 1000 &&
      Math.abs(eventEnd.getTime() - end.getTime()) <= 15 * 60 * 1000
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

function findWeekdayInRange(from: Date, to: Date, weekday: number) {
  const cursor = new Date(from)
  cursor.setHours(0, 0, 0, 0)

  while (cursor <= to) {
    if (cursor.getDay() === weekday) {
      return cursor
    }
    cursor.setDate(cursor.getDate() + 1)
  }

  return null
}

function normalizeText(text: string) {
  return text
    .toLowerCase()
    .replace(/�/g, 'ae')
    .replace(/�/g, 'oe')
    .replace(/�/g, 'ue')
    .replace(/�/g, 'ss')
}

function toMinutes(hours: string, minutes?: string) {
  return Number(hours) * 60 + Number(minutes || 0)
}

function setDayMinutes(day: Date, minutes: number) {
  const result = new Date(day)
  result.setHours(0, 0, 0, 0)
  result.setMinutes(minutes)
  return result
}

function minDate(a: Date, b: Date) {
  return a.getTime() <= b.getTime() ? a : b
}

function periodBounds(period: PreferredPeriod) {
  if (period === 'morning') return { startMinutes: 6 * 60, endMinutes: 12 * 60 }
  if (period === 'afternoon') return { startMinutes: 12 * 60, endMinutes: 17 * 60 }
  return { startMinutes: 17 * 60, endMinutes: 22 * 60 }
}

function defaultStartMinutesForPeriod(period: PreferredPeriod) {
  if (period === 'morning') return 9 * 60
  if (period === 'afternoon') return 14 * 60
  if (period === 'evening') return 18 * 60
  return preferences.value.workStartHour * 60
}

function periodLabel(period: PreferredPeriod) {
  if (period === 'morning') return 'Vormittag'
  if (period === 'afternoon') return 'Nachmittag'
  if (period === 'evening') return 'Abend'
  return 'beliebige Zeit'
}

function weekdayLabel(day: number) {
  const weekdayLabels = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
  return weekdayLabels[day] || 'Tag'
}

function formatClockMinutes(minutes: number) {
  const safeMinutes = ((minutes % (24 * 60)) + (24 * 60)) % (24 * 60)
  const hours = Math.floor(safeMinutes / 60)
  const mins = safeMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
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

function intentLabel(intent: PlanningIntent) {
  if (intent === 'event') return 'Termin'
  if (intent === 'task') return 'Aufgabe'
  return 'Routine'
}

function useExamplePrompt(value: string) {
  prompt.value = value
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="show" class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
        <div class="absolute inset-0" @click="emit('close')" />

        <div class="glass-card-elevated relative z-10 max-h-[100dvh] w-full overflow-y-auto rounded-t-glass-xl pb-[max(1rem,env(safe-area-inset-bottom))] sm:max-h-[92vh] sm:max-w-5xl sm:rounded-glass-lg sm:pb-0">
          <div class="sticky top-0 z-10 border-b border-border-subtle bg-surface/88 px-4 py-5 backdrop-blur-glass sm:bg-transparent sm:px-6">
            <div class="flex items-start justify-between gap-4">
              <div class="absolute left-1/2 top-2 h-1.5 w-14 -translate-x-1/2 rounded-full bg-white/12 sm:hidden" />
              <div>
                <div class="flex items-center gap-2">
                  <span class="h-2.5 w-2.5 animate-glow rounded-full bg-accent-purple shadow-glow-purple" />
                  <p class="text-xs font-semibold uppercase tracking-[0.24em] text-accent-purple-soft">KI Planer</p>
                </div>
                <h2 class="mt-2 text-2xl font-semibold text-text-primary">Natürlich planen</h2>
                <p class="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
                  Schreib einfach, was du unterbringen willst. Ich erkenne Termin, Aufgabe oder Routine und zeige dir direkt, was daraus entsteht.
                </p>
              </div>
              <button type="button" class="btn-secondary inline-flex h-10 w-10 items-center justify-center" @click="emit('close')">
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <div class="grid gap-6 px-4 py-4 sm:px-6 sm:py-6 lg:grid-cols-[1.2fr,0.95fr]">
            <div class="space-y-5">
              <section class="glass-card p-4">
                <label class="block text-sm font-medium text-text-secondary">Was möchtest du einplanen?</label>
                <textarea
                  v-model="prompt"
                  rows="5"
                  class="input-dark mt-3 w-full resize-none px-4 py-4"
                  placeholder="z.B. Meeting morgen um 14 Uhr, Hausarbeit 3h diese Woche oder jeden Mittwoch Gym 18 bis 20 Uhr"
                />

                <div class="mt-4">
                  <div class="text-xs font-semibold uppercase tracking-[0.2em] text-text-muted">Schnell starten</div>
                  <div class="mt-2 flex flex-wrap gap-2">
                    <button
                      v-for="example in examplePrompts"
                      :key="example"
                      type="button"
                      class="rounded-full border border-border-subtle bg-white/[0.03] px-3 py-2 text-left text-xs text-text-secondary transition hover:border-border-medium hover:bg-white/[0.06] hover:text-text-primary"
                      @click="useExamplePrompt(example)"
                    >
                      {{ example }}
                    </button>
                  </div>
                </div>

                <div class="mt-4 space-y-4">
                  <div>
                    <div class="text-xs font-semibold uppercase tracking-[0.2em] text-text-muted">Typ</div>
                    <div class="mt-2 flex flex-wrap gap-2">
                      <button
                        v-for="mode in [
                          { value: 'auto', label: 'Automatisch' },
                          { value: 'event', label: 'Termin' },
                          { value: 'task', label: 'Aufgabe' },
                          { value: 'routine', label: 'Routine' },
                        ]"
                        :key="mode.value"
                        type="button"
                        class="rounded-full border px-3 py-2 text-sm font-medium transition"
                        :class="intentMode === mode.value
                          ? 'border-accent-purple/40 bg-accent-purple/15 text-accent-purple'
                          : 'border-border-subtle bg-white/[0.03] text-text-secondary hover:border-border-medium hover:text-text-primary'"
                        @click="intentMode = mode.value as 'auto' | PlanningIntent"
                      >
                        {{ mode.label }}
                      </button>
                    </div>
                  </div>

                  <div>
                    <div class="text-xs font-semibold uppercase tracking-[0.2em] text-text-muted">Standarddauer</div>
                    <div class="mt-2 flex flex-wrap gap-2">
                      <button
                        v-for="minutes in [30, 60, 90, 120, 180]"
                        :key="minutes"
                        type="button"
                        class="rounded-full border px-3 py-2 text-sm transition"
                        :class="durationMinutes === minutes
                          ? 'border-accent-blue/40 bg-accent-blue/15 text-accent-blue'
                          : 'border-border-subtle bg-white/[0.03] text-text-secondary hover:border-border-medium hover:text-text-primary'"
                        @click="durationMinutes = minutes"
                      >
                        {{ minutes === 30 ? '30 Min.' : minutes === 60 ? '1 Std.' : minutes === 90 ? '1,5 Std.' : minutes === 120 ? '2 Std.' : '3 Std.' }}
                      </button>
                    </div>
                  </div>
                </div>

                <div class="mt-5 flex gap-2">
                  <button
                    type="button"
                    class="btn-primary inline-flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm disabled:opacity-50"
                    :disabled="!prompt.trim() || isPlanning"
                    @click="handlePlan"
                  >
                    <svg v-if="isPlanning" class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Vorschlag suchen
                  </button>
                  <button type="button" class="btn-secondary px-4 py-3 text-sm" @click="emit('close')">
                    Schließen
                  </button>
                </div>
              </section>

              <section class="glass-card border-dashed p-4" v-if="!parsedDetails">
                <div class="flex items-start gap-3">
                  <div class="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-accent-purple/12 text-accent-purple shadow-glow-purple">
                    <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 5v14m7-7H5" />
                    </svg>
                  </div>
                  <div>
                    <h3 class="text-sm font-semibold text-text-primary">Beispiele und Ideen</h3>
                    <p class="mt-2 text-sm leading-6 text-text-secondary">
                      Formuliere locker, was du vorhast. Der Chat erkennt daraus Termin, Aufgabe oder Routine und zeigt dir direkt einen passenden Vorschlag.
                    </p>
                  </div>
                </div>
                <div class="mt-4 space-y-2 text-sm italic text-text-muted">
                  <p>`Treffen mit Bro morgen Abend`</p>
                  <p>`2h Videoschnitt zwischen 14 und 17 Uhr`</p>
                  <p>`jeden Mittwoch Gym 18 bis 20 Uhr`</p>
                </div>
              </section>

              <div v-if="error" class="rounded-glass border border-priority-critical/30 bg-priority-critical/10 px-4 py-3 text-sm text-[#FFD3DC]">
                {{ error }}
              </div>

              <div
                v-else-if="syncStatus"
                class="rounded-glass border px-4 py-3 text-sm"
                :class="syncStatus.state === 'error'
                  ? 'border-priority-critical/30 bg-priority-critical/10 text-[#FFD3DC]'
                  : syncStatus.state === 'success'
                    ? 'border-accent-green/30 bg-accent-green/10 text-accent-green'
                    : 'border-border-subtle bg-white/[0.04] text-text-secondary'"
              >
                {{ syncStatus.message }}
              </div>
            </div>

            <div class="space-y-5">
              <section class="glass-card p-4">
                <div class="flex items-center justify-between gap-3">
                  <h3 class="text-sm font-semibold uppercase tracking-[0.2em] text-accent-blue">Vorschlag</h3>
                  <span v-if="parsedDetails" class="rounded-full bg-white/[0.05] px-3 py-1 text-[11px] text-text-secondary">
                    {{ intentLabel(parsedDetails.intent) }}
                  </span>
                </div>

                <div v-if="parsedDetails" class="mt-4 flex flex-wrap gap-2">
                  <span class="rounded-full bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-text-secondary">
                    Erkannt als {{ intentLabel(parsedDetails.intent) }}
                  </span>
                  <span v-if="previewAvailabilityLabel" class="rounded-full bg-accent-green/15 px-2.5 py-1 text-[11px] font-medium text-accent-green">
                    {{ previewAvailabilityLabel }}
                  </span>
                  <span v-if="parsedDetails.recurrenceLabel" class="rounded-full bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-text-secondary">
                    {{ parsedDetails.recurrenceLabel }}
                  </span>
                  <span v-if="parsedDetails.timePreference?.label" class="rounded-full bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-text-secondary">
                    {{ parsedDetails.timePreference.label }}
                  </span>
                  <span v-else-if="parsedDetails.preferredPeriod !== 'any'" class="rounded-full bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-text-secondary">
                    {{ periodLabel(parsedDetails.preferredPeriod) }}
                  </span>
                </div>

                <div
                  v-if="previewReason || previewUncertainty || previewAlternatives.length > 0"
                  class="mt-4 rounded-glass border border-border-subtle bg-white/[0.03] p-4"
                >
                  <div class="text-xs font-semibold uppercase tracking-[0.2em] text-text-muted">Warum diese Entscheidung?</div>
                  <p v-if="previewReason" class="mt-3 text-sm leading-6 text-text-secondary">
                    {{ previewReason }}
                  </p>
                  <p v-if="previewUncertainty" class="mt-3 text-xs text-priority-high">
                    Unsicherheit: {{ previewUncertainty }}
                  </p>
                  <div v-if="previewAlternatives.length > 0" class="mt-4">
                    <div class="flex items-center justify-between gap-2">
                      <div class="text-[11px] font-medium uppercase tracking-[0.2em] text-text-muted">Vorschläge</div>
                      <div class="text-[11px] text-text-muted">{{ previewAlternatives.length }} auswählbar</div>
                    </div>
                    <div class="mt-2 max-h-56 space-y-2 overflow-y-auto pr-1">
                      <button
                        v-for="alternative in previewAlternatives"
                        :key="alternative.key"
                        type="button"
                        class="w-full rounded-xl border px-3 py-2 text-left transition hover:border-border-medium hover:bg-white/[0.06]"
                        :class="selectedPreviewSuggestionKey === alternative.key
                          ? 'border-accent-blue/35 bg-accent-blue/12'
                          : 'border-border-subtle bg-white/[0.04]'"
                        @click="applyAlternativeSuggestion(alternative)"
                      >
                        <div class="flex items-start justify-between gap-3">
                          <div class="min-w-0 flex-1">
                            <div class="flex flex-wrap items-center gap-2">
                              <div class="text-xs font-medium text-text-primary">{{ alternative.label }}</div>
                              <span
                                v-if="alternative.isPrimary"
                                class="rounded-full border border-accent-green/20 bg-accent-green/10 px-2 py-0.5 text-[10px] font-medium text-accent-green"
                              >
                                Empfohlen
                              </span>
                            </div>
                            <div class="mt-1 text-[11px] text-text-muted">{{ alternative.reason }}</div>
                          </div>
                          <span
                            class="rounded-full border px-2 py-0.5 text-[10px] font-medium"
                            :class="selectedPreviewSuggestionKey === alternative.key
                              ? 'border-accent-blue/25 bg-accent-blue/15 text-accent-blue'
                              : 'border-accent-blue/20 bg-accent-blue/10 text-accent-blue'"
                          >
                            {{ selectedPreviewSuggestionKey === alternative.key ? 'Ausgewählt' : 'Übernehmen' }}
                          </span>
                        </div>
                      </button>
                    </div>
                  </div>
                </div>

                <div v-if="previewEvent && parsedDetails" class="mt-4 space-y-3">
                  <div class="rounded-glass border border-accent-blue/20 bg-accent-blue/10 p-4">
                    <p class="text-sm font-medium text-text-primary">{{ parsedDetails.title }}</p>
                    <p class="mt-1 text-sm text-text-secondary">
                      {{ parsedDetails.durationMinutes }} Minuten, wird direkt als Termin erstellt
                    </p>
                    <p class="mt-3 text-sm text-accent-blue">
                      {{ formatPreview(previewEvent.start.dateTime) }} bis
                      {{ formatPreview(previewEvent.end.dateTime) }}
                    </p>
                  </div>

                  <div
                    v-if="previewDuplicateWarnings.length > 0"
                    class="rounded-glass border border-priority-high/30 bg-priority-high/10 px-4 py-3"
                  >
                    <div class="text-xs font-semibold uppercase tracking-[0.2em] text-priority-high">Mögliche Duplikate</div>
                    <div class="mt-3 space-y-2">
                      <div
                        v-for="duplicate in previewDuplicateWarnings.slice(0, 2)"
                        :key="`${duplicate.event.id || duplicate.event.summary}-${duplicate.reason}`"
                        class="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2"
                      >
                        <div class="text-xs font-medium text-text-primary">{{ duplicate.event.summary || 'ähnlicher Termin' }}</div>
                        <div class="mt-1 text-[11px] text-priority-high">{{ duplicate.reason }}</div>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    class="btn-accent-green w-full px-4 py-3 text-sm disabled:opacity-50"
                    :disabled="isPlanning"
                    @click="handleCreate"
                  >
                    Termin erstellen
                  </button>
                </div>

                <div v-else-if="previewTask && parsedDetails" class="mt-4 space-y-3">
                  <div class="rounded-glass border border-accent-purple/20 bg-accent-purple/10 p-4">
                    <p class="text-sm font-medium text-text-primary">{{ previewTask.title }}</p>
                    <p class="mt-1 text-sm text-text-secondary">
                      {{ previewTask.estimatedMinutes }} Minuten, Priorität {{ previewTask.priority }}
                    </p>
                    <p class="mt-3 text-sm text-accent-purple">
                      <template v-if="previewTaskSlot">
                        Wird als Aufgabe angelegt und direkt für {{ formatPreview(previewTask.scheduledStart) }} terminiert
                      </template>
                      <template v-else>
                        Noch kein freier Slot gefunden, Aufgabe wird nur angelegt.
                      </template>
                    </p>
                    <p class="mt-2 text-xs text-text-muted">
                      Deadline: {{ previewTask.deadline ? new Date(previewTask.deadline).toLocaleDateString('de-DE') : 'keine' }}
                    </p>
                  </div>

                  <div
                    v-if="previewDuplicateWarnings.length > 0"
                    class="rounded-glass border border-priority-high/30 bg-priority-high/10 px-4 py-3"
                  >
                    <div class="text-xs font-semibold uppercase tracking-[0.2em] text-priority-high">Mögliche Duplikate</div>
                    <div class="mt-3 space-y-2">
                      <div
                        v-for="duplicate in previewDuplicateWarnings.slice(0, 2)"
                        :key="`${duplicate.event.id || duplicate.event.summary}-${duplicate.reason}`"
                        class="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2"
                      >
                        <div class="text-xs font-medium text-text-primary">{{ duplicate.event.summary || 'ähnlicher Termin' }}</div>
                        <div class="mt-1 text-[11px] text-priority-high">{{ duplicate.reason }}</div>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    class="btn-accent-green w-full px-4 py-3 text-sm disabled:opacity-50"
                    :disabled="isPlanning"
                    @click="handleCreateTask"
                  >
                    Aufgabe erstellen
                  </button>
                </div>

                <div v-else-if="previewRoutine && parsedDetails" class="mt-4 space-y-3">
                  <div class="rounded-glass border border-accent-green/20 bg-accent-green/10 p-4">
                    <p class="text-sm font-medium text-text-primary">{{ previewRoutine.template.title }}</p>
                    <p class="mt-1 text-sm text-text-secondary">
                      {{ weekdayLabel(previewRoutine.template.day) }},
                      {{ String(previewRoutine.template.startHour).padStart(2, '0') }}:00 bis
                      {{ String(previewRoutine.template.endHour).padStart(2, '0') }}:00
                    </p>
                    <p class="mt-3 text-sm text-accent-green">
                      Wird als Routine-Vorlage gespeichert und für die nächsten 4 Wochen eingetragen
                    </p>
                    <p class="mt-2 text-xs text-text-muted">
                      Nächste Ausführung: {{ formatPreview(previewRoutine.nextStart.toISOString()) }} bis {{ formatPreview(previewRoutine.nextEnd.toISOString()) }}
                    </p>
                  </div>

                  <div
                    v-if="routineDuplicateWarnings.length > 0"
                    class="rounded-glass border border-priority-high/30 bg-priority-high/10 px-4 py-3"
                  >
                    <div class="text-xs font-semibold uppercase tracking-[0.2em] text-priority-high">Bereits ähnliche Routinen im Kalender</div>
                    <div class="mt-3 space-y-2">
                      <div
                        v-for="duplicate in routineDuplicateWarnings"
                        :key="duplicate.label"
                        class="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2"
                      >
                        <div class="text-xs font-medium text-text-primary">{{ duplicate.label }}</div>
                        <div class="mt-1 text-[11px] text-priority-high">{{ duplicate.reason }}</div>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    class="btn-accent-green w-full px-4 py-3 text-sm disabled:opacity-50"
                    :disabled="isPlanning"
                    @click="handleCreateRoutine"
                  >
                    Routine speichern
                  </button>
                </div>

                <div v-else class="mt-4 rounded-glass border border-dashed border-border-subtle bg-white/[0.03] px-4 py-6 text-center">
                  <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent-blue/12 text-accent-blue shadow-glow-blue">
                    <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M5 12h14m-7-7 7 7-7 7" />
                    </svg>
                  </div>
                  <h4 class="mt-4 text-sm font-semibold text-text-primary">Noch kein Vorschlag vorhanden</h4>
                  <p class="mt-2 text-sm text-text-secondary">
                    Beschreibe links deinen Wunsch in natürlicher Sprache oder tippe auf ein Beispiel, damit rechts direkt ein Vorschlag erscheint.
                  </p>
                </div>
              </section>

              <div v-if="error" class="rounded-glass border border-priority-critical/30 bg-priority-critical/10 px-4 py-3 text-sm text-[#FFD3DC]">
                {{ error }}
              </div>

              <div
                v-else-if="syncStatus"
                class="rounded-glass border px-4 py-3 text-sm"
                :class="syncStatus.state === 'error'
                  ? 'border-priority-critical/30 bg-priority-critical/10 text-[#FFD3DC]'
                  : syncStatus.state === 'success'
                    ? 'border-accent-green/30 bg-accent-green/10 text-accent-green'
                    : 'border-border-subtle bg-white/[0.04] text-text-secondary'"
              >
                {{ syncStatus.message }}
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



