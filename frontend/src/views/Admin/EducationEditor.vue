<template>
  <div class="hierarchy-manager">
    <h1>Add Individual Course to Student</h1>
    <br />
    <br />
    <!-- Program Selection -->
    <div>
      <v-select
        v-model="selectedProgram"
        :items="programs"
        item-title="programName"
        item-value="_id"
        placeholder="Select program"
        @update:modelValue="fetchAllCourses"
        class="styled-select"
      />
    </div>
    <br />
    <br />
    <!-- Add Individual Course to Student -->
    <div>
      <v-select
        v-model="selectedIndividualCourse"
        :items="allCourses"
        item-title="displayText"
        item-value="_id"
        placeholder="Select course"
        class="styled-select"
      />
      <br />
      <!-- <input id="student-name" v-model="studentName" placeholder="Student Name" class="styled-input"/> -->
      <v-container>
        <v-form>
          <!-- Dropdown for selecting a student -->
          <v-autocomplete
            v-model="selectedStudent"
            :items="filteredStudents"
            :search="searchQuery"
            item-title="name"
            item-value="_id"
            label="Select a student"
            return-object
            outlined
            :menu-props="{ closeOnContentClick: false }"
            attach
            :no-data-text="'Please write student name'"
            @update:search="searchQuery = $event"
          />
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
        programs: [],
        selectedProgram: null,
        allCourses: [],
        studentName: '',
        studentId: '',
        selectedIndividualCourse: null,
        searchQuery: '', // ✅ Add this to make it reactive
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
        console.log('Selected Program:', this.selectedProgram) // Debugging

        if (!this.selectedProgram) {
          console.warn('No program selected.')
          return
        }

        try {
          console.log('Fetching courses for program ID:', this.selectedProgram)

          const response = await axios.get(
            `${import.meta.env.VITE_API_URL}/api/program/${this.selectedProgram}/courses`
          )

          if (!response.data || !Array.isArray(response.data)) {
            console.error('Unexpected response structure:', response)
            alert('Invalid course data received.')
            return
          }

          // Map the courses to a readable format
          this.allCourses = response.data.map((course) => ({
            ...course,
            displayText: `${course.courseName} (${course.courseCode || 'No Code'})`,
          }))

          console.log('Fetched courses:', this.allCourses)
        } catch (error) {
          console.error('Error fetching courses:', error)
          alert('Failed to fetch courses for the selected program.')
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

          await axios.post(
            `${import.meta.env.VITE_API_URL}/api/student/${this.studentId}/courses`,
            {
              courseId: this.selectedIndividualCourse,
            }
          )
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

          const response = await axios.post(
            `${import.meta.env.VITE_API_URL}/api/student/${this.studentId}/programs`,
            {
              programId: this.selectedProgram,
            }
          )
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
    computed: {
      filteredStudents() {
        if (!this.searchQuery || this.searchQuery.trim().length === 0) {
          return [] // ✅ Show nothing when input is empty
        }

        if (!Array.isArray(this.students) || this.students.length === 0) {
          return [] // ✅ Prevent errors if students data is empty
        }

        return this.students
          .filter((student) => student.name.toLowerCase().includes(this.searchQuery.toLowerCase()))
          .slice(0, 10) // ✅ Limit results to prevent lag
      },
    },
  }
</script>

<style scoped>
  .hierarchy-manager {
    min-height: 500px; /* Ensures enough vertical space */
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
