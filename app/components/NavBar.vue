<script setup lang="ts">
const { isLoggedIn, userProfile, isLoading, login, logout } = useGoogleAuth()

const props = defineProps<{
  currentView: 'month' | 'week'
  currentDate: Date
  warningsCount?: number
}>()

const emit = defineEmits<{
  'update:currentView': [value: 'month' | 'week']
  'open-settings': []
  'open-task': []
  'open-planner': []
  'toggle-sidebar': []
  'open-command-center': []
  'go-today': []
  'go-prev': []
  'go-next': []
}>()

const dateLabel = computed(() => {
  if (props.currentView === 'month') {
    return props.currentDate.toLocaleDateString('de-DE', {
      month: 'long',
      year: 'numeric',
    })
  }

  const current = new Date(props.currentDate)
  const day = current.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const start = new Date(current)
  start.setDate(current.getDate() + diff)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)

  return `KW ${getWeekNumber(start)} · ${start.toLocaleDateString('de-DE', {
    day: 'numeric',
    month: 'short',
  })} - ${end.toLocaleDateString('de-DE', {
    day: 'numeric',
    month: 'short',
  })}`
})

function getWeekNumber(date: Date) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNumber = target.getUTCDay() || 7
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber)
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1))
  return Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}
</script>

<template>
  <header class="sticky top-0 z-20 border-b border-border-subtle bg-surface/70 backdrop-blur-glass">
    <div class="flex min-h-16 flex-col gap-4 px-4 py-4 lg:px-6">
      <div class="flex items-center justify-between gap-3">
        <div class="flex min-w-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            class="btn-secondary inline-flex h-10 items-center rounded-full px-4 text-sm"
            @click="emit('go-today')"
          >
            Heute
          </button>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="btn-secondary inline-flex h-10 w-10 items-center justify-center"
              title="Zurück"
              @click="emit('go-prev')"
            >
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              type="button"
              class="btn-secondary inline-flex h-10 w-10 items-center justify-center"
              title="Weiter"
              @click="emit('go-next')"
            >
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
          <div class="min-w-0">
            <p class="truncate text-base font-semibold capitalize text-text-primary sm:text-lg">
              {{ dateLabel }}
            </p>
            <p class="hidden text-xs text-text-muted sm:block">Kalender, Aufgaben und KI-Planung in einem Raum</p>
          </div>
        </div>

        <div v-if="isLoggedIn" class="hidden items-center gap-1 rounded-full border border-border-subtle bg-white/5 p-1 md:flex">
          <button
            type="button"
            class="rounded-full px-4 py-2 text-sm font-medium transition"
            :class="currentView === 'month' ? 'bg-accent-purple/20 text-accent-purple shadow-glow-purple' : 'text-text-secondary hover:bg-white/5 hover:text-text-primary'"
            @click="emit('update:currentView', 'month')"
          >
            Monat
          </button>
          <button
            type="button"
            class="rounded-full px-4 py-2 text-sm font-medium transition"
            :class="currentView === 'week' ? 'bg-accent-purple/20 text-accent-purple shadow-glow-purple' : 'text-text-secondary hover:bg-white/5 hover:text-text-primary'"
            @click="emit('update:currentView', 'week')"
          >
            Woche
          </button>
        </div>

        <div class="flex items-center gap-2">
          <template v-if="isLoggedIn">
            <button
              type="button"
              class="btn-secondary inline-flex h-10 items-center gap-2 px-4 text-sm"
              title="Suchen und Schnellzugriff"
              @click="emit('open-command-center')"
            >
              <svg class="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="m21 21-4.35-4.35m1.85-5.15a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
              </svg>
              <span class="hidden sm:inline">Suchen</span>
              <span
                v-if="warningsCount"
                class="rounded-full bg-priority-critical/15 px-2 py-0.5 text-[11px] font-semibold text-priority-critical"
              >
                {{ warningsCount }}
              </span>
            </button>
            <template v-if="userProfile">
              <button
                type="button"
                class="hidden items-center gap-3 rounded-full border border-border-subtle bg-white/5 px-2.5 py-1.5 transition hover:bg-white/10 xl:inline-flex"
                @click="logout"
              >
                <img
                  :src="userProfile.picture"
                  :alt="userProfile.name"
                  class="h-8 w-8 rounded-full object-cover"
                  referrerpolicy="no-referrer"
                >
                <div class="text-left">
                  <div class="max-w-32 truncate text-sm font-medium text-text-primary">{{ userProfile.name }}</div>
                  <div class="text-xs text-text-muted">Abmelden</div>
                </div>
              </button>
              <img
                :src="userProfile.picture"
                :alt="userProfile.name"
                class="h-10 w-10 rounded-full border border-border-subtle object-cover xl:hidden"
                referrerpolicy="no-referrer"
              >
            </template>
          </template>

          <button
            v-if="!isLoggedIn"
            type="button"
            class="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm disabled:opacity-60"
            :disabled="isLoading"
            @click="login"
          >
            <svg v-if="isLoading" class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Mit Google anmelden
          </button>
        </div>
      </div>

      <div v-if="isLoggedIn" class="flex items-center justify-center md:hidden">
        <div class="flex items-center gap-1 rounded-full border border-border-subtle bg-white/5 p-1">
          <button
            type="button"
            class="rounded-full px-4 py-2 text-sm font-medium transition"
            :class="currentView === 'month' ? 'bg-accent-purple/20 text-accent-purple shadow-glow-purple' : 'text-text-secondary hover:bg-white/5 hover:text-text-primary'"
            @click="emit('update:currentView', 'month')"
          >
            Monat
          </button>
          <button
            type="button"
            class="rounded-full px-4 py-2 text-sm font-medium transition"
            :class="currentView === 'week' ? 'bg-accent-purple/20 text-accent-purple shadow-glow-purple' : 'text-text-secondary hover:bg-white/5 hover:text-text-primary'"
            @click="emit('update:currentView', 'week')"
          >
            Woche
          </button>
        </div>
      </div>
    </div>
  </header>
</template>
