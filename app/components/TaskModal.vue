<script setup lang="ts">
import type { Task, TaskPriority } from '~/types/task'

const props = defineProps<{
  show: boolean
  task?: Task | null
  defaultDate?: string
}>()

const emit = defineEmits<{
  close: []
  save: [data: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>]
  delete: [taskId: string]
}>()

const isEditing = computed(() => !!props.task?.id)

const title = ref('')
const description = ref('')
const estimatedMinutes = ref(30)
const deadline = ref('')
const priority = ref<TaskPriority>('medium')
const isDeepWork = ref(false)

const priorityOptions: { value: TaskPriority; label: string; color: string }[] = [
  { value: 'critical', label: 'Kritisch', color: 'text-red-600' },
  { value: 'high', label: 'Hoch', color: 'text-orange-600' },
  { value: 'medium', label: 'Mittel', color: 'text-yellow-600' },
  { value: 'low', label: 'Niedrig', color: 'text-green-600' },
]

const durationOptions = [
  { value: 15, label: '15 Min.' },
  { value: 30, label: '30 Min.' },
  { value: 45, label: '45 Min.' },
  { value: 60, label: '1 Std.' },
  { value: 90, label: '1,5 Std.' },
  { value: 120, label: '2 Std.' },
  { value: 180, label: '3 Std.' },
  { value: 240, label: '4 Std.' },
]

watch(() => props.show, (val) => {
  if (!val) return
  if (props.task) {
    title.value = props.task.title
    description.value = props.task.description || ''
    estimatedMinutes.value = props.task.estimatedMinutes
    deadline.value = props.task.deadline ? props.task.deadline.slice(0, 10) : ''
    priority.value = props.task.priority
    isDeepWork.value = props.task.isDeepWork
  } else {
    title.value = ''
    description.value = ''
    estimatedMinutes.value = 30
    deadline.value = props.defaultDate || ''
    priority.value = 'medium'
    isDeepWork.value = false
  }
})

function handleSave() {
  if (!title.value.trim()) return

  emit('save', {
    title: title.value.trim(),
    description: description.value.trim() || undefined,
    estimatedMinutes: estimatedMinutes.value,
    deadline: deadline.value ? new Date(`${deadline.value}T23:59:59`).toISOString() : undefined,
    priority: priority.value,
    status: props.task?.status || 'todo',
    projectId: props.task?.projectId,
    dependencies: props.task?.dependencies || [],
    scheduledStart: props.task?.scheduledStart,
    scheduledEnd: props.task?.scheduledEnd,
    calendarEventId: props.task?.calendarEventId,
    isDeepWork: isDeepWork.value,
  })
}

function handleDelete() {
  if (props.task?.id) {
    emit('delete', props.task.id)
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
            {{ isEditing ? 'Aufgabe bearbeiten' : 'Neue Aufgabe' }}
          </h2>

          <div class="space-y-3">
            <!-- Titel -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Titel</label>
              <input
                v-model="title"
                type="text"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                placeholder="Aufgabe beschreiben..."
                @keydown.enter="handleSave"
              >
            </div>

            <!-- Beschreibung -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Beschreibung</label>
              <textarea
                v-model="description"
                rows="2"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none resize-none"
                placeholder="Optional..."
              />
            </div>

            <!-- Dauer & Prioritaet -->
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Dauer</label>
                <select
                  v-model.number="estimatedMinutes"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                >
                  <option v-for="opt in durationOptions" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Prioritaet</label>
                <select
                  v-model="priority"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                >
                  <option v-for="opt in priorityOptions" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </option>
                </select>
              </div>
            </div>

            <!-- Deadline -->
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Deadline</label>
              <input
                v-model="deadline"
                type="date"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              >
            </div>

            <!-- Deep Work Toggle -->
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                v-model="isDeepWork"
                type="checkbox"
                class="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              >
              <span class="text-sm text-gray-700">Deep Work (Fokuszeit noetig)</span>
            </label>
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
