<template>
  <div class="modal-overlay">
    <div class="modal-content">
      <div class="scrollable-view">
        <p><strong>Elev:</strong> {{ event.extendedProps.studentName }}</p>
        <p><strong>Datum:</strong> {{ formatDate(event.start) }}</p>
        <p><strong>Tid:</strong> {{ formatTime(event.start) }}</p>
        <p><strong>Plats:</strong> {{ event.extendedProps.location }}</p>
        <p><strong>Bokad av:</strong> {{ event.extendedProps.bookedBy }}</p>
      </div>

      <div class="buttons">
        <button @click="$emit('close')">Stäng</button>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  props: {
    event: Object // från kalendern, ex: event.extendedProps
  },
  methods: {
    formatDate(date) {
      return new Date(date).toLocaleDateString('sv-SE', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    },
    formatTime(date) {
      return new Date(date).toLocaleTimeString('sv-SE', {
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  }
};
</script>

<style scoped>
.meeting-info {
  padding: 1rem;
}
.meeting-info p {
  margin: 0.3rem 0;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.modal-content {
  background: white;
  padding: 20px;
  width: 400px;
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
}
</style>
