<template>
  <div class="scrollable-view">
    <h1>APL Status Board</h1>
    <APLBoard />
  </div>
</template>

<script setup>
  import APLBoard from '../components/APLBoard.vue'
</script>

<style scoped>
  .apl-view {
    padding: 24px;
  }
  h1 {
    margin-bottom: 16px;
  }
</style>
