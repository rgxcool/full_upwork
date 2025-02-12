import axios from 'axios'

export default {
  namespaced: true,
  state: {
    token: localStorage.getItem('token') || null,
    user: null,
  },
  mutations: {
    SET_TOKEN(state, token) {
      state.token = token
      localStorage.setItem('token', token) // Store token persistently
    },
    SET_USER(state, user) {
      state.user = user
    },
    LOGOUT(state) {
      state.token = null
      state.user = null
      localStorage.removeItem('token') // Remove token on logout
    },
  },
  actions: {
    async login({ commit }, credentials) {
      try {
        const response = await axios.post('https://your-backend.com/api/login', credentials)
        const token = response.data.token

        commit('SET_TOKEN', token)
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}` // Attach token globally

        await dispatch('fetchUser') // Load user details after login
      } catch (error) {
        console.error('Login failed:', error.response?.data?.message)
      }
    },
    async fetchUser({ commit, state }) {
      if (!state.token) return

      try {
        const response = await axios.get('https://your-backend.com/api/user', {
          headers: { Authorization: `Bearer ${state.token}` },
        })
        commit('SET_USER', response.data)
      } catch (error) {
        console.error('Failed to fetch user:', error.response?.data?.message)
      }
    },
    logout({ commit }) {
      commit('LOGOUT')
      delete axios.defaults.headers.common['Authorization'] // Remove token from Axios headers
    },
  },
  getters: {
    isAuthenticated: (state) => !!state.token,
    user: (state) => state.user,
  },
}
