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
const { projects, tasks } = useTasks()

const title = ref('')
const description = ref('')
const estimatedMinutes = ref(30)
const deadline = ref('')
const priority = ref<TaskPriority>('medium')
const isDeepWork = ref(false)
const projectId = ref('')
const dependencies = ref<string[]>([])
const progressPercent = ref(0)

const priorityOptions: { value: TaskPriority; label: string; active: string; inactive: string }[] = [
  { value: 'critical', label: 'Kritisch', active: 'bg-priority-critical/15 text-priority-critical border-priority-critical/40', inactive: 'border-border-subtle text-text-secondary hover:border-priority-critical/30 hover:text-priority-critical' },
  { value: 'high', label: 'Hoch', active: 'bg-priority-high/15 text-priority-high border-priority-high/40', inactive: 'border-border-subtle text-text-secondary hover:border-priority-high/30 hover:text-priority-high' },
  { value: 'medium', label: 'Mittel', active: 'bg-priority-medium/15 text-priority-medium border-priority-medium/40', inactive: 'border-border-subtle text-text-secondary hover:border-priority-medium/30 hover:text-priority-medium' },
  { value: 'low', label: 'Niedrig', active: 'bg-priority-low/15 text-priority-low border-priority-low/40', inactive: 'border-border-subtle text-text-secondary hover:border-priority-low/30 hover:text-priority-low' },
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
    projectId.value = props.task.projectId || ''
    dependencies.value = [...props.task.dependencies]
    progressPercent.value = props.task.progressPercent || 0
  } else {
    title.value = ''
    description.value = ''
    estimatedMinutes.value = 30
    deadline.value = props.defaultDate || ''
    priority.value = 'medium'
    isDeepWork.value = false
    projectId.value = ''
    dependencies.value = []
    progressPercent.value = 0
  }
})

const availableDependencies = computed(() =>
  tasks.value.filter(task => task.id !== props.task?.id)
)

function toggleDependency(taskId: string) {
  if (dependencies.value.includes(taskId)) {
    dependencies.value = dependencies.value.filter(id => id !== taskId)
    return
  }

  dependencies.value = [...dependencies.value, taskId]
}

