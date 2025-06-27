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
    border: 1px solid black;
    border-radius: 6px;
    padding: 8px; /* remove padding around the box */
    margin: 0;
    box-sizing: border-box;
  }

  .notification-box ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .notification-box li {
    border: 2px solid #007dc3ff;
    border-radius: 6px;
    padding: 8px 12px;
    margin-bottom: 8px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background-color: #f9f9f9;
  }

  .notification-box button {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 16px;
    margin-left: 8px;
  }
</style>
