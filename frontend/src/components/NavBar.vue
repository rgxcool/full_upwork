<template>
  <nav class="navbar px-5" @click.self="closeSearch">
    <div v-if="canSeeSearch" class="top-nav">
      <div class="build-counter">v. {{ buildVersion }}</div>

      <div class="search-container" @click.stop>
        <div class="search-bar">
          <input
            v-if="selectedSearchType !== 'Datum'"
            type="text"
            v-model="searchQuery"
            @input="handleSearch"
            @focus="handleInputFocus"
            :placeholder="`Sök efter ${selectedSearchType.toLowerCase()}...`"
          />
          <DatePicker
            v-if="selectedSearchType === 'Datum'"
            v-model="selectedDate"
            :format="'yyyy-MM-dd'"
            @change="handleSearch"
            :placeholder="'Välj datum'"
          />
          <div class="search-type-toggle">
            <button @click="toggleSearchTypeDropdown">{{ selectedSearchType }}</button>
            <ul v-if="showSearchTypeDropdown" class="search-type-options">
              <li @click="selectSearchType('Användare')">Användare</li>
              <li @click="selectSearchType('Kurs')">Kurs</li>
              <li @click="selectSearchType('Datum')">Datum</li>
            </ul>
          </div>
        </div>
        <div v-if="showResults" class="search-results">
          <ul class="result-list">
            <li
              v-for="result in filteredResults"
              :key="result.id"
              @click="navigateToDetails(result)"
              class="result-item"
            >
              <div class="result-content">
                <div class="result-title">{{ result.name }}</div>
                <div class="result-subtitle">{{ result.extra }}</div>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>
    <!-- Left Section: Logo & Build Version -->
    <div class="logo-container">
      <router-link class="navbar-brand" to="/">
        <img src="../assets/mindful_transparent.png" alt="Mindful logo" class="logo" />
      </router-link>
    </div>

    <!-- Center Section: Navigation Links -->
    <ul class="nav-links">
      <li v-for="item in filteredMenuItems" :key="item.link">
        <router-link :to="item.link" class="nav-link">{{ item.name }}</router-link>
      </li>
    </ul>

    <!-- Icons -->
    <div class="icon-container">
      <div class="icon-group">
        <div
          v-if="isLoggedIn && canSeeNotifications"
          class="icon notification-icon"
          @click="toggleNotificationPanel"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">
            <path
              fill="currentColor"
              d="M12 2C10.3 2 9 3.3 9 5v1.1c-2.8.5-5 3-5 5.9v4l-1 1v1h16v-1l-1-1v-4c0-2.9-2.2-5.4-5-5.9V5c0-1.7-1.3-3-3-3zm0 18c1.1 0 2-.9 2-2H10c0 1.1.9 2 2 2z"
            />
          </svg>
          <span v-if="totalNotifications > 0" class="notis-badge">{{ totalNotifications }}</span>

          <span v-if="notifications.length" class="notis-badge">{{ notifications.length }}</span>
        </div>

        <!-- Notispanel -->
        <div v-if="showNotisPanel" class="notis-panel">
          <NotificationBox />
        </div>

        <!-- Hamburgermenyn syns bara på mobil -->

        <!-- Mobilmenyn visas när togglad -->
        <div v-if="isMobileMenuOpen" class="mobile-menu">
          <button @click="logout" class="logout-btn">Logga ut</button>

          <ul class="mobile-nav-links">
            <li v-for="item in filteredMenuItems" :key="item.link">
              <router-link :to="item.link" class="nav-link">{{ item.name }}</router-link>
            </li>
          </ul>
        </div>

        <div class="icon profile-icon" @click="toggleProfileMenu">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">
            <path
              fill="currentColor"
              d="M12 4a4 4 0 0 1 4 4a4 4 0 0 1-4 4a4 4 0 0 1-4-4a4 4 0 0 1 4-4m0 10c4.42 0 8 1.79 8 4v2H4v-2c0-2.21 3.58-4 8-4"
            />
          </svg>

          <!-- Mobilmeny under profilikonen -->
          <div v-if="showProfileMenu" class="profile-dropdown">
            <button v-if="isLoggedIn" @click="logout" class="logout-btn">Logga ut</button>
            <router-link v-else to="/register" class="dropdown-link">Registrera</router-link>
            <router-link v-else to="/login" class="dropdown-link">Logga in</router-link>
          </div>
        </div>

        <div class="auth-links">
          <router-link
            v-if="!isLoggedIn"
            to="/register"
            class="px-4 py-2 text-blue-600 hover:underline"
          >
            Register
          </router-link>
          <router-link
            v-if="!isLoggedIn"
            to="/login"
            class="px-4 py-2 text-blue-600 hover:underline"
          >
            Login
          </router-link>

          <button class="burger-menu" @click="toggleMobileMenu">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">
              <path
                fill="currentColor"
                d="M3 6h18M3 12h18M3 18h18"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </nav>
