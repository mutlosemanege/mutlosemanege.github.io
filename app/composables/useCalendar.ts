export interface CalendarEvent {
  id?: string
  summary: string
  description?: string
  start: {
    dateTime?: string
    date?: string
    timeZone?: string
  }
  end: {
    dateTime?: string
    date?: string
    timeZone?: string
  }
  colorId?: string
}

export interface CalendarDuplicateCandidate {
  event: CalendarEvent
  kind: 'exact-match' | 'overlap'
  reason: string
}

export interface CalendarSyncStatus {
  state: 'idle' | 'syncing' | 'success' | 'error'
  action: 'fetch' | 'create' | 'update' | 'delete'
  message: string
  at: string
}

type RetryableCalendarAction =
  | { action: 'fetch'; args: { timeMin: string; timeMax: string } }
  | { action: 'create'; args: { event: Omit<CalendarEvent, 'id'> } }
  | { action: 'update'; args: { eventId: string; event: Partial<CalendarEvent> } }
  | { action: 'delete'; args: { eventId: string } }

const events = ref<CalendarEvent[]>([])
const isLoading = ref(false)
const error = ref<string | null>(null)
const syncStatus = ref<CalendarSyncStatus | null>(null)
const lastFailedAction = ref<RetryableCalendarAction | null>(null)
const isRetryingLastAction = ref(false)

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'

