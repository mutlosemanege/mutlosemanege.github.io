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

const monthLabel = computed(() => {
  return props.currentDate.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
})
</script>

<template>
  <div>
    <!-- Header -->
    <div class="text-center mb-4">
      <h2 class="text-xl font-semibold text-gray-900 capitalize">{{ monthLabel }}</h2>
    </div>

    <!-- Grid -->
    <div class="border border-gray-200 rounded-lg overflow-hidden">
      <!-- Weekday headers -->
      <div class="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
        <div
          v-for="day in WEEKDAYS"
          :key="day"
          class="py-2 text-center text-xs font-semibold text-gray-600 uppercase"
        >
          {{ day }}
        </div>
      </div>

      <!-- Day cells -->
      <div class="grid grid-cols-7">
        <div
          v-for="(cell, idx) in days"
          :key="idx"
          :class="[
            'min-h-[80px] sm:min-h-[100px] p-1 border-b border-r border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors',
            !cell.isCurrentMonth && 'bg-gray-50/50'
          ]"
          @click="emit('select-date', cell.dateStr)"
        >
          <div class="flex items-center justify-center mb-1">
            <span
              :class="[
                'inline-flex items-center justify-center w-7 h-7 text-sm rounded-full',
                cell.isToday && 'bg-primary-600 text-white font-bold',
                !cell.isToday && cell.isCurrentMonth && 'text-gray-900',
                !cell.isToday && !cell.isCurrentMonth && 'text-gray-400'
              ]"
            >
              {{ cell.day }}
            </span>
          </div>
          <div class="space-y-0.5">
            <EventItem
              v-for="ev in cell.events.slice(0, 3)"
              :key="ev.id"
              :event="ev"
              compact
              @click="emit('select-event', ev)"
            />
            <div
              v-if="cell.events.length > 3"
              class="text-xs text-gray-500 text-center"
            >
              +{{ cell.events.length - 3 }} weitere
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
