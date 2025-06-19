<template>
  <div class="notification-box">
    <h3>Notiser</h3>

    <div v-if="notifications.length === 0">Inga nya notiser</div>
    <ul v-else>
      <li v-for="n in notifications" :key="n._id">
        {{ n.message }}
        <a v-if="n.meta && n.meta.url" :href="n.meta.url">Se elev</a>
        <button @click="dismissNotification(n._id)">✖</button>
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
      pollInterval: null,
    };
  },
  methods: {
    async fetchNotifications() {
      try {
        const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/notifications`);

        const filteredNotifications = [];
        const seenTypes = new Set();
        const seenDropoutStudents = new Set();

        for (const n of res.data) {
          if (['action_plan_required', 'grades_pending'].includes(n.type)) {
            if (!seenTypes.has(n.type)) {
              filteredNotifications.push(n);
              seenTypes.add(n.type);
            }
          } else if (n.type === 'dropout') {
            const studentId = n.meta.studentId.toString();
            if (!seenDropoutStudents.has(studentId)) {
              filteredNotifications.push(n);
              seenDropoutStudents.add(studentId);
            }
          } else {
            filteredNotifications.push(n);
          }
        }

        this.notifications = filteredNotifications;
      } catch (err) {
        this.error = 'Kunde inte hämta notiser.';
      } finally {
        this.loading = false;
      }
    },
    async dismissNotification(id) {
      try {
        await axios.put(`${import.meta.env.VITE_API_URL}/api/notifications/${id}/resolve`);
        this.notifications = this.notifications.filter(n => n._id !== id);
      } catch (error) {
        this.error = 'Kunde inte ta bort notisen.';
      }
    },
  },
  mounted() {
    this.fetchNotifications();
    this.pollInterval = setInterval(() => {
      this.fetchNotifications();
    }, 30000);
  },
  beforeUnmount() {
    clearInterval(this.pollInterval);
  },
};
</script>