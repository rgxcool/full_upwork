// === frontend/components/MeetingModal.vue ===
<template>
  <div class="modal-overlay">
    <div class="modal-content">
      <h3>Boka möte med {{ studentName }}</h3>
      <label>Titel:</label>
      <input v-model="title" placeholder="Ex. Uppföljning" />

      <label>Beskrivning:</label>
      <textarea v-model="description" placeholder="Valfritt"></textarea>

      <label>Starttid:</label>
      <input type="datetime-local" v-model="start" />

      <label>Sluttid:</label>
      <input type="datetime-local" v-model="end" />

      <div class="buttons">
        <button @click="submitMeeting">Spara</button>
        <button @click="$emit('close')">Avbryt</button>
      </div>
    </div>
  </div>
</template>

<script>
import axios from 'axios';
import { useStore } from 'vuex';

export default {
  props: ['studentId', 'studentName'],
  setup() {
    const store = useStore();
    const userRole = store.getters.userRole;
    return { userRole };
  },
  data() {
    return {
      title: '',
      description: '',
      start: '',
      end: ''
    };
  },
  methods: {
    async submitMeeting() {
      try {
        await axios.post('/api/meetings', {
          title: this.title,
          description: this.description,
          participants: [this.studentId],
          start: this.start,
          end: this.end,
          createdBy: this.userRole
        });
        this.$emit('close');
      } catch (err) {
        console.error('Kunde inte spara möte:', err);
      }
    }
  }
};
</script>

<style scoped>
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
}
.modal-content {
  background: white;
  padding: 20px;
  width: 400px;
  border-radius: 8px;
}
input, textarea {
  width: 100%;
  margin-bottom: 10px;
}
.buttons {
  display: flex;
  justify-content: space-between;
}
</style>