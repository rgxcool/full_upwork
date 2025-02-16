<template>
  <div class="hierarchy-manager">
    <h1>Add Individual Course to Student</h1>
    <br /><br />

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
    <br /><br />

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
      <br /><br />

      <button class="btn btn-primary" @click="handleAddCourse">Add Course to Student</button>
    </div>
  </div>
</template>

<script>
  import axios from 'axios'
  import { ref, onMounted, computed } from 'vue'

  export default {
    setup() {
      const students = ref([])
      const selectedStudent = ref(null)
      const searchQuery = ref('')

      // Fetch students data on mount
      onMounted(async () => {
        try {
          console.log('🔍 Fetching students...')
          const response = await fetch(`${import.meta.env.VITE_API_URL}/api/students`)
          students.value = await response.json()
          console.log('✅ Students loaded:', students.value)
        } catch (error) {
          console.error('❌ Error fetching students:', error)
        }
      })

      return {
        students,
        selectedStudent,
        searchQuery,
      }
    },
    data() {
      return {
        programs: [],
        selectedProgram: null,
        allCourses: [],
        selectedIndividualCourse: null,
      }
    },
    methods: {
      resetForm() {
        this.selectedProgram = null
        this.selectedIndividualCourse = null
        this.selectedStudent = null
        this.allCourses = []
      },
      async fetchPrograms() {
        try {
          console.log('🔍 Fetching programs...')
          const response = await axios.get(`${import.meta.env.VITE_API_URL}/api/programs`)
          this.programs = response.data
          console.log('✅ Programs loaded:', this.programs)
        } catch (error) {
          console.error('❌ Error fetching programs:', error)
          alert('Failed to fetch programs.')
        }
      },
      async fetchAllCourses() {
        if (!this.selectedProgram) {
          console.warn('⚠️ No program selected.')
          return
        }

        try {
          console.log(`🔍 Fetching courses for Program ID: ${this.selectedProgram}`)
          const response = await axios.get(
            `${import.meta.env.VITE_API_URL}/api/program/${this.selectedProgram}/courses`
          )

          if (!response.data || !Array.isArray(response.data)) {
            console.error('❌ Invalid response structure:', response)
            alert('Invalid course data received.')
            return
          }

          this.allCourses = response.data.map((course) => ({
            ...course,
            displayText: `${course.courseName} (${course.courseCode || 'No Code'})`,
          }))

          console.log('✅ Courses loaded:', this.allCourses)
        } catch (error) {
          console.error('❌ Error fetching courses:', error)
          alert('Failed to fetch courses for the selected program.')
        }
      },
      async handleAddCourse() {
        if (!this.selectedStudent || !this.selectedStudent._id) {
          alert('❌ Please select a valid student.')
          return
        }
        if (!this.selectedIndividualCourse) {
          alert('❌ Please select a course.')
          return
        }

        try {
          console.log(
            `🔍 Adding course ${this.selectedIndividualCourse} to student ${this.selectedStudent._id}`
          )
          await axios.post(
            `${import.meta.env.VITE_API_URL}/api/student/${this.selectedStudent._id}/addcourse`,
            { courseId: this.selectedIndividualCourse }
          )
          alert('✅ Course added successfully.')
          this.resetForm()
        } catch (error) {
          console.error('❌ Error adding course:', error)
          alert('Failed to add course.')
        }
      },
    },
    mounted() {
      this.fetchPrograms()
    },
    computed: {
      filteredStudents() {
        if (!this.searchQuery.trim()) {
          return [] // Show nothing when input is empty
        }
        return this.students
          .filter((student) => student.name.toLowerCase().includes(this.searchQuery.toLowerCase()))
          .slice(0, 10) // Limit results for performance
      },
    },
  }
</script>

<style scoped>
  .hierarchy-manager {
    min-height: 500px;
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
