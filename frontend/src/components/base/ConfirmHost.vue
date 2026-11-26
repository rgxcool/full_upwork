<!-- Mount ONCE in App.vue: <ConfirmHost /> -->
<template>
  <ConfirmDialog
    :model-value="state.open"
    :title="state.title"
    :message="state.message"
    :confirm-label="state.confirmLabel"
    :cancel-label="state.cancelLabel"
    :danger="state.danger"
    @update:model-value="(v) => !v && settle(false)"
    @confirm="settle(true)"
  />
</template>

<script setup>
import ConfirmDialog from './ConfirmDialog.vue'
import { useConfirm } from '@/composables/useConfirm.js'

const { state, settle } = useConfirm()
</script>
