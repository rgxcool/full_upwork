<template>
  <div class="container mt-4">
    <div class="card p-4 shadow-sm">
      <h2 class="mb-3">Elevdetaljer</h2>

      <!-- Elevinformation -->
      <div class="mb-4">
        <h4>Grundläggande Information</h4>
        <p><strong>Namn:</strong> {{ student.namn }}</p>
        <p><strong>Personnummer:</strong> {{ student.personnummer }}</p>
        <p><strong>Kurs:</strong> {{ student.kurspaket }}</p>
        <p><strong>Telefon:</strong> {{ student.telefon }}</p>
        <p><strong>E-post:</strong> {{ student.mail }}</p>
      </div>

      <!-- Praktikstatus -->
      <div class="mb-4">
        <h4>Status</h4>
        <p><strong>Startdatum:</strong> {{ student.startDatum }}</p>
        <p><strong>Slutdatum:</strong> {{ student.slutDatum }}</p>
        <p><strong>Kommun:</strong> {{ student.kommun }}</p>
        <p><strong>Provstatus:</strong> {{ student.prov }}</p>
        <p><strong>Övrigt:</strong> {{ student.ovrigt }}</p>
      </div>

      <!-- Praktiksamordnarens redigering -->
      <div v-if="isCoordinator">
        <h4>Redigera Information</h4>
        <label for="prov" class="form-label">Provstatus:</label>
        <input type="text" id="prov" class="form-control mb-2" v-model="student.prov" />

        <label for="ovrigt" class="form-label">Övrigt:</label>
        <textarea id="ovrigt" class="form-control mb-2" v-model="student.ovrigt"></textarea>

        <button class="btn btn-primary" @click="updateStudent">Spara ändringar</button>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted } from "vue";
import { useRoute } from "vue-router";
import axios from "axios";

export default {
  setup() {
    const route = useRoute();
    const student = ref({});
    const isCoordinator = true; // Här kan du lägga till en check för användarroll

    const fetchStudent = async () => {
      try {
        const response = await axios.get(`http://localhost:5001/api/students/${route.params.id}`);
        student.value = response.data;
      } catch (error) {
        console.error("Misslyckades att hämta elev:", error);
      }
    };

    const updateStudent = async () => {
      try {
        await axios.put(`/api/students/${student.value._id}`, student.value);
        alert("Elevens information uppdaterades!");
      } catch (error) {
        console.error("Misslyckades att uppdatera elev:", error);
      }
    };

    onMounted(fetchStudent);

    return {
      student,
      isCoordinator,
      updateStudent,
    };
  },
};
</script>

<style scoped>
.container {
  max-width: 800px;
  margin: auto;
}
</style>
