<script setup lang="ts">
const { isLoggedIn, userProfile, isLoading, login, logout } = useGoogleAuth()

defineProps<{
  currentView: 'month' | 'week'
}>()

const emit = defineEmits<{
  'update:currentView': [value: 'month' | 'week']
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

        <!-- User / Auth -->
        <div class="flex items-center gap-3">
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
