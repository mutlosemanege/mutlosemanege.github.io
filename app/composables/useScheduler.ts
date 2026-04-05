import type { CalendarEvent } from '~/composables/useCalendar'
import type { Task, UserPreferences, DeepWorkWindow } from '~/types/task'

type ReadonlyUserPreferences = Readonly<UserPreferences>

export interface TimeSlot {
  start: Date
  end: Date
  isDeepWork: boolean
}

export interface ScheduledTaskPlan {
  blocks: Array<{ start: Date; end: Date }>
}

export interface ScheduleTaskOptions {
  preferredStartByTaskId?: Record<string, string | undefined>
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
    const bufferMs = prefs.taskBufferMinutes * 60 * 1000
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
          start: new Date(Math.max(eventStart.getTime() - bufferMs, dayStart.getTime())),
          end: new Date(Math.min(eventEnd.getTime() + bufferMs, dayEnd.getTime())),
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
          const slotDurationMinutes = (slotEnd.getTime() - slotStart.getTime()) / 60000
          freeSlots.push({
            start: slotStart,
            end: slotEnd,
            isDeepWork: isInDeepWorkWindow(slotStart, slotEnd, deepWork) &&
              slotDurationMinutes >= prefs.minDeepWorkBlockMinutes,
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
        const slotDurationMinutes = (slotEnd.getTime() - slotStart.getTime()) / 60000
        freeSlots.push({
          start: slotStart,
          end: slotEnd,
          isDeepWork: isInDeepWorkWindow(slotStart, slotEnd, deepWork) &&
            slotDurationMinutes >= prefs.minDeepWorkBlockMinutes,
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
    options: ScheduleTaskOptions = {},
  ): Map<string, ScheduledTaskPlan> {
    const result = new Map<string, ScheduledTaskPlan>()

    // Tasks sortieren: Prioritaet absteigend, Deadline aufsteigend
    const sorted = [...tasksToSchedule].sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
      const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority]
      if (pDiff !== 0) return pDiff

      // Bei gleicher Prioritaet: hoehster Deadline-Druck zuerst
      const aPressure = getDeadlinePressureScore(a)
      const bPressure = getDeadlinePressureScore(b)
      if (aPressure !== bPressure) return bPressure - aPressure

      // Danach fruehere Deadline zuerst
      const aDeadline = a.deadline ? new Date(a.deadline).getTime() : Infinity
      const bDeadline = b.deadline ? new Date(b.deadline).getTime() : Infinity
      if (aDeadline !== bDeadline) return aDeadline - bDeadline

      return b.estimatedMinutes - a.estimatedMinutes
    })

    // Planungszeitraum: ab jetzt, bis zur spaetesten Deadline oder max. 180 Tage
    const now = new Date()
    const latestDeadline = sorted.reduce<number>((max, task) => {
      if (!task.deadline) return max
      return Math.max(max, new Date(task.deadline).getTime())
    }, now.getTime())

    const planEnd = new Date(Math.max(
      latestDeadline + 7 * 24 * 60 * 60 * 1000,
      now.getTime() + 30 * 24 * 60 * 60 * 1000,
    ))
    const maxEnd = new Date(now)
    maxEnd.setDate(maxEnd.getDate() + 180)
    if (planEnd > maxEnd) {
      planEnd.setTime(maxEnd.getTime())
    }

    // Alle freien Slots finden
    let freeSlots = findFreeSlots(now, planEnd, existingEvents, prefs)
    let madeProgress = true

    while (madeProgress) {
      madeProgress = false

      for (const task of sorted) {
        if (result.has(task.id) || task.status === 'done') continue

        const allDepsScheduled = task.dependencies.every(depId => {
          const dependencyTask = tasksToSchedule.find(candidate => candidate.id === depId)
          if (!dependencyTask) return true

          return dependencyTask.status === 'done' ||
            dependencyTask.status === 'scheduled' ||
            result.has(depId)
        })
        if (!allDepsScheduled) continue

        const durationMs = task.estimatedMinutes * 60 * 1000
        let earliestStart = now

        for (const depId of task.dependencies) {
          const depPlan = result.get(depId)
          const depEnd = depPlan?.blocks[depPlan.blocks.length - 1]?.end
          if (depEnd && depEnd > earliestStart) {
            earliestStart = depEnd
            continue
          }

          const dependencyTask = tasksToSchedule.find(candidate => candidate.id === depId)
          if (!dependencyTask) continue

          const persistedDependencyEnd = dependencyTask.scheduleBlocks?.[dependencyTask.scheduleBlocks.length - 1]?.end ||
            dependencyTask.scheduledEnd
          if (persistedDependencyEnd) {
            const scheduledEnd = new Date(persistedDependencyEnd)
            if (scheduledEnd > earliestStart) {
              earliestStart = scheduledEnd
            }
          }
        }

        const allocation = allocateTaskAcrossSlots(
          freeSlots,
          durationMs,
          task.isDeepWork,
          earliestStart,
          prefs.taskBufferMinutes,
          options.preferredStartByTaskId?.[task.id] ? new Date(options.preferredStartByTaskId[task.id]!) : undefined,
        )
        if (allocation.blocks.length === 0 || allocation.scheduledMs < durationMs) continue

        result.set(task.id, { blocks: allocation.blocks })
        freeSlots = allocation.remainingSlots
        madeProgress = true
      }
    }

    return result
  }

