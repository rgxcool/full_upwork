<template>
  <div class="programs-container">
    <h1>Programs and Courses</h1>
    <div v-if="programs.length">
      <div v-for="program in programs" :key="program._id" class="program">
        <h2>{{ program.programName }}</h2>
        <div
          v-if="program.programCoursePackages && program.programCoursePackages.length"
        >
          <div
            v-for="coursePackage in program.programCoursePackages"
            :key="coursePackage._id"
          >
            <h3>- {{ coursePackage.coursePackageName }}</h3>
            <ul>
              <li
                v-for="course in coursePackage.coursePackageCourses"
                :key="course._id"
              >
                * {{ course.courseName }} ({{ course.courseCode }})
              </li>
            </ul>
          </div>
        </div>
        <p v-else>No course package available for this program.</p>
      </div>
    </div>
    <div v-else>
      <p>Loading programs...</p>
    </div>

    <h1>All Courses</h1>
    <div v-if="courses.length">
      <ul>
        <li v-for="course in courses" :key="course._id">
          {{ course.courseName }} ({{ course.courseCode }})
        </li>
      </ul>
    </div>
    <div v-else>
      <p>Loading courses...</p>
    </div>
  </div>
</template>

<script>
  import axios from 'axios'

  export default {
    data() {
      return {
        programs: [], // Stores programs and their course packages and courses
        courses: [], // Stores all courses separately
      }
    },
    methods: {
      async fetchPrograms() {
        try {
          const response = await axios.get(
            `${import.meta.env.VITE_API_URL}/api/programs`
          )
          this.programs = await Promise.all(
            response.data.map(async (program) => {
              const coursePackages = await this.fetchCoursePackagesForProgram(
                program._id
              )
              return { ...program, programCoursePackages: coursePackages }
            })
          )
        } catch (error) {
          console.error('Error fetching programs:', error)
        }
      },
      async fetchCoursePackagesForProgram(programId) {
        try {
          const response = await axios.get(
            `${import.meta.env.VITE_API_URL}/api/coursePackages?programId=${programId}`
          )
          return response.data
        } catch (error) {
          console.error(
            `Error fetching course packages for program ${programId}:`,
            error
          )
          return []
        }
      },
      async fetchAllCourses() {
        try {
          const response = await axios.get(
            `${import.meta.env.VITE_API_URL}/api/courses`
          )
          this.courses = response.data
        } catch (error) {
          console.error('Error fetching all courses:', error)
        }
      },
    },
    mounted() {
      this.fetchPrograms()
      this.fetchAllCourses()
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
