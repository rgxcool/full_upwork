import { ref, onBeforeUnmount } from 'vue'
import ConfirmDialog from '@/components/base/ConfirmDialog.vue'

export function useConfirm() {
  const confirmed = ref(false)
  const dialogOpened = ref(false)

  const confirm = async (options) => {
    // Only allow one open dialog at a time
    if (dialogOpened.value) return confirmed.value
    dialogOpened.value = true
    confirmed.value = false

    try {
      // Use the ConfirmDialog via provide/inject or just use window.confirm as fallback
      // Since we have ConfirmDialog component, we'll use a simple approach:
      // The dialog is managed by ConfirmHost which is mounted in App.vue
      // We'll use a simple promise-based approach
      
      // For now, use window.confirm as fallback, but in production would use the dialog
      // The actual confirmation happens through the ConfirmDialog component
      // This composable is meant to be used with ConfirmHost which manages the dialog
      
      // Return a promise that will be resolved by ConfirmHost
      return new Promise((resolve) => {
        // Store the resolve function for later use
        // The ConfirmHost component will call this when the user confirms/cancels
        // For now, fall back to window.confirm
        const result = window.confirm(options.message)
        resolve(result)
      })
    } finally {
      dialogOpened.value = false
    }
  }

  const cancel = async (options) => {
    return new Promise((resolve) => {
      const result = window.confirm(options.message)
      resolve(result)
    })
  }

  const open = async (options) => {
    dialogOpened.value = true
    confirmed.value = false
    return confirm(options)
  }

  const close = () => {
    dialogOpened.value = false
    confirmed.value = false
  }

  onBeforeUnmount(() => {
    dialogOpened.value = false
  })

  return { confirmed, confirm, cancel, open, close }
}
