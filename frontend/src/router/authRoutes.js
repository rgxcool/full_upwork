import LoginPage from '@/views/Login.vue'
import Register from '@/views/Auth/Register.vue'
import ResetPassword from '@/views/Auth/ResetPassword.vue'

export default [
  {
    path: '/login',
    name: 'login',
    component: LoginPage,
    meta: { title: 'Login - Mindful Learning' },
  },
  { path: '/register', name: 'Register', component: Register },
  { path: '/reset-password', component: ResetPassword },
]
