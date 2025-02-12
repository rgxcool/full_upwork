import axios from 'axios'

export default {
  state: {
    token: localStorage.getItem('token') || null, // Persist login state
  },
  mutations: {
    SET_TOKEN(state, token) {
      state.token = token
      localStorage.setItem('token', token) // Store token in LocalStorage
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}` // Set default auth header
    },
    LOGOUT(state) {
      state.token = null
      localStorage.removeItem('token')
      delete axios.defaults.headers.common['Authorization'] // Remove token
    },
  },
  actions: {
    async login({ commit }, credentials) {
      try {
        const response = await axios.post('http://localhost:5001/auth/login', credentials)
        commit('SET_TOKEN', response.data.token)
        return response
      } catch (error) {
        console.error('Login error:', error.response?.data?.message || error.message)
        throw error
      }
    },
    logout({ commit }) {
      commit('LOGOUT')
    },
  },
}
