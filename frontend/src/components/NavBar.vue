<template>
  <nav class="navbar px-5" @click.self="closeSearch">
    <div class="top-nav">
      <div class="logo-version-group">
        <router-link class="navbar-brand" to="/">
          <img src="../assets/mindful_transparent.png" alt="Mindful logo" class="logo" />
        </router-link>
        <span class="build-counter" @click="toggleSecretMenu" ref="versionRef" style="cursor:pointer;">v. {{ buildVersion }}</span>
      </div>
      <div v-if="canSeeSearch" class="search-wrapper">
        <div class="search-bar-enhanced">
          <div class="search-type" @click="toggleSearchTypeDropdown">
            {{ selectedSearchType }}
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24">
              <path fill="currentColor" d="M7 10l5 5 5-5z" />
            </svg>
          </div>

          <input
            v-if="selectedSearchType !== 'Datum'"
            class="search-input"
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
            :placeholder="'Välj datum'"
          />

          <div v-if="searchQuery || selectedDate" class="clear-icon" @click="clearSearch">✕</div>
        </div>

        <ul v-if="showSearchTypeDropdown" class="search-type-dropdown">
          <li :class="{ active: selectedSearchType === 'Alla' }" @click="selectSearchType('Alla')">
            Alla
          </li>
          <li
            :class="{ active: selectedSearchType === 'Användare' }"
            @click="selectSearchType('Användare')"
          >
            Användare
          </li>
          <li :class="{ active: selectedSearchType === 'Kurs' }" @click="selectSearchType('Kurs')">
            Kurs
          </li>
          <li
            :class="{ active: selectedSearchType === 'Datum' }"
            @click="selectSearchType('Datum')"
          >
            Datum
          </li>
        </ul>
      </div>
      <div v-if="canSeeSearch" class="icon-container">
        <div class="icon-group">
          <div
            v-if="isLoggedIn && canSeeNotifications"
            class="icon notification-icon"
            @click="toggleNotificationPanel"
            ref="notificationIcon"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">
              <path
                fill="currentColor"
                d="M12 2C10.3 2 9 3.3 9 5v1.1c-2.8.5-5 3-5 5.9v4l-1 1v1h16v-1l-1-1v-4c0-2.9-2.2-5.4-5-5.9V5c0-1.7-1.3-3-3-3zm0 18c1.1 0 2-.9 2-2H10c0 1.1.9 2 2 2z"
              />
            </svg>
            <span v-if="notifications.length" class="notis-badge">{{ notifications.length }}</span>
          </div>

          <!-- Notispanel -->
          <div v-if="showNotisPanel" class="notis-panel" ref="notisPanel">
            <NotificationBox
              :notifications="notifications"
              @notification-dismissed="
                (id) => (notifications = notifications.filter((n) => n._id !== id))
              "
            />
          </div>

          <div class="icon profile-icon" @click="toggleProfileMenu">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">
              <path
                fill="currentColor"
                d="M12 4a4 4 0 0 1 4 4a4 4 0 0 1-4 4a4 4 0 0 1-4-4a4 4 0 0 1 4-4m0 10c4.42 0 8 1.79 8 4v2H4v-2c0-2.21 3.58-4 8-4"
              />
            </svg>

            <!-- Mobilmeny under profilikonen -->
            <div v-if="showProfileMenu" class="profile-dropdown" ref="profileDropdown">
              <button v-if="isLoggedIn" @click="logout" class="logout-btn">Logga ut</button>
              <router-link v-else to="/login" class="dropdown-link">Logga in</router-link>
            </div>
          </div>

          <!-- Visible login/register buttons when not logged in -->
          <div v-if="!isLoggedIn" class="auth-buttons">
            <router-link to="/login" class="login-btn">Logga in</router-link>
            <!-- Register button removed -->
          </div>
        </div>
      </div>
      <!-- Resultat -->
      <div v-if="showResults" class="search-results me-3">
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
    <!-- Always show login/register buttons at far right if not logged in -->
    <div v-if="!isLoggedIn" class="auth-buttons navbar-auth-buttons">
      <router-link to="/login" class="login-btn">Logga in</router-link>
      <!-- Register button removed -->
    </div>
    <!-- Secret menu dropdown rendered as sibling to .top-nav and .nav-links -->
    <div v-if="showSecretMenu" class="secret-menu-dropdown" :style="secretMenuStyle">
      <ul>
        <li v-for="item in secretMenuItems" :key="item.link">
          <router-link v-if="item.link !== '/register'" :to="item.link" class="nav-link">{{ item.name }}</router-link>
        </li>
      </ul>
    </div>
    <ul class="nav-links nav-links-row">
      <li v-for="item in filteredMenuItems" :key="item.link">
        <router-link v-if="item.link !== '/register'" :to="item.link" class="nav-link">{{ item.name }}</router-link>
      </li>
    </ul>
  </nav>
