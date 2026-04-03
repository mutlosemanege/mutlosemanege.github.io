import type { Task } from '~/types/task'

export interface DeadlineWarning {
  task: Task
  level: 'critical' | 'warning'
  message: string
  daysRemaining: number
}

export function useDeadlineWatcher() {
  const { preferences } = usePreferences()
  const { tasks } = useTasks()

  const warnings = computed<DeadlineWarning[]>(() => {
    const now = new Date()
    const result: DeadlineWarning[] = []

    for (const task of tasks.value) {
      if (task.status === 'done' || !task.deadline) continue

      const deadline = new Date(task.deadline)
      const msRemaining = deadline.getTime() - now.getTime()
      const daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24))

      // Bereits ueberfaellig
      if (daysRemaining < 0) {
        result.push({
          task,
          level: 'critical',
          message: `"${task.title}" ist ${Math.abs(daysRemaining)} Tag(e) ueberfaellig!`,
          daysRemaining,
        })
        continue
      }

      // Heute faellig
      if (daysRemaining === 0) {
        result.push({
          task,
          level: 'critical',
          message: `"${task.title}" ist heute faellig!`,
          daysRemaining: 0,
        })
        continue
      }

      // Innerhalb des Warnzeitraums
      if (daysRemaining <= preferences.value.deadlineWarningDays) {
        // Zusaetzlich pruefen: Reicht die verbleibende Zeit?
        const workHoursPerDay = preferences.value.workEndHour - preferences.value.workStartHour -
          (preferences.value.lunchEndHour - preferences.value.lunchStartHour)
        const availableMinutes = daysRemaining * workHoursPerDay * 60
        const isTight = task.estimatedMinutes > availableMinutes * 0.5

        result.push({
          task,
          level: isTight ? 'critical' : 'warning',
          message: isTight
            ? `"${task.title}" in ${daysRemaining} Tag(en) faellig — Zeit wird knapp!`
            : `"${task.title}" in ${daysRemaining} Tag(en) faellig`,
          daysRemaining,
        })
      }
    }

    // Sortieren: Kritisch zuerst, dann nach verbleibenden Tagen
    return result.sort((a, b) => {
      if (a.level !== b.level) return a.level === 'critical' ? -1 : 1
      return a.daysRemaining - b.daysRemaining
    })
  })

  const hasWarnings = computed(() => warnings.value.length > 0)
  const criticalCount = computed(() => warnings.value.filter(w => w.level === 'critical').length)

  return {
    warnings,
    hasWarnings,
    criticalCount,
  }
}
