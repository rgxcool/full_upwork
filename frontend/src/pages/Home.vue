<template>
  <div class="min-vh-100 d-flex flex-column justify-content-center align-items-center bg-light w-100 mt-5">
    <!-- 🔹 Hero Section -->
    <section class="container text-center py-5 bg-success text-white rounded">
      <h1 class="display-4 fw-bold">Effektiv Skoladministration</h1>
      <p class="lead mx-auto w-75">Mindful Learning hjälper skolor att hantera elever, kurser och administration på ett smidigt sätt.</p>
      <div class="mt-4">
        <router-link to="/register" class="btn btn-light text-primary fw-bold">Kom igång</router-link>
      </div>
    </section>

    <!-- 🔹 Features Section -->
    <section class="container text-center py-5 mt-2">
      <h2 class="h2 fw-bold text-dark">Varför välja Mindful Learning?</h2>
      <div class="row justify-content-center mt-4">
        <div class="col-md-3 d-flex flex-column align-items-center">
          <div class="p-4 bg-white shadow-sm rounded text-center">
            <h3 class="h4 text-primary">Enkel Elevhantering</h3>
            <p class="text-muted">Håll koll på alla elever, kurser och betyg på en enda plats.</p>
          </div>
        </div>
        <div class="col-md-3 d-flex flex-column align-items-center">
          <div class="p-4 bg-white shadow-sm rounded text-center">
            <h3 class="h4 text-primary">Automatiserade Rapporter</h3>
            <p class="text-muted">Skapa och exportera rapporter på sekunder utan manuellt arbete.</p>
          </div>
        </div>
        <div class="col-md-3 d-flex flex-column align-items-center">
          <div class="p-4 bg-white shadow-sm rounded text-center">
            <h3 class="h4 text-primary">Säker & GDPR-vänlig</h3>
            <p class="text-muted">Alla data är skyddade med moderna säkerhetsstandarder.</p>
          </div>
        </div>
      </div>
    </section>

    <!-- 🔹 Testimonials Section -->
    <section class="bg-light py-5 container text-center">
      <h2 class="h2 fw-bold text-dark">Vad säger våra användare?</h2>
      <div class="row justify-content-center mt-4">
        <div class="col-md-5 d-flex flex-column align-items-center">
          <div class="p-4 bg-white shadow-sm rounded text-center">
            <p class="text-muted">"Mindful Learning har revolutionerat vår skoladministration. Allt är så smidigt och enkelt!"</p>
            <h4 class="text-primary mt-3">- Lisa Andersson, Skolchef</h4>
          </div>
        </div>
        <div class="col-md-5 d-flex flex-column align-items-center">
          <div class="p-4 bg-white shadow-sm rounded text-center">
            <p class="text-muted">"Jag sparar flera timmar i veckan tack vare automatiserade rapporter och elevhantering."</p>
            <h4 class="text-primary mt-3">- Johan Svensson, Lärare</h4>
          </div>
        </div>
      </div>
    </section>

    <!-- 🔹 Call-to-Action Section -->
    <section class="text-center py-5 container">
      <h2 class="h2 fw-bold text-dark">Redo att digitalisera din skola?</h2>
      <p class="lead text-muted mt-2">Registrera dig idag och börja använda Mindful Learning gratis!</p>
      <div class="mt-4">
        <router-link to="/register" class="btn btn-primary fw-bold">Registrera Gratis</router-link>
      </div>
    </section>

    <!-- 🔹 Footer -->
    <footer class="bg-dark text-white py-3 text-center w-100">
      <p class="mb-0">&copy; 2024 Mindful Learning. Alla rättigheter förbehållna.</p>
    </footer>
  </div>
</template>

<script>
  export default {
    name: 'HomePage',
  }
</script>

<style scoped>
  /* Custom styling if needed */
</style>