</template>

<script>
  import { ref, computed, onMounted, watch, onBeforeUnmount } from 'vue'
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
      const notisPanel = ref(null)
      const notificationIcon = ref(null)
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
      const profileDropdown = ref(null)

      const endDateNotifications = ref([])
      const missingGradeNotifications = ref([])

      const isMobileMenuOpen = ref(false)

      const selectedSearchType = ref('Alla')
      const showSearchTypeDropdown = ref(false)

      const toggleMobileMenu = () => {
        isMobileMenuOpen.value = !isMobileMenuOpen.value
      }

      const totalNotifications = computed(() => notifications.value.length)

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

      const toggleNotificationPanel = (event) => {
        showNotisPanel.value = !showNotisPanel.value
      }

      const navigateToDetails = (result) => {
        showResults.value = false
        searchQuery.value = ''

        // Gå till special vy om det är kurs eller program eller kurspaket
        const courseTypes = ['Kurs', 'Course', 'Program', 'CoursePackage']

        if (courseTypes.includes(result.type)) {
          router.push(`/education/${result.id}`) // NY ruta för kurser
        } else {
          router.push(`/detaljer/${result.type}/${result.id}`) // Vanlig vy
        }
      }

      const hasPermission = (role) => store.getters.hasPermission(role)

      const isLoggedIn = computed(() => store.getters.isLoggedIn)

      // Check if user role is "teacher" or higher
      const canSeeSearch = computed(() => {
        const allowedRoles = ['teacher', 'syv', 'specped', 'coordinator', 'admin', 'systemadmin']
        return isLoggedIn.value && allowedRoles.includes(userRole.value)
      })

      const logout = () => {
        store.dispatch('logout')
        router.push('/')
      }

      const selectSearchType = (type) => {
        selectedSearchType.value = type
        showSearchTypeDropdown.value = false
        handleSearch()
      }

      const toggleSearchTypeDropdown = () => {
        showSearchTypeDropdown.value = !showSearchTypeDropdown.value
      }

      const handleSearch = async () => {
        console.log('📦 searchResults:', searchResults.value)
        console.log('📂 filteredResults:', filteredResults.value)
        try {
          const params = new URLSearchParams()
          const isDateSearch = selectedSearchType.value === 'Datum'

          if (isDateSearch) {
            if (!selectedDate.value || isNaN(new Date(selectedDate.value).getTime())) {
              searchResults.value = []
              showResults.value = false
              return
            }
            const date = new Date(selectedDate.value)
            const formattedDate = date.toISOString().split('T')[0]
            params.append('type', 'Datum')
            params.append('date', formattedDate)
          } else if (selectedSearchType.value === 'Alla' && searchQuery.value && /^\d{4}-\d{2}-\d{2}$/.test(searchQuery.value)) {
            // If 'Alla' and input matches yyyy-mm-dd, treat as date search
            params.append('type', 'Datum')
            params.append('date', searchQuery.value)
          } else {
            if (!searchQuery.value || searchQuery.value.length < 3) {
              searchResults.value = []
              showResults.value = false
              return
            }
            params.append('type', selectedSearchType.value)
            params.append('q', searchQuery.value)
          }

          const res = await axios.get(
            `http://localhost:5001/api/search?${params.toString()}`,
            { withCredentials: true }
          )
          searchResults.value = res.data
          showResults.value = filteredResults.value.length > 0
        } catch (err) {
          console.error('Sökfel:', err)
          searchResults.value = []
          showResults.value = false
        }
      }

      // Reagera på datumändring om "Datum" är aktivt
      watch(selectedDate, (val) => {
        if (selectedSearchType.value === 'Datum' && val) {
          handleSearch()
        }
      })

      const filteredResults = computed(() => {
        const type = selectedSearchType.value
        if (type === 'Alla') return searchResults.value

        if (type === 'Användare') {
          return searchResults.value.filter((res) =>
            ['Användare', 'Lärare', 'Personal', 'Elev'].includes(res.type)
          )
        }

        if (type === 'Kurs') {
          return searchResults.value.filter((res) =>
            ['Course', 'Program', 'CoursePackage', 'Kurs'].includes(res.type)
          )
        }

        if (type === 'Datum') {
          return searchResults.value.filter((res) => res.type === 'Elev')
        }

        return searchResults.value.filter((res) => res.type === type)
      })

      const clearSearch = () => {
        searchQuery.value = ''
        selectedDate.value = null
        searchResults.value = []
        showResults.value = false
      }

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

      // Remove these from main nav bar and add to secret menu
      const secretMenuNames = [
        'Utbildning',
        'TEST',
        'Student Inskrivningar',
        'Elev+',
        'PDF',
        'Prövningar',
        'Earnings',
        'Stats',
      ];
      const menuItems = [
        { name: 'APL', link: '/apl', role: ['admin', 'teacher'] },
        { name: 'Kalender', link: '/kalender', role: ['teacher', 'syv', 'specped', 'admin', 'systemadmin'] },
        { name: 'Kurspaket', link: '/programsandpackages', role: 'admin' },
        { name: 'Kurser', link: '/programsandcourses', role: 'admin' },
        { name: 'Kursinstanser', link: '/course-instances', role: 'admin' },
        { name: 'Kursmatchning', link: '/course-matching', role: 'admin' },
        { name: 'Lägg till Lärare', link: '/lagg-till-larare', role: 'admin' },
        { name: 'Lärarhantering', link: '/teacher-management', role: 'admin' },
        { name: 'Elever', link: '/students', role: ['admin', 'teacher'] },
        { name: 'Betyg', link: '/betyg', role: 'teacher' },
        { name: 'Prövningar', link: '/examform', role: 'student' },
      ];
      const filteredMenuItems = computed(() => {
        return menuItems.filter((item) => {
          if (secretMenuNames.includes(item.name)) return false;
          if (!item.role) return true;
          return hasPermission(item.role);
        });
      });
      const secretMenuItems = computed(() => {
        return menuItems.filter((item) => {
          if (!secretMenuNames.includes(item.name)) return false;
          if (!item.role) return true;
          return hasPermission(item.role);
        });
      });
      const toggleProfileMenu = () => {
        showProfileMenu.value = !showProfileMenu.value
      }

      // Close profile menu and notis panel when clicking outside
      const handleClickOutside = (event) => {
        // Profile dropdown
        if (showProfileMenu.value) {
          if (
            profileDropdown.value &&
            !profileDropdown.value.contains(event.target) &&
            !event.target.closest('.profile-icon')
          ) {
            showProfileMenu.value = false
          }
        }
        // Notis panel
        if (showNotisPanel.value) {
          if (
            notisPanel.value &&
            !notisPanel.value.contains(event.target) &&
            !event.target.closest('.notification-icon')
          ) {
            showNotisPanel.value = false
          }
        }
      }
      onMounted(() => {
        document.addEventListener('mousedown', handleClickOutside)
      })
      onBeforeUnmount(() => {
        document.removeEventListener('mousedown', handleClickOutside)
      })

      const showSecretMenu = ref(false);
      const versionRef = ref(null);
      const secretMenuStyle = computed(() => {
        if (!showSecretMenu.value || !versionRef.value) return {};
        // Position dropdown below the version number, relative to nav
        const navRect = versionRef.value.closest('nav').getBoundingClientRect();
        const rect = versionRef.value.getBoundingClientRect();
        return {
          position: 'absolute',
          top: `${rect.bottom - navRect.top + 8}px`,
          left: `${rect.left - navRect.left}px`,
          zIndex: 3000,
        };
      });
      const toggleSecretMenu = () => {
        showSecretMenu.value = !showSecretMenu.value;
      };

      return {
        totalNotifications,
        isMobileMenuOpen,
        toggleMobileMenu,
        toggleSearchTypeDropdown,
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
        secretMenuItems,
        showSecretMenu,
        toggleSecretMenu,
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
        profileDropdown,
        selectedSearchType,
        showSearchTypeDropdown,
        selectSearchType,
        clearSearch,
        notisPanel,
        notificationIcon,
        versionRef,
        secretMenuStyle,
        canSeeSearch,
        userRole,
      }
    },
  }
