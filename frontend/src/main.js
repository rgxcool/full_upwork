import { createApp } from 'vue'
import App from './App.vue'

import axios from 'axios'
import router from './router/router.js'
import store from './store/store.js'

import '@mdi/font/css/materialdesignicons.css'
import './assets/main.css'  // Tailwind-stilar

import { createVuetify } from 'vuetify'
import 'vuetify/styles'
import './assets/styles/global.css'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { VTimePicker } from 'vuetify/labs/VTimePicker'

document.documentElement.lang = 'sv'

// ✅ Correct Vuetify instance creation
const vuetify = createVuetify({
  components: {
    ...components,
    VTimePicker, // ✅ manually added time picker
  },
  directives,
  icons: {
    defaultSet: 'mdi',
  },
})

console.log('🚀 Initializing Vue App...')
console.log('VITE_API_URL:', import.meta.env.VITE_API_URL)
console.log('All env variables:', import.meta.env)

async function bootstrap() {
  // Use user from store.state, not store.state.auth
  const user = store.state.user
  if (user && user.token) {
    axios.defaults.headers.common['Authorization'] = `Bearer ${user.token}`
  } else {
    console.warn('⚠️ No user token found in Vuex state.')
  }

  try {
    await store.dispatch('fetchUser')
  } catch (e) {
    console.error('Error during fetchUser:', e)
  }

  const app = createApp(App)
  app.use(router)
  app.use(store)
  app.use(vuetify)
  app.mount('#app')

  console.log('✅ Vue App Mounted!')
}

bootstrap()
