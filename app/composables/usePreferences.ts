import { DEFAULT_PREFERENCES } from '~/types/task'
import type { UserPreferences, DeepWorkWindow, PlanningBehaviorSignals, DailyCommitState } from '~/types/task'

const STORAGE_KEY = 'kalender-ai-preferences'

const preferences = ref<UserPreferences>(loadPreferences())

function loadPreferences(): UserPreferences {
  if (import.meta.server) return { ...DEFAULT_PREFERENCES }
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<UserPreferences>
      return {
        ...DEFAULT_PREFERENCES,
        ...parsed,
        behaviorSignals: {
          ...DEFAULT_PREFERENCES.behaviorSignals,
          ...(parsed.behaviorSignals || {}),
        },
        dailyCommit: {
          ...DEFAULT_PREFERENCES.dailyCommit,
          ...(parsed.dailyCommit || {}),
        },
      }
    }
  } catch {
    // Fallback to defaults
  }
  return { ...DEFAULT_PREFERENCES }
}

function savePreferences() {
  if (import.meta.server) return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences.value))
}

function incrementBucket(bucket: Record<string, number>, hourKey: string) {
  return {
    ...bucket,
    [hourKey]: (bucket[hourKey] || 0) + 1,
  }
}

function hourKeyFromDate(date: Date) {
  return String(date.getHours()).padStart(2, '0')
}

function dateKeyFromDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function mergeBehaviorSignals(partial: Partial<PlanningBehaviorSignals>) {
  preferences.value = {
    ...preferences.value,
    behaviorSignals: {
      ...preferences.value.behaviorSignals,
      ...partial,
    },
  }
  savePreferences()
}

export function usePreferences() {
  function updatePreferences(updates: Partial<UserPreferences>) {
    preferences.value = { ...preferences.value, ...updates }
    savePreferences()
  }

  function resetPreferences() {
    preferences.value = { ...DEFAULT_PREFERENCES }
    savePreferences()
  }

  function getDailyCommit(date = new Date()): DailyCommitState {
    const dateKey = dateKeyFromDate(date)
    const current = preferences.value.dailyCommit
    if (current.dateKey !== dateKey) {
      return {
        dateKey,
        committedTaskIds: [],
        deferredTaskIds: [],
      }
    }

    return current
  }

  function setDailyCommit(committedTaskIds: string[], deferredTaskIds: string[], date = new Date()) {
    preferences.value = {
      ...preferences.value,
      dailyCommit: {
        dateKey: dateKeyFromDate(date),
        committedTaskIds: [...new Set(committedTaskIds)],
        deferredTaskIds: [...new Set(deferredTaskIds)],
      },
    }
    savePreferences()
  }

  function clearDailyCommit(date = new Date()) {
    preferences.value = {
      ...preferences.value,
      dailyCommit: {
        dateKey: dateKeyFromDate(date),
        committedTaskIds: [],
        deferredTaskIds: [],
      },
    }
    savePreferences()
  }

  function setDeepWorkWindow(day: number, startHour: number, endHour: number) {
    const windows = preferences.value.deepWorkWindows.filter(w => w.day !== day)
    if (startHour < endHour) {
      windows.push({ day, startHour, endHour })
    }
    preferences.value = { ...preferences.value, deepWorkWindows: windows }
    savePreferences()
  }

  function removeDeepWorkWindow(day: number) {
    const windows = preferences.value.deepWorkWindows.filter(w => w.day !== day)
    preferences.value = { ...preferences.value, deepWorkWindows: windows }
    savePreferences()
  }

  function isWorkDay(date: Date): boolean {
    const dayOfWeek = date.getDay() // 0=So, 1=Mo, ...
    return preferences.value.workDays.includes(dayOfWeek)
  }

  function getDeepWorkWindow(date: Date): DeepWorkWindow | undefined {
    const dayOfWeek = date.getDay()
    return preferences.value.deepWorkWindows.find(w => w.day === dayOfWeek)
  }

  function recordTaskCompletion(date: Date, isDeepWork: boolean) {
    const hourKey = hourKeyFromDate(date)
    const currentSignals = preferences.value.behaviorSignals

    mergeBehaviorSignals({
      completedByHour: incrementBucket(currentSignals.completedByHour, hourKey),
      deepWorkCompletedByHour: isDeepWork
        ? incrementBucket(currentSignals.deepWorkCompletedByHour, hourKey)
        : currentSignals.deepWorkCompletedByHour,
      completionCount: currentSignals.completionCount + 1,
    })
  }

  function recordTaskMiss(date: Date) {
    const hourKey = hourKeyFromDate(date)
    const currentSignals = preferences.value.behaviorSignals

    mergeBehaviorSignals({
      missedByHour: incrementBucket(currentSignals.missedByHour, hourKey),
      missedCount: currentSignals.missedCount + 1,
      rescheduledCount: currentSignals.rescheduledCount + 1,
    })
  }

  function getPreferredHours(isDeepWork = false) {
    const source = isDeepWork
      ? preferences.value.behaviorSignals.deepWorkCompletedByHour
      : preferences.value.behaviorSignals.completedByHour

    return Object.entries(source)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([hour]) => Number(hour))
  }

  return {
    preferences: readonly(preferences),
    updatePreferences,
    resetPreferences,
    setDeepWorkWindow,
    removeDeepWorkWindow,
    isWorkDay,
    getDeepWorkWindow,
    recordTaskCompletion,
    recordTaskMiss,
    getPreferredHours,
    getDailyCommit,
    setDailyCommit,
    clearDailyCommit,
  }
}
