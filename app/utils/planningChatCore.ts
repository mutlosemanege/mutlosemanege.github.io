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
  recurrenceDay?: number
  recurrenceLabel?: string
  timePreference?: PlanningTimePreference
  ambiguityHints: string[]
}

interface RecurrenceMatch {
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

  const recurrence = extractRecurrence(normalized)
  const timePreference = extractTimePreference(normalized, fallbackDuration)
  const preferredPeriod = extractPreferredPeriod(normalized)
  const explicitDate = extractSpecificDate(normalized, now) ?? extractNamedAnnualDate(normalized, now)
  const weekday = recurrence?.day ?? extractWeekday(normalized)
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
  const intent = detectIntent(text, recurrence, intentMode)
  const ambiguityHints = buildAmbiguityHints({
    hasExplicitDate,
    preferredPeriod,
    timePreference,
    weekday,
    weekdayReferenceMode,
    rangeMode,
    intent,
  })

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
    ambiguityHints,
  }
}

export function detectIntent(
  text: string,
  recurrence: { day: number; label: string } | null,
  intentMode: 'auto' | PlanningIntent = 'auto',
): PlanningIntent {
  if (intentMode === 'event') return 'event'
  if (intentMode === 'task') return 'task'
  if (intentMode === 'routine') return 'routine'

  const normalized = normalizeText(text)
  const taskHints = ['lernen', 'videoschnitt', 'video', 'schnitt', 'schneiden', 'bearbeiten', 'vorbereiten', 'schreiben', 'bauen', 'erledigen', 'review', 'recherche', 'arbeiten']
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

  if (!/(jeden|jede|immer|woechentlich|regelmaessig)/.test(text)) return null
  const day = extractWeekday(text)
  if (day === null) return null

  return {
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
    .replace(/\b(jeden|jede|immer|woechentlich|regelmaessig|heute|morgen|uebermorgen|naechste woche|diese woche|wochenende|diesen|dieses|naechsten|kommenden|am|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|montags|dienstags|mittwochs|donnerstags|freitags|samstags|sonntags)\b/gi, '')
    .replace(/\b(heiligabend|heilig abend|weihnachten|erster weihnachtstag|1\.?\s*weihnachtstag|zweiter weihnachtstag|2\.?\s*weihnachtstag|silvester|neujahr)\b/gi, '')
    .replace(/\b(morgens|vormittag|vormittags|nachmittag|nachmittags|mittags|abend|abends|frueh|spaet)\b/gi, '')
    .replace(/\b(zwischen|um|ab|bis|von|und)\b/gi, '')
    .replace(/\b\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?\b/gi, '')
    .replace(/\b\d{1,2}\.\s*(januar|februar|maerz|april|mai|juni|juli|august|september|oktober|november|dezember)\b/gi, '')
    .replace(/\b\d{1,2}(?::\d{2})?\s*(uhr)?\b/gi, '')
    .replace(/\b\d+(?:[.,]\d+)?\s*(min|minute|minuten|h|std|stunden)\b/gi, '')
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

function extractNamedAnnualDate(text: string, now: Date) {
  const annualDateMap: Array<{ pattern: RegExp; monthIndex: number; day: number }> = [
    { pattern: /\bheiligabend\b/, monthIndex: 11, day: 24 },
    { pattern: /\b(erster weihnachtstag|1\.?\s*weihnachtstag|weihnachten)\b/, monthIndex: 11, day: 25 },
    { pattern: /\b(zweiter weihnachtstag|2\.?\s*weihnachtstag)\b/, monthIndex: 11, day: 26 },
    { pattern: /\bsilvester\b/, monthIndex: 11, day: 31 },
    { pattern: /\bneujahr\b/, monthIndex: 0, day: 1 },
  ]

  for (const entry of annualDateMap) {
    if (entry.pattern.test(text)) {
      return normalizeFutureDateCandidate(entry.day, entry.monthIndex, now.getFullYear(), now, true)
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
}) {
  const hints: string[] = []

  if (!context.hasExplicitDate) {
    hints.push('Es wurde kein genaues Datum erkannt. Ich suche deshalb im nächsten passenden Zeitraum.')
  } else if (context.weekday !== null && context.weekdayReferenceMode === 'default') {
    hints.push('Den genannten Wochentag deute ich als nächsten passenden Termin. Mit "diesen" oder "nächsten" wird es eindeutiger.')
  }

  if (!context.timePreference && context.preferredPeriod !== 'any') {
    hints.push(`"${periodLabel(context.preferredPeriod)}" ist eher ein Zeitraum als eine feste Uhrzeit. Deshalb bekommst du bewusst mehrere passende Zeiten.`)
  }

  if (!context.timePreference && context.rangeMode !== 'exact-day' && context.intent !== 'routine') {
    hints.push('Ohne genaue Uhrzeit oder exakten Tag priorisiere ich zuerst sinnvolle freie Slots statt nur eine einzige starre Zeit.')
  }

  return hints
}

function periodLabel(period: PreferredPeriod) {
  if (period === 'morning') return 'morgens'
  if (period === 'afternoon') return 'nachmittags'
  if (period === 'evening') return 'abends'
  return 'flexibel'
}
