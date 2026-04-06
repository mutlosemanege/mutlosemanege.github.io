<script setup lang="ts">
import { LIFE_AREA_OPTIONS } from '~/types/task'
import type { LifeArea, Task } from '~/types/task'

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

const { tasks, projects } = useTasks()

const isEditing = computed(() => !!props.task?.id)
const title = ref('')
const description = ref('')
const estimatedMinutes = ref(60)
const deadlineDate = ref('')
const deadlineTime = ref('18:00')
const priority = ref<Task['priority']>('medium')
const isDeepWork = ref(false)
const lifeArea = ref<LifeArea | ''>('')
const projectId = ref('')
const dependencyIds = ref<string[]>([])
const progressPercent = ref(0)
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
const priorityOptions: Array<{
  value: Task['priority']
  label: string
  active: string
  inactive: string
}> = [
  { value: 'critical', label: 'Kritisch', active: 'bg-priority-critical/15 text-priority-critical border-priority-critical/40', inactive: 'border-border-subtle text-text-secondary hover:border-priority-critical/30 hover:text-priority-critical' },
  { value: 'high', label: 'Hoch', active: 'bg-priority-high/15 text-priority-high border-priority-high/40', inactive: 'border-border-subtle text-text-secondary hover:border-priority-high/30 hover:text-priority-high' },
  { value: 'medium', label: 'Mittel', active: 'bg-priority-medium/15 text-priority-medium border-priority-medium/40', inactive: 'border-border-subtle text-text-secondary hover:border-priority-medium/30 hover:text-priority-medium' },
  { value: 'low', label: 'Niedrig', active: 'bg-priority-low/15 text-priority-low border-priority-low/40', inactive: 'border-border-subtle text-text-secondary hover:border-priority-low/30 hover:text-priority-low' },
]
const progressPresets = [0, 25, 50, 75, 100]

const availableDependencies = computed(() =>
  tasks.value.filter(task => task.id !== props.task?.id),
)

function resetForm() {
  const baseDate = props.defaultDate || new Date().toISOString().slice(0, 10)
  const task = props.task

  title.value = task?.title || ''
  description.value = task?.description || ''
  estimatedMinutes.value = task?.estimatedMinutes || task?.originalEstimatedMinutes || 60
  priority.value = task?.priority || 'medium'
  isDeepWork.value = task?.isDeepWork || false
  lifeArea.value = task?.lifeArea || ''
  projectId.value = task?.projectId || ''
  dependencyIds.value = [...(task?.dependencies || [])]
  progressPercent.value = task?.progressPercent || 0

  if (task?.deadline) {
    const deadline = new Date(task.deadline)
    deadlineDate.value = deadline.toISOString().slice(0, 10)
    deadlineTime.value = deadline.toTimeString().slice(0, 5)
  } else {
    deadlineDate.value = baseDate
    deadlineTime.value = '18:00'
  }
}

watch(() => props.show, (show) => {
  if (show) resetForm()
})

const remainingMinutes = computed(() => {
  const baseline = props.task?.originalEstimatedMinutes || estimatedMinutes.value
  return Math.max(0, Math.round(baseline * (1 - (progressPercent.value / 100))))
})

function toggleDependency(taskId: string) {
  if (dependencyIds.value.includes(taskId)) {
    dependencyIds.value = dependencyIds.value.filter(id => id !== taskId)
    return
  }

  dependencyIds.value = [...dependencyIds.value, taskId]
}

