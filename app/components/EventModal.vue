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
      : { dateTime: new Date(`${endDate.value}T${endTime.value}`).toISOString(), timeZone: tz }
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
      <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/40" @click="emit('close')" />

        <!-- Modal -->
        <div class="relative bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
          <h2 class="text-lg font-semibold text-gray-900">
            {{ isEditing ? 'Termin bearbeiten' : 'Neuer Termin' }}
          </h2>

          <div class="space-y-3">
            <!-- Title -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Titel</label>
              <input
                v-model="title"
                type="text"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                placeholder="Terminname eingeben..."
                @keydown.enter="handleSave"
              >
            </div>

            <!-- Description -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Beschreibung</label>
              <textarea
                v-model="description"
                rows="2"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none resize-none"
                placeholder="Optional..."
              />
            </div>

            <!-- All Day Toggle -->
            <label class="flex items-center gap-2 cursor-pointer">
              <input v-model="allDay" type="checkbox" class="rounded border-gray-300 text-primary-600 focus:ring-primary-500">
              <span class="text-sm text-gray-700">Ganztaegig</span>
            </label>

            <!-- Start -->
            <div class="grid gap-2" :class="allDay ? 'grid-cols-1' : 'grid-cols-2'">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Start</label>
                <input
                  v-model="startDate"
                  type="date"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                >
              </div>
              <div v-if="!allDay">
                <label class="block text-sm font-medium text-gray-700 mb-1">Uhrzeit</label>
                <input
                  v-model="startTime"
                  type="time"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                >
              </div>
            </div>

            <!-- End -->
            <div class="grid gap-2" :class="allDay ? 'grid-cols-1' : 'grid-cols-2'">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Ende</label>
                <input
                  v-model="endDate"
                  type="date"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                >
              </div>
              <div v-if="!allDay">
                <label class="block text-sm font-medium text-gray-700 mb-1">Uhrzeit</label>
                <input
                  v-model="endTime"
                  type="time"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                >
              </div>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex items-center justify-between pt-2">
            <button
              v-if="isEditing"
              class="px-3 py-2 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
              @click="handleDelete"
            >
              Loeschen
            </button>
            <div v-else />

            <div class="flex gap-2">
              <button
                class="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                @click="emit('close')"
              >
                Abbrechen
              </button>
              <button
                class="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
                :disabled="!title.trim()"
                @click="handleSave"
              >
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
