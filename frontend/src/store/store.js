import { createStore } from 'vuex'
import axios from 'axios'

// Role hierarchy list (higher index = higher authority)
const ROLE_HIERARCHY = [
  'guest',
  'user',
  'student',
  'coordinator',
  'specped',
  'syv',
  'teacher',
  'admin',
  'systemadmin',
]

// Create an Axios instance with credentials enabled
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL + '/api',
  withCredentials: true, // ✅ Ensures cookies are included in requests
})

export default createStore({
  state: {
    user: null,
    tasks: [],
  },

  getters: {
    isLoggedIn: (state) => !!state.user,
    userRole: (state) => state.user?.role || 'guest',
    isAdmin: (state) => ['admin', 'systemadmin'].includes(state.user?.role),
    isSystemAdmin: (state) => state.user?.role === 'systemadmin',
    tasks: (state) => state.tasks,

    /**
     * Check if the user has the required role (or higher)
     */
    hasPermission: (state) => (requiredRole) => {
      const userRole = state.user?.role || 'guest'
      const userIndex = ROLE_HIERARCHY.indexOf(userRole)
      const requiredIndex = ROLE_HIERARCHY.indexOf(requiredRole)
      return userIndex >= requiredIndex
    },
  },

  mutations: {
    SET_USER(state, user) {
      console.log(`🔹 Vuex: Setting user -> ${user?.role || 'guest'}`)
      state.user = user
    },
    LOGOUT(state) {
      console.log('🔹 Vuex: Logging out user')
      state.user = null
      state.tasks = [] // Clear tasks on logout
    },
    SET_TASKS(state, tasks) {
      state.tasks = tasks
    },
    ADD_TASK(state, task) {
      state.tasks.push(task)
    },
    UPDATE_TASK(state, updatedTask) {
      const index = state.tasks.findIndex((task) => task._id === updatedTask._id)
      if (index !== -1) state.tasks[index] = updatedTask
    },
    DELETE_TASK(state, taskId) {
      state.tasks = state.tasks.filter((task) => task._id !== taskId)
    },
    DELETE_ALL_TASKS(state) {
      state.tasks = []
    },
  },

  actions: {
    async login({ dispatch }, credentials) {
      console.log('🔹 Vuex: Attempting login with:', credentials)

      try {
        await api.post('/auth/login', {
          email: credentials.email.trim(),
          password: credentials.password.trim(),
        })

        await dispatch('fetchUser')

        return { success: true, message: 'Login successful' }
      } catch (error) {
        console.error('❌ Login failed:', error.response?.data?.message || error)
        return { success: false, message: error.response?.data?.message || 'Login failed' }
      }
    },
    async fetchUser({ commit }) {
      try {
        const { data } = await api.get('/auth/me')

        console.log('✅ User authenticated:', data)
        commit('SET_USER', data)
      } catch (error) {
        console.error('❌ Failed to fetch current user:', error.response?.data?.message || error)

        if (error.response?.status === 401) {
          commit('LOGOUT')
        }
      }
    },
    async logout({ commit }) {
      try {
        await api.post('/auth/logout')
      } catch (error) {
        console.error('❌ Logout request failed:', error)
      }
      commit('LOGOUT')
    },

    async fetchTasks({ commit }) {
      try {
        const { data } = await api.get('/task')
        commit('SET_TASKS', data)
      } catch (error) {
        console.error('❌ Vuex: Failed to fetch tasks:', error.response?.data || error)

        // Handle session expiration (force logout)
        if (error.response?.status === 401) {
          commit('LOGOUT')
        }
      }
    },

    async addTask({ commit }, description) {
      try {
        const { data } = await api.post('/task', { description })
        commit('ADD_TASK', data)
      } catch (error) {
        console.error('❌ Vuex: Failed to add task:', error.response?.data || error)
      }
    },

    async updateTask({ commit }, task) {
      try {
        const { data } = await api.put(`/task/${task._id}`, task)
        commit('UPDATE_TASK', data)
      } catch (error) {
        console.error('❌ Vuex: Failed to update task:', error.response?.data || error)
      }
    },

    async deleteTask({ commit }, taskId) {
      try {
        await api.delete(`/task/${taskId}`)
        commit('DELETE_TASK', taskId)
      } catch (error) {
        console.error('❌ Vuex: Failed to delete task:', error.response?.data || error)
      }
    },

    async deleteAllTasks({ commit }) {
      try {
        await api.delete('/delalltasks')
        commit('DELETE_ALL_TASKS')
      } catch (error) {
        console.error('❌ Vuex: Failed to delete all tasks:', error.response?.data || error)
      }
    },
  },
})
