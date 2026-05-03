import type { Ref } from 'vue'
import { resolveLifeAreaLabel } from '~/types/task'
import type { LifeArea, Task } from '~/types/task'

interface UseLifeBalanceOptions {
  tasks: Ref<readonly Task[]>
  inferLifeArea?: (task: Task) => LifeArea
}

const LIFE_AREAS: LifeArea[] = ['arbeit', 'gesundheit', 'privat', 'lernen', 'alltag']

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

function startOfWeek(date: Date) {
  const value = startOfDay(date)
  const shift = (value.getDay() + 6) % 7
  value.setDate(value.getDate() - shift)
  return value
}

function overlapMinutes(start: Date, end: Date, rangeStart: Date, rangeEnd: Date) {
  const overlapStart = Math.max(start.getTime(), rangeStart.getTime())
  const overlapEnd = Math.min(end.getTime(), rangeEnd.getTime())
  return overlapEnd > overlapStart ? Math.round((overlapEnd - overlapStart) / 60000) : 0
}

function scheduledMinutesInRange(task: Task, rangeStart: Date, rangeEnd: Date) {
  if (task.scheduleBlocks?.length) {
    return task.scheduleBlocks.reduce((sum, block) => {
      return sum + overlapMinutes(new Date(block.start), new Date(block.end), rangeStart, rangeEnd)
    }, 0)
  }

  if (task.scheduledStart && task.scheduledEnd) {
    return overlapMinutes(new Date(task.scheduledStart), new Date(task.scheduledEnd), rangeStart, rangeEnd)
  }

  return 0
}

export function useLifeBalance({ tasks, inferLifeArea }: UseLifeBalanceOptions) {
  function resolveArea(task: Task): LifeArea {
    return inferLifeArea?.(task) || task.lifeArea || 'arbeit'
  }

  const currentWeek = computed(() => {
    const start = startOfWeek(new Date())
    const end = endOfDay(new Date(start))
    end.setDate(start.getDate() + 6)
    return { start, end }
  })

  const recentWindow = computed(() => {
    const end = endOfDay(new Date())
    const start = startOfDay(new Date())
    start.setDate(start.getDate() - 13)
    return { start, end }
  })

  const weeklyAreaBalance = computed(() => {
    const totals = new Map<LifeArea, number>(LIFE_AREAS.map(area => [area, 0]))

    for (const task of tasks.value) {
      const minutes = scheduledMinutesInRange(task, currentWeek.value.start, currentWeek.value.end)
      if (minutes <= 0) continue
      const area = resolveArea(task)
      totals.set(area, (totals.get(area) || 0) + minutes)
    }

    return LIFE_AREAS.map(area => ({
      area,
      label: resolveLifeAreaLabel(area),
      minutes: totals.get(area) || 0,
    }))
  })

  const neglectedAreas = computed(() => {
    const totals = new Map<LifeArea, number>(LIFE_AREAS.map(area => [area, 0]))

    for (const task of tasks.value) {
      const minutes = scheduledMinutesInRange(task, recentWindow.value.start, recentWindow.value.end)
      if (minutes <= 0) continue
      const area = resolveArea(task)
      totals.set(area, (totals.get(area) || 0) + minutes)
    }

    const totalMinutes = [...totals.values()].reduce((sum, minutes) => sum + minutes, 0)
    if (totalMinutes === 0) return []

    return LIFE_AREAS.map(area => {
      const minutes = totals.get(area) || 0
      return {
        area,
        label: resolveLifeAreaLabel(area),
        minutes,
        share: minutes / totalMinutes,
      }
    })
      .filter(entry => entry.share < 0.2)
      .sort((a, b) => a.share - b.share)
  })

  return {
    weeklyAreaBalance,
    neglectedAreas,
  }
}