function handleSave() {
  if (!title.value.trim()) return

  const deadline = deadlineDate.value
    ? new Date(`${deadlineDate.value}T${deadlineTime.value || '18:00'}`).toISOString()
    : undefined

  const existingTask = props.task

  emit('save', {
    title: title.value.trim(),
    description: description.value.trim() || undefined,
    estimatedMinutes: Math.max(15, estimatedMinutes.value || 15),
    originalEstimatedMinutes: existingTask?.originalEstimatedMinutes || Math.max(15, estimatedMinutes.value || 15),
    progressPercent: existingTask?.status === 'done' ? 100 : Math.max(0, Math.min(100, progressPercent.value || 0)),
    deadline,
    priority: priority.value,
    aiSuggestedPriority: existingTask?.aiSuggestedPriority,
    priorityReason: existingTask?.priorityReason,
    prioritySource: existingTask?.prioritySource,
    status: existingTask?.status || 'todo',
    lifeArea: lifeArea.value || undefined,
    projectId: projectId.value || undefined,
    dependencies: dependencyIds.value,
    scheduleBlocks: existingTask?.scheduleBlocks,
    scheduledStart: existingTask?.scheduledStart,
    scheduledEnd: existingTask?.scheduledEnd,
    calendarEventId: existingTask?.calendarEventId,
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
      <div
        v-if="show"
        class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      >
        <div class="absolute inset-0" @click="emit('close')" />

        <div class="glass-card-elevated relative z-10 max-h-[92vh] w-full overflow-y-auto rounded-t-glass-xl p-6 sm:max-w-lg sm:rounded-glass-lg">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.24em] text-accent-purple-soft">Aufgaben-Editor</p>
              <h2 class="mt-2 text-xl font-semibold text-text-primary">
                {{ isEditing ? 'Aufgabe bearbeiten' : 'Neue Aufgabe' }}
              </h2>
              <p class="mt-2 text-sm text-text-secondary">
                Klar erfassen, priorisieren und bei Bedarf direkt den offenen Rest festhalten.
              </p>
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
              <div class="preset-scroll flex gap-2 overflow-x-auto pb-2">
                <button
                  v-for="opt in durationOptions"
                  :key="opt.value"
                  type="button"
                  class="flex-shrink-0 rounded-full border px-3 py-2 text-sm transition"
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

            <div v-if="isEditing" class="rounded-glass border border-accent-green/20 bg-accent-green/10 p-4">
              <div class="flex items-center justify-between">
                <label class="mb-2 block text-sm font-medium text-text-secondary">Zwischenstand</label>
                <span class="text-xs text-text-muted">{{ progressPercent }}%</span>
              </div>
              <input
                v-model.number="progressPercent"
                type="range"
                min="0"
                max="100"
                step="5"
                class="w-full accent-[var(--color-accent-green)]"
              >
              <div class="preset-scroll mt-3 flex gap-2 overflow-x-auto pb-2">
                <button
                  v-for="preset in progressPresets"
                  :key="preset"
                  type="button"
                  class="flex-shrink-0 rounded-full border px-3 py-1 text-xs transition"
                  :class="progressPercent === preset
                    ? 'border-accent-green/30 bg-accent-green/15 text-accent-green'
                    : 'border-border-subtle bg-white/[0.04] text-text-secondary hover:border-border-strong hover:bg-white/[0.06]'"
                  @click="progressPercent = preset"
                >
                  {{ preset }}%
                </button>
              </div>
              <p class="mt-3 text-xs text-accent-green">Noch offen: ca. {{ remainingMinutes }} Minuten</p>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <div>
                <label class="mb-2 block text-sm font-medium text-text-secondary">Deadline Datum</label>
                <input v-model="deadlineDate" type="date" class="input-dark w-full px-4 py-3">
              </div>
              <div>
                <label class="mb-2 block text-sm font-medium text-text-secondary">Deadline Uhrzeit</label>
                <input v-model="deadlineTime" type="time" class="input-dark w-full px-4 py-3">
              </div>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <div>
                <label class="mb-2 block text-sm font-medium text-text-secondary">Projekt</label>
                <select v-model="projectId" class="input-dark w-full px-4 py-3">
                  <option value="">Kein Projekt</option>
                  <option v-for="project in projects" :key="project.id" :value="project.id">
                    {{ project.name }}
                  </option>
                </select>
              </div>
              <div>
                <label class="mb-2 block text-sm font-medium text-text-secondary">Lebensbereich</label>
                <select v-model="lifeArea" class="input-dark w-full px-4 py-3">
                  <option value="">Automatisch erkennen</option>
                  <option v-for="option in LIFE_AREA_OPTIONS" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </select>
              </div>
            </div>

            <div v-if="availableDependencies.length > 0">
              <div class="mb-2 flex items-center justify-between gap-3">
                <label class="block text-sm font-medium text-text-secondary">Abhängigkeiten</label>
                <span class="text-xs text-text-muted">{{ dependencyIds.length }} gewählt</span>
              </div>
              <div class="max-h-40 space-y-2 overflow-y-auto rounded-glass border border-border-subtle bg-white/[0.03] p-3">
                <label
                  v-for="candidate in availableDependencies"
                  :key="candidate.id"
                  class="flex cursor-pointer items-center gap-3 rounded-xl border border-transparent px-3 py-2 transition hover:border-border-subtle hover:bg-white/[0.03]"
                >
                  <input
                    type="checkbox"
                    :checked="dependencyIds.includes(candidate.id)"
                    class="rounded border-border-subtle bg-transparent text-accent-purple focus:ring-accent-purple"
                    @change="toggleDependency(candidate.id)"
                  >
                  <span class="text-sm text-text-secondary">{{ candidate.title }}</span>
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

select.input-dark,
input[type='date'].input-dark,
input[type='time'].input-dark {
  color-scheme: dark;
  background-color: rgba(15, 23, 42, 0.88);
  border-color: rgba(148, 163, 184, 0.22);
  color: rgba(248, 250, 252, 0.95);
}

.preset-scroll {
  scrollbar-width: thin;
  scrollbar-color: rgba(96, 165, 250, 0.75) rgba(255, 255, 255, 0.08);
}

.preset-scroll::-webkit-scrollbar {
  height: 8px;
}

.preset-scroll::-webkit-scrollbar-track {
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.08);
}

.preset-scroll::-webkit-scrollbar-thumb {
  border-radius: 9999px;
  background: linear-gradient(90deg, rgba(168, 85, 247, 0.85), rgba(96, 165, 250, 0.85));
}
</style>
