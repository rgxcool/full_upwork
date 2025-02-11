import { createStore } from 'vuex';

const store = createStore({
  state() {
    return {
      user: null,
      students: [],
    };
  },
  mutations: {
    setUser(state, user) {
      state.user = user;
    },
    setStudents(state, students) {
      state.students = students;
    },
  },
  actions: {
    fetchStudents({ commit }) {
      fetch('http://localhost:5001/api/students')
        .then(response => response.json())
        .then(data => {
          commit('setStudents', data);
        })
        .catch(error => console.error('Error fetching students:', error));
    },
  },
  getters: {
    getUser(state) {
      return state.user;
    },
    getStudents(state) {
      return state.students;
    },
  },
});

export default store;