  function allocateTaskAcrossSlots(
    slots: TimeSlot[],
    durationMs: number,
    needsDeepWork: boolean,
    earliestStart: Date,
    bufferMinutes: number,
    preferredStart?: Date,
  ): {
    blocks: Array<{ start: Date; end: Date }>
    remainingSlots: TimeSlot[]
    scheduledMs: number
  } {
    let remainingMs = durationMs
    let currentEarliest = earliestStart
    let workingSlots = [...slots]
    const blocks: Array<{ start: Date; end: Date }> = []

    const passes = [
      (slot: TimeSlot) => needsDeepWork ? slot.isDeepWork : !slot.isDeepWork,
      (_slot: TimeSlot) => true,
    ]

    for (const slotFilter of passes) {
      const orderedSlots = orderSlotsForTask(workingSlots, durationMs, currentEarliest, preferredStart)

      for (const slot of orderedSlots) {
        if (remainingMs <= 0) break
        if (!slotFilter(slot)) continue

        const effectiveStart = new Date(Math.max(slot.start.getTime(), currentEarliest.getTime()))
        const availableMs = slot.end.getTime() - effectiveStart.getTime()
        if (availableMs < 15 * 60 * 1000) continue

        const bookedMs = Math.min(remainingMs, availableMs)
        const bookEnd = new Date(effectiveStart.getTime() + bookedMs)
        const slotRelease = new Date(bookEnd.getTime() + bufferMinutes * 60 * 1000)

        blocks.push({ start: effectiveStart, end: bookEnd })
        workingSlots = splitSlotAfterBooking(workingSlots, slot, effectiveStart, slotRelease)
        remainingMs -= bookedMs
        currentEarliest = slotRelease
      }
    }

    return {
      blocks,
      remainingSlots: workingSlots,
      scheduledMs: durationMs - remainingMs,
    }
  }

  function orderSlotsForTask(
    slots: TimeSlot[],
    durationMs: number,
    earliestStart: Date,
    preferredStart?: Date,
  ): TimeSlot[] {
    const oneHourMs = 60 * 60 * 1000
    const isShortTask = durationMs <= oneHourMs
    const isLargeTask = durationMs >= 2 * oneHourMs

    return [...slots].sort((a, b) => {
      const aEffectiveStart = Math.max(a.start.getTime(), earliestStart.getTime())
      const bEffectiveStart = Math.max(b.start.getTime(), earliestStart.getTime())
      const aAvailable = a.end.getTime() - aEffectiveStart
      const bAvailable = b.end.getTime() - bEffectiveStart

      const aFits = aAvailable >= durationMs
      const bFits = bAvailable >= durationMs
      if (aFits !== bFits) return aFits ? -1 : 1

      if (isShortTask) {
        if (aFits && bFits && aAvailable !== bAvailable) {
          return aAvailable - bAvailable
        }
      }

      if (isLargeTask) {
        if (aAvailable !== bAvailable) {
          return bAvailable - aAvailable
        }
      }

      if (preferredStart) {
        const aDistance = Math.abs(aEffectiveStart - preferredStart.getTime())
        const bDistance = Math.abs(bEffectiveStart - preferredStart.getTime())
        if (aDistance !== bDistance) {
          return aDistance - bDistance
        }
      }

      return aEffectiveStart - bEffectiveStart
    })
  }

  function getDeadlinePressureScore(task: Task): number {
    if (!task.deadline) return 0

    const deadlineMs = new Date(task.deadline).getTime()
    const nowMs = Date.now()
    const remainingMs = Math.max(deadlineMs - nowMs, 60 * 60 * 1000)
    const remainingHours = remainingMs / (60 * 60 * 1000)
    const taskHours = Math.max(task.estimatedMinutes / 60, 0.25)

    return taskHours / remainingHours
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
