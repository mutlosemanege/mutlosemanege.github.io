<script setup lang="ts">
const { warnings, hasWarnings } = useDeadlineWatcher()
const isCollapsed = ref(false)
</script>

<template>
  <div v-if="hasWarnings" class="max-w-7xl mx-auto px-4 mt-4">
    <div
      class="rounded-lg border px-4 py-3 text-sm"
      :class="warnings[0]?.level === 'critical'
        ? 'bg-red-50 border-red-200 text-red-700'
        : 'bg-yellow-50 border-yellow-200 text-yellow-700'"
    >
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <!-- Warn-Icon -->
          <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <span class="font-medium">
            {{ warnings.length }} Deadline-Warnung{{ warnings.length > 1 ? 'en' : '' }}
          </span>
        </div>
        <button
          class="text-xs underline opacity-75 hover:opacity-100"
          @click="isCollapsed = !isCollapsed"
        >
          {{ isCollapsed ? 'Anzeigen' : 'Ausblenden' }}
        </button>
      </div>

      <ul v-if="!isCollapsed" class="mt-2 space-y-1">
        <li
          v-for="warning in warnings"
          :key="warning.task.id"
          class="flex items-center gap-2"
        >
          <span
            class="w-2 h-2 rounded-full flex-shrink-0"
            :class="warning.level === 'critical' ? 'bg-red-500' : 'bg-yellow-500'"
          />
          {{ warning.message }}
        </li>
      </ul>
    </div>
  </div>
</template>
