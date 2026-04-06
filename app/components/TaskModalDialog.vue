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
const durationPresets = [15, 30, 45, 60, 90, 120, 180]
const remainingPercentPresets = [0, 25, 50, 75, 100]

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

        <div class="glass-card-elevated relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-glass-xl sm:max-w-2xl sm:rounded-glass-lg">
          <div class="border-b border-accent-purple/20 bg-gradient-to-r from-accent-purple/12 via-accent-blue/10 to-accent-green/10 px-5 py-4">
            <div class="flex items-start justify-between gap-4">
              <div>
                <p class="text-xs font-semibold uppercase tracking-[0.24em] text-accent-purple-soft">Aufgabe</p>
                <h2 class="mt-2 text-xl font-semibold text-text-primary">
                  {{ isEditing ? 'Aufgabe bearbeiten' : 'Neue Aufgabe' }}
                </h2>
                <p class="mt-2 text-sm text-text-secondary">
                  Schnell erfassen, einfärben und realistisch einschätzen, wie viel davon noch offen ist.
                </p>
              </div>
              <button type="button" class="btn-secondary inline-flex h-10 w-10 items-center justify-center" @click="emit('close')">
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <div class="flex-1 overflow-y-auto px-5 py-4">
            <div class="space-y-5">
              <div>
                <label class="mb-2 block text-sm font-medium text-text-secondary">Titel</label>
                <input
                  v-model="title"
                  type="text"
                  class="input-dark w-full px-4 py-3"
                  placeholder="Was möchtest du erledigen?"
                >
              </div>

              <div>
                <label class="mb-2 block text-sm font-medium text-text-secondary">Beschreibung</label>
                <textarea
                  v-model="description"
                  rows="3"
                  class="input-dark w-full resize-none px-4 py-3"
                  placeholder="Optionaler Kontext..."
                />
              </div>

              <div class="grid gap-4 sm:grid-cols-2">
                <div class="rounded-glass border border-accent-blue/20 bg-accent-blue/10 p-4">
                  <label class="mb-2 block text-sm font-medium text-text-secondary">Dauer</label>
                  <input v-model.number="estimatedMinutes" min="15" step="15" type="number" class="input-dark w-full px-4 py-3">
                  <div class="mt-3 flex flex-wrap gap-2">
                    <button
                      v-for="preset in durationPresets"
                      :key="preset"
                      type="button"
                      class="rounded-full border px-3 py-1 text-xs transition"
                      :class="estimatedMinutes === preset
                        ? 'border-accent-blue/30 bg-accent-blue/15 text-accent-blue'
                        : 'border-border-subtle bg-white/[0.04] text-text-secondary hover:border-border-strong hover:bg-white/[0.06]'"
                      @click="estimatedMinutes = preset"
                    >
                      {{ preset }} Min.
                    </button>
                  </div>
                </div>
                <div class="rounded-glass border border-accent-purple/20 bg-accent-purple/10 p-4">
                  <label class="mb-2 block text-sm font-medium text-text-secondary">Priorität</label>
                  <select v-model="priority" class="input-dark w-full px-4 py-3">
                    <option value="critical">critical</option>
                    <option value="high">high</option>
                    <option value="medium">medium</option>
                    <option value="low">low</option>
                  </select>
                  <div class="mt-3 flex flex-wrap gap-2">
                    <span class="rounded-full border border-priority-critical/20 bg-priority-critical/10 px-2.5 py-1 text-[11px] text-priority-critical">critical</span>
                    <span class="rounded-full border border-priority-high/20 bg-priority-high/10 px-2.5 py-1 text-[11px] text-priority-high">high</span>
                    <span class="rounded-full border border-priority-medium/20 bg-priority-medium/10 px-2.5 py-1 text-[11px] text-priority-medium">medium</span>
                    <span class="rounded-full border border-priority-low/20 bg-priority-low/10 px-2.5 py-1 text-[11px] text-priority-low">low</span>
                  </div>
                </div>
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
                  <label class="mb-2 block text-sm font-medium text-text-secondary">Lebensbereich</label>
                  <select v-model="lifeArea" class="input-dark w-full px-4 py-3">
                    <option value="">Automatisch erkennen</option>
                    <option v-for="option in LIFE_AREA_OPTIONS" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </option>
                  </select>
                </div>
                <div>
                  <label class="mb-2 block text-sm font-medium text-text-secondary">Projekt</label>
                  <select v-model="projectId" class="input-dark w-full px-4 py-3">
                    <option value="">Ohne Projekt</option>
                    <option v-for="project in projects" :key="project.id" :value="project.id">
                      {{ project.name }}
                    </option>
                  </select>
                </div>
              </div>

              <button
                type="button"
                class="flex w-full items-center justify-between rounded-glass border px-4 py-3 text-left transition"
                :class="isDeepWork ? 'border-accent-purple/35 bg-accent-purple/10 text-text-primary' : 'border-border-subtle bg-white/[0.03] text-text-secondary hover:border-border-medium'"
                @click="isDeepWork = !isDeepWork"
              >
                <div>
                  <div class="text-sm font-medium">Deep Work</div>
                  <div class="mt-1 text-xs text-text-muted">Die Aufgabe braucht eher einen ruhigen, längeren Fokusblock.</div>
                </div>
                <span class="relative inline-flex h-6 w-11 rounded-full transition" :class="isDeepWork ? 'bg-accent-purple' : 'bg-white/10'">
                  <span class="absolute top-1 h-4 w-4 rounded-full bg-white transition" :class="isDeepWork ? 'left-6' : 'left-1'" />
                </span>
              </button>

              <div v-if="isEditing" class="grid gap-4 sm:grid-cols-2">
                <div class="rounded-glass border border-accent-green/20 bg-accent-green/10 p-4">
                  <label class="mb-2 block text-sm font-medium text-text-secondary">Fortschritt</label>
                  <input v-model.number="progressPercent" min="0" max="100" step="5" type="number" class="input-dark w-full px-4 py-3">
                  <input
                    v-model.number="progressPercent"
                    min="0"
                    max="100"
                    step="5"
                    type="range"
                    class="mt-3 w-full accent-[var(--color-accent-green)]"
                  >
                  <div class="mt-3 flex flex-wrap gap-2">
                    <button
                      v-for="preset in remainingPercentPresets"
                      :key="preset"
                      type="button"
                      class="rounded-full border px-3 py-1 text-xs transition"
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
                <div class="rounded-glass border border-border-subtle bg-white/[0.03] px-4 py-3 text-sm text-text-secondary">
                  Der bestehende Planungsstatus bleibt beim Bearbeiten erhalten, solange du ihn hier nicht direkt änderst.
                </div>
              </div>

              <div>
                <div class="mb-2 flex items-center justify-between gap-3">
                  <label class="block text-sm font-medium text-text-secondary">Abhängigkeiten</label>
                  <span class="text-xs text-text-muted">{{ dependencyIds.length }} gewählt</span>
                </div>

                <div v-if="availableDependencies.length > 0" class="max-h-48 space-y-2 overflow-y-auto rounded-glass border border-border-subtle bg-white/[0.03] p-3">
                  <button
                    v-for="candidate in availableDependencies"
                    :key="candidate.id"
                    type="button"
                    class="flex w-full items-center justify-between rounded-glass border px-3 py-2 text-left transition"
                    :class="dependencyIds.includes(candidate.id)
                      ? 'border-accent-blue/30 bg-accent-blue/10 text-text-primary'
                      : 'border-border-subtle bg-white/[0.03] text-text-secondary hover:border-border-medium'"
                    @click="toggleDependency(candidate.id)"
                  >
                    <span class="min-w-0 truncate text-sm">{{ candidate.title }}</span>
                    <span class="text-[11px] uppercase tracking-wide">{{ dependencyIds.includes(candidate.id) ? 'gewählt' : 'optional' }}</span>
                  </button>
                </div>

                <p v-else class="rounded-glass border border-border-subtle bg-white/[0.03] px-4 py-3 text-sm text-text-secondary">
                  Noch keine weiteren Aufgaben vorhanden, die als Abhängigkeit gewählt werden könnten.
                </p>
              </div>
            </div>
          </div>

          <div class="flex items-center justify-between gap-3 border-t border-border-subtle px-5 py-4">
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
</style>
