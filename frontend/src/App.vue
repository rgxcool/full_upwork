<template>
  <div id="app">
    <NavBar />

    <div class="content" :class="{ 'no-navbar': isLoginPage }">
      <v-app>
        <router-view />
      </v-app>
    </div>
  </div>
</template>

<script>
  import { computed } from 'vue'
  import { useRoute } from 'vue-router'
  import NavBar from './components/NavBar.vue'

  export default {
    components: { NavBar },
    setup() {
      const route = useRoute()
      
      const isLoginPage = computed(() => {
        return route.path === '/login'
      })

      return {
        isLoginPage
      }
    }
  }
</script>
<style>
  #app {
    width: 100%;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    overflow-x: hidden; /* prevent horizontal scroll */
  }

  .content {
    margin-top: 7rem;
    min-height: calc(100vh - 7rem);
    overflow-x: hidden;
    display: flex;
    flex-direction: column;
  }

  .content.no-navbar {
    margin-top: 0;
    min-height: 100vh;
  }

  router-view {
    flex-grow: 1;
    width: 100%;
  }
</style>
