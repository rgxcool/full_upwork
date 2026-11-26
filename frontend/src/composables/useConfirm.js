// Promise-based replacement for window.confirm().
//   const { confirm } = useConfirm()
//   if (!(await confirm({ title: 'Ta bort deltagare?', danger: true }))) return
import { reactive } from 'vue'

const state = reactive({
  open: false,
  title: '',
  message: '',
  confirmLabel: 'Bekräfta',
  cancelLabel: 'Avbryt',
  danger: false,
})

let resolver = null

function settle(value) {
  state.open = false
  if (resolver) {
    resolver(value)
    resolver = null
  }
}

export function useConfirm() {
  const confirm = (options = {}) => {
    // A second call while one is open cancels the first.
    if (resolver) settle(false)
    Object.assign(state, {
      title: 'Är du säker?',
      message: '',
      confirmLabel: 'Bekräfta',
      cancelLabel: 'Avbryt',
      danger: false,
      ...(typeof options === 'string' ? { title: options } : options),
      open: true,
    })
    return new Promise((resolve) => {
      resolver = resolve
    })
  }
  return { confirm, state, settle }
}
