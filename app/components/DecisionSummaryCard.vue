<script setup lang="ts">
const props = withDefaults(defineProps<{
  title?: string
  modeLabel?: string | null
  tone?: 'neutral' | 'preview' | 'success' | 'warning'
  why?: string[]
  uncertainty?: string | null
  alternatives?: string[]
  nextStep?: string | null
}>(), {
  title: 'Warum diese Entscheidung?',
  modeLabel: null,
  tone: 'neutral',
  why: () => [],
  uncertainty: null,
  alternatives: () => [],
  nextStep: null,
})

const toneClasses = computed(() => {
  if (props.tone === 'preview') {
    return {
      card: 'border-accent-blue/20 bg-accent-blue/10',
      badge: 'border-accent-blue/20 bg-accent-blue/12 text-accent-blue',
      heading: 'text-accent-blue',
      alternative: 'border-accent-blue/15 bg-white/[0.05] text-text-secondary',
      nextStep: 'border-accent-blue/20 bg-accent-blue/12 text-accent-blue',
    }
  }

  if (props.tone === 'success') {
    return {
      card: 'border-accent-green/20 bg-accent-green/10',
      badge: 'border-accent-green/20 bg-accent-green/12 text-accent-green',
      heading: 'text-accent-green',
      alternative: 'border-accent-green/15 bg-white/[0.05] text-text-secondary',
      nextStep: 'border-accent-green/20 bg-accent-green/12 text-accent-green',
    }
  }

  if (props.tone === 'warning') {
    return {
      card: 'border-priority-high/20 bg-priority-high/10',
      badge: 'border-priority-high/20 bg-priority-high/12 text-priority-high',
      heading: 'text-priority-high',
      alternative: 'border-priority-high/15 bg-white/[0.05] text-text-secondary',
      nextStep: 'border-priority-high/20 bg-priority-high/12 text-priority-high',
    }
  }

  return {
    card: 'border-border-subtle bg-white/[0.03]',
    badge: 'border-border-subtle bg-white/[0.05] text-text-secondary',
    heading: 'text-text-primary',
    alternative: 'border-border-subtle bg-white/[0.04] text-text-secondary',
    nextStep: 'border-accent-purple/20 bg-accent-purple/10 text-accent-purple-soft',
  }
})
</script>

<template>
  <div class="rounded-glass border p-4" :class="toneClasses.card">
    <div class="flex items-start justify-between gap-3">
      <div class="text-sm font-medium" :class="toneClasses.heading">{{ title }}</div>
      <span
        v-if="modeLabel"
        class="rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]"
        :class="toneClasses.badge"
      >
        {{ modeLabel }}
      </span>
    </div>

    <div v-if="why.length > 0" class="mt-3 space-y-2">
      <p
        v-for="reason in why"
        :key="reason"
        class="text-sm leading-6 text-text-secondary"
      >
        {{ reason }}
      </p>
    </div>

    <p
      v-if="uncertainty"
      class="mt-3 rounded-glass border border-priority-high/20 bg-priority-high/10 px-3 py-2 text-xs text-priority-high"
    >
      Unsicherheit: {{ uncertainty }}
    </p>

    <div v-if="alternatives.length > 0" class="mt-4">
      <div class="text-[11px] font-medium uppercase tracking-[0.2em] text-text-muted">Alternativen</div>
      <div class="mt-2 flex flex-wrap gap-1.5">
        <span
          v-for="alternative in alternatives"
          :key="alternative"
          class="rounded-full border px-2.5 py-1 text-[11px]"
          :class="toneClasses.alternative"
        >
          {{ alternative }}
        </span>
      </div>
    </div>

    <div
      v-if="nextStep"
      class="mt-4 rounded-glass border px-3 py-2 text-xs font-medium"
      :class="toneClasses.nextStep"
    >
      Nächster Schritt: {{ nextStep }}
    </div>
  </div>
</template>
