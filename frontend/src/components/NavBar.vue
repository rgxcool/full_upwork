<template>
  <nav class="navbar" @click.self="closeSearch">
    <div class="top-nav">
      <div class="build-counter">v. {{ buildVersion }}</div>

      <!-- Search Bar -->
      <div class="search-container" @click.stop>
        <div class="search-bar">
          <input
            type="text"
            v-model="searchQuery"
            @input="handleSearch"
            @focus="showFilterOptions"
            placeholder="Sök efter lärare, elev, kurs eller datum..."
          />
          <button @click="toggleSearch">
            <svg v-if="!showResults" xmlns="http://www.w3.org/2000/svg" width="24" height="24">
              <path
                fill="currentColor"
                d="m19.6 21l-6.3-6.3q-.75.6-1.725.95T9.5 16q-2.725 0-4.612-1.888T3 9.5t1.888-4.612T9.5 3t4.613 1.888T16 9.5q0 1.1-.35 2.075T14.7 13.3l6.3 6.3zM9.5 14q1.875 0 3.188-1.312T14 9.5t-1.312-3.187T9.5 5T6.313 6.313T5 9.5t1.313 3.188T9.5 14"
              />
            </svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" width="16" height="16">
              <path
                fill="currentColor"
                d="M7.293 8L3.146 3.854a.5.5 0 1 1 .708-.708L8 7.293l4.146-4.147a.5.5 0 0 1 .708.708L8.707 8l4.147 4.146a.5.5 0 0 1-.708.708L8 8.707l-4.146 4.147a.5.5 0 0 1-.708-.708z"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Logo -->
    <div class="logo-container">
      <router-link class="navbar-brand" to="/">
        <img src="../assets/mindful_transparent.png" alt="Mindful logo" class="logo" />
      </router-link>
    </div>

    <!-- Role-Based Navigation -->
    <ul class="nav-links">
      <li v-for="item in filteredMenuItems" :key="item.link">
        <router-link :to="item.link" class="nav-link">{{ item.name }}</router-link>
      </li>
    </ul>

    <!-- User Profile & Logout -->
    <div class="icon-container">
      <router-link v-if="isLoggedIn" to="/profile" class="icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">
          <path
            fill="currentColor"
            d="M12 4a4 4 0 0 1 4 4a4 4 0 0 1-4 4a4 4 0 0 1-4-4a4 4 0 0 1 4-4m0 10c4.42 0 8 1.79 8 4v2H4v-2c0-2.21 3.58-4 8-4"
          />
        </svg>
      </router-link>

      <!-- Login / Logout -->
      <router-link v-if="!isLoggedIn" to="/login" class="px-4 py-2 text-blue-600 hover:underline">
        Login
      </router-link>
      <button v-else @click="logout" class="px-4 py-2 text-red-600 hover:underline">Logout</button>
    </div>
  </nav>
</template>

<script>
  import { computed } from 'vue'
  import { useStore } from 'vuex'
  import { useRouter } from 'vue-router'

  export default {
    setup() {
      const store = useStore()
      const router = useRouter()

      const isLoggedIn = computed(() => store.getters.isLoggedIn)
      const hasPermission = (role) => store.getters.hasPermission(role)

      const logout = () => {
        store.dispatch('logout')
        router.push('/')
      }

      const menuItems = [
        { name: 'Register', link: '/register', guestOnly: true },

        // Admin Routes
        { name: 'Add User', link: '/lagg-till-anvandare', role: 'admin' },
        { name: 'Search Users', link: '/anvandare', role: 'admin' },
        { name: 'Add Student', link: '/addstudent', role: 'admin' },
        { name: 'Student List', link: '/students', role: 'admin' },
        { name: 'Education Editor', link: '/education', role: 'admin' },
        { name: 'Programs & Courses', link: '/programsandcourses', role: 'admin' },
        { name: 'Programs & Packages', link: '/programsandpackages', role: 'admin' },
        { name: 'Edit Student', link: '/editstudent', role: 'admin' },
        { name: 'PDF Viewer', link: '/pdf', role: 'admin' },

        // Teacher Routes
        { name: 'Exam Calendar', link: '/kalender', role: 'teacher' },
        { name: 'Grade Setting', link: '/betyg', role: 'teacher' },

        // Student Routes
        { name: 'Student Details', link: '/student/:id', role: 'student' },
      ]

      const filteredMenuItems = computed(() => {
        return menuItems.filter((item) => {
          if (item.guestOnly && isLoggedIn.value) return false // Hide guest links for logged-in users
          if (item.role && !hasPermission(item.role)) return false // Hide unauthorized links
          return true
        })
      })

      return { isLoggedIn, logout, filteredMenuItems }
    },
  }
