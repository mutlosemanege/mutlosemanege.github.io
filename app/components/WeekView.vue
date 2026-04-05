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
  <div class="glass-card ambient-glow-blue overflow-hidden">
    <div class="grid grid-cols-8 border-b border-border-subtle bg-white/[0.03]">
      <div class="border-r border-border-subtle px-2 py-3 text-center text-xs uppercase tracking-[0.24em] text-text-muted" />
        <div
          v-for="col in weekDays"
          :key="col.dateStr"
          :class="[
            'border-r border-border-subtle px-2 py-3 text-center last:border-r-0',
            col.isToday && 'bg-accent-purple/5',
          ]"
        >
          <div class="text-xs font-medium uppercase tracking-[0.24em] text-text-secondary">{{ col.label }}</div>
          <div
            :class="[
              'mt-1 inline-flex h-8 w-8 items-center justify-center rounded-full text-sm',
              col.isToday ? 'bg-accent-purple text-white font-bold shadow-glow-purple' : 'text-text-primary'
            ]"
          >
            {{ col.dayNum }}
          </div>
          <div class="mt-2 space-y-1 px-0.5">
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

    <div class="overflow-auto">
      <div class="grid grid-cols-8 relative">
        <div class="border-r border-border-subtle bg-surface/35">
          <div v-for="hour in HOURS" :key="hour" class="h-14 border-b border-border-subtle/70 pr-2 pt-0 text-right">
            <span class="text-xs text-text-muted">{{ String(hour).padStart(2, '0') }}:00</span>
          </div>
        </div>

        <div
          v-for="col in weekDays"
          :key="col.dateStr"
          :class="[
            'relative cursor-pointer border-r border-border-subtle last:border-r-0',
            col.isToday && 'bg-accent-purple/[0.04]',
          ]"
          @click="emit('select-date', col.dateStr)"
        >
          <div v-for="hour in HOURS" :key="hour" class="h-14 border-b border-border-subtle/70 transition hover:bg-white/[0.02]" />

          <div
            v-for="ev in getTimedEvents(col.events)"
            :key="ev.id"
            class="absolute left-1 right-1 z-10"
            :style="getEventStyle(ev)"
          >
            <EventItem :event="ev" compact @click="emit('select-event', ev)" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
