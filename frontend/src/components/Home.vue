<template>
  <div class="min-h-screen bg-gray-100">
    <!-- 🔹 Navbar -->
    <nav class="bg-white shadow-md p-4 flex justify-between items-center">
      <router-link to="/" class="text-2xl font-bold text-blue-600">Mindful Learning</router-link>
      <div>
        <router-link to="/register" class="px-4 py-2 bg-blue-600 text-black rounded-md hover:bg-blue-700 transition">Registrera</router-link>
      </div>
    </nav>

    <!-- 🔹 Hero Section -->
    <section class="text-center py-20 bg-blue-500 text-white">
      <h1 class="text-4xl font-bold mb-4">Effektiv Skoladministration</h1>
      <p class="text-lg max-w-2xl mx-auto">Mindful Learning hjälper skolor att hantera elever, kurser och administration på ett smidigt sätt.</p>
      <div class="mt-6">
        <router-link to="/register" class="px-6 py-3 bg-white text-blue-600 font-semibold rounded-md shadow hover:bg-gray-100 transition"> Kom igång </router-link>
      </div>
    </section>

    <!-- 🔹 Features Section -->
    <section class="py-16 px-6">
      <div class="max-w-4xl mx-auto text-center">
        <h2 class="text-3xl font-semibold text-gray-800 mb-6">Varför välja Mindful Learning?</h2>
      </div>
      <div class="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
        <div class="p-6 bg-white rounded-lg shadow-md text-center">
          <h3 class="text-xl font-semibold text-blue-600 mb-2">Enkel Elevhantering</h3>
          <p class="text-gray-600">Håll koll på alla elever, kurser och betyg på en enda plats.</p>
        </div>
        <div class="p-6 bg-white rounded-lg shadow-md text-center">
          <h3 class="text-xl font-semibold text-blue-600 mb-2">Automatiserade Rapporter</h3>
          <p class="text-gray-600">Skapa och exportera rapporter på sekunder utan manuellt arbete.</p>
        </div>
        <div class="p-6 bg-white rounded-lg shadow-md text-center">
          <h3 class="text-xl font-semibold text-blue-600 mb-2">Säker & GDPR-vänlig</h3>
          <p class="text-gray-600">Alla data är skyddade med moderna säkerhetsstandarder.</p>
        </div>
      </div>
    </section>

    <!-- 🔹 Testimonials Section -->
    <section class="bg-gray-200 py-16 px-6">
      <div class="max-w-4xl mx-auto text-center">
        <h2 class="text-3xl font-semibold text-gray-800 mb-6">Vad säger våra användare?</h2>
      </div>
      <div class="grid md:grid-cols-2 gap-8 max-w-6xl mx-auto">
        <div class="p-6 bg-white rounded-lg shadow-md">
          <p class="text-gray-600">"Mindful Learning har revolutionerat vår skoladministration. Allt är så smidigt och enkelt!"</p>
          <h4 class="text-lg font-semibold mt-4 text-blue-600">- Lisa Andersson, Skolchef</h4>
        </div>
        <div class="p-6 bg-white rounded-lg shadow-md">
          <p class="text-gray-600">"Jag sparar flera timmar i veckan tack vare automatiserade rapporter och elevhantering."</p>
          <h4 class="text-lg font-semibold mt-4 text-blue-600">- Johan Svensson, Lärare</h4>
        </div>
      </div>
    </section>

    <!-- 🔹 Call-to-Action Section -->
    <section class="text-center py-16">
      <h2 class="text-3xl font-semibold text-gray-800">Redo att digitalisera din skola?</h2>
      <p class="text-lg text-gray-600 mt-2">Registrera dig idag och börja använda Mindful Learning gratis!</p>
      <div class="mt-6">
        <router-link to="/register" class="px-6 py-3 bg-blue-600 text-white font-semibold rounded-md shadow hover:bg-blue-700 transition"> Registrera Gratis </router-link>
      </div>
    </section>

    <!-- 🔹 Footer -->
    <footer class="bg-gray-900 text-white py-6 text-center">
      <p>&copy; 2024 Mindful Learning. Alla rättigheter förbehållna.</p>
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
