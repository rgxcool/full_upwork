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

export default createStore({
  state: {
    user: null, // User object, no more token storage
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
     * Example usage: store.getters.hasPermission("teacher")
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
      state.user = null
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
        const response = await axios.post(
          `${import.meta.env.VITE_API_URL}/api/auth/login`,
          { email: credentials.email.trim(), password: credentials.password.trim() },
          { withCredentials: true } // ✅ Ensures cookies are sent
        )

        console.log('✅ Vuex: Login successful, response:', response.data)

        await dispatch('fetchUser') // ✅ Fetch user session after login

        return response.data // ✅ Ensures Vuex login action returns correct data
      } catch (error) {
        console.error('❌ Login failed:', error.response?.data?.message || error)
        return { success: false, message: error.response?.data?.message || 'Login failed' }
      }
    },

    async fetchUser({ commit }) {
      try {
        const { data } = await axios.get(`${import.meta.env.VITE_API_URL}/api/auth/session`, {
          withCredentials: true, // ✅ Ensures cookies are sent
        })

        console.log('✅ User session fetched:', data) // ✅ Debugging

        commit('SET_USER', data.user)
      } catch (error) {
        console.error('❌ Failed to fetch user:', error.response?.data?.message || error)
      }
    },

    async logout({ commit }) {
      try {
        await axios.post(
          `${import.meta.env.VITE_API_URL}/api/auth/logout`,
          {},
          { withCredentials: true }
        )
      } catch (error) {
        console.error('❌ Logout request failed:', error)
      }
      commit('LOGOUT')
    },

    async fetchTasks({ commit }) {
      try {
        const { data } = await axios.get(`${import.meta.env.VITE_API_URL}/api/task`, {
          withCredentials: true, // ✅ Ensures auth token is sent in cookies
        })
        commit('SET_TASKS', data)
      } catch (error) {
        console.error('❌ Vuex: Failed to fetch tasks:', error.response?.data || error)
      }
    },

    async addTask({ commit }, description) {
      try {
        const { data } = await axios.post(
          `${import.meta.env.VITE_API_URL}/api/task`,
          { description },
          {
            withCredentials: true,
          }
        )
        commit('ADD_TASK', data)
      } catch (error) {
        console.error('❌ Vuex: Failed to add task:', error.response?.data || error)
      }
    },

    async updateTask({ commit }, task) {
      try {
        const { data } = await axios.put(
          `${import.meta.env.VITE_API_URL}/api/task/${task._id}`,
          task,
          {
            withCredentials: true,
          }
        )
        commit('UPDATE_TASK', data)
      } catch (error) {
        console.error('❌ Vuex: Failed to update task:', error.response?.data || error)
      }
    },

    async deleteTask({ commit }, taskId) {
      try {
        await axios.delete(`${import.meta.env.VITE_API_URL}/api/task/${taskId}`, {
          withCredentials: true,
        })
        commit('DELETE_TASK', taskId)
      } catch (error) {
        console.error('❌ Vuex: Failed to delete task:', error.response?.data || error)
      }
    },

    async deleteAllTasks({ commit }) {
      try {
        await axios.delete(`${import.meta.env.VITE_API_URL}/api/delalltasks`, {
          withCredentials: true,
        })
        commit('DELETE_ALL_TASKS')
      } catch (error) {
        console.error('❌ Vuex: Failed to delete all tasks:', error.response?.data || error)
      }
    },
  },
})
