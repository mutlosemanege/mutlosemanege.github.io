<script setup lang="ts">
import type { DeepWorkWindow } from '~/types/task'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const { preferences, updatePreferences, setDeepWorkWindow, removeDeepWorkWindow, resetPreferences } = usePreferences()

const dayNames = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
const dayNamesShort = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']

// Lokale Kopie fuer das Formular
const form = reactive({
  workStartHour: 9,
  workEndHour: 17,
  lunchStartHour: 12,
  lunchEndHour: 13,
  minDeepWorkBlockMinutes: 90,
  deadlineWarningDays: 3,
  workDays: [1, 2, 3, 4, 5] as number[],
  deepWorkWindows: [] as DeepWorkWindow[],
})

watch(() => props.show, (val) => {
  if (!val) return
  const p = preferences.value
  form.workStartHour = p.workStartHour
  form.workEndHour = p.workEndHour
  form.lunchStartHour = p.lunchStartHour
  form.lunchEndHour = p.lunchEndHour
  form.minDeepWorkBlockMinutes = p.minDeepWorkBlockMinutes
  form.deadlineWarningDays = p.deadlineWarningDays
  form.workDays = [...p.workDays]
  form.deepWorkWindows = p.deepWorkWindows.map(w => ({ ...w }))
})

function toggleWorkDay(day: number) {
  const idx = form.workDays.indexOf(day)
  if (idx >= 0) {
    form.workDays.splice(idx, 1)
  } else {
    form.workDays.push(day)
    form.workDays.sort()
  }
}

function getDeepWorkForDay(day: number): DeepWorkWindow | undefined {
  return form.deepWorkWindows.find(w => w.day === day)
}

function toggleDeepWork(day: number) {
  const existing = getDeepWorkForDay(day)
  if (existing) {
    form.deepWorkWindows = form.deepWorkWindows.filter(w => w.day !== day)
  } else {
    form.deepWorkWindows.push({
      day,
      startHour: form.workStartHour,
      endHour: Math.min(form.workStartHour + 3, form.workEndHour),
    })
  }
}

function updateDeepWorkHour(day: number, field: 'startHour' | 'endHour', value: number) {
  const w = getDeepWorkForDay(day)
  if (w) w[field] = value
}

function handleSave() {
  updatePreferences({
    workStartHour: form.workStartHour,
    workEndHour: form.workEndHour,
    lunchStartHour: form.lunchStartHour,
    lunchEndHour: form.lunchEndHour,
    minDeepWorkBlockMinutes: form.minDeepWorkBlockMinutes,
    deadlineWarningDays: form.deadlineWarningDays,
    workDays: [...form.workDays],
    deepWorkWindows: form.deepWorkWindows.map(w => ({ ...w })),
  })
  emit('close')
}

