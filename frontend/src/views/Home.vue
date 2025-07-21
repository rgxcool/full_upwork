<template>
  <div class="home-minimal">
    <div class="center-content">
      <h1>Välkommen till Mindfullearning</h1>
    </div>
  </div>
</template>

<script>
  export default {
    name: 'HomePage',
  }
</script>

<style scoped>
  .home-minimal {
    min-height: 100vh;
    background: #f8f8f8;
    display: flex;
    flex-direction: column;
  }
  .center-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
  }
  .center-content h1 {
    font-size: 2.5rem;
    font-weight: 700;
    margin-bottom: 2.5rem;
    color: #222;
  }
</style>
