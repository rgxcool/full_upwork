import axios from 'axios'

export default {
  state: {
    userToken: localStorage.getItem('userToken') || null, // Persist login state
  },
  mutations: {
    SET_TOKEN(state, token) {
      state.userToken = token
      localStorage.setItem('userToken', token) // Store token in LocalStorage
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}` // Set default auth header
    },
    LOGOUT(state) {
      state.userToken = null
      localStorage.removeItem('userToken')
      delete axios.defaults.headers.common['Authorization'] // Remove token
    },
  },
  actions: {
    async login({ commit }, credentials) {
      try {
        const response = await axios.post('http://localhost:5001/auth/login', credentials)
        commit('SET_TOKEN', response.data.userToken)
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
