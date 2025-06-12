<template>
    <div class="notification-box">
      <h3>Notiser</h3>
  
      <div v-if="notifications.length === 0">Inga nya notiser</div>
      <ul v-else>
        <li v-for="n in notifications" :key="n._id">
          {{ n.message }}
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
        loading: true,
        pollIntervall: null,
      };
    },
    methods: {
      async fetchNotifications() {
          try {
          const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/notifications`);
          // Ren JavaScript, filtera efter unikt ID:
          this.notifications = res.data.filter(n => !n.resolved);

          const seenIds = new Set();
          this.notifications = this.notifications.filter(n => {
            if (seenIds.has(n._id)) return false;
            seenIds.add(n._id);
            return true;
          });
          
        } catch (err) {
          this.error = 'Kunde inte hämta notiser.';
        } finally {
          this.loading = false;
        }
      }
    },
      mounted() {
        this.fetchNotifications();
        this.pollIntervall = setInterval(() => {
          this.fetchNotifications();
        }, 30000); //30 sekunder

    }, beforeUnmount() {
      clearInterval(this.pollIntervall);
    }
  };
  </script>
  