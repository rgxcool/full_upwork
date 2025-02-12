<template>
  <div class="hierarchy-manager">
    <h1>Add Individual Course to Student</h1>
    <br />
    <br />
    <!-- Program Selection -->
    <div>
      <v-select v-model="selectedProgram" :items="programs" item-title="programName" item-value="_id" placeholder="Select program" @update:modelValue="fetchAllCourses" class="styled-select" />
    </div>
    <br />
    <br />
    <!-- Add Individual Course to Student -->
    <div>
      <v-select v-model="selectedIndividualCourse" :items="allCourses" item-title="displayText" item-value="_id" placeholder="Select course" class="styled-select" />
      <br />
      <!-- <input id="student-name" v-model="studentName" placeholder="Student Name" class="styled-input"/> -->
      <v-container>
        <v-form>
          <!-- Dropdown for selecting a student -->
          <v-select v-model="selectedStudent" :items="students" item-title="namn" item-value="_id" label="Select a student" return-object outlined />
        </v-form>
      </v-container>
      <br />
      <br />
      <button class="btn btn-primary" @click="handleAddCourse">Add Course to Student</button>
    </div>
  </div>
</template>

<script>
  import axios from 'axios'
  import { ref, onMounted } from 'vue'

  export default {
    setup() {
      const students = ref([])
      const selectedStudent = ref(null)

      // Fetch students data (use your actual API here)
      onMounted(async () => {
        try {
          const response = await fetch(`${import.meta.env.VITE_API_URL}/api/students`)
          const data = await response.json()
          students.value = data // Assuming the response has a list of students
        } catch (error) {
          console.error('Error fetching students:', error)
        }
      })

      return { students, selectedStudent }
    },
    data() {
      return {
        programs: [], // List of programs
        selectedProgram: null, // Selected program ID
        allCourses: [], // List of all courses for the selected program
        studentName: '', // Name of the student
        studentId: '', // ID of the student (fetched from backend)
        selectedIndividualCourse: null, // Selected course ID,
      }
    },
    methods: {
      resetForm() {
        // Reset all relevant fields to their initial values
        this.selectedProgram = null
        this.selectedIndividualCourse = null
        this.studentName = ''
        this.allCourses = [] // Optionally clear the courses list if needed
      },
      async fetchPrograms() {
        try {
          const response = await axios.get(`${import.meta.env.VITE_API_URL}/api/programs`)
          this.programs = response.data
        } catch (error) {
          console.error('Error fetching programs:', error)
          alert('Failed to fetch programs.')
        }
      },

      async fetchAllCourses() {
        console.log('Selected Program:', this.selectedProgram) // Debug
        if (this.selectedProgram) {
          try {
            console.log('Fetching courses for program ID:', this.selectedProgram) // Debug
            const response = await axios.get(`${import.meta.env.VITE_API_URL}/api/programs/${this.selectedProgram}/courses`)

            // Ensure each course has a display text that combines name and code
            this.allCourses = response.data.map((course) => ({
              ...course,
              displayText: `${course.courseName}(${course.courseCode || 'No Code'})`,
            }))

            console.log('Fetched courses:', this.allCourses) // Debug
          } catch (error) {
            console.error('Error fetching courses:', error)
            alert('Failed to fetch courses for the selected program.')
          }
        }
      },

      async getStudentIdByName() {
        if (!this.selectedStudent || !this.selectedStudent._id) {
          alert('Please select a valid student.')
          return
        }
        this.studentId = this.selectedStudent._id
      },

      async addCourseToStudent() {
        try {
          if (!this.studentId) {
            alert('Please select a valid student.')
            return
          }

          if (!this.selectedIndividualCourse) {
            alert('Please select a course.')
            return
          }

          await axios.post(`${import.meta.env.VITE_API_URL}/api/students/${this.studentId}/courses`, { courseId: this.selectedIndividualCourse })
          alert(`Course added successfully.`)
        } catch (error) {
          console.error('Error adding course:', error)
          alert('Failed to add course.')
        }
      },

      async handleAddCourse() {
        try {
          if (!this.selectedStudent || !this.selectedStudent._id) {
            alert('Please select a student.')
            return
          }

          this.studentId = this.selectedStudent._id
          await this.addCourseToStudent()
          this.resetForm()
        } catch (error) {
          console.error('Error handling add course:', error)
        }
      },

      async addProgramToStudent() {
        try {
          if (!this.selectedProgram) {
            alert('Please select a program.')
            return
          }

          await this.getStudentIdByName()

          if (!this.studentId) {
            alert('Invalid student. Please check the student name.')
            return
          }

          const response = await axios.post(`${import.meta.env.VITE_API_URL}/api/students/${this.studentId}/programs`, { programId: this.selectedProgram })
          alert(`${response.data} - Program and courses added successfully.`)
        } catch (error) {
          console.error('Error adding program:', error)
          alert('Failed to add program to the student.')
        }
      },
    },

    mounted() {
      this.fetchPrograms() // Fetch programs when component is mounted
    },
  }
</script>

<style scoped>
  .hierarchy-manager {
    padding: 20px;
  }

  .styled-select {
    border: 2px solid #333;
    border-radius: 4px;
    padding: 8px;
    width: 50%;
    font-size: 16px;
  }

  .styled-input {
    border: 2px solid #333;
    border-radius: 4px;
    padding: 8px;
    width: 300px;
    font-size: 16px;
  }
</style>