</script>

<style scoped>
  /* Navbar */

  .logo-version-group {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .top-nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    margin-bottom: 0;
    gap: 24px;
  }

  .logo-container {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 0;
  }
  .navbar {
    background-color: #f8f8f8;
    font-family: 'Roboto', sans-serif;
    padding: 20px;
    position: relative;
  }

  /* Top navigation container */
  .top-nav {
    display: flex;
    align-items: center;
    justify-content: space-between !important;
    flex-wrap: wrap; /* gör att burgaren hoppar ner snyggt om det blir trångt */
    gap: 20px;
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
    border: 1.5px solid #6c63ff;
    border-radius: 10px;
    width: 300px;
    padding: 18px 16px 18px 16px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    z-index: 1200;
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
    border: none !important;
    background: transparent !important;
    box-shadow: none !important;
    padding: 10px 0;
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

  .search-wrapper {
    flex: 1;
    display: flex;
    justify-content: center;
    min-width: 200px;
    max-width: 600px;
    margin: 0 24px;
    position: relative;
  }

  .search-bar-enhanced {
    display: flex;
    align-items: center;
    background: white;
    border: 1px solid #ccc;
    border-radius: 25px;
    padding: 8px 12px;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
    gap: 10px;
  }

  .search-type {
    background: #f2f2f2;
    padding: 4px 10px;
    border-radius: 20px;
    font-size: 13px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 4px;
    user-select: none;
  }

  .search-input {
    flex: 1;
    border: none;
    background: transparent;
    outline: none;
    font-size: 15px;
  }

  .clear-icon {
    cursor: pointer;
    font-size: 18px;
    color: #aaa;
  }

  .search-type-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    width: 100%;
    margin-top: 5px;
    background: white;
    border-radius: 10px;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
    border: 1px solid #ccc;
    padding: 0;
    z-index: 1100;
    list-style: none;
  }

  .search-type-dropdown li {
    padding: 10px 18px;
    cursor: pointer;
    transition: background 0.2s, color 0.2s;
    border-radius: 8px;
    margin: 4px 8px;
    font-size: 15px;
    color: #222;
    background: transparent;
  }

  .search-type-dropdown li:hover {
    background: #ece6f0;
    color: #6c63ff;
  }

  .search-type-dropdown li.active {
    background: #6c63ff;
    color: #fff;
  }

  .search-bar {
    background: #fff;
    border: 1px solid #ddd;
    box-shadow: 0 1px 6px rgba(0, 0, 0, 0.1);
    border-radius: 30px;
    padding: 8px 16px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .search-type-toggle button {
    background-color: #f5f5f5;
    border-radius: 15px;
    padding: 6px 12px;
    border: 1px solid #ccc;
    transition: background 0.2s ease;
  }

  .search-type-toggle button:hover {
    background-color: #e0e0e0;
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
    border: none;
    cursor: pointer;
  }

  @media (min-width: 769px) {
    .mobile-menu,
    .mobile-overlay {
      display: none !important;
    }
  }

  @media (max-width: 768px) {
    .burger-menu {
      display: block;
      background: none;
      border: none;
      cursor: pointer;
      color: #333; /* ← viktigt för att fyllningen syns */
    }

    .nav-links {
      display: none !important;
    }

    .mobile-menu {
      position: fixed;
      top: 0;
      right: 0;
      height: 100vh;
      width: 80%;
      max-width: 300px;
      background-color: #fff;
      box-shadow: -2px 0 10px rgba(0, 0, 0, 0.1);
      transform: translateX(100%);
      transition: transform 0.3s ease;
      padding: 20px;
      z-index: 2000;
      display: flex;
      flex-direction: column;
    }

    .mobile-menu.open {
      transform: translateX(0); /* Detta visar menyn */
    }

    .mobile-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100vh;
      background: rgba(0, 0, 0, 0.4);
      z-index: 1500;
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

  .burger-menu svg {
    stroke: currentColor;
    stroke-width: 2;
    transition: stroke 0.2s;
    width: 24px;
    height: 24px;
  }
  .burger-menu:hover svg {
    stroke: #6c63ff;
  }

  .profile-dropdown {
    position: absolute;
    top: 45px;
    right: 0;
    background: #fff;
    border: 1.5px solid #6c63ff;
    border-radius: 10px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    padding: 10px;
    display: flex;
    flex-direction: column;
    z-index: 1200;
    width: 150px;
  }

  .profile-dropdown .logout-btn,
  .profile-dropdown .dropdown-link {
    color: #222;
    background: transparent;
    border: none;
    outline: none;
    padding: 10px;
    text-align: left;
    border-radius: 4px;
    font-size: 15px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s, color 0.2s;
    width: 100%;
    display: block;
  }

  .profile-dropdown .logout-btn:hover,
  .profile-dropdown .logout-btn:focus,
  .profile-dropdown .dropdown-link:hover,
  .profile-dropdown .dropdown-link:focus {
    background: #6c63ff;
    color: #fff;
  }

  .auth-buttons {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-left: 16px;
  }
  .login-btn {
    background: #6c63ff;
    color: #fff;
    padding: 8px 18px;
    border-radius: 20px;
    text-decoration: none;
    font-weight: 600;
    transition: background 0.2s;
  }
  .login-btn:hover {
    background: #5548c8;
  }
  .register-btn {
    background: #ece6f0;
    color: #6c63ff;
    padding: 8px 18px;
    border-radius: 20px;
    text-decoration: none;
    font-weight: 600;
    transition: background 0.2s;
  }
  .register-btn:hover {
    background: #dcd4e6;
  }
  .navbar-auth-buttons {
    /* position: absolute; top: 20px; right: 40px; z-index: 2000; */
    position: static !important;
    display: flex;
    align-items: center;
    gap: 10px;
    margin-left: 16px;
  }
  .top-nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    margin-bottom: 0;
    gap: 24px;
  }
  .logo-version-group {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .logo-version-group .logo {
    height: 44px;
  }
  .logo-version-group .build-counter {
    font-size: 1.1rem;
    color: #6c63ff;
    font-weight: 600;
  }
  .secret-menu-dropdown {
    background: #fffbe6 !important; /* debug yellow */
    border: 1.5px solid #6c63ff;
    border-radius: 10px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    padding: 10px 20px;
    min-width: 200px;
    z-index: 3000;
  }
  .secret-menu-dropdown ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .secret-menu-dropdown li {
    margin-bottom: 8px;
  }
  .secret-menu-dropdown li:last-child {
    margin-bottom: 0;
  }
</style>
