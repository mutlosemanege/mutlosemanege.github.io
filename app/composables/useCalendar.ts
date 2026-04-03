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

const events = ref<CalendarEvent[]>([])
const isLoading = ref(false)
const error = ref<string | null>(null)

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

  async function fetchEvents(timeMin: string, timeMax: string) {
    isLoading.value = true
    error.value = null
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
      events.value = data.items || []
    } catch (e: any) {
      error.value = e.message
      events.value = []
    } finally {
      isLoading.value = false
    }
  }

  async function createEvent(event: Omit<CalendarEvent, 'id'>): Promise<CalendarEvent | null> {
    isLoading.value = true
    error.value = null
    try {
      const result = await apiRequest(
        `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId())}/events`,
        {
          method: 'POST',
          body: JSON.stringify(event)
        }
      )
      return result
    } catch (e: any) {
      error.value = e.message
      return null
    } finally {
      isLoading.value = false
    }
  }

  async function updateEvent(eventId: string, event: Partial<CalendarEvent>): Promise<CalendarEvent | null> {
    isLoading.value = true
    error.value = null
    try {
      const result = await apiRequest(
        `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId())}/events/${encodeURIComponent(eventId)}`,
        {
          method: 'PATCH',
          body: JSON.stringify(event)
        }
      )
      return result
    } catch (e: any) {
      error.value = e.message
      return null
    } finally {
      isLoading.value = false
    }
  }

  async function deleteEvent(eventId: string): Promise<boolean> {
    isLoading.value = true
    error.value = null
    try {
      await apiRequest(
        `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId())}/events/${encodeURIComponent(eventId)}`,
        { method: 'DELETE' }
      )
      return true
    } catch (e: any) {
      error.value = e.message
      return false
    } finally {
      isLoading.value = false
    }
  }

  return {
    events: readonly(events),
    isLoading: readonly(isLoading),
    error: readonly(error),
    fetchEvents,
    createEvent,
    updateEvent,
    deleteEvent
  }
}