function handleReset() {
  resetPreferences()
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/40" @click="emit('close')" />

        <!-- Modal -->
        <div class="relative bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 space-y-5 max-h-[90vh] overflow-y-auto">
          <h2 class="text-lg font-semibold text-gray-900">Planung und Routinen</h2>
          <p class="text-sm text-gray-500">
            Lege hier fest, wann du normalerweise arbeitest und welche Zeiten der Planer frei halten soll.
          </p>

          <!-- Arbeitszeiten -->
          <div>
            <h3 class="text-sm font-medium text-gray-700 mb-2">Arbeitszeiten</h3>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs text-gray-500 mb-1">Start</label>
                <select
                  v-model.number="form.workStartHour"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                >
                  <option v-for="h in 24" :key="h - 1" :value="h - 1">
                    {{ String(h - 1).padStart(2, '0') }}:00
                  </option>
                </select>
              </div>
              <div>
                <label class="block text-xs text-gray-500 mb-1">Ende</label>
                <select
                  v-model.number="form.workEndHour"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                >
                  <option v-for="h in 24" :key="h" :value="h">
                    {{ String(h).padStart(2, '0') }}:00
                  </option>
                </select>
              </div>
            </div>
          </div>

          <!-- Mittagspause -->
          <div>
            <h3 class="text-sm font-medium text-gray-700 mb-2">Mittagspause</h3>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs text-gray-500 mb-1">Von</label>
                <select
                  v-model.number="form.lunchStartHour"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                >
                  <option v-for="h in 24" :key="h - 1" :value="h - 1">
                    {{ String(h - 1).padStart(2, '0') }}:00
                  </option>
                </select>
              </div>
              <div>
                <label class="block text-xs text-gray-500 mb-1">Bis</label>
                <select
                  v-model.number="form.lunchEndHour"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                >
                  <option v-for="h in 24" :key="h" :value="h">
                    {{ String(h).padStart(2, '0') }}:00
                  </option>
                </select>
              </div>
            </div>
          </div>

          <!-- Arbeitstage -->
          <div>
            <h3 class="text-sm font-medium text-gray-700 mb-2">Arbeitstage</h3>
            <div class="flex gap-1.5">
              <button
                v-for="day in 7"
                :key="day"
                :class="[
                  'w-10 h-10 rounded-lg text-xs font-medium transition-colors',
                  form.workDays.includes(day % 7)
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                ]"
                @click="toggleWorkDay(day % 7)"
              >
                {{ dayNamesShort[day % 7] }}
              </button>
            </div>
          </div>

          <!-- Deep Work Fenster -->
          <div>
            <h3 class="text-sm font-medium text-gray-700 mb-2">Deep-Work-Zeiten</h3>
            <p class="text-xs text-gray-500 mb-3">
              Geschuetzte Fokuszeiten, in denen nur Deep-Work-Aufgaben eingeplant werden.
            </p>
            <div class="space-y-2">
              <div
                v-for="day in form.workDays"
                :key="day"
                class="flex items-center gap-3"
              >
                <label class="flex items-center gap-2 w-24 cursor-pointer">
                  <input
                    type="checkbox"
                    :checked="!!getDeepWorkForDay(day)"
                    class="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    @change="toggleDeepWork(day)"
                  >
                  <span class="text-sm text-gray-700">{{ dayNames[day] }}</span>
                </label>
                <template v-if="getDeepWorkForDay(day)">
                  <select
                    :value="getDeepWorkForDay(day)!.startHour"
                    class="px-2 py-1 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                    @change="updateDeepWorkHour(day, 'startHour', Number(($event.target as HTMLSelectElement).value))"
                  >
                    <option v-for="h in 24" :key="h - 1" :value="h - 1">
                      {{ String(h - 1).padStart(2, '0') }}:00
                    </option>
                  </select>
                  <span class="text-gray-400">-</span>
                  <select
                    :value="getDeepWorkForDay(day)!.endHour"
                    class="px-2 py-1 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                    @change="updateDeepWorkHour(day, 'endHour', Number(($event.target as HTMLSelectElement).value))"
                  >
                    <option v-for="h in 24" :key="h" :value="h">
                      {{ String(h).padStart(2, '0') }}:00
                    </option>
                  </select>
                </template>
              </div>
            </div>
          </div>

          <!-- Weitere Einstellungen -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Min. Deep-Work-Block</label>
              <select
                v-model.number="form.minDeepWorkBlockMinutes"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              >
                <option :value="30">30 Min.</option>
                <option :value="60">60 Min.</option>
                <option :value="90">90 Min.</option>
                <option :value="120">120 Min.</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Deadline-Warnung</label>
              <select
                v-model.number="form.deadlineWarningDays"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              >
                <option :value="1">1 Tag vorher</option>
                <option :value="2">2 Tage vorher</option>
                <option :value="3">3 Tage vorher</option>
                <option :value="5">5 Tage vorher</option>
                <option :value="7">7 Tage vorher</option>
              </select>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex items-center justify-between pt-2">
            <button
              class="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              @click="handleReset"
            >
              Zuruecksetzen
            </button>
            <div class="flex gap-2">
              <button
                class="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                @click="emit('close')"
              >
                Abbrechen
              </button>
              <button
                class="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                @click="handleSave"
              >
                Speichern
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