function handleSave() {
  if (!title.value.trim()) return

  const baseMinutes = props.task?.originalEstimatedMinutes || props.task?.estimatedMinutes || estimatedMinutes.value
  const remainingMinutes = progressPercent.value > 0
    ? Math.max(5, Math.round(baseMinutes * ((100 - progressPercent.value) / 100)))
    : estimatedMinutes.value
  const nextStatus = progressPercent.value > 0 && (props.task?.status === 'todo' || props.task?.status === 'missed')
    ? 'in_progress'
    : (props.task?.status || 'todo')

  emit('save', {
    title: title.value.trim(),
    description: description.value.trim() || undefined,
    estimatedMinutes: remainingMinutes,
    originalEstimatedMinutes: progressPercent.value > 0 || props.task?.originalEstimatedMinutes
      ? baseMinutes
      : undefined,
    progressPercent: progressPercent.value,
    deadline: deadline.value ? new Date(`${deadline.value}T23:59:59`).toISOString() : undefined,
    priority: priority.value,
    aiSuggestedPriority: props.task?.aiSuggestedPriority,
    priorityReason: 'Manuell im Aufgaben-Editor gesetzt',
    prioritySource: 'manual',
    status: nextStatus,
    projectId: projectId.value || undefined,
    dependencies: dependencies.value,
    scheduleBlocks: props.task?.scheduleBlocks,
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
      <div v-if="show" class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
        <div class="absolute inset-0" @click="emit('close')" />

        <div class="glass-card-elevated relative z-10 max-h-[92vh] w-full overflow-y-auto rounded-t-glass-xl p-6 sm:max-w-lg sm:rounded-glass-lg">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.24em] text-accent-purple-soft">Aufgaben-Editor</p>
              <h2 class="mt-2 text-xl font-semibold text-text-primary">
                {{ isEditing ? 'Aufgabe bearbeiten' : 'Neue Aufgabe' }}
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
                placeholder="Aufgabe beschreiben..."
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

            <div>
              <label class="mb-2 block text-sm font-medium text-text-secondary">Dauer</label>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="opt in durationOptions"
                  :key="opt.value"
                  type="button"
                  class="rounded-full border px-3 py-2 text-sm transition"
                  :class="estimatedMinutes === opt.value ? 'border-accent-purple/40 bg-accent-purple/15 text-accent-purple' : 'border-border-subtle bg-white/[0.03] text-text-secondary hover:border-border-medium hover:text-text-primary'"
                  @click="estimatedMinutes = opt.value"
                >
                  {{ opt.label }}
                </button>
              </div>
            </div>

            <div>
              <label class="mb-2 block text-sm font-medium text-text-secondary">Priorität</label>
              <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <button
                  v-for="opt in priorityOptions"
                  :key="opt.value"
                  type="button"
                  class="rounded-xl border px-3 py-2 text-sm font-medium transition"
                  :class="priority === opt.value ? opt.active : opt.inactive"
                  @click="priority = opt.value"
                >
                  {{ opt.label }}
                </button>
              </div>
            </div>

            <div>
              <div class="flex items-center justify-between">
                <label class="mb-2 block text-sm font-medium text-text-secondary">Zwischenstand</label>
                <span class="text-xs text-text-muted">{{ progressPercent }}%</span>
              </div>
              <input
                v-model.number="progressPercent"
                type="range"
                min="0"
                max="90"
                step="10"
                class="w-full accent-accent-purple"
              >
              <p class="mt-2 text-xs text-text-muted">
                Noch offen: {{ progressPercent > 0 ? Math.max(5, Math.round((props.task?.originalEstimatedMinutes || props.task?.estimatedMinutes || estimatedMinutes) * ((100 - progressPercent) / 100))) : estimatedMinutes }} Minuten
              </p>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <div>
                <label class="mb-2 block text-sm font-medium text-text-secondary">Deadline</label>
                <input
                  v-model="deadline"
                  type="date"
                  class="input-dark w-full px-4 py-3"
                >
              </div>
              <div>
                <label class="mb-2 block text-sm font-medium text-text-secondary">Projekt</label>
                <select v-model="projectId" class="input-dark w-full px-4 py-3">
                  <option value="">Kein Projekt</option>
                  <option v-for="project in projects" :key="project.id" :value="project.id">
                    {{ project.name }}
                  </option>
                </select>
              </div>
            </div>

            <div v-if="availableDependencies.length > 0">
              <label class="mb-2 block text-sm font-medium text-text-secondary">Abhängigkeiten</label>
              <div class="max-h-36 space-y-2 overflow-y-auto rounded-glass border border-border-subtle bg-white/[0.03] p-3">
                <label
                  v-for="task in availableDependencies"
                  :key="task.id"
                  class="flex cursor-pointer items-center gap-3 rounded-xl border border-transparent px-3 py-2 transition hover:border-border-subtle hover:bg-white/[0.03]"
                >
                  <input
                    type="checkbox"
                    :checked="dependencies.includes(task.id)"
                    class="rounded border-border-subtle bg-transparent text-accent-purple focus:ring-accent-purple"
                    @change="toggleDependency(task.id)"
                  >
                  <span class="text-sm text-text-secondary">{{ task.title }}</span>
                </label>
              </div>
            </div>

            <button
              type="button"
              class="flex w-full items-center justify-between rounded-glass border px-4 py-3 text-left transition"
              :class="isDeepWork ? 'border-accent-purple/40 bg-accent-purple/10 text-text-primary' : 'border-border-subtle bg-white/[0.03] text-text-secondary hover:border-border-medium'"
              @click="isDeepWork = !isDeepWork"
            >
              <div>
                <div class="text-sm font-medium">Deep Work</div>
                <div class="mt-1 text-xs text-text-muted">Für Aufgaben, die einen ruhigen Fokusblock brauchen.</div>
              </div>
              <span class="relative inline-flex h-6 w-11 rounded-full transition" :class="isDeepWork ? 'bg-accent-purple' : 'bg-white/10'">
                <span class="absolute top-1 h-4 w-4 rounded-full bg-white transition" :class="isDeepWork ? 'left-6' : 'left-1'" />
              </span>
            </button>
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
