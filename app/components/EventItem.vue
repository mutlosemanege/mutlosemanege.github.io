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
  '1': 'bg-[#B7A2FF]/15 text-[#B7A2FF] border-l-[#B7A2FF]',
  '2': 'bg-[#8DFFB5]/15 text-[#8DFFB5] border-l-[#8DFFB5]',
  '3': 'bg-[#C084FC]/15 text-[#C084FC] border-l-[#C084FC]',
  '4': 'bg-[#F6C1E7]/15 text-[#F6C1E7] border-l-[#F6C1E7]',
  '5': 'bg-[#FFD66B]/15 text-[#FFD66B] border-l-[#FFD66B]',
  '6': 'bg-[#FFB06B]/15 text-[#FFB06B] border-l-[#FFB06B]',
  '7': 'bg-[#6CB8FF]/15 text-[#6CB8FF] border-l-[#6CB8FF]',
  '8': 'bg-[#A7B0C5]/15 text-[#A7B0C5] border-l-[#A7B0C5]',
  '9': 'bg-[#818CF8]/15 text-[#818CF8] border-l-[#818CF8]',
  '10': 'bg-[#6EE7B7]/15 text-[#6EE7B7] border-l-[#6EE7B7]',
  '11': 'bg-[#FF6B8A]/15 text-[#FF6B8A] border-l-[#FF6B8A]',
}

const colorClass = computed(() => {
  return EVENT_COLORS[props.event.colorId || ''] || 'bg-accent-purple/15 text-accent-purple border-l-accent-purple'
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
      'w-full truncate rounded-lg border border-white/5 border-l-[3px] px-2 py-1 text-left text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition duration-150 hover:-translate-y-0.5 hover:border-white/10 hover:brightness-110',
      colorClass,
      compact ? 'leading-tight' : 'py-1.5'
    ]"
    :title="event.summary"
    @click.stop="emit('click', event)"
  >
    <span class="font-medium">{{ timeStr }}</span>
    <span class="ml-1 text-text-primary/90">{{ event.summary }}</span>
  </button>
</template>
