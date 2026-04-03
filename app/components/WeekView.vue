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

interface DayColumn {
  date: Date
  dateStr: string
  label: string
  dayNum: number
  isToday: boolean
  events: CalendarEvent[]
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const weekDays = computed<DayColumn[]>(() => {
  const d = new Date(props.currentDate)
  // Go to Monday of this week
  const dayOfWeek = d.getDay()
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const monday = new Date(d)
  monday.setDate(d.getDate() + diff)

  const today = formatDate(new Date())
  const columns: DayColumn[] = []
  const dayNames = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

  for (let i = 0; i < 7; i++) {
    const date = new Date(monday)
    date.setDate(monday.getDate() + i)
    const dateStr = formatDate(date)

    columns.push({
      date,
      dateStr,
      label: dayNames[i],
      dayNum: date.getDate(),
      isToday: dateStr === today,
      events: getEventsForDate(dateStr)
    })
  }

  return columns
})

function getEventsForDate(dateStr: string): CalendarEvent[] {
  return props.events.filter(e => {
    if (e.start.date) return e.start.date === dateStr
    if (e.start.dateTime) return e.start.dateTime.slice(0, 10) === dateStr
    return false
  })
}

const weekLabel = computed(() => {
  if (weekDays.value.length === 0) return ''
  const first = weekDays.value[0].date
  const last = weekDays.value[6].date
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
  return `${first.toLocaleDateString('de-DE', opts)} – ${last.toLocaleDateString('de-DE', { ...opts, year: 'numeric' })}`
})

const HOURS = Array.from({ length: 24 }, (_, i) => i)

function getEventStyle(event: CalendarEvent): Record<string, string> {
  if (!event.start.dateTime) return {}
  const start = new Date(event.start.dateTime)
  const end = new Date(event.end.dateTime!)
  const topMinutes = start.getHours() * 60 + start.getMinutes()
  const durationMinutes = Math.max((end.getTime() - start.getTime()) / 60000, 15)
  return {
    top: `${(topMinutes / 60) * 3.5}rem`,
    height: `${(durationMinutes / 60) * 3.5}rem`,
    minHeight: '1.25rem'
  }
}

function getTimedEvents(events: CalendarEvent[]): CalendarEvent[] {
  return events.filter(e => !!e.start.dateTime)
}

function getAllDayEvents(events: CalendarEvent[]): CalendarEvent[] {
  return events.filter(e => !!e.start.date)
}
</script>

<template>
  <div>
    <!-- Header -->
    <div class="text-center mb-4">
      <h2 class="text-xl font-semibold text-gray-900">{{ weekLabel }}</h2>
    </div>

    <!-- All-day events row -->
    <div class="border border-gray-200 rounded-t-lg overflow-hidden">
      <div class="grid grid-cols-8 bg-gray-50 border-b border-gray-200">
        <div class="py-2 px-1 text-center text-xs text-gray-500 border-r border-gray-200" />
        <div
          v-for="col in weekDays"
          :key="col.dateStr"
          class="py-2 text-center border-r border-gray-200 last:border-r-0"
        >
          <div class="text-xs font-semibold text-gray-600 uppercase">{{ col.label }}</div>
          <div
            :class="[
              'inline-flex items-center justify-center w-8 h-8 text-sm rounded-full mt-0.5',
              col.isToday ? 'bg-primary-600 text-white font-bold' : 'text-gray-900'
            ]"
          >
            {{ col.dayNum }}
          </div>
          <!-- All-day events -->
          <div class="px-0.5 space-y-0.5">
            <EventItem
              v-for="ev in getAllDayEvents(col.events)"
              :key="ev.id"
              :event="ev"
              compact
              @click="emit('select-event', ev)"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Time grid -->
    <div class="border-x border-b border-gray-200 rounded-b-lg overflow-auto max-h-[600px]">
      <div class="grid grid-cols-8 relative">
        <!-- Time labels -->
        <div class="border-r border-gray-200">
          <div v-for="hour in HOURS" :key="hour" class="h-14 border-b border-gray-100 pr-2 pt-0 text-right">
            <span class="text-xs text-gray-400">{{ String(hour).padStart(2, '0') }}:00</span>
          </div>
        </div>

        <!-- Day columns -->
        <div
          v-for="col in weekDays"
          :key="col.dateStr"
          class="relative border-r border-gray-200 last:border-r-0 cursor-pointer"
          @click="emit('select-date', col.dateStr)"
        >
          <!-- Hour lines -->
          <div v-for="hour in HOURS" :key="hour" class="h-14 border-b border-gray-100" />

          <!-- Timed events -->
          <div
            v-for="ev in getTimedEvents(col.events)"
            :key="ev.id"
            class="absolute left-0.5 right-0.5 z-10"
            :style="getEventStyle(ev)"
          >
            <EventItem :event="ev" compact @click="emit('select-event', ev)" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
