import type { CalendarEvent } from '~/composables/useCalendar'
import type { Task, UserPreferences, DeepWorkWindow } from '~/types/task'

type ReadonlyUserPreferences = Readonly<UserPreferences>

export interface TimeSlot {
  start: Date
  end: Date
  isDeepWork: boolean
}

export function useScheduler() {
  const { preferences } = usePreferences()

  /**
   * Findet alle freien Zeitslots in einem Zeitraum unter Beruecksichtigung
   * von Arbeitszeiten, Mittagspause, bestehenden Events und Deep-Work-Fenstern.
   */
  function findFreeSlots(
    from: Date,
    to: Date,
    existingEvents: readonly CalendarEvent[],
    prefs: ReadonlyUserPreferences = preferences.value,
  ): TimeSlot[] {
    const slots: TimeSlot[] = []
    const current = new Date(from)
    current.setHours(0, 0, 0, 0)

    const endDate = new Date(to)
    endDate.setHours(23, 59, 59, 999)

    // Tag fuer Tag durchgehen
    while (current <= endDate) {
      const dayOfWeek = current.getDay()

      // Nur an Arbeitstagen
      if (prefs.workDays.includes(dayOfWeek)) {
        const daySlots = getDaySlotsWithGaps(current, existingEvents, prefs)
        slots.push(...daySlots)
      }

      current.setDate(current.getDate() + 1)
    }

    return slots
  }

  /**
   * Berechnet freie Zeitbloecke fuer einen einzelnen Tag.
   */
  function getDaySlotsWithGaps(
    day: Date,
    existingEvents: readonly CalendarEvent[],
    prefs: UserPreferences,
  ): TimeSlot[] {
    const dayStart = new Date(day)
    dayStart.setHours(prefs.workStartHour, 0, 0, 0)

    const dayEnd = new Date(day)
    dayEnd.setHours(prefs.workEndHour, 0, 0, 0)

    const lunchStart = new Date(day)
    lunchStart.setHours(prefs.lunchStartHour, 0, 0, 0)

    const lunchEnd = new Date(day)
    lunchEnd.setHours(prefs.lunchEndHour, 0, 0, 0)

    // Belegte Zeiten sammeln (Events + Mittagspause)
    const busyPeriods: { start: Date; end: Date }[] = [
      { start: lunchStart, end: lunchEnd },
    ]

    for (const event of existingEvents) {
      const eventStart = getEventStart(event)
      const eventEnd = getEventEnd(event)
      if (!eventStart || !eventEnd) continue

      // Nur Events die an diesem Tag liegen
      if (eventEnd > dayStart && eventStart < dayEnd) {
        busyPeriods.push({
          start: new Date(Math.max(eventStart.getTime(), dayStart.getTime())),
          end: new Date(Math.min(eventEnd.getTime(), dayEnd.getTime())),
        })
      }
    }

    // Sortieren nach Startzeit
    busyPeriods.sort((a, b) => a.start.getTime() - b.start.getTime())

    // Freie Slots = Luecken zwischen belegten Zeiten
    const freeSlots: TimeSlot[] = []
    let cursor = new Date(dayStart)

    // Deep-Work-Fenster fuer diesen Tag
    const deepWork = prefs.deepWorkWindows.find(w => w.day === day.getDay())

    for (const busy of busyPeriods) {
      if (cursor < busy.start) {
        const slotStart = new Date(cursor)
        const slotEnd = new Date(busy.start)
        if (slotEnd.getTime() - slotStart.getTime() >= 15 * 60 * 1000) { // Min. 15 Min.
          freeSlots.push({
            start: slotStart,
            end: slotEnd,
            isDeepWork: isInDeepWorkWindow(slotStart, slotEnd, deepWork),
          })
        }
      }
      cursor = new Date(Math.max(cursor.getTime(), busy.end.getTime()))
    }

    // Rest nach dem letzten belegten Block
    if (cursor < dayEnd) {
      const slotStart = new Date(cursor)
      const slotEnd = new Date(dayEnd)
      if (slotEnd.getTime() - slotStart.getTime() >= 15 * 60 * 1000) {
        freeSlots.push({
          start: slotStart,
          end: slotEnd,
          isDeepWork: isInDeepWorkWindow(slotStart, slotEnd, deepWork),
        })
      }
    }

    return freeSlots
  }

  /**
   * Prueft ob ein Slot vollstaendig im Deep-Work-Fenster liegt.
   */
  function isInDeepWorkWindow(start: Date, end: Date, dw?: DeepWorkWindow): boolean {
    if (!dw) return false
    const startHour = start.getHours() + start.getMinutes() / 60
    const endHour = end.getHours() + end.getMinutes() / 60
    return startHour >= dw.startHour && endHour <= dw.endHour
  }

  /**
   * Plant eine Liste von Tasks in freie Kalender-Slots ein.
   * Greedy-Algorithmus: Hoechste Prioritaet + naechste Deadline zuerst.
   */
  function scheduleTasks(
    tasksToSchedule: readonly Task[],
    existingEvents: readonly CalendarEvent[],
    prefs: ReadonlyUserPreferences = preferences.value,
  ): Map<string, { start: Date; end: Date }> {
    const result = new Map<string, { start: Date; end: Date }>()

    // Tasks sortieren: Prioritaet absteigend, Deadline aufsteigend
    const sorted = [...tasksToSchedule].sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
      const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority]
      if (pDiff !== 0) return pDiff

      // Bei gleicher Prioritaet: fruehere Deadline zuerst
      const aDeadline = a.deadline ? new Date(a.deadline).getTime() : Infinity
      const bDeadline = b.deadline ? new Date(b.deadline).getTime() : Infinity
      return aDeadline - bDeadline
    })

    // Planungszeitraum: ab jetzt, 14 Tage voraus
    const now = new Date()
    const planEnd = new Date(now)
    planEnd.setDate(planEnd.getDate() + 14)

    // Alle freien Slots finden
    let freeSlots = findFreeSlots(now, planEnd, existingEvents, prefs)

    // Bereits eingeplante Tasks als "belegt" beruecksichtigen
    const virtualBusy: CalendarEvent[] = [...existingEvents]

    for (const task of sorted) {
      if (task.status === 'done') continue

      // Dependencies pruefen: alle Abhaengigkeiten muessen eingeplant sein
      if (task.dependencies.length > 0) {
        const allDepsScheduled = task.dependencies.every(depId => result.has(depId))
        if (!allDepsScheduled) continue // Spaeter nochmal versuchen
      }

      const durationMs = task.estimatedMinutes * 60 * 1000

      // Frueheste Startzeit (nach Dependencies)
      let earliestStart = now
      for (const depId of task.dependencies) {
        const depSlot = result.get(depId)
        if (depSlot && depSlot.end > earliestStart) {
          earliestStart = depSlot.end
        }
      }

      // Passenden Slot finden
      const slot = findSlotForTask(freeSlots, durationMs, task.isDeepWork, earliestStart, prefs)
      if (slot) {
        const scheduledStart = new Date(slot.start)
        const scheduledEnd = new Date(scheduledStart.getTime() + durationMs)
        result.set(task.id, { start: scheduledStart, end: scheduledEnd })

        // Slot aufteilen (verbleibender Rest bleibt frei)
        freeSlots = splitSlotAfterBooking(freeSlots, slot, scheduledStart, scheduledEnd)
      }
    }

    // Zweiter Durchlauf fuer Tasks die wegen Dependencies uebersprungen wurden
    for (const task of sorted) {
      if (result.has(task.id) || task.status === 'done') continue

      const allDepsScheduled = task.dependencies.every(depId => result.has(depId))
      if (!allDepsScheduled) continue

      const durationMs = task.estimatedMinutes * 60 * 1000
      let earliestStart = now
      for (const depId of task.dependencies) {
        const depSlot = result.get(depId)
        if (depSlot && depSlot.end > earliestStart) {
          earliestStart = depSlot.end
        }
      }

      const slot = findSlotForTask(freeSlots, durationMs, task.isDeepWork, earliestStart, prefs)
      if (slot) {
        const scheduledStart = new Date(slot.start)
        const scheduledEnd = new Date(scheduledStart.getTime() + durationMs)
        result.set(task.id, { start: scheduledStart, end: scheduledEnd })
        freeSlots = splitSlotAfterBooking(freeSlots, slot, scheduledStart, scheduledEnd)
      }
    }

    return result
  }

  /**
   * Findet den ersten passenden Slot fuer einen Task.
   */
  function findSlotForTask(
    slots: TimeSlot[],
    durationMs: number,
    needsDeepWork: boolean,
    earliestStart: Date,
    prefs: ReadonlyUserPreferences,
  ): TimeSlot | null {
    for (const slot of slots) {
      // Slot muss nach earliestStart beginnen
      const effectiveStart = new Date(Math.max(slot.start.getTime(), earliestStart.getTime()))
      const availableMs = slot.end.getTime() - effectiveStart.getTime()

      if (availableMs < durationMs) continue

      // Deep-Work-Tasks nur in Deep-Work-Slots
      if (needsDeepWork && !slot.isDeepWork) continue

      // Nicht-Deep-Work-Tasks NICHT in Deep-Work-Slots (schuetzt Fokuszeit)
      if (!needsDeepWork && slot.isDeepWork) continue

      return slot
    }

    // Fallback: Wenn kein passender Slot, auch "falsche" Slots akzeptieren
    for (const slot of slots) {
      const effectiveStart = new Date(Math.max(slot.start.getTime(), earliestStart.getTime()))
      const availableMs = slot.end.getTime() - effectiveStart.getTime()
      if (availableMs >= durationMs) return slot
    }

    return null
  }

  /**
   * Teilt einen Slot nach einer Buchung auf.
   */
  function splitSlotAfterBooking(
    slots: TimeSlot[],
    bookedSlot: TimeSlot,
    bookStart: Date,
    bookEnd: Date,
  ): TimeSlot[] {
    const result: TimeSlot[] = []

    for (const slot of slots) {
      if (slot === bookedSlot) {
        // Vor der Buchung
        if (slot.start < bookStart) {
          const gap = bookStart.getTime() - slot.start.getTime()
          if (gap >= 15 * 60 * 1000) {
            result.push({ start: new Date(slot.start), end: new Date(bookStart), isDeepWork: slot.isDeepWork })
          }
        }
        // Nach der Buchung
        if (bookEnd < slot.end) {
          const gap = slot.end.getTime() - bookEnd.getTime()
          if (gap >= 15 * 60 * 1000) {
            result.push({ start: new Date(bookEnd), end: new Date(slot.end), isDeepWork: slot.isDeepWork })
          }
        }
      } else {
        result.push(slot)
      }
    }

    return result
  }

  return {
    findFreeSlots,
    scheduleTasks,
  }
}

// --- Hilfsfunktionen ---

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
