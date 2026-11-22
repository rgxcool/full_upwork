import { createStore } from 'vuex'
import client from '@/api/client.js'

// Order used ONLY to pick a single "primary" role for display and for the
// isAdmin/isSystemAdmin getters. It is NOT an access hierarchy: route and
// menu access is decided by explicit role lists (see hasPermission).
const PRIMARY_ROLE_ORDER = [
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

// Explicit role implications. A systemadmin can do everything an admin can
// (PERMISSION_MATRIX); no other role implies another one.
const ROLE_IMPLIES = {
  systemadmin: ['admin'],
}

const collectUserRoles = (user) => {
  const collected = []
  if (Array.isArray(user?.roles)) collected.push(...user.roles)
  if (user?.role) collected.push(user.role)
  return [...new Set(collected.filter((role) => typeof role === 'string'))]
}

const effectiveRoles = (user) => {
  const roles = new Set(collectUserRoles(user))
  for (const role of [...roles]) {
    for (const implied of ROLE_IMPLIES[role] || []) roles.add(implied)
  }
  return roles
}

/**
 * Explicit role check: true when the user holds one of the required roles
 * (systemadmin also satisfies 'admin'). Higher roles do NOT inherit lower
 * roles' routes, so e.g. a teacher can't open SYV pages and staff can't open
 * student-only pages.
 */
export function userHasRole(user, requiredRole) {
  const required = Array.isArray(requiredRole) ? requiredRole : [requiredRole]
  const roles = effectiveRoles(user)
  return required.some((role) => roles.has(role))
}

/**
 * Explicit per-user override for a PERMISSION_MATRIX feature
 * (User.permissions, set in /admin/edit-user). Returns true/false when the
 * admin set one, otherwise null (= use the role default).
 */
export function userFeatureOverride(user, feature) {
  const value = user?.permissions?.[feature]
  return value === true || value === false ? value : null
}

/**
 * Route/menu access. `role` is the default role list (it mirrors the
 * PERMISSION_MATRIX defaults); `feature`, when given, lets a per-user override
 * grant or revoke access regardless of role, like canFeature() in the backend.
 */
export function userCanAccess(user, { role, feature } = {}) {
  if (!user) return false
  if (feature) {
    const override = userFeatureOverride(user, feature)
    if (override !== null) return override
  }
  if (!role) return true
  return userHasRole(user, role)
}

// Use the centralized API client (timeout, error normalization, 401 handling)
const api = client

const store = createStore({
  state: {
    user: null,
    tasks: [],
    requiresPasswordChange: false,
  },

  getters: {
    isLoggedIn: (state) => !!state.user,
    requiresPasswordChange: (state) => !!state.requiresPasswordChange,
    userRole: (state) => {
      let best = null
      let bestIndex = -1
      for (const role of collectUserRoles(state.user)) {
        const index = PRIMARY_ROLE_ORDER.indexOf(role)
        if (index > bestIndex) {
          bestIndex = index
          best = role
        }
      }
      return best || 'guest'
    },
    // Every role the user holds (roles[] plus the legacy singular role),
    // de-duplicated. Used by StaffProfile, its tabs and the NavBar.
    userRoles: (state) => collectUserRoles(state.user),
    isAdmin: (state, getters) => ['admin', 'systemadmin'].includes(getters.userRole),
    isSystemAdmin: (state, getters) => getters.userRole === 'systemadmin',
    tasks: (state) => state.tasks,

    /**
     * Explicit role check (no hierarchy): does the user hold one of the
     * required roles? systemadmin also counts as admin.
     */
    hasPermission: (state) => (requiredRole) => userHasRole(state.user, requiredRole),

    /**
     * Route/menu access with per-user feature overrides, e.g.
     * canAccess({ role: ['admin'], feature: 'statistics' }).
     */
    canAccess: (state) => (meta) => userCanAccess(state.user, meta),

    /** Effective value of a PERMISSION_MATRIX feature override, or null. */
    featureOverride: (state) => (feature) => userFeatureOverride(state.user, feature),
  },

  mutations: {
    SET_USER(state, user) {
      // Ensure role is set from roles array if role is missing
      if (user && !user.role && user.roles && user.roles.length > 0) {
        user.role = user.roles[0];
      }
      state.user = user
    },
    LOGOUT(state) {
      state.user = null
      state.tasks = [] // Clear tasks on logout
      state.requiresPasswordChange = false
    },
    SET_TASKS(state, tasks) {
      state.tasks = tasks
    },
    SET_REQUIRES_PASSWORD_CHANGE(state, value) {
      state.requiresPasswordChange = !!value
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
    async login({ dispatch, commit }, credentials) {
      try {
        const { data } = await api.post('/auth/login', {
          email: credentials.email.trim(),
          password: credentials.password.trim(),
        })

        commit('SET_REQUIRES_PASSWORD_CHANGE', data?.requiresPasswordChange)

        await dispatch('fetchUser')

        return {
          success: true,
          message: 'Login successful',
          requiresPasswordChange: !!data?.requiresPasswordChange,
        }
      } catch (error) {
        console.error('Login failed:', error)
        return { success: false, message: error.message || 'Login failed' }
      }
    },
    async fetchUser({ commit }) {
      try {
        const { data } = await api.get('/auth/session')
        commit('SET_REQUIRES_PASSWORD_CHANGE', data?.requiresPasswordChange)
        commit('SET_USER', data.user)
      } catch (error) {
        console.error('Failed to fetch current user:', error)
      }
    },
    async changePassword({ commit }, { currentPassword, newPassword }) {
      try {
        const { data } = await api.put('/auth/change-password', {
          currentPassword,
          newPassword,
        })
        commit('SET_REQUIRES_PASSWORD_CHANGE', false)
        return { success: true, message: data?.message || 'Lösenordet har ändrats.' }
      } catch (error) {
        return { success: false, message: error.message || 'Lösenordsändringen misslyckades.' }
      }
    },

    async logout({ commit }) {
      try {
        await api.post('/auth/logout')
      } catch (error) {
        console.error('Logout request failed:', error)
      }
      commit('LOGOUT')
    },

    async fetchTasks({ commit }) {
      try {
        const { data } = await api.get('/task')
        commit('SET_TASKS', data)
      } catch (error) {
        console.error('Failed to fetch tasks:', error)
      }
    },

    async addTask({ commit }, payload) {
      try {
        const body =
          typeof payload === "string"
            ? { description: payload }
            : {
                description: payload?.description,
                dueDate: payload?.dueDate || null,
                dueTime: payload?.dueTime || null,
              };
        const { data } = await api.post("/task", body)
        commit("ADD_TASK", data)
      } catch (error) {
        console.error("Failed to add task:", error)
      }
    },

    async updateTask({ commit }, task) {
      try {
        const { data } = await api.put(`/task/${task._id}`, task)
        commit('UPDATE_TASK', data)
      } catch (error) {
        console.error('Failed to update task:', error)
      }
    },

    async deleteTask({ commit }, taskId) {
      try {
        await api.delete(`/task/${taskId}`)
        commit('DELETE_TASK', taskId)
      } catch (error) {
        console.error('Failed to delete task:', error)
      }
    },

    async deleteAllTasks({ commit }) {
      try {
        await api.delete('/delalltasks')
        commit('DELETE_ALL_TASKS')
      } catch (error) {
        console.error('Failed to delete all tasks:', error)
      }
    },
  },
})

export default store

export { api }
