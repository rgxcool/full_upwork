<template>
    <div>
      <table class="table">
        <thead>
          <tr>
            <th>Kursnamn</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="education in student.education" :key="education._id">
            <td>{{ education.name || 'Ingen kursdata' }}</td>
            <td>
              <div v-if="!savedEducations.has(education._id)">
                <select v-model="education.status">
                  <option disabled value="">Choose here</option>
                  <option v-for="s in statuses" :key="s" :value="s">{{ s }}</option>
                </select>
              </div>
              <div v-else>
                {{ education.status }}
                <br>
                <button
                  class="btn btn-success"
                  v-if="!education.status"
                  @click="updateStatus(education)"
                >
                  Spara studieplan
                </button>
              </div>
            </td>
            <td>
            <button
              class="btn btn-success"
              v-if="!education.status"
              @click="updateStatus(education)"
            >
              Spara studieplan
            </button>
          </td>
          </tr>
        </tbody>
      </table>
    </div>
  </template>
<script setup>
import { computed, reactive } from 'vue';
import axios from 'axios';


const savedEducations = reactive(new Set()); // innehåller _id för redan sparade

const props = defineProps({
  userData: Object
});

const student = computed(() => props.userData || { education: [] });

console.log("📦 userData:", props.userData);


const statuses = ["Antagen", "Betygsatt", "Avbrott", "Ej påbörjad", "Reviderad"];

const hasUnsaved = computed(() => {
  return student.value.education.some(e => !savedEducations.has(e._id));
});

const updateStatus = async (education) => {
  const rawEducationId = education._id;

  try {
    const response = await axios.put(
      `http://localhost:5001/api/students/${student.value._id}/education/${rawEducationId}/status`,
      { status: education.status }
    );
    console.log("✅ Status uppdaterad:", response.data);

    savedEducations.add(rawEducationId); // markera som sparad
  } catch (err) {
    console.error("❌ Error updating status:", err.response?.data || err.message);
    alert("Kunde inte uppdatera kursstatus.");
  }
};



console.log("👤 Student data received:", student.value);




</script>

  
  <style scoped>
  .table {
    width: 100%;
    border-collapse: collapse;
  }
  .table th, .table td {
    border: 1px solid #ccc;
    padding: 0.5rem;
  }

  button, input, select, textarea, option {
  font: inherit;
  color: inherit;
  background: none;
  padding: 0;
  margin: 0;
  box-sizing: border-box;
}

select {
  min-width: 150px;
  width: 100%;
  box-sizing: border-box;
}
  </style>
  