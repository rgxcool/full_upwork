<template>
  <div class="programs-container">
    <h1>Programs and Courses</h1>
    <div v-if="programs.length">
      <div v-for="program in programs" :key="program._id" class="program">
        <h2>{{ program.programName }}</h2>
        <div v-if="program.coursePackage">
          <h3>{{ program.coursePackage.coursePackageName }}</h3>
          <ul>
            <li v-for="course in program.coursePackage.courses" :key="course._id">
              {{ course.courseName }} ({{ course.courseCode }})
            </li>
          </ul>
        </div>
        <div v-else>
          <p>No course package available for this program.</p>
        </div>
      </div>
    </div>
    <div v-else>
      <p>Loading programs...</p>
    </div>
  </div>
</template>

<script>
  import axios from 'axios'

  export default {
    data() {
      return {
        programs: [], // Stores programs and their course packages and courses
      }
    },
    methods: {
      async fetchPrograms() {
        try {
          const response = await axios.get(`${import.meta.env.VITE_API_URL}/api/program`) // Replace with your actual API endpoint
          console.log('ProgramsAndCourses.vue - Programs Response: ', response)
          this.programs = await Promise.all(
            response.data.map(async (program) => {
              // Fetch the course package for each program
              const coursePackageResponse = await axios.get(
                `${import.meta.env.VITE_API_URL}/api/coursePackage/${program.coursePackage}`
              )
              console.log(
                `ProgramsAndCourses.vue - Course Package Response for Program ${program._id}: `,
                coursePackageResponse
              )
              // Fetch the courses for each course package
              const coursesResponse = await axios.get(
                `${import.meta.env.VITE_API_URL}/api/coursePackage/${program.coursePackage}/courses`
              )
              console.log(
                `ProgramsAndCourses.vue - Courses Response for Course Package ${program.coursePackage}: `,
                coursesResponse
              )
              return {
                ...program,
                coursePackage: {
                  ...coursePackageResponse.data,
                  courses: coursesResponse.data,
                },
              }
            })
          )
        } catch (error) {
          console.error('Error fetching programs:', error)
        }
      },
    },
    mounted() {
      this.fetchPrograms()
    },
  }
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

  h3 {
    color: #555;
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
