import { createApp } from 'vue'
import App from './App.vue'

import axios from 'axios'
import router from './router/index.js'
import store from './store/index.js'
import './assets/styles/global.css'

console.log('🚀 Initializing Vue App...') // ✅ Debug Message
console.log('VITE_API_URL:', import.meta.env.VITE_API_URL)
console.log('All env variables:', import.meta.env)

axios.defaults.headers.common['Authorization'] = `Bearer ${store.state.auth.token}`

const app = createApp(App)
app.use(router)
app.use(store)
app.mount('#app')

console.log('✅ Vue App Mounted!') // ✅ Debug Message