export function useCalendar() {
  const config = useRuntimeConfig()
  const { getAccessToken } = useGoogleAuth()

  function calendarId(): string {
    return config.public.googleCalendarId as string
  }

  async function apiRequest(url: string, options: RequestInit = {}): Promise<any> {
    const token = getAccessToken()
    if (!token) {
      throw new Error('Nicht angemeldet')
    }

    const res = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      const msg = body?.error?.message || `Fehler: ${res.status}`
      throw new Error(msg)
    }

    if (res.status === 204) return null
    return res.json()
  }

  function setSyncStatus(
    state: CalendarSyncStatus['state'],
    action: CalendarSyncStatus['action'],
    message: string,
  ) {
    syncStatus.value = {
      state,
      action,
      message,
      at: new Date().toISOString(),
    }
  }

  function rememberFailedAction(action: RetryableCalendarAction) {
    lastFailedAction.value = action
  }

  function clearFailedAction() {
    lastFailedAction.value = null
  }

  function upsertLocalEvent(event: CalendarEvent) {
    if (!event.id) {
      events.value = sortCalendarEvents([...events.value, event])
      return
    }

    const index = events.value.findIndex(entry => entry.id === event.id)
    if (index === -1) {
      events.value = sortCalendarEvents([...events.value, event])
      return
    }

    const nextEvents = [...events.value]
    nextEvents[index] = event
    events.value = sortCalendarEvents(nextEvents)
  }

  function removeLocalEvent(eventId: string) {
    events.value = events.value.filter(event => event.id !== eventId)
  }

  function toSafeCalendarMessage(
    action: CalendarSyncStatus['action'],
    rawMessage: string | undefined,
  ) {
    const normalized = (rawMessage || '').toLowerCase()

    if (normalized.includes('insufficient authentication') || normalized.includes('invalid credentials') || normalized.includes('unauthenticated')) {
      return 'Die Kalenderverbindung ist abgelaufen. Bitte verbinde dein Google-Konto erneut.'
    }

    if (normalized.includes('forbidden') || normalized.includes('not have permission')) {
      return 'Der Kalender verweigert diese Aktion gerade. Bitte prüfe Freigaben und verbundenes Konto.'
    }

    if (normalized.includes('rate limit') || normalized.includes('quota')) {
      return 'Zu viele Kalenderanfragen in kurzer Zeit. Bitte versuche es gleich noch einmal.'
    }

    if (normalized.includes('network') || normalized.includes('failed to fetch')) {
      return 'Die Kalenderverbindung ist gerade instabil. Bitte versuche es erneut.'
    }

    const fallbackByAction: Record<CalendarSyncStatus['action'], string> = {
      fetch: 'Kalender konnte nicht synchronisiert werden.',
      create: 'Kalendereintrag konnte nicht erstellt werden.',
      update: 'Kalendereintrag konnte nicht aktualisiert werden.',
      delete: 'Kalendereintrag konnte nicht entfernt werden.',
    }

    return fallbackByAction[action]
  }

  function getEventStart(event: CalendarEvent): Date | null {
    if (event.start.dateTime) return new Date(event.start.dateTime)
    if (event.start.date) return new Date(event.start.date)
    return null
  }

  function getEventEnd(event: CalendarEvent): Date | null {
    if (event.end.dateTime) return new Date(event.end.dateTime)
    if (event.end.date) return new Date(event.end.date)
    return null
  }

  function sortCalendarEvents(pool: readonly CalendarEvent[]) {
    return [...pool].sort((a, b) => {
      const aStart = getEventStart(a)?.getTime() ?? Number.POSITIVE_INFINITY
      const bStart = getEventStart(b)?.getTime() ?? Number.POSITIVE_INFINITY
      if (aStart !== bStart) return aStart - bStart

      const aEnd = getEventEnd(a)?.getTime() ?? Number.POSITIVE_INFINITY
      const bEnd = getEventEnd(b)?.getTime() ?? Number.POSITIVE_INFINITY
      return aEnd - bEnd
    })
  }

  function normalizeSummary(value: string | undefined) {
    return (value || '')
      .trim()
      .toLowerCase()
  }

  function findPotentialDuplicates(
    input: { summary: string; start: Date; end: Date },
    pool: readonly CalendarEvent[] = events.value,
  ): CalendarDuplicateCandidate[] {
    const normalizedSummary = normalizeSummary(input.summary)
    const inputStart = input.start.getTime()
    const inputEnd = input.end.getTime()

    return pool.flatMap((event) => {
      const eventStart = getEventStart(event)
      const eventEnd = getEventEnd(event)
      if (!eventStart || !eventEnd) return []

      const eventSummary = normalizeSummary(event.summary)
      const titlesMatch = eventSummary === normalizedSummary ||
        eventSummary.includes(normalizedSummary) ||
        normalizedSummary.includes(eventSummary)

      if (!titlesMatch) return []

      const startDiff = Math.abs(eventStart.getTime() - inputStart)
      const endDiff = Math.abs(eventEnd.getTime() - inputEnd)
      const overlaps = eventStart < input.end && eventEnd > input.start

      if (startDiff <= 15 * 60 * 1000 && endDiff <= 15 * 60 * 1000) {
        return [{
          event,
          kind: 'exact-match' as const,
          reason: 'Fast gleicher Titel und nahezu gleiche Uhrzeit sind bereits im Kalender vorhanden.',
        }]
      }

      if (overlaps) {
        return [{
          event,
          kind: 'overlap' as const,
          reason: 'Aehnlicher Kalendereintrag mit ueberschneidender Zeit gefunden.',
        }]
      }

      return []
    })
  }

  async function fetchEvents(timeMin: string, timeMax: string) {
    isLoading.value = true
    error.value = null
    setSyncStatus('syncing', 'fetch', 'Kalender wird synchronisiert...')
    try {
      const params = new URLSearchParams({
        timeMin,
        timeMax,
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '250'
      })
      const data = await apiRequest(
        `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId())}/events?${params}`
      )
      events.value = sortCalendarEvents(data.items || [])
      setSyncStatus('success', 'fetch', `${events.value.length} Kalendereintraege synchronisiert.`)
      clearFailedAction()
      return true
    } catch (e: any) {
      const safeMessage = toSafeCalendarMessage('fetch', e.message)
      error.value = safeMessage
      events.value = []
      setSyncStatus('error', 'fetch', safeMessage)
      rememberFailedAction({
        action: 'fetch',
        args: { timeMin, timeMax },
      })
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function createEvent(event: Omit<CalendarEvent, 'id'>): Promise<CalendarEvent | null> {
    isLoading.value = true
    error.value = null
    setSyncStatus('syncing', 'create', 'Kalendereintrag wird erstellt...')
    try {
      const result = await apiRequest(
        `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId())}/events`,
        {
          method: 'POST',
          body: JSON.stringify(event)
        }
      )
      if (result) {
        upsertLocalEvent(result)
      }
      setSyncStatus('success', 'create', 'Kalendereintrag wurde erfolgreich erstellt.')
      clearFailedAction()
      return result
    } catch (e: any) {
      const safeMessage = toSafeCalendarMessage('create', e.message)
      error.value = safeMessage
      setSyncStatus('error', 'create', safeMessage)
      rememberFailedAction({
        action: 'create',
        args: { event },
      })
      return null
    } finally {
      isLoading.value = false
    }
  }

  async function updateEvent(eventId: string, event: Partial<CalendarEvent>): Promise<CalendarEvent | null> {
    isLoading.value = true
    error.value = null
    setSyncStatus('syncing', 'update', 'Kalendereintrag wird aktualisiert...')
    try {
      const result = await apiRequest(
        `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId())}/events/${encodeURIComponent(eventId)}`,
        {
          method: 'PATCH',
          body: JSON.stringify(event)
        }
      )
      if (result) {
        upsertLocalEvent(result)
      }
      setSyncStatus('success', 'update', 'Kalendereintrag wurde aktualisiert.')
      clearFailedAction()
      return result
    } catch (e: any) {
      const safeMessage = toSafeCalendarMessage('update', e.message)
      error.value = safeMessage
      setSyncStatus('error', 'update', safeMessage)
      rememberFailedAction({
        action: 'update',
        args: { eventId, event },
      })
      return null
    } finally {
      isLoading.value = false
    }
  }

  async function deleteEvent(eventId: string): Promise<boolean> {
    isLoading.value = true
    error.value = null
    setSyncStatus('syncing', 'delete', 'Kalendereintrag wird entfernt...')
    try {
      await apiRequest(
        `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId())}/events/${encodeURIComponent(eventId)}`,
        { method: 'DELETE' }
      )
      removeLocalEvent(eventId)
      setSyncStatus('success', 'delete', 'Kalendereintrag wurde entfernt.')
      clearFailedAction()
      return true
    } catch (e: any) {
      const safeMessage = toSafeCalendarMessage('delete', e.message)
      error.value = safeMessage
      setSyncStatus('error', 'delete', safeMessage)
      rememberFailedAction({
        action: 'delete',
        args: { eventId },
      })
      return false
    } finally {
      isLoading.value = false
    }
  }

  const canRetryLastAction = computed(() => !!lastFailedAction.value)

  async function retryLastAction() {
    if (!lastFailedAction.value || isRetryingLastAction.value) return false

    isRetryingLastAction.value = true
    setSyncStatus('syncing', lastFailedAction.value.action, 'Letzte Kalenderaktion wird erneut versucht...')

    try {
      const action = lastFailedAction.value

      if (action.action === 'fetch') {
        return await fetchEvents(action.args.timeMin, action.args.timeMax)
      }

      if (action.action === 'create') {
        return !!(await createEvent(action.args.event))
      }

      if (action.action === 'update') {
        return !!(await updateEvent(action.args.eventId, action.args.event))
      }

      return await deleteEvent(action.args.eventId)
    } finally {
      isRetryingLastAction.value = false
    }
  }

  return {
    events: readonly(events),
    isLoading: readonly(isLoading),
    error: readonly(error),
    syncStatus: readonly(syncStatus),
    canRetryLastAction: readonly(canRetryLastAction),
    isRetryingLastAction: readonly(isRetryingLastAction),
    findPotentialDuplicates,
    fetchEvents,
    createEvent,
    updateEvent,
    deleteEvent,
    retryLastAction,
  }
}
