import { createApp } from 'vue'
import App from './App.vue'

import axios from 'axios'
import router from './router/index.js'
import store from './store/index.js'
import './assets/styles/global.css'

console.log('🚀 Initializing Vue App...') // ✅ Debug Message
console.log('VITE_API_URL:', import.meta.env.VITE_API_URL)
console.log('All env variables:', import.meta.env)

// ✅ Check if token exists before setting the default header
const token = store.state.auth?.token
if (token) {
  axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
} else {
  console.warn('⚠️ No token found in Vuex state.')
}

const app = createApp(App)
app.use(router)
app.use(store)
app.mount('#app')

console.log('✅ Vue App Mounted!') // ✅ Debug Message