</script>

<style scoped>
  /* Navbar */

  .logo-container {
    display: flex;
    justify-content: flex-start;
    gap: 15px;
  }
  .navbar {
    background-color: #f8f8f8;
    font-family: 'Roboto', sans-serif;
    padding: 20px;
  }

  /* Top navigation container */
  .top-nav {
    display: flex;
    align-items: center;
    justify-content: space-between !important;
    max-width: 1800px;
    margin: 0 auto;
    width: 100%;
    padding: 15px 20px;
  }

  /* Sökruta exakt till vänster */
  .search-container {
    display: flex;
    justify-content: center;
    width: 100%;
  }

  .search-bar {
    display: flex;
    align-items: center;
    background: #ece6f0;
    padding: 10px 15px;
    border-radius: 30px;
    width: 500px;
  }

  .search-bar input {
    border: none;
    outline: none;
    background: transparent;
    font-size: 16px;
    width: 100%;
  }

  .search-bar button {
    border: none;
    background: transparent;
    cursor: pointer;
  }

  .search-results {
    background: white;
    border-radius: 10px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    padding: 50px;
    position: absolute;
    top: 75px;
    width: 900px;
    max-height: 400px;
    overflow-y: auto;
    z-index: 1000;
    display: flex;
    flex-direction: column;
  }

  .filter-buttons {
    display: flex;
    justify-content: space-between;
    margin-bottom: 10px;
    gap: 10px;
  }

  .filter-buttons button {
    background: #f0f0f0;
    border: none;
    padding: 10px 15px;
    border-radius: 5px;
    cursor: pointer;
    flex: 1;
    text-align: center;
    font-size: 14px;
  }

  .filter-buttons button.active {
    background: #6c63ff;
    color: white;
  }

  .result-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .result-item {
    padding: 15px;
    border-bottom: 1px solid #ddd;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    text-align: left;
  }

  .result-item:hover {
    background: #f5f5f5;
  }

  .result-title {
    font-weight: bold;
    font-size: 16px;
  }

  .result-subtitle {
    font-size: 14px;
    color: gray;
  }

  .logo {
    height: 50px;
  }

  /* Ikoner exakt till höger */
  .icon-container {
    flex: 0 0 auto; /* Prevents it from growing */
    display: flex;
    justify-content: flex-end;
    gap: 15px;
  }

  .icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: #ece6f0;
    text-decoration: none;
    color: #333;
    transition: background 0.3s;
  }

  .icon:hover {
    background: #dcd4e6;
  }

  /* Separationslinje */
  .divider {
    width: 100%;
    height: 1px;
    background: #ddd;
    margin-top: 10px;
  }

  /* Navigationslänkar exakt justerade */
  .nav-links {
    display: flex;
    justify-content: center; /* Centering the links */
    margin: 0 auto;
    gap: 40px;
    list-style: none;
  }

  .nav-link {
    text-decoration: none;
    font-size: 20px;
    color: #333;
    transition: color 0.3s;
  }

  .nav-link:hover {
    text-decoration: underline;
  }

  @media (max-width: 768px) {
    .nav-links {
      display: none;
      flex-direction: column;
      width: 100%;
      text-align: center;
    }
    .menu-toggle {
      display: block;
    }
  }
</style>
