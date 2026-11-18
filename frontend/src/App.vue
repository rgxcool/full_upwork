<template>
  <div id="app">
    <NavBar v-if="!showSidebar" />
    <ToastNotification />

    <v-alert
      v-if="!isOnline"
      type="warning"
      density="compact"
      class="text-center rounded-0"
      :persistent="true"
    >
      Du är offline. Några funktioner fungerar inte tills anslutningen återställs.
    </v-alert>

    <div class="app-shell" :class="{ 'no-navbar': isLoginPage, 'with-sidebar': showSidebar }">
      <Sidebar v-if="showSidebar" :collapsed="sidebarCollapsed" @toggle="sidebarCollapsed = !sidebarCollapsed" />
      <div class="content" :class="{ 'no-navbar': isLoginPage, 'with-sidebar': showSidebar }">
        <v-app>
          <ErrorBoundary>
            <router-view />
          </ErrorBoundary>
        </v-app>
      </div>
    </div>
  </div>
</template>

<style src="@/styles/tokens.css"></style>
<style src="@/styles/admin-ui.css"></style>
<script>
  import { computed, ref } from 'vue'
  import { useRoute } from 'vue-router'
  import { useStore } from 'vuex'
  import NavBar from './components/NavBar.vue'
  import ToastNotification from './components/ToastNotification.vue'
  import ErrorBoundary from './components/ErrorBoundary.vue'
  import Sidebar from './components/Sidebar.vue'
  import { useNetworkStatus } from '@/composables/useNetworkStatus.js'

  export default {
    components: { NavBar, ToastNotification, ErrorBoundary, Sidebar },
    setup() {
      const route = useRoute()
      const store = useStore()
      const { isOnline } = useNetworkStatus()
      const sidebarCollapsed = ref(false)

      const isLoginPage = computed(() => route.path === '/login')
      const showSidebar = computed(() => !isLoginPage.value && !!store.getters.userRole && store.getters.userRole !== 'guest')

      return {
        isLoginPage,
        isOnline,
        showSidebar,
        sidebarCollapsed,
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
    overflow-x: hidden;
  }

  .app-shell {
    display: flex;
    flex: 1;
    min-height: calc(100vh - 7rem);
  }
  .app-shell.with-sidebar { min-height: 100vh; }
  .app-shell.no-navbar { min-height: 100vh; }

  .content {
    margin-top: 7rem;
    min-height: calc(100vh - 7rem);
    overflow-x: hidden;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }
  .content.with-sidebar { margin-top: 0; min-height: 100vh; }
  .content.no-navbar { margin-top: 0; min-height: 100vh; }

  router-view {
    flex-grow: 1;
    width: 100%;
  }

  @media (max-width: 768px) {
    .app-shell.with-sidebar { flex-direction: column; }
  }
</style>
