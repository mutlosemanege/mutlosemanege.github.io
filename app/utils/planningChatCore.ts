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
  const intent = detectIntent(text, recurrence, intentMode)

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
    if (text.includes(name)) {
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

  const exactMatch = text.match(/\bum\s+(\d{1,2})(?::(\d{2}))?\s*uhr?\b/)
  if (exactMatch) {
    const exactStartMinutes = toMinutes(exactMatch[1], exactMatch[2])
    return {
      exactStartMinutes,
      startMinutes: exactStartMinutes,
      endMinutes: exactStartMinutes + fallbackDuration,
      label: `ab ${formatClockMinutes(exactStartMinutes)}`,
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
    .replace(/\b(jeden|jede|immer|woechentlich|wöchentlich|regelmaessig|regelmäßig|heute|morgen|uebermorgen|übermorgen|naechste woche|nächste woche|diese woche|wochenende|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b/gi, '')
    .replace(/\b(morgens|vormittag|vormittags|nachmittag|nachmittags|mittags|abend|abends|frueh|spät|spaet)\b/gi, '')
    .replace(/\b(zwischen|um|ab|bis|von|und)\b/gi, '')
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
