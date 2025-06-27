<template>
  <nav class="navbar px-5" @click="handleGlobalClick">
    <!-- Search bar -->
    <div v-if="canSeeSearch" class="top-nav">
      <div class="build-counter">v. {{ buildVersion }}</div>

      <div class="search-container position-relative" @click.stop>
        <div class="search-bar d-flex align-items-center gap-2">
          <div class="input-wrapper">
            <input
              v-model="searchQuery"
              v-show="selectedSearchType !== 'Datum'"
              class="form-control rounded-pill pe-5"
              type="text"
              @input="handleSearch"
              :placeholder="`Sök efter ${selectedSearchType.toLowerCase()}...`"
            />
            <DatePicker
              v-model="selectedDate"
              v-show="selectedSearchType === 'Datum'"
              :format="'yyyy-MM-dd'"
              @change="handleSearch"
              :placeholder="'Välj datum'"
            />
          </div>

          <div class="search-type-toggle position-relative ms-auto" @click.stop>
            <button
              @click.stop="toggleSearchTypeDropdown"
              class="search-type-button"
              aria-haspopup="listbox"
              :aria-expanded="showSearchTypeDropdown.toString()"
            >
              {{ selectedSearchType }}
            </button>

            <ul v-if="showSearchTypeDropdown" class="dropdown-menu" role="listbox">
              <li
                v-for="type in ['Användare', 'Kurs', 'Datum']"
                :key="type"
                @click="selectSearchType(type)"
                :class="{ active: selectedSearchType === type }"
                class="dropdown-item"
                role="option"
                :aria-selected="(selectedSearchType === type).toString()"
              >
                {{ type }}
              </li>
            </ul>
          </div>
        </div>

        <div v-if="showResults" class="search-results me-3">
          <ul class="result-list">
            <li
              v-for="result in filteredResults"
              :key="result.id"
              @click="navigateToDetails(result)"
              class="result-item"
            >
              <div class="result-title">{{ result.name }}</div>
              <div class="result-subtitle">{{ result.extra }}</div>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <!-- Logo -->
    <div class="logo-container">
      <router-link class="navbar-brand" to="/">
        <img src="../assets/mindful_transparent.png" alt="Mindful logo" class="logo" />
      </router-link>
    </div>

    <!-- Navigation links -->
    <ul class="nav-links">
      <li v-for="item in filteredMenuItems" :key="item.link">
        <router-link :to="item.link" class="nav-link">{{ item.name }}</router-link>
      </li>
    </ul>

    <!-- User actions -->
    <div class="icon-container">
      <div class="icon-group">
        <div
          v-if="isLoggedIn && canSeeNotifications"
          class="icon notification-icon"
          @click.stop="toggleNotificationPanel"
          role="button"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor">
            <path
              d="M12 2C10.3 2 9 3.3 9 5v1.1c-2.8.5-5 3-5 5.9v4l-1 1v1h16v-1l-1-1v-4c0-2.9-2.2-5.4-5-5.9V5c0-1.7-1.3-3-3-3zm0 18c1.1 0 2-.9 2-2H10c0 1.1.9 2 2 2z"
            />
          </svg>
          <span v-if="notifications.length" class="notis-badge">{{ notifications.length }}</span>
        </div>

        <div v-if="showNotisPanel" class="notis-panel notification-box">
          <NotificationBox
            :notifications="notifications"
            @notification-dismissed="handleNotificationDismissed"
          />
        </div>

        <div class="icon profile-icon" @click.stop="toggleProfileMenu" role="button">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor">
            <path
              d="M12 4a4 4 0 0 1 4 4a4 4 0 0 1-4 4a4 4 0 0 1-4-4a4 4 0 0 1 4-4m0 10c4.42 0 8 1.79 8 4v2H4v-2c0-2.21 3.58-4 8-4"
            />
          </svg>
          <div v-if="showProfileMenu" class="profile-dropdown">
            <button v-if="isLoggedIn" @click="logout" class="logout-btn">Logga ut</button>
            <router-link v-else to="/register" class="dropdown-link">Registrera</router-link>
            <router-link v-else to="/login" class="dropdown-link">Logga in</router-link>
          </div>
        </div>

        <div class="auth-links" v-if="!isLoggedIn">
          <router-link to="/register" class="px-4 py-2 text-blue-600 hover:underline">
            Register
          </router-link>
          <router-link to="/login" class="px-4 py-2 text-blue-600 hover:underline">
            Login
          </router-link>
        </div>

        <button class="burger-menu" @click="toggleMobileMenu" aria-label="Toggle menu">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor">
            <path
              d="M3 6h18M3 12h18M3 18h18"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  </nav>
