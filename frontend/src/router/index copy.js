import { createRouter, createWebHistory } from 'vue-router'
import Home from '@/views/Home.vue'

console.log('🔍 Vue Router is being initialized...')

const routes = [
  {
    path: '/',
    name: 'Home',
    component: Home,
    meta: { title: 'Home - Mindful Learning' },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
