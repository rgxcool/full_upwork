import { createRouter, createWebHistory } from 'vue-router'
import store from '@/store/store.js'

// Public Views
import Home from '@/views/Home.vue'
import LoginPage from '@/views/Auth/Login.vue'
import ResetPassword from '@/views/Auth/ResetPassword.vue'
import Register from '@/views/Auth/Register.vue'

// Lazy-loaded Admin Views
const ExcelUpload = () => import('@/views/Admin/ExcelUpload.vue')
const AddStudent = () => import('@/views/Admin/AddStudent.vue')
const AddTeacher = () => import('@/views/Admin/AddTeacher.vue')
const EducationEditor = () => import('@/views/Admin/EducationEditor.vue')
const ProgramsAndCourses = () => import('@/views/Admin/ProgramsAndCourses.vue')
const ProgramsAndPackages = () => import('@/views/Admin/ProgramsAndPackages.vue')
const AddUser = () => import('@/views/Admin/AddUser.vue')
const EditStudent = () => import('@/views/Admin/EditStudent.vue')
const PdfView = () => import('@/views/Admin/PdfView.vue')
const SearchUser = () => import('@/views/Admin/SearchUser.vue')
const SearchResultDetails = () => import('@/views/Admin/SearchResultDetails.vue')
const EarningsOverview = () => import('@/views/Admin/EarningsOverview.vue')
const CoursesStats = () => import('@/views/Admin/CoursesStats.vue')
const CourseInstances = () => import('@/views/Admin/CourseInstances.vue')
const CourseMatching = () => import('@/views/Admin/CourseMatching.vue')
const StudentEnrollments = () => import('@/views/Admin/StudentEnrollments.vue')
const TeacherManagement = () => import('@/views/Admin/TeacherManagement.vue')

// Lazy-loaded Teacher Views
const FullCalendar = () => import('@/views/Teacher/ExamCalendar.vue')
const BetygSattning = () => import('@/views/Teacher/BetygSattning.vue')
const ProfilePage = () => import('@/views/Teacher/ProfilePage.vue')

// Student Views
import StudentDetails from '@/views/Student/StudentDetails.vue'
import APLView from '@/views/APLView.vue'
import GradeStudent from '../views/Admin/gradeStudent.vue'
import ExamForm from '../views/Exams/ExamOverview.vue'
import EducationDetails from '../views/Admin/EducationDetails.vue'

