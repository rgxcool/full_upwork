import { createStore } from 'vuex'
import axios from 'axios'

export default createStore({
  state: {
    token: localStorage.getItem('token') || null,
    userRole: localStorage.getItem('userRole') || null,
    tasks: [],
  },
  mutations: {
    SET_USER(state, { token, role }) {
      console.log(' Vuex: Saving user token & role:', token, role)
      state.token = token
      state.userRole = role
      localStorage.setItem('token', token)
      localStorage.setItem('userRole', role)
    },
    LOGOUT(state) {
      console.log('🔴 Vuex: Logging out user.')
      state.token = null
      state.userRole = null
      localStorage.removeItem('token')
      localStorage.removeItem('userRole')
    },

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
    async login({ commit }, credentials) {
      console.log('🛠 Vuex: Attempting login with credentials:', credentials)

      try {
        const response = await axios.post(`${import.meta.env.VITE_API_URL}/api/auth/login`, credentials)
        console.log(' Vuex: Backend response:', response.data)

        const { token } = response.data //  Fix: Extract correct token key
        if (!token) {
          console.error('❌ Vuex: Missing `token` in backend response:', response.data)
          return { success: false, message: 'Login failed: No token received.' }
        }

        //  Commit token & role
        commit('SET_USER', { token: token, role: response.data.user?.role || 'user' })

        return {
          success: true,
          message: response.data.message,
          token: token,
        }
      } catch (error) {
        console.error('❌ Vuex: Login request failed:', error.response?.data || error)
        return { success: false, message: error.response?.data?.message || 'Login failed due to server error.' }
      }
    },

    logout({ commit }) {
      commit('LOGOUT')
    },

    async fetchTasks({ commit, state }) {
      if (!state.token) {
        console.error('❌ Vuex: No token found, cannot fetch tasks.')
        return
      }

      const apiUrl = `${import.meta.env.VITE_API_URL}/api/task`
      console.log('🔍 Fetching tasks from:', apiUrl) //  Debug API URL

      try {
        const response = await axios.get(apiUrl, {
          headers: { Authorization: `Bearer ${state.token}` },
        })

        console.log(' Vuex: Fetched tasks:', response.data)
        commit('SET_TASKS', response.data)
      } catch (error) {
        console.error('❌ Vuex: Failed to fetch tasks:', error.response?.data || error)
      }
    },

    async addTask({ commit, state }, description) {
      if (!state.token) {
        console.error('❌ Vuex: No token found, cannot add task.')
        return
      }

      try {
        const response = await axios.post(
          `${import.meta.env.VITE_API_URL}/api/task`,
          { description },
          { headers: { Authorization: `Bearer ${state.token}` } }
        )

        console.log(' Vuex: Task added:', response.data)
        commit('ADD_TASK', response.data)
      } catch (error) {
        console.error('❌ Vuex: Failed to add task:', error.response?.data || error)
      }
    },

    async updateTask({ commit, state }, task) {
      if (!state.token) {
        console.error('❌ Vuex: No token found, cannot update task.')
        return
      }

      try {
        const response = await axios.put(`${import.meta.env.VITE_API_URL}/api/task/${task._id}`, task, {
          headers: { Authorization: `Bearer ${state.token}` },
        })

        commit('UPDATE_TASK', response.data)
      } catch (error) {
        console.error('❌ Vuex: Failed to update task:', error.response?.data || error)
      }
    },

    async deleteTask({ commit, state }, taskId) {
      if (!state.token) {
        console.error('❌ Vuex: No token found, cannot delete task.')
        return
      }

      try {
        await axios.delete(`${import.meta.env.VITE_API_URL}/api/task/${taskId}`, {
          headers: { Authorization: `Bearer ${state.token}` },
        })

        commit('DELETE_TASK', taskId)
      } catch (error) {
        console.error('❌ Vuex: Failed to delete task:', error.response?.data || error)
      }
    },

    async deleteAllTasks({ commit, state }) {
      if (!state.token) {
        console.error('❌ Vuex: No token found, cannot delete all tasks.')
        return
      }

      try {
        await axios.delete(`${import.meta.env.VITE_API_URL}/api/task`, {
          headers: { Authorization: `Bearer ${state.token}` },
        })

        commit('DELETE_ALL_TASKS')
      } catch (error) {
        console.error('❌ Vuex: Failed to delete all tasks:', error.response?.data || error)
      }
    },
  },
  getters: {
    isLoggedIn: (state) => !!state.token,
    userRole: (state) => state.userRole, //  Getter for user role
    tasks: (state) => state.tasks, //  Getter for tasks
  },
})
