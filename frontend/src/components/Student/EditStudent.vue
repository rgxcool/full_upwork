<template>
  <v-container>
    <v-form>
      <!-- Autocomplete for selecting a student -->
      <v-autocomplete
        v-model="selectedStudent"
        :items="students"
        item-title="namn"
        item-value="_id"
        label="Select a student"
        return-object
        outlined
        clearable
        search-input
        hide-details
        dense
      />

      <!-- Display student details if one is selected -->
      <v-row v-if="selectedStudent">
        <v-col cols="12" md="6">
          <v-text-field label="Full Name" v-model="selectedStudent.namn" readonly />
        </v-col>
        <v-col cols="12" md="6">
          <v-text-field label="Personal Number" v-model="selectedStudent.personnummer" readonly />
        </v-col>
      </v-row>
    </v-form>
  </v-container>
</template>

<script>
import { ref, onMounted } from "vue";

export default {
  name: "EditStudent",
  setup() {
    const students = ref([]);
    const selectedStudent = ref(null);

    // Fetch students data (use your actual API here)
    onMounted(async () => {
      try {
        const response = await fetch("http://localhost:5001/api/students");
        const data = await response.json();
        students.value = data; // Assuming the response has a list of students
      } catch (error) {
        console.error("Error fetching students:", error);
      }
    });

    return { students, selectedStudent };
  },
};
</script>

<style scoped>
/* Custom styles (if necessary) */
</style>