const routes = [
  // Public Routes
  { path: '/', name: 'home', component: Home, meta: { title: 'Home - Mindful Learning' } },
  {
    path: '/unauthorized',
    name: 'Unauthorized',
    component: () => import('@/views/Unauthorized.vue'),
  },
  {
    path: '/login',
    name: 'login',
    component: LoginPage,
    meta: { title: 'Login - Mindful Learning' },
  },
  {
    path: '/register',
    name: 'Register',
    component: Register,
    meta: { title: 'Register - Mindful Learning' },
  },
  {
    path: '/reset-password',
    component: ResetPassword,
    meta: { title: 'Reset Password - Mindful Learning' },
  },

  // Admin Dashboard: Move CoursesStats to top
  {
    path: '/stats/courses',
    name: 'CoursesStats',
    component: CoursesStats,
    meta: { title: 'Kursstatistik', role: 'admin' },
  },

  // Admin Routes (Requires "admin" or higher)
  { path: '/lagg-till-anvandare', component: AddUser, meta: { title: 'Add User', role: 'admin' } },
  {
    path: '/lagg-till-larare',
    component: AddTeacher,
    meta: { title: 'Add Teacher', role: 'admin' },
  },
  { path: '/anvandare', component: SearchUser, meta: { title: 'Search Users', role: 'admin' } },
  { path: '/admin/users', component: SearchUser, meta: { title: 'Admin Users', role: 'admin' } },
  {
    path: '/addstudent',
    name: 'AddStudent',
    component: AddStudent,
    meta: { title: 'Add Student', role: 'admin' },
  },
  {
    path: '/detaljer/:type/:id',
    component: SearchResultDetails,
    props: true,
    meta: { title: 'Search Result Details', role: 'teacher' }, // This was admin, and probably should be but making it teacher to broaden access.
  },
  {
    path: '/education/:id',
    name: 'EducationDetials',
    component: EducationDetails,
    props: true,
    meta: { title: 'Education Details', role: 'admin' },
  },
  {
    path: '/students',
    name: 'Students',
    component: ExcelUpload,
    meta: { title: 'Student List', role: 'admin' },
  },
  {
    path: '/education',
    name: 'EducationEditor',
    component: EducationEditor,
    meta: { title: 'Education Editor', role: 'admin' },
  },
  {
    path: '/programsandcourses',
    name: 'ProgramsAndCourses',
    component: ProgramsAndCourses,
    meta: { title: 'Programs & Courses', role: 'admin' },
  },
  {
    path: '/programsandpackages',
    component: ProgramsAndPackages,
    meta: { title: 'Programs & Packages', role: 'admin' },
  },
  {
    path: '/editstudent',
    name: 'EditStudent',
    component: EditStudent,
    meta: { title: 'Edit Student', role: 'admin' },
  },
  {
    path: '/earnings',
    name: 'Earnings',
    component: EarningsOverview,
    meta: { title: 'Earnings Overview', role: 'admin' },
  },
  {
    path: '/course-instances',
    name: 'CourseInstances',
    component: CourseInstances,
    meta: { title: 'Course Instances', role: 'admin' },
  },
  {
    path: '/course-matching',
    name: 'CourseMatching',
    component: CourseMatching,
    meta: { title: 'Course Matching', role: 'admin' },
  },
  {
    path: '/student-enrollments',
    name: 'StudentEnrollments',
    component: StudentEnrollments,
    meta: { title: 'Student Enrollments', role: 'admin' },
  },
  {
    path: '/teacher-management',
    name: 'TeacherManagement',
    component: TeacherManagement,
    meta: { title: 'Teacher Management', role: 'admin' },
  },

  // Teacher Routes (Requires "teacher" or higher)
  { path: '/kalender', component: FullCalendar, meta: { title: 'Exam Calendar', role: 'teacher' } },
  { path: '/betyg', component: BetygSattning, meta: { title: 'Grade Setting', role: 'teacher' } },
  {
    path: '/profile',
    name: 'profile',
    component: ProfilePage,
    meta: { title: 'My Profile', requiresAuth: true },
  },

  // Student Routes
  {
    path: '/student/:id',
    name: 'StudentDetails',
    component: StudentDetails,
    props: true,
    meta: { title: 'Student Details', role: 'student' },
  },

  {
    path: '/examform',
    name: 'ExamForm',
    component: ExamForm,
    meta: { title: 'Exam Form', role: 'student' },
  },

  // Utility Routes (General Access)
  {
    path: '/pdf',
    name: 'PdfView',
    component: PdfView,
    meta: { title: 'PDF Viewer', role: 'admin' },
  },
  {
    path: '/apl',
    name: 'APLView',
    component: APLView,
    meta: { title: 'APL List', role: 'admin' },
  },
  {
    path: '/grades',
    name: 'Grades',
    component: GradeStudent,
    meta: { title: 'Grade Student', role: 'teacher' },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

// Global Navigation Guards
router.beforeEach((to, from, next) => {
  document.title = to.meta.title || 'Mindful Learning' // Dynamically set page titles

  const isAuthenticated = store.getters.isLoggedIn
  const hasPermission = store.getters.hasPermission

  if (to.meta.requiresAuth && !isAuthenticated) {
    next('/login') // Redirect unauthenticated users
  } else if (to.meta.role && !hasPermission(to.meta.role)) {
    next('/unauthorized') // Redirect if role is insufficient
  } else {
    next() // Allow access
  }
})

export default router