</template>

<script setup>
  /**
   * @file src/components/Navbar.vue
   * @description Navigation bar with search, notifications, profile, and responsive menu support.
   */

  import { ref, computed, onMounted } from 'vue'
  import { useStore } from 'vuex'
  import { useRouter } from 'vue-router'
  import axios from 'axios'
  import DatePicker from '@vuepic/vue-datepicker'
  import '@vuepic/vue-datepicker/dist/main.css'
  import NotificationBox from './notificationBox.vue'

  const store = useStore()
  const router = useRouter()

  /** @type {import('vue').ComputedRef<string>} */
  const userRole = computed(() => store.getters.userRole || 'guest')

  /** @type {import('vue').ComputedRef<boolean>} */
  const isLoggedIn = computed(() => store.getters.isLoggedIn)

  /** @type {import('vue').ComputedRef<boolean>} */
  const canSeeNotifications = computed(() =>
    ['teacher', 'admin', 'systemadmin'].includes(userRole.value)
  )

  /** @type {import('vue').ComputedRef<boolean>} */
  const canSeeSearch = computed(
    () =>
      isLoggedIn.value &&
      ['teacher', 'syv', 'specped', 'coordinator', 'admin', 'systemadmin'].includes(userRole.value)
  )

  const notifications = ref([])
  const showNotisPanel = ref(false)
  const buildVersion = ref(import.meta.env.VITE_BUILD_VERSION || 'Dev')
  const searchQuery = ref('')
  const searchResults = ref([])
  const showResults = ref(false)
  const filter = ref('all')
  const selectedCourse = ref('')
  const selectedDate = ref(null)
  const allCourses = ref([])
  const showProfileMenu = ref(false)
  const isMobileMenuOpen = ref(false)
  const selectedSearchType = ref('Användare')
  const showSearchTypeDropdown = ref(false)

  /**
   * Closes dropdowns and overlays if user clicks outside interactive elements.
   * @param {MouseEvent} event
   */
  function handleGlobalClick(event) {
    const ignoreClasses = [
      'search-type-toggle',
      'dropdown-menu',
      'notification-box',
      'notis-panel',
      'profile-dropdown',
    ]

    if (!ignoreClasses.some((cls) => event.target.closest(`.${cls}`))) {
      showSearchTypeDropdown.value = false
      showNotisPanel.value = false
      showProfileMenu.value = false
    }
  }
  /**
   * Toggle search type dropdown menu visibility.
   */
  function toggleSearchTypeDropdown() {
    showSearchTypeDropdown.value = !showSearchTypeDropdown.value
  }

  /**
   * Selects a new search type and triggers a search.
   * @param {string} type
   */
  function selectSearchType(type) {
    selectedSearchType.value = type
    showSearchTypeDropdown.value = false
    handleSearch()
  }

  /**
   * Toggles mobile menu visibility.
   */
  function toggleMobileMenu() {
    isMobileMenuOpen.value = !isMobileMenuOpen.value
  }

  /**
   * Total number of unread notifications.
   * @returns {import('vue').ComputedRef<number>}
   */
  const totalNotifications = computed(() => notifications.value.length)

  /**
   * Fetches user notifications from the backend.
   */
  async function fetchNotifications() {
    const res = await axios.get('/api/notifications')
    notifications.value = res.data
  }

  /**
   * Toggle visibility of the notification panel.
   */
  function toggleNotificationPanel() {
    showNotisPanel.value = !showNotisPanel.value
  }

  /**
   * Toggle profile dropdown visibility.
   */
  function toggleProfileMenu() {
    showProfileMenu.value = !showProfileMenu.value
  }

  /**
   * Log the user out and redirect to home.
   */
  function logout() {
    store.dispatch('logout')
    router.push('/')
  }

  /**
   * Returns menu items the current user is allowed to see.
   */
  const filteredMenuItems = computed(() => {
    const menuItems = [
      { name: 'APL', link: '/apl', role: 'admin' },
      { name: 'Kalender', link: '/kalender', role: 'teacher' },
      { name: 'Utbildning', link: '/education', role: 'admin' },
      { name: 'Kurspaket', link: '/programsandpackages', role: 'admin' },
      { name: 'Kurser', link: '/programsandcourses', role: 'admin' },
      { name: 'Elev+', link: '/addstudent', role: 'admin' },
      { name: 'Elever', link: '/students', role: 'admin' },
      { name: 'PDF', link: '/pdf', role: 'admin' },
      { name: 'Grades', link: '/grades', role: 'teacher' },
      { name: 'Prövningar', link: '/examform', role: 'student' },
      { name: 'Earnings', link: '/earnings', role: 'admin' },
      { name: 'Stats', link: '/stats/courses', role: 'admin' },
    ]
    return menuItems.filter((item) => !item.role || store.getters.hasPermission(item.role))
  })

  /**
   * Navigate to a result from the search results list.
   * @param {{ id: string, type: string }} result
   */
  function navigateToDetails(result) {
    showResults.value = false
    searchQuery.value = ''
    router.push(`/detaljer/${result.type}/${result.id}`)
  }

  /**
   * Filters search results based on selected filter.
   */
  const filteredResults = computed(() =>
    filter.value === 'all'
      ? searchResults.value
      : searchResults.value.filter((res) => res.type === filter.value)
  )

  /**
   * Triggers search request based on input or selected date.
   */
  function handleSearch() {
    if (
      selectedSearchType.value !== 'Datum' &&
      (!searchQuery.value || searchQuery.value.length < 3)
    ) {
      searchResults.value = []
      showResults.value = false
      return
    }

    const params = new URLSearchParams()
    params.append('type', selectedSearchType.value)

    if (selectedSearchType.value === 'Datum') {
      if (!selectedDate.value || isNaN(new Date(selectedDate.value).getTime())) {
        showResults.value = false
        return
      }
      const date = new Date(selectedDate.value)
      params.append('date', date.toISOString().split('T')[0])
    } else {
      params.append('q', searchQuery.value)
    }

    axios
      .get(`/api/search?${params}`)
      .then((response) => {
        searchResults.value = response.data
        showResults.value = searchResults.value.length > 0
      })
      .catch(() => {
        searchResults.value = []
        showResults.value = false
      })
  }

  /**
   * Removes a notification from local state.
   * @param {string} id
   */
  function handleNotificationDismissed(id) {
    notifications.value = notifications.value.filter((n) => n._id !== id)
  }

  /**
   * Add ESC key handler to close dropdowns and overlays.
   */
  onMounted(() => {
    if (isLoggedIn.value && canSeeNotifications.value) fetchNotifications()
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        showSearchTypeDropdown.value = false
        showNotisPanel.value = false
        showProfileMenu.value = false
      }
    })
  })
