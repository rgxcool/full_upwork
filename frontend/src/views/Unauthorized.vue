<template>
  <div class="scrollable-view">
    <div class="unauthorized">
      <div class="container">
        <h1>Access Denied</h1>
        <p>You do not have permission to view this page.</p>
        <RouterLink to="/">Return to Home</RouterLink>
      </div>
    </div>
  </div>
</template>

<script setup>
// No script logic needed for a static page
</script>

<style scoped>
.unauthorized {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 80vh;
  text-align: center;
}

.container {
  max-width: 500px;
  padding: 2rem;
  border: 1px solid #ccc;
  border-radius: 10px;
}
</style>
