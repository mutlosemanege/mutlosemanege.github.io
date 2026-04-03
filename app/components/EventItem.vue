<script setup lang="ts">
import type { CalendarEvent } from '~/composables/useCalendar'

const props = defineProps<{
  event: CalendarEvent
  compact?: boolean
}>()

const emit = defineEmits<{
  click: [event: CalendarEvent]
}>()

const EVENT_COLORS: Record<string, string> = {
  '1': 'bg-blue-100 text-blue-800 border-blue-300',
  '2': 'bg-green-100 text-green-800 border-green-300',
  '3': 'bg-purple-100 text-purple-800 border-purple-300',
  '4': 'bg-red-100 text-red-800 border-red-300',
  '5': 'bg-yellow-100 text-yellow-800 border-yellow-300',
  '6': 'bg-orange-100 text-orange-800 border-orange-300',
  '7': 'bg-cyan-100 text-cyan-800 border-cyan-300',
  '8': 'bg-gray-100 text-gray-800 border-gray-300',
  '9': 'bg-indigo-100 text-indigo-800 border-indigo-300',
  '10': 'bg-emerald-100 text-emerald-800 border-emerald-300',
  '11': 'bg-rose-100 text-rose-800 border-rose-300',
}

const colorClass = computed(() => {
  return EVENT_COLORS[props.event.colorId || ''] || 'bg-primary-100 text-primary-800 border-primary-300'
})

const timeStr = computed(() => {
  const dt = props.event.start.dateTime
  if (!dt) return 'Ganztaegig'
  return new Date(dt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
})
</script>

<template>
  <button
    :class="[
      'w-full text-left rounded px-1.5 py-0.5 text-xs border truncate cursor-pointer hover:opacity-80 transition-opacity',
      colorClass,
      compact ? 'leading-tight' : ''
    ]"
    :title="event.summary"
    @click.stop="emit('click', event)"
  >
    <span class="font-medium">{{ timeStr }}</span>
    <span class="ml-1">{{ event.summary }}</span>
  </button>
</template>
