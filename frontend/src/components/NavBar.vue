<template>
  <nav class="navbar px-5" @click.self="closeSearch">
    <div v-if="canSeeSearch" class="top-nav">

      <div class="build-counter">v. {{ buildVersion }}</div>

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
              <svg v-else xmlns="http://www.w3.org/2000/svg" width="24" height="24">
                <path fill="currentColor" d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
          </div>

        <!-- Sökresultat Dropdown -->
        <div v-if="showResults" class="search-results">
          <!-- Filterknappar -->
          <div class="filter-buttons">
            <button :class="{ active: filter === 'all' }" @click="setFilter('all')">Alla</button>
            <button :class="{ active: filter === 'Elev' }" @click="setFilter('Elev')">Elever</button>
            <button :class="{ active: filter === 'Lärare' }" @click="setFilter('Lärare')">Lärare</button>
          </div>

          <!-- Dropdown + DatePicker -->
          <div class="filter-dropdowns">
            <select v-model="selectedCourse" @change="filterByCourse">
              <option disabled value="">Filtrera på kurs</option>
              <option v-for="course in allCourses" :key="course._id" :value="course._id">
                {{ course.name }}
              </option>
            </select>

            <DatePicker 
              v-model="selectedDate" 
              @update:modelValue="filterByDate"
              :auto-apply="true"
              placeholder="Filtrera på datum"
              locale="sv"
              :format="'yyyy-MM-dd'"
            />
          </div>

          <!-- Resultatlista -->
          <ul class="result-list">
            <li v-for="result in filteredResults" :key="result.id" @click="navigateToDetails(result)" class="result-item">
              <div class="result-content">
                <div class="result-title">{{ result.name }}</div>
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
          <router-link v-if="isLoggedIn" to="/profile" class="icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">
              <path
                fill="currentColor"
                d="M12 4a4 4 0 0 1 4 4a4 4 0 0 1-4 4a4 4 0 0 1-4-4a4 4 0 0 1 4-4m0 10c4.42 0 8 1.79 8 4v2H4v-2c0-2.21 3.58-4 8-4"
              />
            </svg>
          </router-link>

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
          <button v-else @click="logout" class="logout-btn">Logout</button>
        </div>

        </div>
  </nav>
</template>

<script>
  import { ref, computed, onMounted } from 'vue'
  import { useStore } from 'vuex'
  import { useRouter } from 'vue-router'
  import axios from 'axios'
  import DatePicker from "@vuepic/vue-datepicker";
  import "@vuepic/vue-datepicker/dist/main.css";

  export default {
    components: { DatePicker },
    setup() {
      const store = useStore()
      const router = useRouter()

      const userRole = computed(() => store.getters.userRole || 'guest') // Default to 'guest' if undefined

      // Fix missing properties
      const buildVersion = ref(import.meta.env.VITE_BUILD_VERSION || 'Dev')
      const searchQuery = ref('')
      const searchResults = ref([])
      const showResults = ref(false)
      const showFilters = ref(false)
      const filter = ref("all"); // Aktivt filter
      const selectedCourse = ref("");
      const selectedDate = ref(null);
      const allCourses = ref([]);


      const filteredResults = computed(() => {
      if (filter.value === "all") return searchResults.value;
      return searchResults.value.filter((res) => res.type === filter.value);
    });


    const navigateToDetails = (result) => {
      showResults.value = false; // Stäng<er sökresultaten
      searchQuery.value = ""; // Nollställer sökfältet
      router.push(`/detaljer/${result.type}/${result.id}`);
    };

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
        const params = new URLSearchParams();

        if (searchQuery.value) params.append("q", searchQuery.value);
        if (selectedCourse.value) params.append("courseId", selectedCourse.value);
        if (selectedDate.value) {
          const formatted = new Date(selectedDate.value).toISOString().split("T")[0];
          params.append("date", formatted); // 💡 separat "date"-parameter
        }

        try {
          const response = await axios.get(`http://localhost:5001/api/search?${params.toString()}`);
          searchResults.value = response.data;
          showResults.value = true;
        } catch (error) {
          console.error("❌ Fel vid kombinerad sökning:", error);
        }
      };


      const fetchCourses = async () => {
      try {
        const res = await axios.get("http://localhost:5001/api/courses");
        allCourses.value = res.data;
      } catch (err) {
        console.error("❌ Kunde inte hämta kurser:", err);
      }
    };

    const filterByCourse = async () => {
      if (!selectedCourse.value) return;
      try {
        const response = await axios.get(`http://localhost:5001/api/search?courseId=${selectedCourse.value}`);
        searchResults.value = response.data;
        showResults.value = true;
      } catch (error) {
        console.error("❌ Fel vid kursfilter:", error);
      }
    };

    const filterByDate = async () => {
      if (!selectedDate.value) return;
      const formatted = new Date(selectedDate.value).toISOString().split("T")[0];
      try {
        const res = await axios.get(`http://localhost:5001/api/search?q=${formatted}`);
        searchResults.value = res.data;
        showResults.value = true;
      } catch (err) {
        console.error("❌ Fel vid datumfilter:", err);
      }
    };

    const setFilter = (f) => (filter.value = f);
    const openSearchPanel = () => {
      showResults.value = true;
      fetchCourses();
    };

      const menuItems = [
        { name: 'Användare', link: '/anvandare', role: 'admin' },
        { name: 'Kalender', link: '/kalender', role: 'teacher' },
        { name: 'Utbildning', link: '/education', role: 'admin' },
        { name: 'Betyg', link: '/betyg', role: 'teacher' },
        { name: 'Kurspaket', link: '/programsandpackages', role: 'admin' },
        { name: 'Kurser', link: '/programsandcourses', role: 'admin' },
        { name: 'Elev+', link: '/addstudent', role: 'admin' },
        { name: 'Elever', link: '/students', role: 'admin' },
        { name: 'PDF', link: '/pdf', role: 'admin' },
      ]

      const filteredMenuItems = computed(() => {
        return menuItems.filter((item) => {
          if (!item.role) return true // Publicly accessible links
          return hasPermission(item.role) // Ensure systemadmin has full access
        })
      })

      return {
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
        filterByCourse,
        filterByDate,
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
  font-family: "Roboto", sans-serif;
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
