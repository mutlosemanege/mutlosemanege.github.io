<script setup lang="ts">
import { v4 as uuidv4 } from 'uuid'
import type { CalendarEvent } from '~/composables/useCalendar'
import type { RoutineTemplate, Task } from '~/types/task'
import {
  MAX_CHAT_PROMPT_LENGTH,
  MAX_LONG_TEXT_LENGTH,
  MAX_TASK_TITLE_LENGTH,
  normalizeMultilineUserText,
  normalizeOptionalUserText,
  normalizeUserText,
  shortenForFeedback,
} from '~/utils/inputGuards'
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
  recurrenceMode?: RoutineTemplate['repeatMode']
  recurrenceDay?: number
  recurrenceLabel?: string
  recurrenceFrequencyPerWeek?: number
  multipleWeekdays?: number[]
  frequencyInPeriod?: number
  timePreference?: PlanningTimePreference
  restDayHint?: number
  cyclePattern?: { trainDays: number; restDays: number }
  ambiguityHints: string[]
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
  dayKey: string
  label: string
  reason: string
  start: Date
  end: Date
  isPrimary?: boolean
}

interface PreviewSuggestionGroup {
  dayKey: string
  dayLabel: string
  suggestions: PreviewAlternative[]
}

interface ClarificationOption {
  key: string
  label: string
  detail: string
  promptValue: string
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
const { events: calendarEvents, createEvent, deleteEvent, error: calendarError, syncStatus, canRetryLastAction, isRetryingLastAction, retryLastAction, findPotentialDuplicates } = useCalendar()
const { createTask, updateTask } = useTasks()

const prompt = ref('')
const durationMinutes = ref(60)
const intentMode = ref<'auto' | PlanningIntent>('auto')
const isPlanning = ref(false)
const error = ref<string | null>(null)
const previewEvent = ref<Omit<CalendarEvent, 'id'> | null>(null)
const previewTask = ref<Omit<Task, 'id' | 'createdAt' | 'updatedAt'> | null>(null)
const previewRoutine = ref<RoutinePreview | null>(null)
const previewMultiRoutines = ref<RoutinePreview[]>([])
const previewMultiEventSlots = ref<Array<{ start: Date; end: Date }>>([])

const parsedDetails = ref<ParsedPlanningRequest | null>(null)
const previewTaskSlot = ref<{ start: Date; end: Date } | null>(null)
const previewReason = ref<string | null>(null)
const previewUncertainty = ref<string | null>(null)
const previewAlternatives = ref<PreviewAlternative[]>([])
const previewAvailabilityLabel = ref<string | null>(null)
const selectedPreviewSuggestionKey = ref<string | null>(null)

// Routine-Konflikterkennung & Zeitslot-Auswahl
interface RoutineConflictInfo {
  date: Date
  conflictingEvents: CalendarEvent[]
  suggestedShiftDate: Date | null
  suggestedShiftDayLabel: string
}
interface RoutineTimeSlotOption {
  startHour: number
  endHour: number
  label: string
}
interface MultiRoutineTimeAlternatives {
  dayIndex: number
  dayLabel: string
  alternatives: RoutineTimeSlotOption[]
}
const routineConflict = ref<RoutineConflictInfo | null>(null)
const routineTimeAlternatives = ref<RoutineTimeSlotOption[]>([])
const multiRoutineTimeAlternatives = ref<MultiRoutineTimeAlternatives[]>([])
const showDeleteConflictConfirm = ref(false)
const examplePrompts = [
  'Treffen mit Bro morgen Abend',
  '2h Videoschnitt zwischen 14 und 17 Uhr',
  'jeden Mittwoch Gym 18 bis 20 Uhr',
]
const promptCharactersLeft = computed(() => MAX_CHAT_PROMPT_LENGTH - prompt.value.length)
const decisionCardModeLabel = computed(() => {
  if (!parsedDetails.value) return null
  return previewEvent.value || previewTask.value || previewRoutine.value || previewMultiRoutines.value.length > 0 || previewMultiEventSlots.value.length > 0 ? 'Empfehlung' : 'Vorschau'
})
const decisionCardTone = computed(() => {
  if (previewEvent.value || previewTask.value || previewRoutine.value || previewMultiRoutines.value.length > 0 || previewMultiEventSlots.value.length > 0) return 'preview'
  if (error.value) return 'warning'
  return 'neutral'
})
const decisionCardNextStep = computed(() => {
  if (previewEvent.value) return 'Prüfe kurz den Vorschlag oder wähle unten eine andere Zeit aus und erstelle dann den Termin.'
  if (previewTask.value && previewTaskSlot.value) return 'Wenn der Slot passt, kannst du die Aufgabe direkt mit Kalendereintrag anlegen.'
  if (previewTask.value) return 'Lege die Aufgabe jetzt an oder passe den Prompt an, damit der Chat einen direkten Slot suchen kann.'
  if (previewRoutine.value) return 'Speichere die Routine, wenn Wochentag und Uhrzeit wirklich zu deinem Rhythmus passen.'
  if (previewMultiRoutines.value.length > 0) return `Prüfe die ${previewMultiRoutines.value.length} Tage — passen Wochentage und Uhrzeiten, kannst du alle auf einmal speichern.`
  if (previewMultiEventSlots.value.length > 0) return `Prüfe die ${previewMultiEventSlots.value.length} vorgeschlagenen Slots — wenn die Zeiten passen, werden alle als Termine eingetragen.`
  return 'Verfeinere Datum, Uhrzeit oder Dauer, damit der Vorschlag genauer wird.'
})
const interpretedPromptSummary = computed(() => {
  if (!parsedDetails.value) return null

  const parts: string[] = []
  if (parsedDetails.value.hasExplicitDate) {
    const sameDay = parsedDetails.value.dateFrom.toDateString() === parsedDetails.value.dateTo.toDateString()
    parts.push(sameDay
      ? parsedDetails.value.dateFrom.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
      : `${parsedDetails.value.dateFrom.toLocaleDateString('de-DE')} bis ${parsedDetails.value.dateTo.toLocaleDateString('de-DE')}`)
  } else {
    parts.push('nächster passender Zeitraum')
  }

  if (parsedDetails.value.timePreference?.label) {
    parts.push(parsedDetails.value.timePreference.label)
  } else if (parsedDetails.value.preferredPeriod !== 'any') {
    parts.push(periodLabel(parsedDetails.value.preferredPeriod))
  }

  parts.push(`${parsedDetails.value.durationMinutes} Min.`)
  return `Verstanden als: ${parts.join(' · ')}`
})
const clarificationOptions = computed<ClarificationOption[]>(() => {
  if (!parsedDetails.value) return []

  const options: ClarificationOption[] = []
  const normalizedPrompt = normalizeText(prompt.value)

  const addOption = (option: ClarificationOption) => {
    if (option.promptValue.trim() === prompt.value.trim()) return
    if (options.some(existing => existing.promptValue.trim() === option.promptValue.trim())) return
    options.push(option)
  }

  if (
    parsedDetails.value.hasExplicitDate &&
    parsedDetails.value.ambiguityHints.some(hint => hint.includes('Wochentag'))
  ) {
    const weekday = weekdayLabel(parsedDetails.value.dateFrom.getDay())
    const thisWeekPrompt = applyWeekdayQualifier(prompt.value, weekday, 'diesen')
    const nextWeekPrompt = applyWeekdayQualifier(prompt.value, weekday, 'nächsten')
    addOption({
      key: 'weekday-this',
      label: `Diesen ${weekday}`,
      detail: 'Nimmt den nächstmöglichen Termin in dieser Woche.',
      promptValue: thisWeekPrompt,
    })
    addOption({
      key: 'weekday-next',
      label: `Nächsten ${weekday}`,
      detail: 'Springt bewusst auf die Woche danach.',
      promptValue: nextWeekPrompt,
    })
  }

  if (!parsedDetails.value.hasExplicitDate && parsedDetails.value.intent !== 'routine') {
    addOption({
      key: 'date-today',
      label: 'Heute',
      detail: 'Ich suche nur im restlichen heutigen Tag.',
      promptValue: prependDateClarifier(prompt.value, 'heute'),
    })
    addOption({
      key: 'date-tomorrow',
      label: 'Morgen',
      detail: 'Ich suche gezielt morgen statt offen in den nächsten Tagen.',
      promptValue: prependDateClarifier(prompt.value, 'morgen'),
    })
    addOption({
      key: 'date-weekend',
      label: 'Wochenende',
      detail: 'Erlaubt bewusst auch Samstag und Sonntag.',
      promptValue: prependDateClarifier(prompt.value, 'am Wochenende'),
    })
  }

  if (!parsedDetails.value.timePreference?.exactStartMinutes && parsedDetails.value.intent !== 'routine') {
    const timeOptions = parsedDetails.value.preferredPeriod === 'evening'
      ? [
          { label: '18:00', minutes: 18 * 60, detail: 'Etwas früher am Abend.' },
          { label: '19:30', minutes: 19 * 60 + 30, detail: 'Klassischer Abend-Slot.' },
        ]
      : parsedDetails.value.preferredPeriod === 'morning'
        ? [
            { label: '09:00', minutes: 9 * 60, detail: 'Klarer Start am Vormittag.' },
            { label: '10:30', minutes: 10 * 60 + 30, detail: 'Etwas später am Vormittag.' },
          ]
        : [
            { label: '12:00', minutes: 12 * 60, detail: 'Mittig am Tag.' },
            { label: '18:00', minutes: 18 * 60, detail: 'Späterer Termin am selben Tag.' },
          ]

    for (const option of timeOptions) {
      addOption({
        key: `time-${option.minutes}`,
        label: option.label,
        detail: option.detail,
        promptValue: appendExactTime(prompt.value, option.label),
      })
    }
  }

  if (
    previewAlternatives.value.length === 0 &&
    parsedDetails.value.intent !== 'routine' &&
    !normalizedPrompt.includes('wochenende')
  ) {
    addOption({
      key: 'fallback-weekend',
      label: 'Auch Wochenende',
      detail: 'Erweitert die Suche auf Samstag und Sonntag.',
      promptValue: prependDateClarifier(prompt.value, 'am Wochenende'),
    })
  }

  if (parsedDetails.value.recurrenceFrequencyPerWeek) {
    const freq = parsedDetails.value.recurrenceFrequencyPerWeek
    const hasRestDay = parsedDetails.value.restDayHint !== undefined

    if (freq === 6 && !hasRestDay) {
      // 6x/week: offer rest-day chips for 3+1+3 training pattern
      for (const [label, day, detail] of [
        ['Ruhetag Do', 4, 'Mo–Mi trainieren, Do pausieren, Fr–So trainieren (3+1+3)'],
        ['Ruhetag So', 0, 'Mo–Sa trainieren, Sonntag pausieren'],
        ['Ruhetag Mo', 1, 'Ruhetag Montag — Di–So trainieren'],
      ] as [string, number, string][]) {
        addOption({
          key: `rest-day-${day}`,
          label,
          detail,
          promptValue: `${prompt.value} ruhetag ${weekdayLabel(day).toLowerCase()}`,
        })
      }
    } else if (freq === 5 && !hasRestDay) {
      addOption({
        key: 'recurrence-workdays',
        label: 'Werktags',
        detail: 'Klare Routine an Arbeitstagen (Mo–Fr).',
        promptValue: `${prompt.value} werktags`,
      })
    }

    if (!hasRestDay) {
      addOption({
        key: 'recurrence-daily',
        label: 'Täglich',
        detail: 'Macht daraus eine Routine für jeden Tag.',
        promptValue: `${prompt.value} täglich`,
      })
    }
  }

  return options.slice(0, 5)
})

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
  for (const baseDate of collectRoutineOccurrenceDates(previewRoutine.value.template, 4)) {
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

const previewSuggestionGroups = computed<PreviewSuggestionGroup[]>(() => {
  const groups = new Map<string, PreviewSuggestionGroup>()

  for (const suggestion of previewAlternatives.value) {
    const existing = groups.get(suggestion.dayKey)
    if (existing) {
      existing.suggestions.push(suggestion)
      continue
    }

    groups.set(suggestion.dayKey, {
      dayKey: suggestion.dayKey,
      dayLabel: formatSuggestionDay(suggestion.start),
      suggestions: [suggestion],
    })
  }

  return [...groups.values()]
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
  previewMultiRoutines.value = []
  previewMultiEventSlots.value = []
  parsedDetails.value = null
  previewTaskSlot.value = null
  previewReason.value = null
  previewUncertainty.value = null
  previewAlternatives.value = []
  previewAvailabilityLabel.value = null
  selectedPreviewSuggestionKey.value = null
  routineConflict.value = null
  routineTimeAlternatives.value = []
  multiRoutineTimeAlternatives.value = []
  showDeleteConflictConfirm.value = false
})

async function handlePlan() {
  if (isPlanning.value) return
  const safePrompt = normalizeMultilineUserText(prompt.value, MAX_CHAT_PROMPT_LENGTH)
  if (!safePrompt) return

  isPlanning.value = true
  error.value = null
  previewEvent.value = null
  previewTask.value = null
  previewRoutine.value = null
  previewMultiRoutines.value = []
  previewMultiEventSlots.value = []
  previewTaskSlot.value = null
  previewReason.value = null
  previewUncertainty.value = null
  previewAlternatives.value = []
  previewAvailabilityLabel.value = null
  selectedPreviewSuggestionKey.value = null
  routineConflict.value = null
  routineTimeAlternatives.value = []
  multiRoutineTimeAlternatives.value = []
  showDeleteConflictConfirm.value = false

  try {
    prompt.value = safePrompt
    const parsed = parsePlanningPromptCore(safePrompt, durationMinutes.value, intentMode.value)
    const safeTitle = normalizeUserText(parsed.title, MAX_TASK_TITLE_LENGTH) || 'Neuer Eintrag'
    parsed.title = safeTitle
    parsedDetails.value = parsed

    if (parsed.multipleWeekdays && parsed.multipleWeekdays.length >= 2) {
      const routines = buildMultiRoutineFromWeekdays(parsed, parsed.multipleWeekdays)
      previewMultiRoutines.value = routines
      previewReason.value = `${routines.length}x wöchentlich: ${routines.map(r => weekdayLabel(r.template.day!)).join(', ')}`
      previewUncertainty.value = null
      multiRoutineTimeAlternatives.value = buildMultiRoutineTimeAlternatives(routines)
      return
    }

    if (parsed.recurrenceFrequencyPerWeek && !parsed.recurrenceMode) {
      const slots = distributeNSlots(parsed.recurrenceFrequencyPerWeek, parsed, 1)
      if (slots.length > 0) {
        const routines = buildMultiRoutineFromSlots(parsed, slots)
        previewMultiRoutines.value = routines
        previewReason.value = `${routines.length}x wöchentlich: ${routines.map(r => weekdayLabel(r.template.day!)).join(', ')}`
        previewUncertainty.value = routines.length < parsed.recurrenceFrequencyPerWeek ? `Nur ${routines.length} freie Slots gefunden — passe Dauer oder Uhrzeit an für mehr.` : null
        multiRoutineTimeAlternatives.value = buildMultiRoutineTimeAlternatives(routines)
        return
      }
    }

    if (parsed.frequencyInPeriod) {
      const slots = distributeNSlots(parsed.frequencyInPeriod, parsed, 0)
      if (slots.length > 0) {
        previewMultiEventSlots.value = slots.map(s => ({ start: s.start, end: s.end }))
        previewReason.value = `${slots.length} Slots in diesem Zeitraum gefunden`
        previewUncertainty.value = slots.length < parsed.frequencyInPeriod ? `Nur ${slots.length} von ${parsed.frequencyInPeriod} freien Slots gefunden.` : null
        return
      }
    }

    if (parsed.intent === 'routine') {
      const routine = buildRoutinePreview(parsed)
      previewRoutine.value = routine
      previewReason.value = routine.reason
      previewUncertainty.value = buildPreviewUncertainty(parsed, true, routine.roundedToHour)
      syncRoutineConflictState(routine)
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
        title: safeTitle,
        description: normalizeOptionalUserText(`Erstellt aus Chat-Eingabe: "${shortenForFeedback(safePrompt, 140)}"`, MAX_LONG_TEXT_LENGTH),
        estimatedMinutes: parsed.durationMinutes,
        deadline: buildTaskDeadline(parsed),
        priority: inferTaskPriority(safePrompt),
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
      summary: safeTitle,
      description: normalizeOptionalUserText(`Geplant aus Chat-Eingabe: "${shortenForFeedback(safePrompt, 140)}"`, MAX_LONG_TEXT_LENGTH),
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
  if (isPlanning.value || !previewEvent.value) return

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
  if (isPlanning.value || !previewTask.value) return

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
  if (isPlanning.value || !previewRoutine.value) return

  isPlanning.value = true
  error.value = null

  try {
    const existingRoutine = preferences.value.routineTemplates.find(entry =>
      entry.title.trim().toLowerCase() === previewRoutine.value!.template.title.trim().toLowerCase() &&
      (entry.repeatMode || 'weekly') === (previewRoutine.value!.template.repeatMode || 'weekly') &&
      entry.day === previewRoutine.value!.template.day &&
      entry.startHour === previewRoutine.value!.template.startHour &&
      entry.endHour === previewRoutine.value!.template.endHour,
    )

    if (!existingRoutine) {
      const safeTemplate = {
        ...previewRoutine.value.template,
        title: normalizeUserText(previewRoutine.value.template.title, MAX_TASK_TITLE_LENGTH),
        description: normalizeOptionalUserText(previewRoutine.value.template.description, MAX_LONG_TEXT_LENGTH),
      }
      updatePreferences({
        routineTemplates: [
          ...preferences.value.routineTemplates,
          safeTemplate,
        ],
      })
    }

    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    const transientEvents: Array<{ summary: string; start: Date; end: Date }> = []

    for (const baseDate of collectRoutineOccurrenceDates(previewRoutine.value.template, 20)) {
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
        summary: normalizeUserText(previewRoutine.value.template.title, MAX_TASK_TITLE_LENGTH),
        description: normalizeOptionalUserText(previewRoutine.value.template.description || 'Aus Planungs-Chat als Routine angelegt', MAX_LONG_TEXT_LENGTH),
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

async function handleCreateMultiRoutines() {
  if (isPlanning.value || previewMultiRoutines.value.length === 0) return
  isPlanning.value = true
  error.value = null

  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    for (const routine of previewMultiRoutines.value) {
      const isDuplicate = preferences.value.routineTemplates.some(e =>
        e.title.trim().toLowerCase() === routine.template.title.trim().toLowerCase()
        && (e.repeatMode || 'weekly') === (routine.template.repeatMode || 'weekly')
        && e.day === routine.template.day
        && e.startHour === routine.template.startHour
        && e.endHour === routine.template.endHour,
      )
      if (!isDuplicate) {
        updatePreferences({
          routineTemplates: [
            ...preferences.value.routineTemplates,
            {
              ...routine.template,
              title: normalizeUserText(routine.template.title, MAX_TASK_TITLE_LENGTH),
              description: normalizeOptionalUserText(routine.template.description, MAX_LONG_TEXT_LENGTH),
            },
          ],
        })
      }

      const transientEvents: Array<{ summary: string; start: Date; end: Date }> = []
      for (const baseDate of collectRoutineOccurrenceDates(routine.template, 20)) {
        const start = new Date(baseDate)
        start.setHours(routine.template.startHour, 0, 0, 0)
        const end = new Date(baseDate)
        end.setHours(routine.template.endHour, 0, 0, 0)
        if (routine.template.endHour <= routine.template.startHour) end.setDate(end.getDate() + 1)
        if (hasMatchingExistingEvent(routine.template.title, start, end, transientEvents)) continue
        const created = await createEvent({
          summary: normalizeUserText(routine.template.title, MAX_TASK_TITLE_LENGTH),
          description: normalizeOptionalUserText(routine.template.description || 'Aus Planungs-Chat als Routine angelegt', MAX_LONG_TEXT_LENGTH),
          start: { dateTime: start.toISOString(), timeZone: tz },
          end: { dateTime: end.toISOString(), timeZone: tz },
        })
        if (created?.id) transientEvents.push({ summary: routine.template.title, start, end })
      }
    }
    emit('created')
    emit('close')
  } catch (err: any) {
    error.value = err.message || calendarError.value || 'Routinen konnten nicht erstellt werden.'
  } finally {
    isPlanning.value = false
  }
}

async function handleCreateMultiEvents() {
  if (isPlanning.value || previewMultiEventSlots.value.length === 0 || !parsedDetails.value) return
  isPlanning.value = true
  error.value = null

  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    const title = normalizeUserText(parsedDetails.value.title, MAX_TASK_TITLE_LENGTH)
    const desc = normalizeOptionalUserText(`Geplant aus Chat-Eingabe: "${shortenForFeedback(prompt.value.trim(), 140)}"`, MAX_LONG_TEXT_LENGTH)
    for (const slot of previewMultiEventSlots.value) {
      await createEvent({
        summary: title,
        description: desc,
        start: { dateTime: slot.start.toISOString(), timeZone: tz },
        end: { dateTime: slot.end.toISOString(), timeZone: tz },
      })
    }
    emit('created')
    emit('close')
  } catch (err: any) {
    error.value = err.message || calendarError.value || 'Termine konnten nicht erstellt werden.'
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
  const repeatMode = parsed.recurrenceMode || 'weekly'

  if (!parsed.recurrenceMode && parsed.recurrenceFrequencyPerWeek) {
    throw new Error(`Für ${parsed.recurrenceFrequencyPerWeek}x pro Woche brauche ich noch klare Tage oder eine Form wie "werktags" oder "täglich".`)
  }

  if (repeatMode === 'weekly' && parsed.recurrenceDay === undefined) {
    throw new Error('Für eine wöchentliche Routine brauche ich einen Wochentag wie "jeden Mittwoch".')
  }

  const baseStartMinutes = parsed.timePreference?.exactStartMinutes ??
    parsed.timePreference?.startMinutes ??
    defaultStartMinutesForPeriod(parsed.preferredPeriod)
  const baseEndMinutes = parsed.timePreference?.endMinutes ?? (baseStartMinutes + parsed.durationMinutes)
  const startHour = Math.max(0, Math.min(23, Math.floor(baseStartMinutes / 60)))
  const endHour = Math.max(startHour + 1, Math.min(24, Math.ceil(baseEndMinutes / 60)))
  const roundedToHour = baseStartMinutes % 60 !== 0 || baseEndMinutes % 60 !== 0
  const nextDate = nextDateForRoutine(parsed)
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
      day: repeatMode === 'weekly' ? parsed.recurrenceDay : undefined,
      repeatMode,
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

function routineCalendarPool() {
  return calendarEvents.value.length > 0 ? calendarEvents.value : props.events
}

function calendarEventWindow(event: CalendarEvent) {
  const startValue = event.start.dateTime || event.start.date
  const endValue = event.end.dateTime || event.end.date
  if (!startValue || !endValue) return null
  return {
    start: new Date(startValue),
    end: new Date(endValue),
  }
}

function buildRoutineWindow(date: Date, startHour: number, endHour: number) {
  const start = new Date(date)
  start.setHours(startHour, 0, 0, 0)
  const end = new Date(date)
  end.setHours(endHour, 0, 0, 0)
  if (endHour <= startHour) {
    end.setDate(end.getDate() + 1)
  }
  return { start, end }
}

function findRoutineConflictingEvents(date: Date, startHour: number, endHour: number) {
  const { start, end } = buildRoutineWindow(date, startHour, endHour)
  return routineCalendarPool().filter((event) => {
    const window = calendarEventWindow(event)
    if (!window) return false
    return window.start < end && window.end > start
  })
}

function formatRoutineShiftLabel(date: Date) {
  return date.toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

function findNextFreeDayForRoutine(routine: RoutinePreview): Date | null {
  for (let daysAhead = 1; daysAhead <= 14; daysAhead++) {
    const candidate = new Date(routine.nextStart)
    candidate.setDate(candidate.getDate() + daysAhead)
    if (findRoutineConflictingEvents(candidate, routine.template.startHour, routine.template.endHour).length === 0) {
      return candidate
    }
  }

  return null
}

function buildRoutineTimeAlternativesForDate(date: Date, startHour: number, endHour: number) {
  const durationHours = Math.max(1, endHour - startHour)
  const alternatives: RoutineTimeSlotOption[] = []
  const earliestHour = Math.max(0, preferences.value.workStartHour)
  const latestHour = Math.min(24, Math.max(earliestHour + durationHours, preferences.value.workEndHour + 2))

  for (let candidateStartHour = earliestHour; candidateStartHour + durationHours <= latestHour; candidateStartHour++) {
    const candidateEndHour = candidateStartHour + durationHours
    if (findRoutineConflictingEvents(date, candidateStartHour, candidateEndHour).length > 0) continue
    alternatives.push({
      startHour: candidateStartHour,
      endHour: candidateEndHour,
      label: `${String(candidateStartHour).padStart(2, '0')}:00 – ${String(candidateEndHour).padStart(2, '0')}:00`,
    })
    if (alternatives.length >= 5) break
  }

  return alternatives
}

function syncRoutineConflictState(routine: RoutinePreview) {
  routineConflict.value = checkRoutineNextOccurrence(routine)
  routineTimeAlternatives.value = buildRoutineTimeAlternativesList(routine)
  showDeleteConflictConfirm.value = false
}

// Berechnet verfügbare Zeitoptionen für Multi-Routinen (6x wöchentlich etc.)
function buildMultiRoutineTimeAlternatives(routines: RoutinePreview[]) {
  return routines.flatMap((routine, dayIndex) => {
    const alternatives = buildRoutineTimeAlternativesForDate(
      routine.nextStart,
      routine.template.startHour,
      routine.template.endHour,
    )

    if (alternatives.length === 0) {
      return []
    }

    return [{
      dayIndex,
      dayLabel: weekdayLabel(routine.template.day ?? 0),
      alternatives,
    }]
  })
}

// Wendet eine Zeitoption auf eine Multi-Routine an
function applyMultiRoutineTimeSlot(dayIndex: number, slot: RoutineTimeSlotOption) {
  if (dayIndex >= previewMultiRoutines.value.length) return

  const routine = previewMultiRoutines.value[dayIndex]
  const { start: nextStart, end: nextEnd } = buildRoutineWindow(routine.nextStart, slot.startHour, slot.endHour)

  previewMultiRoutines.value[dayIndex] = {
    ...routine,
    template: { ...routine.template, startHour: slot.startHour, endHour: slot.endHour },
    nextStart,
    nextEnd,
  }

  multiRoutineTimeAlternatives.value = buildMultiRoutineTimeAlternatives(previewMultiRoutines.value)
}

// Prüft ob die nächste Routine-Ausführung mit bestehenden Terminen kollidiert.
function checkRoutineNextOccurrence(routine: RoutinePreview): RoutineConflictInfo | null {
  const conflicting = findRoutineConflictingEvents(
    routine.nextStart,
    routine.template.startHour,
    routine.template.endHour,
  )

  if (conflicting.length === 0) return null

  const suggestedShiftDate = findNextFreeDayForRoutine(routine)
  return {
    date: new Date(routine.nextStart),
    conflictingEvents: [...conflicting],
    suggestedShiftDate,
    suggestedShiftDayLabel: suggestedShiftDate
      ? formatRoutineShiftLabel(suggestedShiftDate)
      : 'kein freier Tag in den nächsten 14 Tagen',
  }
}

// Berechnet verfügbare Startzeiten am nächsten Routine-Termin zur Auswahl.
function buildRoutineTimeAlternativesList(routine: RoutinePreview): RoutineTimeSlotOption[] {
  return buildRoutineTimeAlternativesForDate(
    routine.nextStart,
    routine.template.startHour,
    routine.template.endHour,
  )
}

// Wendet einen ausgewählten Zeitslot auf die Routine-Vorschau an und prüft erneut auf Konflikte.
function applyRoutineTimeSlot(slot: RoutineTimeSlotOption) {
  if (!previewRoutine.value) return
  const { start: nextStart, end: nextEnd } = buildRoutineWindow(previewRoutine.value.nextStart, slot.startHour, slot.endHour)
  previewRoutine.value = {
    ...previewRoutine.value,
    template: { ...previewRoutine.value.template, startHour: slot.startHour, endHour: slot.endHour },
    nextStart,
    nextEnd,
    reason: `${previewRoutine.value.reason.split(' · ')[0]} · ${slot.label}`,
  }
  syncRoutineConflictState(previewRoutine.value)
}

// Verschiebt die Routine auf den vorgeschlagenen nächsten freien Tag.
function handleShiftRoutine() {
  if (!routineConflict.value?.suggestedShiftDate || !previewRoutine.value) return
  const shiftDate = routineConflict.value.suggestedShiftDate
  const newDay = shiftDate.getDay()
  const { start: nextStart, end: nextEnd } = buildRoutineWindow(
    shiftDate,
    previewRoutine.value.template.startHour,
    previewRoutine.value.template.endHour,
  )
  previewRoutine.value = {
    ...previewRoutine.value,
    template: { ...previewRoutine.value.template, day: newDay },
    nextStart,
    nextEnd,
    reason: `Verschoben auf ${formatRoutineShiftLabel(shiftDate)}`,
  }
  syncRoutineConflictState(previewRoutine.value)
}

// Bricht die aktuelle Routine-Planung ab und setzt den Zustand zurück.
function handleDiscardRoutine() {
  previewRoutine.value = null
  previewMultiRoutines.value = []
  parsedDetails.value = null
  routineConflict.value = null
  showDeleteConflictConfirm.value = false
  routineTimeAlternatives.value = []
  multiRoutineTimeAlternatives.value = []
  previewReason.value = null
  previewUncertainty.value = null
}

// Löscht den kollidierenden Termin und erstellt danach die Routine.
async function handleDeleteConflictAndInsertRoutine() {
  if (!routineConflict.value || !previewRoutine.value) return

  // Erst Bestätigung einholen, dann ausführen
  if (!showDeleteConflictConfirm.value) {
    showDeleteConflictConfirm.value = true
    return
  }

  isPlanning.value = true
  error.value = null
  try {
    for (const event of routineConflict.value.conflictingEvents) {
      if (!event.id) continue
      const deleted = await deleteEvent(event.id)
      if (!deleted) {
        throw new Error(`"${event.summary || 'Termin'}" konnte nicht gelöscht werden.`)
      }
    }
    routineConflict.value = null
    showDeleteConflictConfirm.value = false
    isPlanning.value = false
    await handleCreateRoutine()
  }
  catch (err: any) {
    error.value = err.message || 'Löschen des Termins fehlgeschlagen.'
  }
  finally {
    isPlanning.value = false
  }
}

function distributeNSlots(count: number, parsed: ParsedPlanningRequest, minGapDays: number): SlotSuggestion[] {
  const from = new Date()
  from.setHours(0, 0, 0, 0)
  const to = new Date(from)
  to.setDate(from.getDate() + Math.max(14, count * 3))

  const searchParsed = { ...parsed, dateFrom: from, dateTo: to }
  const allSlots = findFreeSlots(from, to, props.events, buildChatPlanningPreferences(searchParsed))

  const selected: SlotSuggestion[] = []
  let lastDayNum = -Infinity

  for (const slot of allSlots) {
    if (selected.length >= count) break
    const dayNum = Math.floor(slot.start.getTime() / 86400000)
    if (selected.some(s => s.start.toDateString() === slot.start.toDateString())) continue
    if (dayNum - lastDayNum < minGapDays) continue
    selected.push(slot)
    lastDayNum = dayNum
  }

  return selected
}

function buildMultiRoutineFromSlots(parsed: ParsedPlanningRequest, slots: SlotSuggestion[]): RoutinePreview[] {
  return slots.map((slot) => {
    const startHour = slot.start.getHours()
    const endHour = slot.end.getHours() || startHour + 1
    const day = slot.start.getDay()
    return {
      template: {
        id: uuidv4(),
        title: parsed.title,
        day,
        repeatMode: 'weekly' as const,
        startHour,
        endHour,
        description: `Aus Planungs-Chat erstellt: "${prompt.value.trim()}"`,
      },
      nextStart: slot.start,
      nextEnd: slot.end,
      roundedToHour: false,
      reason: `${weekdayLabel(day)} um ${String(startHour).padStart(2, '0')}:00`,
    }
  })
}

function buildMultiRoutineFromWeekdays(parsed: ParsedPlanningRequest, weekdays: number[]): RoutinePreview[] {
  const baseStartMinutes = parsed.timePreference?.exactStartMinutes
    ?? parsed.timePreference?.startMinutes
    ?? defaultStartMinutesForPeriod(parsed.preferredPeriod)
  const baseEndMinutes = parsed.timePreference?.endMinutes ?? (baseStartMinutes + parsed.durationMinutes)
  const startHour = Math.max(0, Math.min(23, Math.floor(baseStartMinutes / 60)))
  const endHour = Math.max(startHour + 1, Math.min(24, Math.ceil(baseEndMinutes / 60)))
  const roundedToHour = baseStartMinutes % 60 !== 0 || baseEndMinutes % 60 !== 0

  return weekdays.map((day) => {
    const nextDate = nextDateForWeekday(day, 0, new Date())
    const nextStart = new Date(nextDate)
    nextStart.setHours(startHour, 0, 0, 0)
    const nextEnd = new Date(nextDate)
    nextEnd.setHours(endHour, 0, 0, 0)
    return {
      template: {
        id: uuidv4(),
        title: parsed.title,
        day,
        repeatMode: 'weekly' as const,
        startHour,
        endHour,
        description: `Aus Planungs-Chat erstellt: "${prompt.value.trim()}"`,
      },
      nextStart,
      nextEnd,
      roundedToHour,
      reason: `${weekdayLabel(day)} um ${String(startHour).padStart(2, '0')}:00`,
    }
  })
}

function nextDateForRoutine(parsed: ParsedPlanningRequest) {
  const repeatMode = parsed.recurrenceMode || 'weekly'
  const now = new Date()
  const cursor = new Date(now)
  cursor.setHours(0, 0, 0, 0)

  if (repeatMode === 'daily') {
    return cursor
  }

  if (repeatMode === 'workdays') {
    const workDays = preferences.value.workDays?.length ? preferences.value.workDays : [1, 2, 3, 4, 5]
    for (let offset = 0; offset < 14; offset++) {
      const candidate = new Date(cursor)
      candidate.setDate(cursor.getDate() + offset)
      if (workDays.includes(candidate.getDay())) {
        return candidate
      }
    }
    return cursor
  }

  return nextDateForWeekday(parsed.recurrenceDay!, 0, now)
}

function collectRoutineOccurrenceDates(template: RoutineTemplate, limit: number) {
  const occurrences: Date[] = []
  const repeatMode = template.repeatMode || 'weekly'
  const cursor = new Date()
  cursor.setHours(0, 0, 0, 0)

  if (repeatMode === 'daily') {
    for (let offset = 0; offset < limit; offset++) {
      const candidate = new Date(cursor)
      candidate.setDate(cursor.getDate() + offset)
      occurrences.push(candidate)
    }
    return occurrences
  }

  if (repeatMode === 'workdays') {
    const workDays = preferences.value.workDays?.length ? preferences.value.workDays : [1, 2, 3, 4, 5]
    for (let offset = 0; offset < 28 && occurrences.length < limit; offset++) {
      const candidate = new Date(cursor)
      candidate.setDate(cursor.getDate() + offset)
      if (workDays.includes(candidate.getDay())) {
        occurrences.push(candidate)
      }
    }
    return occurrences
  }

  for (let weekOffset = 0; weekOffset < limit; weekOffset++) {
    occurrences.push(nextDateForWeekday(template.day!, weekOffset, new Date()))
  }

  return occurrences
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
  const suggestionPools = new Map<string, PreviewAlternative[]>()
  const seen = new Set<string>()
  const baseCandidates = collectSlotCandidates(parsed)
  const primaryCandidate = baseCandidates[0]
  const primaryDay = primaryCandidate ? startOfPreviewDay(primaryCandidate.start) : null
  const primaryDayKey = primaryDay ? toPreviewDayKey(primaryDay) : null
  const maxSuggestions = 12
  const maxPerDay = 4

  const addCandidatesToPool = (
    candidates: SlotSuggestion[],
    suffixReason?: string,
  ) => {
    for (const candidate of candidates) {
      const key = `${candidate.start.toISOString()}-${candidate.end.toISOString()}`
      if (seen.has(key)) continue
      const dayKey = toPreviewDayKey(candidate.start)
      seen.add(key)
      const entries = suggestionPools.get(dayKey) || []
      entries.push({
        key,
        dayKey,
        label: `${formatPreview(candidate.start.toISOString())} bis ${formatPreview(candidate.end.toISOString())}`,
        reason: suffixReason ? `${candidate.reason} ${suffixReason}` : candidate.reason,
        start: candidate.start,
        end: candidate.end,
        isPrimary: false,
      })
      suggestionPools.set(dayKey, entries)
    }
  }

  if (primaryDay) {
    addCandidatesToPool(
      baseCandidates.filter(candidate => isSamePreviewDay(candidate.start, primaryDay)),
    )
  } else {
    addCandidatesToPool(baseCandidates)
  }

  if (primaryDay) {
    const sameDayParsed = {
      ...parsed,
      dateFrom: new Date(primaryDay),
      dateTo: new Date(primaryDay),
      hasExplicitDate: true,
    }

    if (parsed.timePreference) {
      const relaxedSameDayParsed = {
        ...sameDayParsed,
        timePreference: undefined,
      }
      addCandidatesToPool(
        collectSlotCandidates(relaxedSameDayParsed),
        'Alternative am selben Tag mit gelockerter Uhrzeit.',
      )
    }

    if (parsed.preferredPeriod !== 'any') {
      const relaxedPeriodParsed = {
        ...sameDayParsed,
        preferredPeriod: 'any' as const,
      }
      addCandidatesToPool(
        collectSlotCandidates(relaxedPeriodParsed),
        'Alternative am selben Tag außerhalb des ursprünglichen Zeitfensters.',
      )
    }

    // Erweiterte Zeitfenster um die gewünschte Zeit herum generieren
    if (parsed.timePreference?.exactStartMinutes !== undefined) {
      const exactHour = Math.floor(parsed.timePreference.exactStartMinutes / 60)
      const durationMs = parsed.durationMinutes * 60 * 1000

      for (let hourOffset = -2; hourOffset <= 2; hourOffset++) {
        if (hourOffset === 0) continue
        const alternativeHour = exactHour + hourOffset
        if (alternativeHour < 6 || alternativeHour > 22) continue

        const extendedParsed = {
          ...sameDayParsed,
          timePreference: {
            label: `ca. ${String(alternativeHour).padStart(2, '0')}:00`,
            startMinutes: alternativeHour * 60,
            endMinutes: (alternativeHour * 60) + parsed.durationMinutes,
          },
        }
        addCandidatesToPool(
          collectSlotCandidates(extendedParsed),
          `Alternativ ${hourOffset > 0 ? '+' : ''}${hourOffset}h von Wunschzeit.`,
        )
      }
    }
  }

  if (primaryDay) {
    addCandidatesToPool(
      baseCandidates.filter(candidate => !isSamePreviewDay(candidate.start, primaryDay)),
      'Weitere Option an einem anderen Tag.',
    )
  }

  const orderedDayKeys = [
    ...(primaryDayKey ? [primaryDayKey] : []),
    ...[...suggestionPools.keys()].filter(dayKey => dayKey !== primaryDayKey).sort(),
  ]

  const suggestions: PreviewAlternative[] = []
  for (const dayKey of orderedDayKeys) {
    const pool = suggestionPools.get(dayKey) || []
    const selected = selectDiverseSuggestionsForDay(pool, parsed, maxPerDay)
    suggestions.push(...selected)
    if (suggestions.length >= maxSuggestions) break
  }

  if (suggestions.length < 3) {
    const extendedParsed = {
      ...parsed,
      dateTo: addPreviewDays(parsed.dateTo, 14),
      hasExplicitDate: false,
    }
    const fallbackSuggestions = collectSlotCandidates(extendedParsed)
      .filter(candidate => !suggestions.some(entry => entry.key === `${candidate.start.toISOString()}-${candidate.end.toISOString()}`))
      .slice(0, 3 - suggestions.length)
      .map(candidate => ({
        key: `${candidate.start.toISOString()}-${candidate.end.toISOString()}`,
        dayKey: toPreviewDayKey(candidate.start),
        label: `${formatPreview(candidate.start.toISOString())} bis ${formatPreview(candidate.end.toISOString())}`,
        reason: `${candidate.reason} Alternative auf einem späteren freien Tag mit ähnlicher Zeitlage.`,
        start: candidate.start,
        end: candidate.end,
        isPrimary: false,
      }))
    suggestions.push(...fallbackSuggestions)
  }

  return suggestions.slice(0, maxSuggestions).map((suggestion, index) => ({
    ...suggestion,
    isPrimary: index === 0,
  }))
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

function startOfPreviewDay(date: Date) {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function isSamePreviewDay(date: Date, day: Date) {
  return date.getFullYear() === day.getFullYear() &&
    date.getMonth() === day.getMonth() &&
    date.getDate() === day.getDate()
}

function toPreviewDayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatSuggestionDay(date: Date) {
  const now = new Date()
  const sameYear = date.getFullYear() === now.getFullYear()
  return date.toLocaleDateString('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

function selectDiverseSuggestionsForDay(
  pool: PreviewAlternative[],
  parsed: ParsedPlanningRequest,
  maxCount: number,
) {
  if (pool.length <= maxCount) return pool

  const selected: PreviewAlternative[] = [pool[0]]
  const remaining = pool.slice(1)

  while (selected.length < maxCount && remaining.length > 0) {
    let bestIndex = 0
    let bestScore = -Infinity

    for (let index = 0; index < remaining.length; index++) {
      const candidate = remaining[index]
      const score = buildSuggestionDiversityScore(candidate, selected, parsed)
      if (score > bestScore) {
        bestScore = score
        bestIndex = index
      }
    }

    selected.push(remaining.splice(bestIndex, 1)[0])
  }

  return selected.sort((a, b) => a.start.getTime() - b.start.getTime())
}

function buildSuggestionDiversityScore(
  candidate: PreviewAlternative,
  selected: PreviewAlternative[],
  parsed: ParsedPlanningRequest,
) {
  const candidateMinutes = (candidate.start.getHours() * 60) + candidate.start.getMinutes()
  const nearestDistance = Math.min(
    ...selected.map(entry => Math.abs(candidateMinutes - ((entry.start.getHours() * 60) + entry.start.getMinutes()))),
  )

  let score = nearestDistance

  if (parsed.timePreference?.exactStartMinutes !== undefined) {
    score += Math.abs(candidateMinutes - parsed.timePreference.exactStartMinutes) * 0.35
  } else if (parsed.timePreference?.startMinutes !== undefined) {
    score += Math.abs(candidateMinutes - parsed.timePreference.startMinutes) * 0.2
  }

  return score
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

  if (parsed.ambiguityHints.length > 0) {
    return parsed.ambiguityHints[0]
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

async function applyClarification(option: ClarificationOption) {
  if (isPlanning.value) return
  prompt.value = option.promptValue
  await handlePlan()
}

function applyWeekdayQualifier(text: string, weekday: string, qualifier: 'diesen' | 'nächsten') {
  const escapedWeekday = weekday.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const hasQualifier = new RegExp(`\\b(diesen|dieses|kommenden|naechsten|nächsten)\\s+${escapedWeekday}\\b`, 'i')
  if (hasQualifier.test(text)) {
    return text.replace(hasQualifier, `${qualifier} ${weekday}`)
  }

  return text.replace(new RegExp(`\\b${escapedWeekday}\\b`, 'i'), `${qualifier} ${weekday}`)
}

function prependDateClarifier(text: string, fragment: string) {
  const normalizedPrompt = normalizeText(text)
  const normalizedFragment = normalizeText(fragment)
  if (normalizedPrompt.includes(normalizedFragment)) return text
  return `${fragment} ${text}`.trim()
}

function appendExactTime(text: string, timeLabel: string) {
  const normalizedPrompt = normalizeText(text)
  const compactTime = normalizeText(timeLabel)
  if (normalizedPrompt.includes(`${compactTime} uhr`) || normalizedPrompt.includes(compactTime)) {
    return text
  }

  return `${text} um ${timeLabel} Uhr`.trim()
}

async function handleRetryCalendarAction() {
  await retryLastAction()
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
                  :maxlength="MAX_CHAT_PROMPT_LENGTH"
                  placeholder="z.B. Meeting morgen um 14 Uhr, Hausarbeit 3h diese Woche oder jeden Mittwoch Gym 18 bis 20 Uhr"
                />
                <div class="mt-2 flex items-center justify-between gap-3 text-[11px] text-text-muted">
                  <span>Natürliche Sprache reicht. Datum, Uhrzeit und Dauer werden lokal eingegrenzt, damit der Vorschlag stabil bleibt.</span>
                  <span>{{ promptCharactersLeft }} Zeichen frei</span>
                </div>

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
                <div class="flex items-center justify-between gap-3">
                  <span>{{ syncStatus.message }}</span>
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

                <p v-if="interpretedPromptSummary" class="mt-3 text-xs text-text-muted">
                  {{ interpretedPromptSummary }}
                </p>

                <div v-if="clarificationOptions.length > 0" class="mt-4 rounded-glass border border-accent-blue/15 bg-accent-blue/8 p-3">
                  <div class="flex items-center justify-between gap-2">
                    <div class="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent-blue">Kurz klären</div>
                    <div class="text-[11px] text-text-muted">1 Klick schärft den Prompt</div>
                  </div>
                  <div class="mt-3 flex flex-wrap gap-2">
                    <button
                      v-for="option in clarificationOptions"
                      :key="option.key"
                      type="button"
                      class="rounded-full border border-accent-blue/20 bg-white/[0.06] px-3 py-2 text-left text-xs text-accent-blue transition hover:border-accent-blue/35 hover:bg-white/[0.1] disabled:opacity-50"
                      :disabled="isPlanning"
                      @click="applyClarification(option)"
                    >
                      <span class="font-medium">{{ option.label }}</span>
                      <span class="ml-1 text-text-secondary">{{ option.detail }}</span>
                    </button>
                  </div>
                </div>

                <DecisionSummaryCard
                  v-if="previewReason || previewUncertainty || previewAlternatives.length > 0"
                  class="mt-4"
                  :title="'Warum diese Entscheidung?'"
                  :mode-label="decisionCardModeLabel"
                  :tone="decisionCardTone"
                  :why="previewReason ? [previewReason] : []"
                  :uncertainty="previewUncertainty"
                  :alternatives="[]"
                  :next-step="decisionCardNextStep"
                />
                <div v-if="previewSuggestionGroups.length > 0" class="mt-4">
                    <div class="flex items-center justify-between gap-2">
                      <div class="text-[11px] font-medium uppercase tracking-[0.2em] text-text-muted">Zeit wählen</div>
                      <div class="text-[11px] text-text-muted">{{ previewAlternatives.length }} Optionen verfügbar</div>
                    </div>
                    <div class="mt-2 max-h-64 space-y-2 overflow-y-auto pr-1">
                      <div
                        v-for="group in previewSuggestionGroups"
                        :key="group.dayKey"
                        class="rounded-xl border border-border-subtle bg-white/[0.03] p-3"
                      >
                        <div class="flex items-center justify-between gap-2">
                          <div class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">{{ group.dayLabel }}</div>
                          <div class="text-[11px] text-text-muted">{{ group.suggestions.length }} Zeiten</div>
                        </div>
                        <div class="mt-3 space-y-2">
                          <button
                            v-for="alternative in group.suggestions"
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
                  <!-- Routine-Vorschau -->
                  <div class="rounded-glass border border-accent-green/20 bg-accent-green/10 p-4">
                    <p class="text-sm font-medium text-text-primary">{{ previewRoutine.template.title }}</p>
                    <p class="mt-1 text-sm text-text-secondary">
                      {{ weekdayLabel(previewRoutine.template.day ?? 0) }},
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

                  <!-- Zeitslot-Auswahl: verfügbare Uhrzeiten am gleichen Tag -->
                  <div v-if="routineTimeAlternatives.length > 0" class="rounded-glass border bg-white/[0.03] p-3" :class="routineConflict ? 'border-priority-high/30' : 'border-border-subtle'">
                    <div class="flex items-center justify-between gap-2">
                      <div class="text-[11px] font-semibold uppercase tracking-[0.2em]" :class="routineConflict ? 'text-priority-high' : 'text-text-muted'">
                        {{ routineConflict ? 'Zeitslot belegt — Freie Uhrzeiten' : 'Freie Uhrzeiten am ' + weekdayLabel(previewRoutine.template.day ?? 0) }}
                      </div>
                      <div class="text-[11px] text-text-muted">Klick zum Übernehmen</div>
                    </div>
                    <p v-if="routineConflict" class="mt-1 text-xs text-text-secondary">
                      {{ routineConflict.conflictingEvents.map(e => e.summary || 'Termin').join(', ') }} belegt {{ String(previewRoutine.template.startHour).padStart(2, '0') }}:00. Wähle eine andere Uhrzeit:
                    </p>
                    <div class="mt-2 flex flex-wrap gap-2">
                      <button
                        v-for="slot in routineTimeAlternatives"
                        :key="slot.startHour"
                        type="button"
                        class="rounded-full border px-3 py-1.5 text-xs font-medium transition"
                        :class="previewRoutine.template.startHour === slot.startHour
                          ? 'border-accent-green/40 bg-accent-green/15 text-accent-green'
                          : 'border-border-subtle bg-white/[0.04] text-text-secondary hover:border-border-medium hover:bg-white/[0.07] hover:text-text-primary'"
                        :disabled="isPlanning"
                        @click="applyRoutineTimeSlot(slot)"
                      >
                        {{ slot.label }}
                      </button>
                    </div>
                  </div>

                  <!-- Konflikt-Panel: Tag ist wirklich voll (keine freien Alternativen mehr) -->
                  <div v-if="routineConflict && routineTimeAlternatives.length === 0" class="rounded-glass border border-priority-high/35 bg-priority-high/10 p-4">
                    <div class="flex items-start gap-3">
                      <svg class="mt-0.5 h-4 w-4 flex-shrink-0 text-priority-high" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      </svg>
                      <div class="flex-1">
                        <p class="text-sm font-medium text-priority-high">Kein freier Termin an diesem Tag gefunden</p>
                        <p class="mt-1 text-xs text-text-secondary">
                          {{ routineConflict.conflictingEvents.map(e => e.summary || 'Termin').join(', ') }} belegt diesen Zeitslot bereits. Wie möchtest du vorgehen?
                        </p>
                      </div>
                    </div>

                    <!-- Konflikt-Optionen -->
                    <div class="mt-3 space-y-2">
                      <!-- Option 1: Verschieben (nicht destruktiv, zuerst zeigen) -->
                      <button
                        v-if="routineConflict.suggestedShiftDate"
                        type="button"
                        class="w-full rounded-xl border border-accent-blue/25 bg-accent-blue/10 px-4 py-2.5 text-left text-sm text-accent-blue transition hover:border-accent-blue/40 hover:bg-accent-blue/15 disabled:opacity-50"
                        :disabled="isPlanning"
                        @click="handleShiftRoutine"
                      >
                        <div class="font-medium">Routine um einen Tag verschieben</div>
                        <div class="mt-0.5 text-xs text-text-secondary">Nächster freier Tag: {{ routineConflict.suggestedShiftDayLabel }}</div>
                      </button>
                      <div v-else class="rounded-xl border border-border-subtle bg-white/[0.03] px-4 py-2.5 text-xs text-text-muted">
                        Kein freier Alternativtag in den nächsten 14 Tagen gefunden.
                      </div>

                      <!-- Option 2: Bestehenden Termin löschen + Gym einfügen (destruktiv, Bestätigung nötig) -->
                      <div v-if="!showDeleteConflictConfirm">
                        <button
                          type="button"
                          class="w-full rounded-xl border border-priority-high/25 bg-priority-high/8 px-4 py-2.5 text-left text-sm text-[#FFD3DC] transition hover:border-priority-high/40 hover:bg-priority-high/12 disabled:opacity-50"
                          :disabled="isPlanning"
                          @click="handleDeleteConflictAndInsertRoutine"
                        >
                          <div class="font-medium">Bestehenden Termin löschen und Routine einfügen</div>
                          <div class="mt-0.5 text-xs text-text-secondary">Löscht: {{ routineConflict.conflictingEvents.map(e => e.summary || 'Termin').join(', ') }}</div>
                        </button>
                      </div>
                      <!-- Bestätigungs-Schritt für die destruktive Aktion -->
                      <div v-else class="rounded-xl border border-priority-critical/35 bg-priority-critical/12 p-3">
                        <p class="text-xs font-medium text-[#FFD3DC]">Sicher? Diese Aktion löscht den bestehenden Termin unwiderruflich.</p>
                        <div class="mt-2 flex gap-2">
                          <button
                            type="button"
                            class="flex-1 rounded-lg border border-priority-critical/30 bg-priority-critical/15 px-3 py-1.5 text-xs font-medium text-[#FFD3DC] transition hover:bg-priority-critical/20 disabled:opacity-50"
                            :disabled="isPlanning"
                            @click="handleDeleteConflictAndInsertRoutine"
                          >
                            Ja, löschen und einfügen
                          </button>
                          <button
                            type="button"
                            class="flex-1 rounded-lg border border-border-subtle bg-white/[0.04] px-3 py-1.5 text-xs text-text-secondary transition hover:bg-white/[0.07]"
                            @click="showDeleteConflictConfirm = false"
                          >
                            Abbrechen
                          </button>
                        </div>
                      </div>

                      <!-- Option 3: Routine verwerfen -->
                      <button
                        type="button"
                        class="w-full rounded-xl border border-border-subtle bg-white/[0.03] px-4 py-2.5 text-left text-sm text-text-muted transition hover:border-border-medium hover:bg-white/[0.06] hover:text-text-secondary disabled:opacity-50"
                        :disabled="isPlanning"
                        @click="handleDiscardRoutine"
                      >
                        Termin verwerfen
                      </button>
                    </div>
                  </div>

                  <!-- Duplikat-Warnungen -->
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

                  <!-- Speichern-Button: nur wenn kein offener Konflikt -->
                  <button
                    v-if="!routineConflict"
                    type="button"
                    class="btn-accent-green w-full px-4 py-3 text-sm disabled:opacity-50"
                    :disabled="isPlanning"
                    @click="handleCreateRoutine"
                  >
                    Routine speichern
                  </button>
                </div>

                <div v-else-if="previewMultiRoutines.length > 0 && parsedDetails" class="mt-4 space-y-3">
                  <div class="rounded-glass border border-accent-green/20 bg-accent-green/10 p-4">
                    <p class="text-sm font-medium text-text-primary">{{ parsedDetails.title }}</p>
                    <p class="mt-1 text-sm text-text-secondary">{{ previewMultiRoutines.length }}x wöchentlich als Routinen</p>
                    
                    <!-- Zeitoptionen pro Tag -->
                    <div v-if="multiRoutineTimeAlternatives.length > 0" class="mt-4 space-y-3">
                      <div class="text-[11px] font-semibold uppercase tracking-[0.2em] text-text-muted">
                        Zeit anpassen (klick auf Option)
                      </div>
                      <div
                        v-for="alt in multiRoutineTimeAlternatives"
                        :key="alt.dayIndex"
                        class="rounded-xl border border-border-subtle bg-white/[0.03] p-3"
                      >
                        <div class="text-xs font-medium text-text-primary mb-2">{{ alt.dayLabel }}</div>
                        <div class="flex flex-wrap gap-2">
                          <button
                            v-for="slot in alt.alternatives"
                            :key="slot.startHour"
                            type="button"
                            class="rounded-full border px-3 py-1.5 text-xs font-medium transition"
                            :class="previewMultiRoutines[alt.dayIndex]?.template.startHour === slot.startHour
                              ? 'border-accent-green/40 bg-accent-green/15 text-accent-green'
                              : 'border-border-subtle bg-white/[0.04] text-text-secondary hover:border-border-medium hover:bg-white/[0.07] hover:text-text-primary'"
                            :disabled="isPlanning"
                            @click="applyMultiRoutineTimeSlot(alt.dayIndex, slot)"
                          >
                            {{ slot.label }}
                          </button>
                        </div>
                      </div>
                    </div>

                    <!-- Aktuelle Zeiten -->
                    <div class="mt-3 space-y-1">
                      <div
                        v-for="(routine, i) in previewMultiRoutines"
                        :key="i"
                        class="flex items-center gap-2 text-sm text-text-secondary"
                      >
                        <span class="text-accent-green">·</span>
                        {{ weekdayLabel(routine.template.day ?? 0) }},
                        {{ String(routine.template.startHour).padStart(2, '0') }}:00 – {{ String(routine.template.endHour).padStart(2, '0') }}:00
                        <span v-if="multiRoutineTimeAlternatives.some(a => a.dayIndex === i)" class="text-[10px] text-text-muted">
                          ({{ multiRoutineTimeAlternatives.find(a => a.dayIndex === i)?.alternatives.length ?? 0 }} Optionen)
                        </span>
                      </div>
                    </div>
                    <p class="mt-3 text-sm text-accent-green">
                      Wird als {{ previewMultiRoutines.length }} Routine-Vorlagen gespeichert und jeweils für 4 Wochen eingetragen
                    </p>
                  </div>
                  <button
                    type="button"
                    class="btn-accent-green w-full px-4 py-3 text-sm disabled:opacity-50"
                    :disabled="isPlanning"
                    @click="handleCreateMultiRoutines"
                  >
                    {{ previewMultiRoutines.length }} Routinen speichern
                  </button>
                </div>

                <div v-else-if="previewMultiEventSlots.length > 0 && parsedDetails" class="mt-4 space-y-3">
                  <div class="rounded-glass border border-accent-blue/20 bg-accent-blue/10 p-4">
                    <p class="text-sm font-medium text-text-primary">{{ parsedDetails.title }}</p>
                    <p class="mt-1 text-sm text-text-secondary">{{ previewMultiEventSlots.length }} Termine in diesem Zeitraum</p>
                    <div class="mt-3 space-y-1">
                      <div
                        v-for="(slot, i) in previewMultiEventSlots"
                        :key="i"
                        class="flex items-center gap-2 text-sm text-text-secondary"
                      >
                        <span class="text-accent-blue">·</span>
                        {{ formatPreview(slot.start.toISOString()) }} –
                        {{ slot.end.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) }}
                      </div>
                    </div>
                    <p class="mt-3 text-sm text-accent-blue">
                      Werden als {{ previewMultiEventSlots.length }} einzelne Kalendertermine eingetragen
                    </p>
                  </div>
                  <button
                    type="button"
                    class="btn-primary w-full px-4 py-3 text-sm disabled:opacity-50"
                    :disabled="isPlanning"
                    @click="handleCreateMultiEvents"
                  >
                    {{ previewMultiEventSlots.length }} Termine erstellen
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
                <div class="flex items-center justify-between gap-3">
                  <span>{{ syncStatus.message }}</span>
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



