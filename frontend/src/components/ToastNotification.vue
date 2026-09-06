<template>
  <Transition name="toast">
    <div v-if="toast.state.show" class="toast-notification" :style="toastStyle">
      <span class="toast-notification__message">{{ toast.state.message }}</span>
      <button
        type="button"
        class="toast-notification__close"
        :style="{ color: accentColor }"
        @click="toast.dismiss()"
      >
        Stäng
      </button>
    </div>
  </Transition>
</template>

<script setup>
import { computed } from 'vue'
import { useToast } from '@/composables/useToast.js'

const toast = useToast()

const accentColor = computed(
  () =>
    ({
      success: 'var(--status-success)',
      error: 'var(--status-danger)',
      warning: 'var(--status-warning)',
      info: 'var(--status-info)',
    })[toast.state.type] || 'var(--status-info)'
)

const toastStyle = computed(() => ({
  borderColor: accentColor.value,
  borderLeftColor: accentColor.value,
}))
</script>

<style scoped>
.toast-notification {
  position: fixed;
  top: 1rem;
  right: 1rem;
  z-index: 9999;
  width: auto;
  max-width: 400px;
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 0.875rem 1rem;
  background-color: var(--color-surface, #ffffff);
  color: var(--color-ink, #22272e);
  border: 1px solid;
  border-left-width: 6px;
  border-radius: var(--radius-overlay, 8px);
  box-shadow: var(--shadow-overlay, 0 4px 24px rgba(16, 24, 40, 0.16));
  font-family: var(--font-body, inherit);
  font-size: var(--font-size-base, 0.9375rem);
  line-height: 1.4;
}

.toast-notification__message {
  color: var(--color-ink, #22272e);
  font-weight: var(--font-weight-medium, 500);
}

.toast-notification__close {
  flex-shrink: 0;
  border: none;
  background: none;
  padding: 0;
  margin: 0;
  cursor: pointer;
  font-weight: var(--font-weight-semibold, 600);
  font-size: var(--font-size-sm, 0.8125rem);
  line-height: 1.4;
}

.toast-notification__close:hover {
  text-decoration: underline;
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 200ms ease, transform 200ms ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(1rem);
}
</style>
