<template>
  <div class="container my-5">
    <h2 class="mb-4">Hantera Prövningar</h2>
    <!-- Add button to open create form -->
    <button @click="openForm()">Registrera Ny Prövning</button>

    <!-- Form Modal (using a simple conditional rendering) -->
    <div v-if="showForm">
      <h3>{{ currentExam._id ? 'Redigera' : 'Registrera' }} Prövning</h3>
      <form @submit.prevent="saveExam">
        <!-- Form fields based on the model -->
        <input v-model="currentExam.name" placeholder="Namn" required />
        <input v-model="currentExam.personalNumber" placeholder="Personnummer" required />
        <input v-model="currentExam.course" placeholder="Kurs" required />
        <!-- Add all other fields: kontaktuppgifter, adress, onskadManad, kommun, ansvarigLarare, etc. -->
        <label><input type="checkbox" v-model="currentExam.materialutlamning" /> Materialutlämning</label>
        <label><input type="checkbox" v-model="currentExam.betalning" /> Betalning</label>
        <button type="submit">Spara</button>
        <button @click="closeForm()">Avbryt</button>
      </form>
    </div>

    <!-- Table to list exams -->
    <table>
      <thead>
        <tr>
          <th>Namn</th>
          <th>Kurs</th>
          <th>Önskad Månad</th>
          <th>Åtgärder</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="exam in exams" :key="exam._id">
          <td>{{ exam.name }}</td>
          <td>{{ exam.course }}</td>
          <td>{{ exam.requestedMonth }}</td>
          <td>
            <button @click="openForm(exam)">Redigera</button>
            <button @click="deleteExam(exam._id)">Ta bort</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import axios from 'axios';

const exams = ref([]);
const showForm = ref(false);
const currentExam = ref({});

const fetchExams = async () => {
  try {
    const { data } = await axios.get('/api/admin/exams'); // Use the new admin route
    exams.value = data;
  } catch (error) {
    console.error('Failed to fetch exams', error);
  }
};

const openForm = (exam = {}) => {
  currentExam.value = { ...exam };
  showForm.value = true;
};

const closeForm = () => {
  showForm.value = false;
  currentExam.value = {};
};

const saveExam = async () => {
  if (currentExam.value._id) {
    // Update
    await axios.put(`/api/exams/${currentExam.value._id}`, currentExam.value);
  } else {
    // Create
    await axios.post('/api/exams', currentExam.value);
  }
  closeForm();
  fetchExams();
};

const deleteExam = async (id) => {
  if (confirm('Är du säker?')) {
    await axios.delete(`/api/exams/${id}`);
    fetchExams();
  }
};

onMounted(fetchExams);
</script>
