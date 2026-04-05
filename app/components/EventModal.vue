<script setup lang="ts">
import type { CalendarEvent } from '~/composables/useCalendar'

const props = defineProps<{
  show: boolean
  event?: CalendarEvent | null
  defaultDate?: string
}>()

const emit = defineEmits<{
  close: []
  save: [data: Omit<CalendarEvent, 'id'>]
  delete: [eventId: string]
}>()

const isEditing = computed(() => !!props.event?.id)
const title = ref('')
const description = ref('')
const startDate = ref('')
const startTime = ref('')
const endDate = ref('')
const endTime = ref('')
const allDay = ref(false)

function formatDateLocal(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function formatTimeLocal(d: Date): string {
  return d.toTimeString().slice(0, 5)
}

watch(() => props.show, (val) => {
  if (!val) return
  if (props.event) {
    title.value = props.event.summary || ''
    description.value = props.event.description || ''
    if (props.event.start.dateTime) {
      const s = new Date(props.event.start.dateTime)
      const e = new Date(props.event.end.dateTime!)
      startDate.value = formatDateLocal(s)
      startTime.value = formatTimeLocal(s)
      endDate.value = formatDateLocal(e)
      endTime.value = formatTimeLocal(e)
      allDay.value = false
    } else {
      startDate.value = props.event.start.date || ''
      endDate.value = props.event.end.date || ''
      startTime.value = '09:00'
      endTime.value = '10:00'
      allDay.value = true
    }
  } else {
    const d = props.defaultDate || formatDateLocal(new Date())
    title.value = ''
    description.value = ''
    startDate.value = d
    endDate.value = d
    startTime.value = '09:00'
    endTime.value = '10:00'
    allDay.value = false
  }
})

function handleSave() {
  if (!title.value.trim()) return

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone

  const eventData: Omit<CalendarEvent, 'id'> = {
    summary: title.value.trim(),
    description: description.value.trim() || undefined,
    start: allDay.value
      ? { date: startDate.value }
      : { dateTime: new Date(`${startDate.value}T${startTime.value}`).toISOString(), timeZone: tz },
    end: allDay.value
      ? { date: endDate.value || startDate.value }
      : { dateTime: new Date(`${endDate.value}T${endTime.value}`).toISOString(), timeZone: tz },
  }

  emit('save', eventData)
}

function handleDelete() {
  if (props.event?.id) {
    emit('delete', props.event.id)
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="show" class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
        <div class="absolute inset-0" @click="emit('close')" />

        <div class="glass-card-elevated relative z-10 w-full overflow-y-auto rounded-t-glass-xl p-6 sm:max-w-lg sm:rounded-glass-lg">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.24em] text-accent-blue">Kalender</p>
              <h2 class="mt-2 text-xl font-semibold text-text-primary">
                {{ isEditing ? 'Termin bearbeiten' : 'Neuer Termin' }}
              </h2>
            </div>
            <button type="button" class="btn-secondary inline-flex h-10 w-10 items-center justify-center" @click="emit('close')">
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div class="mt-5 space-y-5">
            <div>
              <label class="mb-2 block text-sm font-medium text-text-secondary">Titel</label>
              <input
                v-model="title"
                type="text"
                class="input-dark w-full px-4 py-3"
                placeholder="Terminname eingeben..."
                @keydown.enter="handleSave"
              >
            </div>

            <div>
              <label class="mb-2 block text-sm font-medium text-text-secondary">Beschreibung</label>
              <textarea
                v-model="description"
                rows="3"
                class="input-dark w-full resize-none px-4 py-3"
                placeholder="Optional..."
              />
            </div>

            <button
              type="button"
              class="flex w-full items-center justify-between rounded-glass border px-4 py-3 text-left transition"
              :class="allDay ? 'border-accent-blue/40 bg-accent-blue/10 text-text-primary' : 'border-border-subtle bg-white/[0.03] text-text-secondary hover:border-border-medium'"
              @click="allDay = !allDay"
            >
              <div>
                <div class="text-sm font-medium">Ganztägig</div>
                <div class="mt-1 text-xs text-text-muted">Ideal für freie Tage, Abgaben oder Reisen.</div>
              </div>
              <span class="relative inline-flex h-6 w-11 rounded-full transition" :class="allDay ? 'bg-accent-blue' : 'bg-white/10'">
                <span class="absolute top-1 h-4 w-4 rounded-full bg-white transition" :class="allDay ? 'left-6' : 'left-1'" />
              </span>
            </button>

            <div class="grid gap-4" :class="allDay ? 'grid-cols-1' : 'sm:grid-cols-2'">
              <div>
                <label class="mb-2 block text-sm font-medium text-text-secondary">Start</label>
                <input v-model="startDate" type="date" class="input-dark w-full px-4 py-3">
              </div>
              <div v-if="!allDay">
                <label class="mb-2 block text-sm font-medium text-text-secondary">Uhrzeit</label>
                <input v-model="startTime" type="time" class="input-dark w-full px-4 py-3">
              </div>
            </div>

            <div class="grid gap-4" :class="allDay ? 'grid-cols-1' : 'sm:grid-cols-2'">
              <div>
                <label class="mb-2 block text-sm font-medium text-text-secondary">Ende</label>
                <input v-model="endDate" type="date" class="input-dark w-full px-4 py-3">
              </div>
              <div v-if="!allDay">
                <label class="mb-2 block text-sm font-medium text-text-secondary">Uhrzeit</label>
                <input v-model="endTime" type="time" class="input-dark w-full px-4 py-3">
              </div>
            </div>
          </div>

          <div class="mt-6 flex items-center justify-between gap-3 border-t border-border-subtle pt-5">
            <button
              v-if="isEditing"
              type="button"
              class="rounded-xl px-3 py-2 text-sm text-priority-critical transition hover:bg-priority-critical/10"
              @click="handleDelete"
            >
              Löschen
            </button>
            <div v-else />

            <div class="flex gap-2">
              <button type="button" class="btn-secondary px-4 py-2 text-sm" @click="emit('close')">Abbrechen</button>
              <button type="button" class="btn-primary px-4 py-2 text-sm disabled:opacity-50" :disabled="!title.trim()" @click="handleSave">
                {{ isEditing ? 'Speichern' : 'Erstellen' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
