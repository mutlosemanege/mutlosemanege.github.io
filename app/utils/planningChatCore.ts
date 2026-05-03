export type PlanningIntent = 'event' | 'task' | 'routine'
export type PreferredPeriod = 'morning' | 'afternoon' | 'evening' | 'any'

export interface PlanningTimePreference {
  startMinutes?: number
  endMinutes?: number
  exactStartMinutes?: number
  label: string
}

export interface ParsedPlanningRequest {
  title: string
  durationMinutes: number
  dateFrom: Date
  dateTo: Date
  hasExplicitDate: boolean
  preferredPeriod: PreferredPeriod
  intent: PlanningIntent
  recurrenceMode?: 'weekly' | 'workdays' | 'daily'
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

interface RecurrenceMatch {
  repeatMode: 'weekly' | 'workdays' | 'daily'
  day: number
  label: string
}

export function parsePlanningPrompt(
  text: string,
  fallbackDuration: number,
  intentMode: 'auto' | PlanningIntent = 'auto',
  now = new Date(),
): ParsedPlanningRequest {
  const normalized = normalizeText(text)
  const dateFrom = new Date(now)
  const dateTo = new Date(now)
  dateTo.setDate(dateTo.getDate() + 7)

  let multipleWeekdays = extractMultipleWeekdays(normalized)
  const recurrenceFrequencyPerWeek = extractRecurrenceFrequencyPerWeek(normalized)
  const restDayHint = extractRestDay(normalized)

  // For 6x/week + explicit rest day: auto-compute the 6 active weekdays
  if (!multipleWeekdays && recurrenceFrequencyPerWeek === 6 && restDayHint !== null) {
    multipleWeekdays = [1, 2, 3, 4, 5, 6, 0].filter(d => d !== restDayHint)
  }

  const cyclePattern = extractCyclePattern(normalized)

  // Cycle pattern + explicit frequency: compute weekdays from rhythm
  if (!multipleWeekdays && cyclePattern && recurrenceFrequencyPerWeek) {
    const computed = computeWeekdaysFromCycle(cyclePattern.trainDays, cyclePattern.restDays, recurrenceFrequencyPerWeek)
    if (computed.length === recurrenceFrequencyPerWeek) {
      multipleWeekdays = computed
    }
  }

  // Cycle pattern without explicit frequency: derive frequency from cycle within 7 days
  if (!multipleWeekdays && cyclePattern && !recurrenceFrequencyPerWeek && !restDayHint) {
    const computed = computeWeekdaysFromCycle(cyclePattern.trainDays, cyclePattern.restDays)
    if (computed.length >= 2) {
      multipleWeekdays = computed
    }
  }

  const recurrence = multipleWeekdays ? null : extractRecurrence(normalized)
  const frequencyInPeriod = recurrenceFrequencyPerWeek === null ? extractFrequencyInPeriod(normalized) : null
  const timePreference = extractTimePreference(normalized, fallbackDuration)
  const preferredPeriod = extractPreferredPeriod(normalized)
  const explicitDate = extractSpecificDate(normalized, now) ?? extractNamedAnnualDate(normalized, now)
  const weekday = recurrence?.day ?? (multipleWeekdays ? multipleWeekdays[0] : null) ?? extractWeekday(normalized)
  const weekdayReferenceMode = extractWeekdayReferenceMode(normalized)
  let hasExplicitDate = false
  let rangeMode: 'exact-day' | 'next-week' | 'this-week' | 'weekend' | 'open' = 'open'

  if (explicitDate) {
    hasExplicitDate = true
    rangeMode = 'exact-day'
    dateFrom.setTime(explicitDate.getTime())
    dateTo.setTime(explicitDate.getTime())
  } else if (normalized.includes('uebermorgen')) {
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
      : resolveWeekdayReferenceDate(weekday, weekdayReferenceMode, now)

    if (targetDate) {
      hasExplicitDate = true
      dateFrom.setTime(targetDate.getTime())
      dateTo.setTime(targetDate.getTime())
    }
  }

  const explicitDuration = extractDuration(text)
  const title = buildCleanTitle(normalized)
  const effectiveRecurrenceForIntent = recurrence ?? (multipleWeekdays ? { day: multipleWeekdays[0], label: 'multi-day', repeatMode: 'weekly' as const } : null)
  const intent = detectIntent(text, effectiveRecurrenceForIntent, recurrenceFrequencyPerWeek, intentMode)
  const ambiguityHints = buildAmbiguityHints({
    hasExplicitDate,
    preferredPeriod,
    timePreference,
    weekday,
    weekdayReferenceMode,
    rangeMode,
    intent,
    recurrenceFrequencyPerWeek,
    multipleWeekdays,
    frequencyInPeriod,
    restDayHint,
    cyclePattern,
  })

  return {
    title: title || 'Neuer Eintrag',
    durationMinutes: explicitDuration ?? fallbackDuration,
    dateFrom,
    dateTo,
    hasExplicitDate,
    preferredPeriod,
    intent,
    recurrenceMode: recurrence?.repeatMode,
    recurrenceDay: recurrence?.day,
    recurrenceLabel: multipleWeekdays ? `${multipleWeekdays.length}x wöchentlich` : recurrence?.label,
    recurrenceFrequencyPerWeek,
    multipleWeekdays: multipleWeekdays ?? undefined,
    frequencyInPeriod: frequencyInPeriod ?? undefined,
    timePreference,
    restDayHint: restDayHint ?? undefined,
    cyclePattern: cyclePattern ?? undefined,
    ambiguityHints,
  }
}

export function detectIntent(
  text: string,
  recurrence: { day: number; label: string } | null,
  recurrenceFrequencyPerWeek: number | null,
  intentMode: 'auto' | PlanningIntent = 'auto',
): PlanningIntent {
  if (intentMode === 'event') return 'event'
  if (intentMode === 'task') return 'task'
  if (intentMode === 'routine') return 'routine'

  const normalized = normalizeText(text)
  const taskHints = ['lernen', 'videoschnitt', 'video', 'schnitt', 'schneiden', 'bearbeiten', 'vorbereiten', 'schreiben', 'bauen', 'erledigen', 'review', 'recherche', 'arbeiten']
  const eventHints = ['treffen', 'call', 'meeting', 'mittag', 'essen', 'arzt', 'termin', 'party', 'date', 'feier']

  if (recurrence || recurrenceFrequencyPerWeek !== null) return 'routine'

  const taskMatches = taskHints.filter(hint => normalized.includes(hint)).length
  const eventMatches = eventHints.filter(hint => normalized.includes(hint)).length

  if (taskMatches === 0 && eventMatches === 0) {
    const explicitDuration = extractDuration(text)
    return explicitDuration && explicitDuration >= 90 ? 'task' : 'event'
  }

  return taskMatches > eventMatches ? 'task' : 'event'
}

export function extractMultipleWeekdays(text: string): number[] | null {
  const pluralMap: Record<string, number> = {
    montags: 1,
    dienstags: 2,
    mittwochs: 3,
    donnerstags: 4,
    freitags: 5,
    samstags: 6,
    sonntags: 0,
  }

  const found: number[] = []
  for (const [name, day] of Object.entries(pluralMap)) {
    if (text.includes(name)) found.push(day)
  }

  return found.length >= 2 ? found.sort((a, b) => a - b) : null
}

export function extractRestDay(text: string): number | null {
  const restDayMap: Record<string, number> = {
    sonntag: 0, sonntags: 0,
    montag: 1, montags: 1,
    dienstag: 2, dienstags: 2,
    mittwoch: 3, mittwochs: 3,
    donnerstag: 4, donnerstags: 4,
    freitag: 5, freitags: 5,
    samstag: 6, samstags: 6,
  }

  const match = text.match(/\bruhetag\s+(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|montags|dienstags|mittwochs|donnerstags|freitags|samstags|sonntags)\b/)
  if (!match) return null
  return restDayMap[match[1]] ?? null
}

export function extractCyclePattern(text: string): { trainDays: number; restDays: number } | null {
  // "3 tage dann 1 tag pause" / "3 tage und 1 ruhetag" / "3 tage, 1 tag erholen"
  const blockExplicit = text.match(/(\d+)\s*tage?\s*(?:dann|und|,)\s*(\d+)\s*tage?\s*(?:pause|ruhetag|ruhe|erholen|erholung)/)
  if (blockExplicit) {
    const trainDays = Number(blockExplicit[1])
    const restDays = Number(blockExplicit[2])
    if (trainDays >= 1 && restDays >= 1 && trainDays + restDays <= 10) {
      return { trainDays, restDays }
    }
  }

  // "2 ruhetage alle 4 tage" / "y ruhetage alle x tage"
  const restFirst = text.match(/(\d+)\s*ruhetage?\s*alle\s*(\d+)\s*tage?/)
  if (restFirst) {
    const restDays = Number(restFirst[1])
    const cycleLen = Number(restFirst[2])
    const trainDays = cycleLen - restDays
    if (trainDays >= 1 && restDays >= 1 && cycleLen <= 10) {
      return { trainDays, restDays }
    }
  }

  // "alle 4 tage 1 ruhetag" / "alle 3 tage einen ruhetag"
  const alleCycle = text.match(/alle\s+(\d+)\s*tage?\s*(?:(\d+)\s*)?(?:einen?\s*)?(?:pause|ruhetag|ruhe|erholung)/)
  if (alleCycle) {
    const cycleLen = Number(alleCycle[1])
    const restDays = alleCycle[2] ? Number(alleCycle[2]) : 1
    const trainDays = cycleLen - restDays
    if (trainDays >= 1 && restDays >= 1 && cycleLen <= 10) {
      return { trainDays, restDays }
    }
  }

  // "alle 3 tage sport" / "alle 2 tage gym"
  const everyNthDay = text.match(/alle\s+(\d+)\s*tage?\s+([a-z])/)
  if (everyNthDay) {
    const cycleLen = Number(everyNthDay[1])
    const restDays = cycleLen - 1
    if (cycleLen >= 2 && cycleLen <= 7 && restDays >= 1) {
      return { trainDays: 1, restDays }
    }
  }

  // "immer 1 tag dazwischen" / "immer 2 tage dazwischen (ruhetag/pause)"
  const between = text.match(/immer\s+(\d+)\s*tage?\s*dazwischen/)
  if (between) {
    const restDays = Number(between[1])
    if (restDays >= 1 && restDays <= 6) {
      return { trainDays: 1, restDays }
    }
  }

  return null
}

function computeWeekdaysFromCycle(trainDays: number, restDays: number, targetCount?: number): number[] {
  const cycleLen = trainDays + restDays
  // Build a 7-day boolean pattern starting Monday
  const pattern: boolean[] = Array.from({ length: 7 }, (_, i) => (i % cycleLen) < trainDays)
  // Map positions to JS weekday numbers: position 0 = Monday (1), ..., position 6 = Sunday (0)
  const weekSequence = [1, 2, 3, 4, 5, 6, 0]
  const weekdays = weekSequence.filter((_, i) => pattern[i])
  if (targetCount !== undefined && weekdays.length > targetCount) return weekdays.slice(0, targetCount)
  return weekdays
}

export function extractFrequencyInPeriod(text: string): number | null {
  if (!text.includes('diese woche') && !text.includes('naechste woche')) return null
  const match = text.match(/\b(\d{1,2})\s*(?:x|mal)\b/)
  if (!match) return null
  const value = Number(match[1])
  if (!Number.isFinite(value) || value <= 0 || value > 14) return null
  return value
}

export function extractRecurrenceFrequencyPerWeek(text: string) {
  const match = text.match(/\b(\d{1,2})\s*(?:x|mal)\s*(?:pro\s*)?(?:die\s*)?woche\b/)
  if (!match) return null

  const value = Number(match[1])
  if (!Number.isFinite(value) || value <= 0) return null
  return value
}

export function extractDuration(text: string): number | null {
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

export function extractPreferredPeriod(text: string): PreferredPeriod {
  if (/(morgens|vormittag|vormittags|frueh)/.test(text)) return 'morning'
  if (/(nachmittag|nachmittags|mittags)/.test(text)) return 'afternoon'
  if (/(abend|abends|spaet)/.test(text)) return 'evening'
  return 'any'
}

export function extractRecurrence(text: string) {
  const recurringWeekday = extractRecurringWeekday(text)
  if (recurringWeekday) return recurringWeekday

  if (/\b(taeglich|jeden tag)\b/.test(text)) {
    return {
      repeatMode: 'daily' as const,
      day: -1,
      label: 'Täglich',
    }
  }

  if (/\b(werktags|arbeitstags|an arbeitstagen|mo-fr|mo bis fr|montag bis freitag)\b/.test(text)) {
    return {
      repeatMode: 'workdays' as const,
      day: -1,
      label: 'An Arbeitstagen',
    }
  }

  if (!/(jeden|jede|immer|woechentlich|regelmaessig)/.test(text)) return null
  const day = extractWeekday(text)
  if (day === null) return null

  return {
    repeatMode: 'weekly' as const,
    day,
    label: `Jede Woche ${weekdayLabel(day)}`,
  }
}

export function extractWeekday(text: string): number | null {
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
    if (text.includes(name) || text.includes(`${name}s`)) {
      return day
    }
  }

  return null
}

export function extractTimePreference(text: string, fallbackDuration: number): PlanningTimePreference | undefined {
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

export function buildCleanTitle(text: string) {
  return text
    .replace(/\bruhetag\s+(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|montags|dienstags|mittwochs|donnerstags|freitags|samstags|sonntags)\b/gi, '')
    .replace(/\d+\s*ruhetage?\s*alle\s*\d+\s*tage?/gi, '')
    .replace(/alle\s+\d+\s*tage?\s*(?:\d+\s*)?(?:einen?\s*)?(?:pause|ruhetag|ruhe|erholung)/gi, '')
    .replace(/alle\s+\d+\s*tage?\s+/gi, '')
    .replace(/\d+\s*tage?\s*(?:dann|und|,)\s*\d+\s*tage?\s*(?:pause|ruhetag|ruhe|erholen|erholung)/gi, '')
    .replace(/immer\s+\d+\s*tage?\s*dazwischen/gi, '')
    .replace(/\b(ruhetag|ruhetage|pause|erholung)\b/gi, '')
    .replace(/\b(jeden|jede|immer|woechentlich|regelmaessig|taeglich|jeden tag|werktags|arbeitstags|an arbeitstagen|mo-fr|mo bis fr|montag bis freitag|heute|morgen|uebermorgen|naechste woche|diese woche|wochenende|diesen|dieses|naechsten|kommenden|am|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|montags|dienstags|mittwochs|donnerstags|freitags|samstags|sonntags)\b/gi, '')
    .replace(/\b(heiligabend|heilig abend|weihnachten|erster weihnachtstag|1\.?\s*weihnachtstag|zweiter weihnachtstag|2\.?\s*weihnachtstag|silvester|neujahr|valentinstag|tag der arbeit|erster mai|tag der deutschen einheit|dritter oktober|nikolaus|karfreitag|karsamstag|osterabend|ostersonntag|ostern|ostermontag|christi himmelfahrt|himmelfahrt|pfingstsonntag|pfingsten|pfingstmontag|muttertag)\b/gi, '')
    .replace(/\b\d{1,2}\s*(?:x|mal)\s*(?:pro\s*)?(?:diese[rn]?\s+)?(?:die\s*)?woche\b/gi, '')
    .replace(/\b(morgens|vormittag|vormittags|nachmittag|nachmittags|mittags|abend|abends|frueh|spaet)\b/gi, '')
    .replace(/\b(zwischen|um|ab|bis|von|und)\b/gi, '')
    .replace(/\b\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?\b/gi, '')
    .replace(/\b\d{1,2}\.\s*(januar|februar|maerz|april|mai|juni|juli|august|september|oktober|november|dezember)\b/gi, '')
    .replace(/\b\d{1,2}(?::\d{2})?\s*(uhr)?\b/gi, '')
    .replace(/\b\d+(?:[.,]\d+)?\s*(min|minute|minuten|h|std|stunden)\b/gi, '')
    .replace(/\b\d{1,2}\s*(?:x|mal)\s*(?:pro\s*)?(?:die\s*)?woche\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeText(text: string) {
  return text
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/heillig/g, 'heilig')
    .replace(/heilig\s+abend/g, 'heiligabend')
}

export function nextDateForWeekday(day: number, weekOffset: number, from: Date) {
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

function extractRecurringWeekday(text: string): RecurrenceMatch | null {
  const recurringMap: Record<string, number> = {
    montags: 1,
    dienstags: 2,
    mittwochs: 3,
    donnerstags: 4,
    freitags: 5,
    samstags: 6,
    sonntags: 0,
  }

  for (const [name, day] of Object.entries(recurringMap)) {
    if (text.includes(name)) {
      return {
        repeatMode: 'weekly',
        day,
        label: `Jede Woche ${weekdayLabel(day)}`,
      }
    }
  }

  return null
}

function extractWeekdayReferenceMode(text: string) {
  if (/\bnaechsten\s+(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b/.test(text)) {
    return 'next' as const
  }
  if (/\b(kommenden|diesen|dieses)\s+(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b/.test(text)) {
    return 'this' as const
  }
  return 'default' as const
}

function resolveWeekdayReferenceDate(
  weekday: number,
  mode: 'next' | 'this' | 'default',
  now: Date,
) {
  if (mode === 'next') {
    return nextDateForWeekday(weekday, 1, now)
  }

  return nextDateForWeekday(weekday, 0, now)
}

function extractSpecificDate(text: string, now: Date) {
  const numericDateMatch = text.match(/\b(?:am\s+)?(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/)
  if (numericDateMatch) {
    const day = Number(numericDateMatch[1])
    const monthIndex = Number(numericDateMatch[2]) - 1
    let year = numericDateMatch[3] ? Number(numericDateMatch[3]) : now.getFullYear()
    if (year < 100) year += 2000
    return normalizeFutureDateCandidate(day, monthIndex, year, now, !numericDateMatch[3])
  }

  const namedDateMatch = text.match(/\b(?:am\s+)?(\d{1,2})\.\s*(januar|februar|maerz|april|mai|juni|juli|august|september|oktober|november|dezember)\b/)
  if (namedDateMatch) {
    const day = Number(namedDateMatch[1])
    const monthIndex = parseGermanMonthName(namedDateMatch[2])
    if (monthIndex !== undefined) {
      return normalizeFutureDateCandidate(day, monthIndex, now.getFullYear(), now, true)
    }
  }

  return null
}

function easterSunday(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month, day)
}

function secondSundayInMay(year: number): Date {
  let sundays = 0
  for (let day = 1; day <= 31; day++) {
    const date = new Date(year, 4, day)
    if (date.getMonth() !== 4) break
    if (date.getDay() === 0) {
      sundays++
      if (sundays === 2) return date
    }
  }
  return new Date(year, 4, 14)
}

function extractNamedAnnualDate(text: string, now: Date) {
  const year = now.getFullYear()

  const fixedDates: Array<{ pattern: RegExp; monthIndex: number; day: number }> = [
    { pattern: /\bheiligabend\b/, monthIndex: 11, day: 24 },
    { pattern: /\b(erster weihnachtstag|1\.?\s*weihnachtstag|weihnachten)\b/, monthIndex: 11, day: 25 },
    { pattern: /\b(zweiter weihnachtstag|2\.?\s*weihnachtstag)\b/, monthIndex: 11, day: 26 },
    { pattern: /\bsilvester\b/, monthIndex: 11, day: 31 },
    { pattern: /\bneujahr\b/, monthIndex: 0, day: 1 },
    { pattern: /\bvalentinstag\b/, monthIndex: 1, day: 14 },
    { pattern: /\b(tag der arbeit|erster mai)\b/, monthIndex: 4, day: 1 },
    { pattern: /\b(tag der deutschen einheit|dritter oktober)\b/, monthIndex: 9, day: 3 },
    { pattern: /\bnikolaus\b/, monthIndex: 11, day: 6 },
  ]

  for (const entry of fixedDates) {
    if (entry.pattern.test(text)) {
      return normalizeFutureDateCandidate(entry.day, entry.monthIndex, year, now, true)
    }
  }

  const easterOffsets: Array<{ pattern: RegExp; offset: number }> = [
    { pattern: /\bkarfreitag\b/, offset: -2 },
    { pattern: /\b(karsamstag|osterabend)\b/, offset: -1 },
    { pattern: /\b(ostersonntag|ostern)\b/, offset: 0 },
    { pattern: /\bostermontag\b/, offset: 1 },
    { pattern: /\b(christi himmelfahrt|himmelfahrt)\b/, offset: 39 },
    { pattern: /\b(pfingstsonntag|pfingsten)\b/, offset: 49 },
    { pattern: /\bpfingstmontag\b/, offset: 50 },
  ]

  const today = new Date(now)
  today.setHours(0, 0, 0, 0)

  for (const entry of easterOffsets) {
    if (entry.pattern.test(text)) {
      for (const y of [year, year + 1]) {
        const base = easterSunday(y)
        const result = new Date(base)
        result.setDate(result.getDate() + entry.offset)
        result.setHours(0, 0, 0, 0)
        if (result >= today) return result
      }
    }
  }

  if (/\bmuttertag\b/.test(text)) {
    for (const y of [year, year + 1]) {
      const result = secondSundayInMay(y)
      result.setHours(0, 0, 0, 0)
      if (result >= today) return result
    }
  }

  return null
}

function normalizeFutureDateCandidate(
  day: number,
  monthIndex: number,
  year: number,
  now: Date,
  allowRollOverToNextYear: boolean,
) {
  const candidate = new Date(year, monthIndex, day)
  if (
    Number.isNaN(candidate.getTime()) ||
    candidate.getDate() !== day ||
    candidate.getMonth() !== monthIndex
  ) {
    return null
  }

  candidate.setHours(0, 0, 0, 0)
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)

  if (allowRollOverToNextYear && candidate < today) {
    candidate.setFullYear(candidate.getFullYear() + 1)
  }

  return candidate
}

function parseGermanMonthName(name: string) {
  const monthMap: Record<string, number> = {
    januar: 0,
    februar: 1,
    maerz: 2,
    april: 3,
    mai: 4,
    juni: 5,
    juli: 6,
    august: 7,
    september: 8,
    oktober: 9,
    november: 10,
    dezember: 11,
  }

  return monthMap[name]
}

function weekdayLabel(day: number) {
  return ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'][day] || 'unbekannt'
}

function toMinutes(hours: string, minutes?: string) {
  return Number(hours) * 60 + Number(minutes || 0)
}

function formatClockMinutes(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function buildAmbiguityHints(context: {
  hasExplicitDate: boolean
  preferredPeriod: PreferredPeriod
  timePreference?: PlanningTimePreference
  weekday: number | null
  weekdayReferenceMode: 'next' | 'this' | 'default'
  rangeMode: 'exact-day' | 'next-week' | 'this-week' | 'weekend' | 'open'
  intent: PlanningIntent
  recurrenceFrequencyPerWeek: number | null
  multipleWeekdays?: number[] | null
  frequencyInPeriod?: number | null
  restDayHint?: number | null
  cyclePattern?: { trainDays: number; restDays: number } | null
}) {
  const hints: string[] = []

  if (!context.hasExplicitDate && context.restDayHint === undefined) {
    hints.push('Es wurde kein genaues Datum erkannt. Ich suche deshalb im nächsten passenden Zeitraum.')
  } else if (context.hasExplicitDate && context.weekday !== null && context.weekdayReferenceMode === 'default' && context.restDayHint === undefined) {
    hints.push('Den genannten Wochentag deute ich als nächsten passenden Termin. Mit "diesen" oder "nächsten" wird es eindeutiger.')
  }

  if (!context.timePreference && context.preferredPeriod !== 'any') {
    hints.push(`"${periodLabel(context.preferredPeriod)}" ist eher ein Zeitraum als eine feste Uhrzeit. Deshalb bekommst du bewusst mehrere passende Zeiten.`)
  }

  if (!context.timePreference && context.rangeMode !== 'exact-day' && context.intent !== 'routine') {
    hints.push('Ohne genaue Uhrzeit oder exakten Tag priorisiere ich zuerst sinnvolle freie Slots statt nur eine einzige starre Zeit.')
  }

  if (context.intent === 'routine' && context.recurrenceFrequencyPerWeek !== null && !context.multipleWeekdays?.length) {
    if (context.cyclePattern) {
      // cycle detected but couldn't map to weekdays — give targeted hint
    } else if (context.recurrenceFrequencyPerWeek >= 5) {
      hints.push(`${context.recurrenceFrequencyPerWeek}x pro Woche erkannt. Sag mir deinen Ruhetag (z. B. "Ruhetag Donnerstag") — dann plane ich die anderen ${context.recurrenceFrequencyPerWeek} Tage automatisch.`)
    } else {
      hints.push(`${context.recurrenceFrequencyPerWeek}x pro Woche erkannt. Ich verteile die Einheiten automatisch — oder gib konkrete Tage an wie "montags mittwochs freitags".`)
    }
  }

  if (context.intent === 'routine' && context.recurrenceFrequencyPerWeek === 6 && context.multipleWeekdays?.length === 6 && context.restDayHint !== null) {
    const restLabel = weekdayLabel(context.restDayHint!)
    hints.push(`Ruhetag ${restLabel} erkannt. Ich lege 6 wöchentliche Routinen an — 3 Tage, Pause ${restLabel}, 3 Tage.`)
  }

  if (context.cyclePattern && context.multipleWeekdays?.length) {
    const { trainDays, restDays } = context.cyclePattern
    const dayNames = context.multipleWeekdays.map(d => weekdayLabel(d)).join(', ')
    hints.push(`Muster erkannt: ${trainDays} Trainingstag${trainDays > 1 ? 'e' : ''} + ${restDays} Ruhetag${restDays > 1 ? 'e' : ''}. Trainingstage: ${dayNames}.`)
  } else if (context.cyclePattern && !context.multipleWeekdays?.length) {
    const { trainDays, restDays } = context.cyclePattern
    hints.push(`Muster (${trainDays}+${restDays}) erkannt, aber keine Wochentage berechenbar. Sag mir wie oft pro Woche, z. B. "5 mal die Woche".`)
  }

  if (context.frequencyInPeriod) {
    hints.push(`${context.frequencyInPeriod}x in diesem Zeitraum erkannt. Ich suche ${context.frequencyInPeriod} freie Slots und trage sie ein.`)
  }

  return hints
}

function periodLabel(period: PreferredPeriod) {
  if (period === 'morning') return 'morgens'
  if (period === 'afternoon') return 'nachmittags'
  if (period === 'evening') return 'abends'
  return 'flexibel'
}
