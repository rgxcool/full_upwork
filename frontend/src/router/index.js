import { createRouter, createWebHistory } from 'vue-router'
import store from '@/store'

import Home from '@/pages/Home.vue'

import LoginPage from '@/pages/Auth/Login.vue'
import ResetPassword from '@/pages/Auth/ResetPassword.vue'
import Register from '@/pages/Auth/Register.vue'

import ExcelUpload from '@/pages/Admin/ExcelUpload.vue'
import AddStudent from '@/pages/Admin/AddStudent.vue'
import EducationEditor from '@/pages/Admin/EducationEditor.vue'
import ProgramsAndCourses from '@/pages/Admin/ProgramsAndCourses.vue'
import AddUser from '@/pages/Admin/AddUser.vue'
import EditStudent from '@/pages/Admin/EditStudent.vue'

import FullCalendar from '@/pages/Teacher/ExamCalendar.vue'
import BetygSattning from '@/pages/Teacher/BetygSattning.vue'
import ProfilePage from '@/pages/Teacher/ProfilePage.vue'
import StudentDetails from '@/pages/Student/StudentDetails.vue'

import PdfParser from '@/pages/Utils/PdfParser.vue'
import SearchUser from '@/pages/Utils/SearchUser.vue'

const routes = [
  { path: '/', name: 'home', component: Home, meta: { title: 'Home - Mindful Learning' } },

  { path: '/login', name: 'login', component: LoginPage, meta: { title: 'Login - Mindful Learning' } },
  { path: '/register', name: 'Register', component: Register },
  { path: '/reset-password', component: ResetPassword },

  { path: '/lagg-till-anvandare', component: AddUser },
  { path: '/anvandare', component: SearchUser },

  { path: '/addstudent', name: 'AddStudent', component: AddStudent },
  //   { path: '/addteacher', name: 'AddTeacher', component: AddTeacher },
  { path: '/elever', name: 'Elever', component: ExcelUpload },
  //   { path: '/kalender', component: FullCalendar },
  //   { path: '/students/:id', name: 'StudentDetails', component: StudentDetails, props: true },
  //   { path: '/education', name: 'EducationEditor', component: EducationEditor },
  //   { path: '/programsandcourses', name: 'ProgramsAndCourses', component: ProgramsAndCourses },
  //   { path: '/editstudent', name: 'EditStudent', component: EditStudent },

  //   { path: '/betyg', component: BetygSattning },
  //   { path: '/profile', name: 'profile', component: ProfilePage, meta: { requiresAuth: true } },
  //   { path: '/pdf', name: 'PDFParser', component: PdfParser },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

// Global navigation guards
router.beforeEach((to, from, next) => {
  document.title = to.meta.title || 'Mindful Learning'

  const isAuthenticated = store.getters.isLoggedIn
  const userRole = store.getters.userRole

  if (to.meta.requiresAuth && !isAuthenticated) {
    next('/login')
  } else if (to.meta.role && to.meta.role !== userRole) {
    next('/unauthorized')
  } else {
    next()
  }
})

export default router