</script>

<style scoped>
  /* Navbar */

  /* Search bar container */
  .search-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 10px;
    border: 2px solid #007dc3ff;
    border-radius: 20px;
    background: #ecf0f1;
    width: 100%;
    max-width: 500px;
    box-sizing: border-box;
  }

  /* Wrapper that overlays inputs */
  .input-wrapper {
    position: relative;
    flex: 1;
    min-width: 0;
    height: 40px;
  }

  /* Inputs overlap perfectly */
  .input-wrapper input,
  .input-wrapper .vue-datepicker {
    position: absolute;
    top: 0;
    left: 0;
    width: 100% !important;
    height: 100% !important;
    padding-left: 10px !important;
    box-sizing: border-box;
    border: none !important;
    background: transparent;
    outline: none;
    box-shadow: none;
    font-size: 16px;
    font-family: inherit;
  }

  /* Hide inactive input */
  .input-wrapper input[v-show='false'],
  .input-wrapper .vue-datepicker[v-show='false'] {
    opacity: 0;
    pointer-events: none;
    z-index: 0;
  }

  /* Show active input */
  .input-wrapper input[v-show='true'],
  .input-wrapper .vue-datepicker[v-show='true'] {
    opacity: 1;
    pointer-events: auto;
    z-index: 1;
  }

  /* Search type toggle */
  .search-type-toggle {
    position: relative;
    margin-left: auto;
  }

  /* Search type button */
  .search-type-button {
    background-color: #007dc3;
    color: white;
    font-weight: bold;
    padding: 6px 14px;
    border: none;
    border-radius: 20px;
    cursor: pointer;
    font-size: 14px;
    transition: background-color 0.2s ease;
    white-space: nowrap;
  }

  .search-type-button:hover {
    background-color: #005fa3;
  }

  /* Dropdown menu */
  .dropdown-menu {
    display: block !important;
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 6px;
    padding: 8px;
    background-color: #fff;
    border: 2px solid #007dc3ff;
    border-radius: 12px;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
    list-style: none;
    min-width: 120px;
    width: max-content;
    z-index: 1000;
  }

  /* Dropdown items */
  .dropdown-item {
    border: 1px solid #007dc3ff;
    border-radius: 8px;
    margin: 6px 0;
    padding: 4px 8px;
    text-align: center;
    cursor: pointer;
    background-color: white;
    transition: background-color 0.2s ease;
    user-select: none;
  }

  .dropdown-item:hover {
    background-color: #2370b4;
    color: white;
  }

  .dropdown-item.active {
    background-color: #007dc3ff;
    color: white;
    font-weight: bold;
  }

  /* Search results dropdown */
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

  /* Logo container */
  .logo-container {
    display: flex;
    justify-content: flex-start;
    gap: 15px;
  }

  .logo {
    height: 50px;
  }

  /* Navbar base */
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

  /* Search container */
  .search-container {
    max-width: 500px;
    width: 100%;
    position: relative;
    box-sizing: border-box;
  }

  /* Icons */
  .icon-container {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 20px;
    position: relative;
  }

  .icon-group {
    display: flex;
    align-items: center;
    gap: 15px;
    position: relative;
  }

  .icon {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: #ece6f0;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    cursor: pointer;
  }

  .icon:hover {
    background: #dcd4e6;
  }

  .notis-badge {
    position: absolute;
    top: -6px;
    right: -6px;
    background: #f44336;
    color: white;
    font-size: 12px;
    font-weight: bold;
    padding: 2px 6px;
    border-radius: 999px;
    line-height: 1;
    z-index: 10;
  }

  /* Navigation links */
  .nav-links {
    display: flex;
    justify-content: center;
    margin: 0 auto;
    gap: 40px;
    list-style: none;
  }

  .nav-link {
    text-decoration: none;
    font-size: 15px;
    color: #333;
    transition: color 0.3s;
  }

  .nav-link:hover {
    text-decoration: underline;
  }

  /* Logout button */
  .logout-btn {
    appearance: none;
    border: none;
    background: none;
    font-size: 1rem;
    color: blue;
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
    transition: color 0.3s, background 0.3s;
  }

  .logout-btn:hover {
    background: blue;
    color: white;
  }

  /* Notification panel */
  .notis-panel {
    position: absolute;
    top: 50px;
    right: 0;
    background: #fff;
    border-radius: 12px;
    width: 300px;
    padding: 0px;
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
    z-index: 1000;
    font-family: 'Inter', sans-serif;
  }

  .notis-header {
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 12px;
    color: #333;
  }

  .notis-empty {
    color: #999;
    font-style: italic;
    font-size: 14px;
    text-align: center;
  }

  .notis-panel ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .notis-panel li {
    display: flex;
    align-items: center;
    padding: 6px 0;
    font-size: 14px;
    color: #444;
  }

  .notis-panel input[type='checkbox'] {
    margin-right: 10px;
    transform: scale(1.2);
    accent-color: #6c63ff;
  }

  /* Profile dropdown */
  .profile-icon {
    position: relative;
  }

  .profile-dropdown {
    position: absolute;
    top: 45px;
    right: 0;
    background: #fff;
    border: 1px solid #000000;
    border-radius: 10px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    padding: 10px;
    display: flex;
    flex-direction: column;
    z-index: 1200;
    width: 150px;
  }

  .dropdown-link {
    padding: 10px;
    text-align: left;
    text-decoration: none;
    color: #333;
    border-radius: 4px;
  }

  .dropdown-link:hover,
  .profile-dropdown .logout-btn:hover {
    background-color: #007dc3ff;
  }

  .dropdown-item.active {
    background-color: #007dc3ff;
    color: white;
    font-weight: bold;
  }

  /* Responsive: Mobile menu */
  .burger-menu {
    display: none;
    background: none;
    border: none;
    cursor: pointer;
  }

  @media (max-width: 768px) {
    .burger-menu {
      display: block;
      position: absolute;
      top: 20px;
      right: 20px;
      z-index: 1100;
    }

    .nav-links {
      display: none !important;
    }

    .mobile-menu {
      position: absolute;
      top: 70px;
      right: 0;
      width: 100%;
      background: #f8f8f8;
      border-top: 1px solid #ddd;
      padding: 20px;
      z-index: 1000;
    }

    .mobile-nav-links {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 15px;
    }

    .mobile-nav-links .nav-link {
      font-size: 16px;
      text-align: left;
      padding: 10px;
      display: block;
      color: #333;
    }

    .logout-btn {
      margin-bottom: 20px;
      width: 100%;
      text-align: left;
      color: red;
    }
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
