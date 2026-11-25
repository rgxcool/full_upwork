<template>
  <ConfirmDialog
    v-model="modelValue"
    :title="title"
    :message="message"
    :danger="danger"
    :confirm-label="confirmLabel"
    :cancel-label="cancelLabel"
    @confirm="handleConfirm"
  />
</template>

<script setup>
import ConfirmDialog from './ConfirmDialog.vue'

const emit = defineEmits(['update:modelValue'])

const modelValue = ref(false)
const title = ref('')
const message = ref('')
const danger = ref(false)
const confirmLabel = ref('Bekräfta')
const cancelLabel = ref('Avbryt')

function handleConfirm() {
  emit('update:modelValue', true)
}

function handleCancel() {
  emit('update:modelValue', false)
}
</script>

<style scoped>
/* Empty - styles handled by ConfirmDialog */
</style>
