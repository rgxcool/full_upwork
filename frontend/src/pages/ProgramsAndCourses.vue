<template>
  <div class="programs-container">
    <h1>Programs and Courses</h1>
    <div v-if="programs.length">
      <div v-for="program in programs" :key="program._id" class="program">
        <h2>{{ program.programName }}</h2>
        <ul>
          <li v-for="course in program.courses" :key="course._id">
            {{ course.courseName }} ({{ course.courseCode }})
          </li>
        </ul>
      </div>
    </div>
    <div v-else>
      <p>Loading programs...</p>
    </div>
  </div>
</template>

<script>
import axios from "axios";

export default {
  data() {
    return {
      programs: [], // Stores programs and their courses
    };
  },
  methods: {
    async fetchPrograms() {
      try {
        const response = await axios.get(`${process.env.VUE_APP_API_URL}/api/programs`); // Replace with your actual API endpoint
        this.programs = await Promise.all(
          response.data.map(async (program) => {
            // Fetch the courses for each program
            const coursesResponse = await axios.get(`${process.env.VUE_APP_API_URL}/api/programs/${program._id}/courses`);
            return {
              ...program,
              courses: coursesResponse.data,
            };
          })
        );
      } catch (error) {
        console.error("Error fetching programs:", error);
      }
    },
  },
  mounted() {
    this.fetchPrograms();
  },
};
</script>

<style scoped>
.programs-container {
  padding: 20px;
  font-family: Arial, sans-serif;
}

.program {
  margin-bottom: 20px;
}

h1 {
  text-align: center;
  margin-bottom: 20px;
}

h2 {
  color: #333;
}

ul {
  list-style-type: none;
  padding: 0;
}

li {
  margin: 5px 0;
}

p {
  text-align: center;
}
</style>
