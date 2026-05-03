import type { Ref } from 'vue'
import { resolveLifeAreaLabel } from '~/types/task'
import type { DailyReflectionEntry, LifeArea, Task } from '~/types/task'

interface UseDayFlowOptions {
  tasks: Ref<readonly Task[]>
  inferLifeArea?: (task: Task) => LifeArea
}

function startOfDay(date: Date) {
  const value = new Date(date)
  value.setHours(0, 0, 0, 0)
  return value
}

function endOfDay(date: Date) {
  const value = new Date(date)
  value.setHours(23, 59, 59, 999)
  return value
}

function reflectionSaved(reflection: DailyReflectionEntry) {
  return reflection.tags.length > 0 || Boolean(reflection.note?.trim())
}

function taskTouchesDate(task: Task, date: Date) {
  const dayStart = startOfDay(date)
  const dayEnd = endOfDay(date)

  if (task.scheduleBlocks?.length) {
    return task.scheduleBlocks.some((block) => {
      const start = new Date(block.start)
      const end = new Date(block.end)
      return start <= dayEnd && end >= dayStart
    })
  }

  if (task.scheduledStart && task.scheduledEnd) {
    const start = new Date(task.scheduledStart)
    const end = new Date(task.scheduledEnd)
    return start <= dayEnd && end >= dayStart
  }

  if (!task.deadline) return false
  const deadline = new Date(task.deadline)
  return deadline >= dayStart && deadline <= dayEnd
}

function sortByTaskPressure(a: Task, b: Task) {
  const aTime = a.scheduledStart || a.deadline || ''
  const bTime = b.scheduledStart || b.deadline || ''
  return new Date(aTime || '9999-12-31T23:59:59.999Z').getTime() - new Date(bTime || '9999-12-31T23:59:59.999Z').getTime()
}

export function useDayFlow({ tasks, inferLifeArea }: UseDayFlowOptions) {
  const { preferences, getDailyCommit, getDailyReflection } = usePreferences()

  function resolveArea(task: Task): LifeArea {
    return inferLifeArea?.(task) || task.lifeArea || 'arbeit'
  }

  const today = computed(() => startOfDay(new Date()))
  const yesterday = computed(() => {
    const value = startOfDay(new Date())
    value.setDate(value.getDate() - 1)
    return value
  })

  const todayCommit = computed(() => getDailyCommit(today.value))
  const todayReflection = computed(() => getDailyReflection(today.value))
  const yesterdayCommit = computed(() => getDailyCommit(yesterday.value))
  const yesterdayReflection = computed(() => getDailyReflection(yesterday.value))

  const yesterdayContinuitySummary = computed(() => {
    if (!reflectionSaved(yesterdayReflection.value)) return null

    const committedIds = yesterdayCommit.value.committedTaskIds
    const committedTasks = tasks.value.filter(task => committedIds.includes(task.id))
    const summaryParts: string[] = []

    if (committedIds.length > 0) {
      const doneCount = committedTasks.filter(task => task.status === 'done').length
      summaryParts.push(`${doneCount}/${committedIds.length} Aufgaben erledigt`)
    }

    if (committedTasks.length > 0) {
      const areaCounts = new Map<LifeArea, number>()
      for (const task of committedTasks) {
        const area = resolveArea(task)
        areaCounts.set(area, (areaCounts.get(area) || 0) + 1)
      }
      const leadArea = [...areaCounts.entries()]
        .sort((a, b) => b[1] - a[1])[0]?.[0]
      if (leadArea) {
        summaryParts.push(`Fokus auf ${resolveLifeAreaLabel(leadArea)}`)
      }
    }

    if (summaryParts.length === 0) {
      if (yesterdayReflection.value.tags.length > 0) {
        summaryParts.push(yesterdayReflection.value.tags.join(', '))
      } else {
        summaryParts.push('kurzer Tagesabschluss gespeichert')
      }
    }

    return `Gestern: ${summaryParts.join(', ')}`
  })

  const middayCheckIn = computed(() => {
    const now = new Date()
    if (now.getHours() < 12 || now.getHours() >= 14) return null
    if (todayCommit.value.committedTaskIds.length === 0) return null

    const committedIds = new Set(todayCommit.value.committedTaskIds)
    const openPlannedTasks = tasks.value
      .filter(task => committedIds.has(task.id) && task.status !== 'done' && taskTouchesDate(task, today.value))
      .sort(sortByTaskPressure)

    if (openPlannedTasks.length === 0) return null

    const doneCount = tasks.value.filter(task => committedIds.has(task.id) && task.status === 'done').length
    const nextTask = openPlannedTasks[0]

    return {
      label: 'Mittag - alles noch auf Kurs?',
      summary: `${openPlannedTasks.length} offene Fokusaufgabe${openPlannedTasks.length === 1 ? '' : 'n'}, ${doneCount}/${todayCommit.value.committedTaskIds.length} bereits erledigt.`,
      detail: nextTask
        ? `Als Naechstes drueckt ${nextTask.title}. Ein kurzer Check haelt den Nachmittag realistisch.`
        : 'Ein kurzer Check haelt den Nachmittag realistisch.',
    }
  })

  const eveningReflectionNudge = computed(() => {
    const now = new Date()
    if (now.getHours() < preferences.value.workEndHour) return null
    if (reflectionSaved(todayReflection.value)) return null

    return {
      label: 'Abendabschluss noch offen',
      detail: 'Ein kurzer Tagesabschluss hilft der KI morgen mit realistischerem Fokus, Puffer und besseren Empfehlungen.',
    }
  })

  return {
    yesterdayContinuitySummary,
    middayCheckIn,
    eveningReflectionNudge,
  }
}
