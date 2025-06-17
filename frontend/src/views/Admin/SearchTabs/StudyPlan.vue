<template>
  <div>
    <div v-for="education in student.education" :key="education._id" class="education-item">
      <div class="info">
        <strong>Kurs:</strong> {{ education.name || 'Ingen kursdata' }}
      </div>
      <div class="info">
        <strong>Status:</strong>
        <div v-if="!savedEducations.has(education._id)">
          <select v-model="education.status">
            <option disabled value="">Välj här</option>
            <option v-for="s in statuses" :key="s" :value="s">{{ s }}</option>
          </select>
        </div>
        <div v-else>{{ education.status }}</div>
      </div>
      <div class="actions" >
        <button
          class="btn btn-success"
          @click="updateStatus(education)"
        >
          Spara studieplan
        </button> 
      </div>


    </div>
  </div>
</template>

<script setup>
import { computed, reactive } from 'vue';
import axios from 'axios';

const savedEducations = reactive(new Set());

const props = defineProps({
  userData: Object
});

const student = computed(() => props.userData || { education: [] });

const statuses = ["Antagen", "Betygsatt", "Avbrott", "Ej påbörjad", "Reviderad"];

const updateStatus = async (education) => {
  try {
    const res = await axios.put(
      `http://localhost:5001/api/students/${student.value._id}/education/${education._id}/status`,
      { status: education.status }
    );
    console.log("✅ Uppdaterad:", res.data);
    savedEducations.add(education._id);
  } catch (err) {
    console.error("❌ Fel vid uppdatering:", err.response?.data || err.message);
    alert("Kunde inte uppdatera kursstatus.");
  }
};
</script>

<style scoped>
.education-item {
  border: 1px solid #ccc;
  padding: 1rem;
  margin-bottom: 1rem;
  border-radius: 8px;
}

.info {
  margin-bottom: 0.5rem;
}

.actions {
  margin-top: 0.5rem;
}

select {
  min-width: 150px;
  width: 100%;
  box-sizing: border-box;
}
</style>
