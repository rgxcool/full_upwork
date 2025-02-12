import { createStore } from 'vuex'
import axios from 'axios'

export default createStore({
  state: {
    userToken: localStorage.getItem('userToken') || null,
    userRole: localStorage.getItem('userRole') || null,
    tasks: [],
  },
  mutations: {
    SET_USER(state, { token, role }) {
      console.log('✅ Vuex: Saving user token & role:', token, role)
      state.userToken = token
      state.userRole = role
      localStorage.setItem('userToken', token)
      localStorage.setItem('userRole', role)
    },
    LOGOUT(state) {
      console.log('🔴 Vuex: Logging out user.')
      state.userToken = null
      state.userRole = null
      localStorage.removeItem('userToken')
      localStorage.removeItem('userRole')
    },

    // ✅ Task Mutations
    SET_TASKS(state, tasks) {
      state.tasks = tasks
    },
    ADD_TASK(state, task) {
      state.tasks.push(task)
    },
    UPDATE_TASK(state, updatedTask) {
      const index = state.tasks.findIndex((task) => task._id === updatedTask._id)
      if (index !== -1) {
        state.tasks[index] = updatedTask
      }
    },
    DELETE_TASK(state, taskId) {
      state.tasks = state.tasks.filter((task) => task._id !== taskId)
    },
    DELETE_ALL_TASKS(state) {
      state.tasks = []
    },
  },
  actions: {
    // ✅ AUTH ACTIONS
    async login({ commit }, credentials) {
      console.log('🛠 Vuex: Attempting login with credentials:', credentials)

      try {
        const response = await axios.post(`${import.meta.env.VITE_API_URL}/api/auth/login`, credentials)
        console.log('✅ Vuex: Backend response:', response.data)

        const { userToken } = response.data // ✅ Fix: Extract correct token key
        if (!userToken) {
          console.error('❌ Vuex: Missing `userToken` in backend response:', response.data)
          return { success: false, message: 'Login failed: No token received.' }
        }

        // ✅ Commit token & role
        commit('SET_USER', { token: userToken, role: response.data.user?.role || 'user' })

        return {
          success: true,
          message: response.data.message,
          token: userToken,
        }
      } catch (error) {
        console.error('❌ Vuex: Login request failed:', error.response?.data || error)
        return { success: false, message: error.response?.data?.message || 'Login failed due to server error.' }
      }
    },

    logout({ commit }) {
      commit('LOGOUT')
    },

    // ✅ TASK ACTIONS
    async fetchTasks({ commit, state }) {
      if (!state.userToken) {
        console.error('❌ Vuex: No token found, cannot fetch tasks.')
        return
      }

      try {
        const response = await axios.get(`${import.meta.env.VITE_API_URL}/api/tasks`, {
          headers: { Authorization: `Bearer ${state.userToken}` },
        })

        commit('SET_TASKS', response.data)
      } catch (error) {
        console.error('❌ Vuex: Failed to fetch tasks:', error.response?.data || error)
      }
    },

    async addTask({ commit, state }, description) {
      if (!state.userToken) {
        console.error('❌ Vuex: No token found, cannot add task.')
        return
      }

      try {
        const response = await axios.post(`${import.meta.env.VITE_API_URL}/api/tasks`, { description }, { headers: { Authorization: `Bearer ${state.userToken}` } })

        console.log('✅ Vuex: Task added:', response.data)
        commit('ADD_TASK', response.data)
      } catch (error) {
        console.error('❌ Vuex: Failed to add task:', error.response?.data || error)
      }
    },

    async updateTask({ commit, state }, task) {
      if (!state.userToken) {
        console.error('❌ Vuex: No token found, cannot update task.')
        return
      }

      try {
        const response = await axios.put(`${import.meta.env.VITE_API_URL}/api/tasks/${task._id}`, task, { headers: { Authorization: `Bearer ${state.userToken}` } })

        commit('UPDATE_TASK', response.data)
      } catch (error) {
        console.error('❌ Vuex: Failed to update task:', error.response?.data || error)
      }
    },

    async deleteTask({ commit, state }, taskId) {
      if (!state.userToken) {
        console.error('❌ Vuex: No token found, cannot delete task.')
        return
      }

      try {
        await axios.delete(`${import.meta.env.VITE_API_URL}/api/tasks/${taskId}`, {
          headers: { Authorization: `Bearer ${state.userToken}` },
        })

        commit('DELETE_TASK', taskId)
      } catch (error) {
        console.error('❌ Vuex: Failed to delete task:', error.response?.data || error)
      }
    },

    async deleteAllTasks({ commit, state }) {
      if (!state.userToken) {
        console.error('❌ Vuex: No token found, cannot delete all tasks.')
        return
      }

      try {
        await axios.delete(`${import.meta.env.VITE_API_URL}/api/tasks`, {
          headers: { Authorization: `Bearer ${state.userToken}` },
        })

        commit('DELETE_ALL_TASKS')
      } catch (error) {
        console.error('❌ Vuex: Failed to delete all tasks:', error.response?.data || error)
      }
    },
  },
  getters: {
    isLoggedIn: (state) => !!state.userToken,
    userRole: (state) => state.userRole, // ✅ Getter for user role
    tasks: (state) => state.tasks, // ✅ Getter for tasks
  },
})
