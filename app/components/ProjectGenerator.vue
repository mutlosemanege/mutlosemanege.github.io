<script setup lang="ts">
import type { Task } from '~/types/task'

const emit = defineEmits<{
  close: []
  created: [projectId: string]
}>()

const props = defineProps<{
  show: boolean
}>()

const { generateProject, isProcessing, aiError } = useAI()
const { createProject, createTask } = useTasks()

const description = ref('')
const deadline = ref('')
const step = ref<'input' | 'review' | 'done'>('input')

interface PreviewTask {
  tempId: string
  title: string
  description: string
  estimatedMinutes: number
  dependsOn: string[]
  isDeepWork: boolean
  suggestedPriority: 'critical' | 'high' | 'medium' | 'low'
  include: boolean // User kann Tasks ab-/anwaehlen
}

const projectName = ref('')
const previewTasks = ref<PreviewTask[]>([])
const tokenUsage = ref({ inputTokens: 0, outputTokens: 0 })

watch(() => props.show, (val) => {
  if (!val) return
  description.value = ''
  deadline.value = ''
  step.value = 'input'
  projectName.value = ''
  previewTasks.value = []
})

async function handleGenerate() {
  if (!description.value.trim()) return

  const result = await generateProject(
    description.value.trim(),
    deadline.value || undefined,
  )

  if (result) {
    projectName.value = result.projectName
    previewTasks.value = result.tasks.map(t => ({ ...t, include: true }))
    tokenUsage.value = result.usage
    step.value = 'review'
  }
}

async function handleConfirm() {
  const includedTasks = previewTasks.value.filter(t => t.include)
  if (includedTasks.length === 0) return

  // Projekt erstellen
  const project = await createProject({
    name: projectName.value,
    description: description.value,
    taskIds: [],
    deadline: deadline.value ? new Date(`${deadline.value}T23:59:59`).toISOString() : undefined,
  })

  // TempId → echte ID Mapping
  const idMap = new Map<string, string>()

  // Tasks erstellen (in Reihenfolge wegen Abhaengigkeiten)
  const createdIds: string[] = []
  for (const pt of includedTasks) {
    const realDeps = pt.dependsOn
      .map(depTempId => idMap.get(depTempId))
      .filter((id): id is string => id !== undefined)

    const task = await createTask({
      title: pt.title,
      description: pt.description,
      estimatedMinutes: pt.estimatedMinutes,
      priority: pt.suggestedPriority,
      status: 'todo',
      projectId: project.id,
      dependencies: realDeps,
      isDeepWork: pt.isDeepWork,
    })

    idMap.set(pt.tempId, task.id)
    createdIds.push(task.id)
  }

  // Projekt mit Task-IDs aktualisieren
  const { updateProject } = useTasks()
  await updateProject(project.id, { taskIds: createdIds })

  step.value = 'done'
  emit('created', project.id)
}

const totalMinutes = computed(() =>
  previewTasks.value
    .filter(t => t.include)
    .reduce((sum, t) => sum + t.estimatedMinutes, 0)
)

const totalHours = computed(() => Math.round(totalMinutes.value / 60 * 10) / 10)
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/40" @click="emit('close')" />

        <div class="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">

          <!-- Step 1: Eingabe -->
          <template v-if="step === 'input'">
            <h2 class="text-lg font-semibold text-gray-900">KI-Projekt generieren</h2>
            <p class="text-sm text-gray-500">
              Beschreibe dein Projekt und die KI erstellt automatisch alle Aufgaben mit Abhaengigkeiten.
            </p>

            <div class="space-y-3">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Projektbeschreibung</label>
                <textarea
                  v-model="description"
                  rows="4"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none resize-none"
                  placeholder="z.B. Website Redesign mit 5 Unterseiten, Responsive Design und SEO-Optimierung..."
                />
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Deadline (optional)</label>
                <input
                  v-model="deadline"
                  type="date"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                >
              </div>
            </div>

            <!-- AI Error -->
            <div v-if="aiError" class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {{ aiError }}
            </div>

            <div class="flex justify-end gap-2 pt-2">
              <button
                class="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                @click="emit('close')"
              >
                Abbrechen
              </button>
              <button
                class="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
                :disabled="!description.trim() || isProcessing"
                @click="handleGenerate"
              >
                <svg v-if="isProcessing" class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {{ isProcessing ? 'Generiere...' : 'Mit KI generieren' }}
              </button>
            </div>
          </template>

          <!-- Step 2: Review -->
          <template v-if="step === 'review'">
            <div class="flex items-center justify-between">
              <h2 class="text-lg font-semibold text-gray-900">{{ projectName }}</h2>
              <span class="text-xs text-gray-400">
                {{ tokenUsage.inputTokens + tokenUsage.outputTokens }} Tokens
              </span>
            </div>
            <p class="text-sm text-gray-500">
              {{ previewTasks.filter(t => t.include).length }} Aufgaben, ca. {{ totalHours }} Stunden
            </p>

            <div class="space-y-2">
              <div
                v-for="task in previewTasks"
                :key="task.tempId"
                class="flex items-start gap-3 p-3 rounded-lg border"
                :class="task.include ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-50'"
              >
                <input
                  v-model="task.include"
                  type="checkbox"
                  class="mt-1 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                >
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-medium text-gray-900">{{ task.title }}</span>
                    <span
                      class="text-xs px-1.5 py-0.5 rounded-full"
                      :class="{
                        'bg-red-100 text-red-700': task.suggestedPriority === 'critical',
                        'bg-orange-100 text-orange-700': task.suggestedPriority === 'high',
                        'bg-yellow-100 text-yellow-700': task.suggestedPriority === 'medium',
                        'bg-green-100 text-green-700': task.suggestedPriority === 'low',
                      }"
                    >
                      {{ task.suggestedPriority }}
                    </span>
                    <span v-if="task.isDeepWork" class="text-xs px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">
                      Deep Work
                    </span>
                  </div>
                  <p class="text-xs text-gray-500 mt-0.5">{{ task.description }}</p>
                  <div class="flex items-center gap-3 mt-1 text-xs text-gray-400">
                    <span>{{ task.estimatedMinutes }} Min.</span>
                    <span v-if="task.dependsOn.length > 0">
                      Abhaengig von: {{ task.dependsOn.join(', ') }}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div class="flex justify-between pt-2">
              <button
                class="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                @click="step = 'input'"
              >
                Zurueck
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
                  @click="handleConfirm"
                >
                  Projekt erstellen
                </button>
              </div>
            </div>
          </template>

          <!-- Step 3: Fertig -->
          <template v-if="step === 'done'">
            <div class="text-center py-6">
              <svg class="mx-auto w-12 h-12 text-green-500 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              <h2 class="text-lg font-semibold text-gray-900">Projekt erstellt!</h2>
              <p class="text-sm text-gray-500 mt-1">
                {{ previewTasks.filter(t => t.include).length }} Aufgaben wurden angelegt.
              </p>
              <button
                class="mt-4 px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                @click="emit('close')"
              >
                Schliessen
              </button>
            </div>
          </template>
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
