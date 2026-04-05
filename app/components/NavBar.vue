<script setup lang="ts">
const { isLoggedIn, userProfile, isLoading, login, logout } = useGoogleAuth()

defineProps<{
  currentView: 'month' | 'week'
}>()

const emit = defineEmits<{
  'update:currentView': [value: 'month' | 'week']
  'open-settings': []
  'open-task': []
  'open-planner': []
  'toggle-sidebar': []
}>()
</script>

<template>
  <nav class="bg-white shadow-sm border-b border-gray-200">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between items-center h-16">
        <!-- Logo / Title -->
        <div class="flex items-center gap-3">
          <svg class="w-8 h-8 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <h1 class="text-xl font-bold text-gray-900">Kalender</h1>
        </div>

        <!-- View Toggle -->
        <div v-if="isLoggedIn" class="hidden sm:flex items-center bg-gray-100 rounded-lg p-1">
          <button
            :class="[
              'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
              currentView === 'month' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            ]"
            @click="emit('update:currentView', 'month')"
          >
            Monat
          </button>
          <button
            :class="[
              'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
              currentView === 'week' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            ]"
            @click="emit('update:currentView', 'week')"
          >
            Woche
          </button>
        </div>

        <!-- Actions & User -->
        <div class="flex items-center gap-3">
          <!-- Aufgaben-Sidebar -->
          <button
            v-if="isLoggedIn"
            class="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            title="Aufgaben"
            @click="emit('toggle-sidebar')"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </button>

          <!-- Neue Aufgabe -->
          <button
            v-if="isLoggedIn"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
            @click="emit('open-task')"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            <span class="hidden sm:inline">Aufgabe</span>
          </button>

          <button
            v-if="isLoggedIn"
            class="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            @click="emit('open-planner')"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16h6M4 6h16M5 20h14a1 1 0 001-1V8a2 2 0 00-2-2H6a2 2 0 00-2 2v11a1 1 0 001 1z" />
            </svg>
            <span class="hidden sm:inline">Planungs-Chat</span>
          </button>

          <!-- Planung -->
          <button
            v-if="isLoggedIn"
            class="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            title="Planung und Routinen"
            @click="emit('open-settings')"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>

          <template v-if="isLoggedIn && userProfile">
            <img
              :src="userProfile.picture"
              :alt="userProfile.name"
              class="w-8 h-8 rounded-full"
              referrerpolicy="no-referrer"
            >
            <span class="hidden sm:inline text-sm text-gray-700">{{ userProfile.name }}</span>
            <button
              class="text-sm text-gray-500 hover:text-gray-700 transition-colors"
              @click="logout"
            >
              Abmelden
            </button>
          </template>
          <template v-else>
            <button
              class="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
              :disabled="isLoading"
              @click="login"
            >
              <svg v-if="isLoading" class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Mit Google anmelden
            </button>
          </template>
        </div>
      </div>

      <!-- Mobile view toggle -->
      <div v-if="isLoggedIn" class="sm:hidden flex items-center justify-center pb-3">
        <div class="flex bg-gray-100 rounded-lg p-1">
          <button
            :class="[
              'px-4 py-1.5 text-sm font-medium rounded-md transition-colors',
              currentView === 'month' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
            ]"
            @click="emit('update:currentView', 'month')"
          >
            Monat
          </button>
          <button
            :class="[
              'px-4 py-1.5 text-sm font-medium rounded-md transition-colors',
              currentView === 'week' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
            ]"
            @click="emit('update:currentView', 'week')"
          >
            Woche
          </button>
        </div>
      </div>
    </div>
  </nav>
</template>
