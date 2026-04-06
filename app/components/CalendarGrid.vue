<script setup lang="ts">
import type { CalendarEvent } from '~/composables/useCalendar'

const props = defineProps<{
  currentDate: Date
  events: readonly CalendarEvent[]
}>()

const emit = defineEmits<{
  'select-date': [date: string]
  'select-event': [event: CalendarEvent]
}>()

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

interface DayCell {
  date: Date
  dateStr: string
  day: number
  isCurrentMonth: boolean
  isToday: boolean
  events: CalendarEvent[]
}

const days = computed<DayCell[]>(() => {
  const year = props.currentDate.getFullYear()
  const month = props.currentDate.getMonth()

  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)

  // Monday = 0, Sunday = 6
  let startOffset = firstDay.getDay() - 1
  if (startOffset < 0) startOffset = 6

  const startDate = new Date(year, month, 1 - startOffset)
  const totalCells = Math.ceil((startOffset + lastDay.getDate()) / 7) * 7

  const today = new Date()
  const todayStr = formatDate(today)

  const cells: DayCell[] = []
  for (let i = 0; i < totalCells; i++) {
    const d = new Date(startDate)
    d.setDate(startDate.getDate() + i)
    const dateStr = formatDate(d)

    cells.push({
      date: d,
      dateStr,
      day: d.getDate(),
      isCurrentMonth: d.getMonth() === month,
      isToday: dateStr === todayStr,
      events: getEventsForDate(dateStr)
    })
  }

  return cells
})

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getEventsForDate(dateStr: string): CalendarEvent[] {
  return props.events.filter(e => {
    if (e.start.date) {
      return e.start.date === dateStr
    }
    if (e.start.dateTime) {
      return e.start.dateTime.slice(0, 10) === dateStr
    }
    return false
  })
}

</script>

<template>
  <div class="glass-card ambient-glow-purple overflow-hidden">
    <div class="grid grid-cols-7 border-b border-border-subtle bg-white/[0.03] px-2 py-3">
        <div
          v-for="day in WEEKDAYS"
          :key="day"
          class="py-2 text-center text-xs font-medium uppercase tracking-[0.24em] text-text-muted"
        >
          {{ day }}
        </div>
      </div>

    <div class="grid grid-cols-7">
        <div
          v-for="(cell, idx) in days"
          :key="idx"
          :class="[
            'min-h-[104px] border-b border-r border-border-subtle/70 p-2 transition hover:bg-white/[0.03] sm:min-h-[132px]',
            !cell.isCurrentMonth && 'text-text-muted/40',
            cell.isToday && 'bg-accent-purple/5 ring-1 ring-inset ring-accent-purple/20'
          ]"
          @click="emit('select-date', cell.dateStr)"
        >
          <div class="mb-2 flex items-center justify-between">
            <span
              :class="[
                'inline-flex h-8 w-8 items-center justify-center rounded-full text-sm',
                cell.isToday && 'bg-accent-purple text-white font-bold shadow-glow-purple',
                !cell.isToday && cell.isCurrentMonth && 'text-text-primary',
                !cell.isToday && !cell.isCurrentMonth && 'text-text-muted/50'
              ]"
            >
              {{ cell.day }}
            </span>
            <span
              v-if="cell.events.length > 0"
              class="rounded-full bg-white/[0.04] px-2 py-0.5 text-[11px] text-text-muted"
            >
              {{ cell.events.length }}
            </span>
          </div>
          <div class="space-y-1">
            <EventItem
              v-for="ev in cell.events.slice(0, 3)"
              :key="ev.id"
              :event="ev"
              compact
              @click="emit('select-event', ev)"
            />
            <div
              v-if="cell.events.length > 3"
              class="px-1 text-xs text-text-muted"
            >
              +{{ cell.events.length - 3 }} mehr
            </div>
          </div>
        </div>
      </div>
  </div>
</template>
