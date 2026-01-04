<template>
  <v-container>
    <v-card>
      <v-card-title>Min kursöversikt</v-card-title>
      <v-card-text>
        <v-data-table
          :headers="headers"
          :items="courses"
          :loading="loading"
          class="elevation-1"
        >
          <template v-slot:item.startDate="{ item }">
            {{ formatDate(item.startDate) }}
          </template>
          <template v-slot:item.endDate="{ item }">
            {{ formatDate(item.endDate) }}
          </template>
        </v-data-table>
      </v-card-text>
    </v-card>
  </v-container>
</template>

<script>
import axios from 'axios';

export default {
  name: 'CourseOverview',
  data() {
    return {
      loading: true,
      courses: [],
      headers: [
        { text: 'Kursnamn', value: 'courseName' },
        { text: 'Kurskod', value: 'courseCode' },
        { text: 'Startdatum', value: 'startDate' },
        { text: 'Slutdatum', value: 'endDate' },
        { text: 'Antal anmälda', value: 'enrollmentCount' },
      ],
    };
  },
  async created() {
    await this.fetchMyCourses();
  },
  methods: {
    async fetchMyCourses() {
      this.loading = true;
      try {
        const response = await axios.get('/api/course-instances/mine');
        this.courses = response.data.instances;
      } catch (error) {
        console.error('Error fetching my courses:', error);
        // Handle error, e.g., show a notification
      } finally {
        this.loading = false;
      }
    },
    formatDate(dateString) {
      if (!dateString) return 'N/A';
      const options = { year: 'numeric', month: 'short', day: 'numeric' };
      return new Date(dateString).toLocaleDateString('sv-SE', options);
    },
  },
};
</script>

<style scoped>
.v-card-title {
  font-weight: bold;
}
</style>
