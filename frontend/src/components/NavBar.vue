<template>
  <nav class="navbar">
    <div class="nav-container">
      <div class="build-counter">v. {{ buildVersion }}</div>

      <!-- Logotyp -->
      <router-link to="/" class="navbar-brand">
        <img class="logo" src="@/assets/mindful_transparent.png" alt="Mindful Logo" />
      </router-link>

      <!-- Hamburgermeny för mobil -->
      <button class="menu-toggle" @click="toggleMenu">
        <i :class="isMenuOpen ? 'fas fa-times' : 'fas fa-bars'"></i>
      </button>

      <!-- Navigationsmeny -->
      <div :class="['menu', { open: isMenuOpen }]">
        <ul class="menu-list">
          <li v-for="(item, index) in menuItems" :key="index">
            <router-link class="menu-link" :to="item.link">{{ item.name }}</router-link>
          </li>
        </ul>

        <!-- Ikoner till höger -->
        <div class="menu-icons">
          <i class="fas fa-bell icon"></i>
          <i class="fas fa-comment icon"></i>
          <router-link to="/profile" class="icon-link">
            <i class="fas fa-user icon"></i>
          </router-link>
        </div>

        <!-- Login / Logout Button -->
        <router-link v-if="!isLoggedIn" to="/login" class="px-4 py-2 text-blue-600 hover:underline"> Login </router-link>

        <button v-else @click="logout" class="px-4 py-2 text-red-600 hover:underline">Logout</button>
      </div>
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

      // ✅ Corrected reference to isLoggedIn
      const isLoggedIn = computed(() => store.getters.isLoggedIn)

      const logout = () => {
        store.dispatch('logout')
        router.push('/')
      }

      return { isLoggedIn, logout }
    },
    data() {
      return {
        buildVersion: import.meta.VUE_APP_BUILD_VERSION || 'Dev',
        isMenuOpen: false,
        menuItems: [
          { name: 'Användare', link: '/anvandare' },
          { name: 'Kalender', link: '/kalender' },
          { name: 'Utbildning', link: '/education' },
          { name: 'Betyg', link: '/betyg' },
          { name: 'Kurser', link: '/programsandcourses' },
          { name: 'Elev+', link: '/addstudent' },
          { name: 'Elever', link: '/elever' },
          { name: 'PDF', link: '/pdf' },
        ],
      }
    },
    methods: {
      toggleMenu() {
        this.isMenuOpen = !this.isMenuOpen
      },
    },
  }
</script>

<style scoped>
  :deep(body) {
    display: block !important;
    justify-content: unset;
    align-items: unset;
    height: 100vh;
    overflow: hidden;
  }
  /* 🎨 Allmän stil för navbar */
  .navbar {
    background-color: #f2f2f2;
    padding: 15px 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-family: 'Roboto', sans-serif;
  }

  .nav-container {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    max-width: 1200px;
    margin: 0 auto;
    text-align: center;
  }

  /* 🖼️ Logotyp */
  .logo {
    height: 50px;
  }

  /* 📱 Mobilmeny-knapp */
  .menu-toggle {
    background: none;
    border: none;
    font-size: 1.8rem;
    cursor: pointer;
    display: none;
  }

  /* 🖥️ Meny för större skärmar */
  .menu {
    display: flex;
    align-items: center;
    gap: 20px;
  }

  /* 📄 Lista av länkar */
  .menu-list {
    list-style: none;
    display: flex;
    gap: 20px;
    margin: 0;
    padding: 0;
  }

  /* 🔗 Länkstil */
  .menu-link {
    text-decoration: none;
    font-size: 1rem;
    font-weight: 500;
    color: #02084b;
    font-family: 'Nunito', sans-serif;
    transition: color 0.3s;
  }

  .menu-link:hover {
    color: #007dc3;
  }

  /* 🔔 Ikoner */
  .menu-icons {
    display: flex;
    gap: 15px;
    margin-left: 20px;
  }

  .icon {
    font-size: 1.4rem;
    color: #000;
    cursor: pointer;
    transition: color 0.3s;
  }

  .icon:hover {
    color: #007dc3;
  }

  /* 📱 Mobilanpassning */
  @media (max-width: 992px) {
    .menu {
      display: none;
      flex-direction: column;
      position: absolute;
      top: 60px;
      right: 0;
      background-color: white;
      width: 100%;
      padding: 15px;
      box-shadow: 0px 4px 6px rgba(0, 0, 0, 0.1);
    }

    .menu.open {
      display: flex;
    }

    .menu-list {
      flex-direction: column;
      text-align: center;
      width: 100%;
    }

    .menu-icons {
      justify-content: center;
      width: 100%;
      margin-top: 10px;
    }

    .menu-toggle {
      display: block;
    }
  }

  .build-counter {
    position: absolute;
    top: 44px;
    left: 5px;
    font-size: 12px;
    background: rgba(0, 0, 0, 0.7);
    color: white;
    padding: 5px 10px;
    border-radius: 5px;
  }
</style>
