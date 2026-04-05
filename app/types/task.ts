export interface Task {
  readonly id: string
  title: string
  description?: string
  estimatedMinutes: number
  deadline?: string // ISO 8601
  priority: TaskPriority
  aiSuggestedPriority?: TaskPriority
  priorityReason?: string
  prioritySource?: 'ai' | 'manual' | 'system'
  status: TaskStatus
  projectId?: string
  dependencies: readonly string[] // Task-IDs die vorher erledigt sein muessen
  scheduleBlocks?: readonly TaskScheduleBlock[]
  scheduledStart?: string // ISO 8601
  scheduledEnd?: string
  calendarEventId?: string // Verknuepftes Google Calendar Event
  isDeepWork: boolean
  createdAt: string
  updatedAt: string
}

export interface TaskScheduleBlock {
  start: string
  end: string
  calendarEventId?: string
}

export type TaskPriority = 'critical' | 'high' | 'medium' | 'low'
export type TaskStatus = 'todo' | 'scheduled' | 'in_progress' | 'done' | 'missed'
export type PlanningStyle = 'entspannt' | 'normal' | 'aggressiv' | 'deadline-first' | 'focus-first'

export interface Project {
  id: string
  name: string
  description: string
  taskIds: string[]
  deadline?: string
  createdAt: string
  updatedAt: string
}

export interface DeepWorkWindow {
  day: number // 0=So, 1=Mo, ..., 6=Sa
  startHour: number
  endHour: number
}

export type RoutineRepeatMode = 'weekly' | 'workdays'

export interface RoutineTemplate {
  id: string
  title: string
  day?: number
  repeatMode?: RoutineRepeatMode
  startHour: number
  endHour: number
  description?: string
  skipDates?: readonly string[]
}

export interface PlanningBehaviorSignals {
  completedByHour: Record<string, number>
  missedByHour: Record<string, number>
  deepWorkCompletedByHour: Record<string, number>
  completionCount: number
  missedCount: number
  rescheduledCount: number
}

export interface UserPreferences {
  planningStyle: PlanningStyle
  behaviorSignals: PlanningBehaviorSignals
  workStartHour: number
  workEndHour: number
  sleepStartHour: number
  sleepEndHour: number
  syncSleepSchedule: boolean
  commuteToWorkMinutes: number
  commuteFromWorkMinutes: number
  syncCommuteSchedule: boolean
  deepWorkWindows: readonly DeepWorkWindow[]
  minDeepWorkBlockMinutes: number
  taskBufferMinutes: number
  lunchStartHour: number
  lunchEndHour: number
  deadlineWarningDays: number
  workDays: readonly number[] // 1=Mo, 2=Di, ..., 5=Fr (default Mo-Fr)
  routineTemplates: readonly RoutineTemplate[]
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  planningStyle: 'normal',
  behaviorSignals: {
    completedByHour: {},
    missedByHour: {},
    deepWorkCompletedByHour: {},
    completionCount: 0,
    missedCount: 0,
    rescheduledCount: 0,
  },
  workStartHour: 9,
  workEndHour: 17,
  sleepStartHour: 23,
  sleepEndHour: 7,
  syncSleepSchedule: false,
  commuteToWorkMinutes: 30,
  commuteFromWorkMinutes: 30,
  syncCommuteSchedule: false,
  deepWorkWindows: [
    { day: 1, startHour: 9, endHour: 12 },
    { day: 2, startHour: 9, endHour: 12 },
    { day: 3, startHour: 9, endHour: 12 },
    { day: 4, startHour: 9, endHour: 12 },
    { day: 5, startHour: 9, endHour: 12 },
  ],
  minDeepWorkBlockMinutes: 90,
  taskBufferMinutes: 15,
  lunchStartHour: 12,
  lunchEndHour: 13,
  deadlineWarningDays: 3,
  workDays: [1, 2, 3, 4, 5],
  routineTemplates: [],
}
