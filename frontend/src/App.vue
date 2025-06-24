<template>
  <div id="app">
    <NavBar />

    <div class="content">
      <v-app>
        <router-view />
      </v-app>
    </div>
  </div>
</template>

<script>
  import NavBar from './components/NavBar.vue'

  export default {
    components: { NavBar },
  }
</script>
<style>
  #app {
    width: 100vw;
    min-height: 100vh;
    flex-direction: column;
  }

  router-view {
    flex-grow: 1;
    width: 100%;
  }
</style>
