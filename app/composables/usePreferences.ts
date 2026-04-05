import { DEFAULT_PREFERENCES } from '~/types/task'
import type { UserPreferences, DeepWorkWindow, RoutineTemplate } from '~/types/task'

const STORAGE_KEY = 'kalender-ai-preferences'

const preferences = ref<UserPreferences>(loadPreferences())

function loadPreferences(): UserPreferences {
  if (import.meta.server) return { ...DEFAULT_PREFERENCES }
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      return { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) }
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

export function usePreferences() {
  function updatePreferences(updates: Partial<UserPreferences>) {
    preferences.value = { ...preferences.value, ...updates }
    savePreferences()
  }

  function resetPreferences() {
    preferences.value = { ...DEFAULT_PREFERENCES }
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

  return {
    preferences: readonly(preferences),
    updatePreferences,
    resetPreferences,
    setDeepWorkWindow,
    removeDeepWorkWindow,
    isWorkDay,
    getDeepWorkWindow,
  }
}
