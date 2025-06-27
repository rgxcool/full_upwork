<template>
  <div class="notification-box">
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
  import axios from 'axios'

  export default {
    data() {
      return {
        error: null,
      }
    },
    props: {
      notifications: {
        type: Array,
        required: true,
      },
    },
    methods: {
      async dismissNotification(id) {
        try {
          await axios.put(`${import.meta.env.VITE_API_URL}/api/notifications/${id}/resolve`)
          this.$emit('notification-dismissed', id)
        } catch (error) {
          this.error = 'Kunde inte ta bort notisen.'
        }
      },
    },
  }
</script>

<style scoped>
  .notification-box {
    border: 2px solid #007dc3ff;

    border-radius: 3px;
  }
</style>
