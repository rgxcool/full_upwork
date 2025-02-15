import { createApp } from 'vue'
import App from './App.vue'

import axios from 'axios'
import router from './router/router.js'
import store from './store/store.js'
import './assets/styles/global.css'

// ✅ Import Vuetify and all components
import { createVuetify } from 'vuetify'
import 'vuetify/styles'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

// ✅ Ensure all components & directives are included
const vuetify = createVuetify({
  components,
  directives,
})

console.log('🚀 Initializing Vue App...')
console.log('VITE_API_URL:', import.meta.env.VITE_API_URL)
console.log('All env variables:', import.meta.env)

// ✅ Set Axios Authorization Token from Vuex
const token = store.state.auth?.token
if (token) {
  axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
} else {
  console.warn('⚠️ No token found in Vuex state.')
}

const app = createApp(App)
app.use(router)
app.use(store)
app.use(vuetify) // ✅ Attach Vuetify to the app
app.mount('#app')

console.log('✅ Vue App Mounted!')