</template>

<script>
  import { ref, computed, onMounted } from 'vue'
  import { useStore } from 'vuex'
  import { useRouter } from 'vue-router'
  import axios from 'axios'
  import DatePicker from '@vuepic/vue-datepicker'
  import '@vuepic/vue-datepicker/dist/main.css'
  import NotificationBox from './notificationBox.vue'

  export default {
    components: { DatePicker, NotificationBox },
    setup() {
      const store = useStore()
      const router = useRouter()

      const userRole = computed(() => store.getters.userRole || 'guest') // Default to 'guest' if undefined
      const canSeeNotifications = computed(() =>
        ['teacher', 'admin', 'systemadmin'].includes(userRole.value)
      )

      const notifications = ref([])
      const showNotisPanel = ref(false)
      // Fix missing properties
      const buildVersion = ref(import.meta.env.VITE_BUILD_VERSION || 'Dev')
      const searchQuery = ref('')
      const searchResults = ref([])
      const showResults = ref(false)
      const showFilters = ref(false)
      const filter = ref('all') // Aktivt filter
      const selectedCourse = ref('')
      const selectedDate = ref(null)
      const allCourses = ref([])
      const showNotification = ref(false)
      const showProfileMenu = ref(false)

      const endDateNotifications = ref([])
      const missingGradeNotifications = ref([])

      const isMobileMenuOpen = ref(false)

      const selectedSearchType = ref('Användare');
      const showSearchTypeDropdown = ref(false);

      const toggleSearchTypeDropdown = () => {
        showSearchTypeDropdown.value = !showSearchTypeDropdown.value;
      };

      const selectSearchType = (type) => {
        selectedSearchType.value = type;
        showSearchTypeDropdown.value = false;
        handleSearch(); // Trigger search with the new type
      };



      const toggleMobileMenu = () => {
        isMobileMenuOpen.value = !isMobileMenuOpen.value
      }

      const totalNotifications = computed(
        () =>
          (showNotification.value ? 1 : 0) +
          (endDateNotifications.value?.length || 0) +
          (missingGradeNotifications.value?.length || 0)
      )

      const fetchNotifications = async () => {
        const res = await axios.get('/api/notifications')
        notifications.value = res.data
      }

      const resolveNote = async (id) => {
        await axios.put(`/api/notifications/${id}/resolve`, {
          userId: store.getters.userId,
        })
        await fetchNotifications() // uppdatera listan
      }

      /*

      const fetchNotifications = async () => {
        if (['teacher', 'admin', 'systemadmin'].includes(userRole.value)) {
          try {
            const res = await axios.get('/api/course-end-notifications');
            showNotification.value = res.data.hasPendingGrades;
          } catch (err) {
            console.error('❌ Fel vid notishämtning:', err);
          }
      }
      };
      */

      const canResetNotifications = computed(() =>
        ['admin', 'systemadmin'].includes(userRole.value)
      )

      const resetNotification = async (id) => {
        try {
          await axios.put(`/api/notifications/${id}/reset`)
          await fetchNotifications() // hämta igen efter reset
        } catch (err) {
          console.error('❌ Kunde inte återställa notis:', err)
        }
      }


      const toggleNotificationPanel = () => {
        showNotisPanel.value = !showNotisPanel.value
      }

      const filteredResults = computed(() => {
        if (filter.value === 'all') return searchResults.value
        return searchResults.value.filter((res) => res.type === filter.value)
      })

      const navigateToDetails = (result) => {
        showResults.value = false // Stäng<er sökresultaten
        searchQuery.value = '' // Nollställer sökfältet
        router.push(`/detaljer/${result.type}/${result.id}`)
      }

      const hasPermission = (role) => store.getters.hasPermission(role)

      const isLoggedIn = computed(() => store.getters.isLoggedIn)

      // Check if user role is "teacher" or higher
      const canSeeSearch = computed(() => {
        const allowedRoles = ['teacher', 'syv', 'specped', 'coordinator', 'admin', 'systemadmin']
        return isLoggedIn.value && allowedRoles.includes(userRole.value)
      })

      console.log('🔹 Navbar: Current User Role ->', userRole.value)
      console.log('🔹 Search Bar Visibility ->', canSeeSearch.value)

      const logout = () => {
        store.dispatch('logout')
        router.push('/')
      }


  const handleSearch = async () => {
    try {
      const params = new URLSearchParams();
      if (selectedSearchType.value === 'Datum') {
        if (!selectedDate.value || isNaN(new Date(selectedDate.value).getTime())) return;
        params.append('date', selectedDate.value);
      } else {
        if (!searchQuery.value || searchQuery.value.length < 3) return;
        params.append('q', searchQuery.value);
      }

      const response = await axios.get(`http://localhost:5001/api/search?${params.toString()}`);

      console.log("Search Response:", response.data); // Debugging output
      searchResults.value = response.data;
      showResults.value = searchResults.value.length > 0;
    } catch (error) {
      console.error('Error during search:', error);
    }
  };




      const fetchCourses = async () => {
        try {
          const res = await axios.get('http://localhost:5001/api/courses')
          allCourses.value = res.data
        } catch (err) {
          console.error('❌ Kunde inte hämta kurser:', err)
        }
      }

      const setFilter = (f) => (filter.value = f)
      const openSearchPanel = () => {
        showResults.value = true
        fetchCourses()
      }

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
        { name: 'ExamForm', link: '/provningar', role: 'student' },
        { name: 'Earnings', link: '/earnings', role: 'admin' },
        { name: 'Stats', link: '/stats/courses', role: 'admin' },
      ]

      const filteredMenuItems = computed(() => {
        return menuItems.filter((item) => {
          if (!item.role) return true // Publicly accessible links
          return hasPermission(item.role) // Ensure systemadmin has full access
        })
      })
      const toggleProfileMenu = () => {
        showProfileMenu.value = !showProfileMenu.value
      }
      onMounted(async () => {
        if (isLoggedIn.value && canSeeNotifications.value) {
          await fetchNotifications()
        }
      })

      return {
        totalNotifications,
        isMobileMenuOpen,
        toggleMobileMenu,
        endDateNotifications,
        missingGradeNotifications,
        notifications,
        showNotisPanel,
        toggleNotificationPanel,
        canSeeNotifications,
        buildVersion,
        filter,
        filteredResults,
        handleSearch,
        searchQuery,
        showResults,
        showFilters,
        searchResults,
        isLoggedIn,
        logout,
        filteredMenuItems,
        canSeeSearch,
        navigateToDetails,
        setFilter,
        selectedCourse,
        allCourses,
        fetchCourses,
        selectedDate,
        showNotification,
        totalNotifications,
        resolveNote,
        notifications,
        showNotisPanel,
        resetNotification,
        canResetNotifications,
        showProfileMenu,
        toggleProfileMenu,
        selectedSearchType,
        showSearchTypeDropdown,
        toggleSearchTypeDropdown,
        selectSearchType,
      }
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
    font-size: 15px;
    color: #333;
    transition: color 0.3s;
  }

  .nav-link:hover {
    text-decoration: underline;
  }

  /* Logout Button - Styled to Match Links */
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

  .notis-panel {
    position: absolute;
    top: 50px;
    right: 0;
    background: #fff;
    border-radius: 12px;
    width: 300px;
    padding: 16px;
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

  .notis-badge {
    position: absolute;
    top: -4px;
    right: -4px;
    background: #f44336;
    color: white;
    font-size: 12px;
    font-weight: bold;
    padding: 2px 6px;
    border-radius: 999px;
    line-height: 1;
  }

  .icon-container,
  .icon-wrapper {
    position: relative;
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

  .icon-container {
    position: relative; /* viktigt! */
  }

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

  .profile-icon {
    position: relative;
  }

  .profile-dropdown {
    position: absolute;
    top: 45px;
    right: 0;
    background: #fff;
    border: 1px solid #ddd;
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
    background-color: #f0f0f0;
  }
</style>
