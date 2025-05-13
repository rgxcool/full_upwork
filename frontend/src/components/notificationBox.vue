<template>
    <div class="notification-box">
      <h3>Notiser</h3>
  
      <div v-if="notifications.length === 0">Inga nya notiser</div>
      <ul>
        <li v-for="n in notifications" :key="n._id">
          {{ n.message }}
          <!-- Kontrollera om n.meta.url finns innan du försöker använda den -->
          <a v-if="n.meta && n.meta.url" :href="n.meta.url">Se elev</a>
        </li>
      </ul>
  
      <div v-if="error" class="error">{{ error }}</div>
    </div>
  </template>
  
  <script>
  import axios from 'axios';
  
  export default {
    data() {
      return {
        notifications: [],
        error: null,
        loading: true
      };
    },
    async mounted() {
      try {
        const res = await axios.get("http://localhost:5001/api/notifications");
        this.notifications = res.data;
      } catch (err) {
        this.error = 'Kunde inte hämta notiser.';
      } finally {
        this.loading = false;
      }
    }
  };
  </script>
  