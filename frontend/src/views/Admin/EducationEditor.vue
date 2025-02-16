<template>
  <div class="hierarchy-manager">
    <h1>Add Individual Course to Student</h1>
    <br /><br />

    <!-- Bootstrap Flash Alert -->
    <div
      v-if="successMessage"
      class="alert alert-success alert-dismissible fade show"
      role="alert"
      style="position: absolute; top: 60px; left: 50%; transform: translateX(-50%); z-index: 1050"
    >
      {{ successMessage }}
      <button type="button" class="btn-close" @click="successMessage = ''"></button>
    </div>

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
  import { ref, computed, onMounted } from 'vue'

  export default {
    setup() {
      const students = ref([])
      const programs = ref([])
      const allCourses = ref([])
      const selectedStudent = ref(null)
      const selectedProgram = ref(null) // ✅ Ensure selectedProgram is in setup()
      const selectedIndividualCourse = ref(null)
      const searchQuery = ref('')
      const isLoading = ref(false)
      const successMessage = ref('')

      // ✅ Fetch programs
      const fetchPrograms = async () => {
        try {
          console.log('🔍 Fetching programs...')
          const response = await axios.get(`${import.meta.env.VITE_API_URL}/api/programs`)
          programs.value = response.data
          console.log('✅ Programs loaded:', programs.value)
        } catch (error) {
          console.error('❌ Error fetching programs:', error)
          alert('Failed to fetch programs.')
        }
      }

      // ✅ Fetch students
      const fetchStudents = async () => {
        if (isLoading.value) return
        isLoading.value = true

        try {
          console.log('🔍 Fetching students...')
          const response = await axios.get(`${import.meta.env.VITE_API_URL}/api/students`)
          students.value = response.data
          console.log('✅ Students loaded:', students.value)
        } catch (error) {
          console.error('❌ Error fetching students:', error)
        } finally {
          isLoading.value = false
        }
      }

      // ✅ Fetch courses when program is selected
      const fetchAllCourses = async () => {
        if (!selectedProgram.value) {
          console.warn('⚠️ No program selected.')
          return
        }

        try {
          console.log(`🔍 Fetching courses for Program ID: ${selectedProgram.value}`)
          const response = await axios.get(
            `${import.meta.env.VITE_API_URL}/api/program/${selectedProgram.value}/courses`
          )

          if (!response.data || !Array.isArray(response.data)) {
            console.error('❌ Invalid response structure:', response)
            alert('Invalid course data received.')
            return
          }

          allCourses.value = response.data.map((course) => ({
            ...course,
            displayText: `${course.courseName} (${course.courseCode || 'No Code'})`,
          }))

          console.log('✅ Courses loaded:', allCourses.value)
        } catch (error) {
          console.error('❌ Error fetching courses:', error)
          alert('Failed to fetch courses for the selected program.')
        }
      }

      // ✅ Handle adding a course to a student
      const handleAddCourse = async () => {
        console.log('🟢 handleAddCourse() triggered') // ✅ Debugging
        if (!selectedStudent.value || !selectedStudent.value._id) {
          console.error('❌ No student selected')
          return
        }
        if (!selectedIndividualCourse.value) {
          console.error('❌ No course selected')
          return
        }

        try {
          console.log(
            `🔍 Adding course ${selectedIndividualCourse.value} to student ${selectedStudent.value._id}`
          )
          await axios.post(
            `${import.meta.env.VITE_API_URL}/api/student/${selectedStudent.value._id}/addcourse`,
            { courseId: selectedIndividualCourse.value }
          )
          console.log('✅ Course added successfully') // ✅ Confirm request
        } catch (error) {
          console.error('❌ Error adding course:', error)
        }
      }

      // ✅ Reset form
      const resetForm = () => {
        selectedProgram.value = null
        selectedIndividualCourse.value = null
        selectedStudent.value = null
        allCourses.value = []
      }

      // ✅ Computed property for filtering students
      const filteredStudents = computed(() => {
        if (!searchQuery.value.trim()) {
          return []
        }
        return students.value
          .filter((student) => student.name.toLowerCase().includes(searchQuery.value.toLowerCase()))
          .slice(0, 10)
      })

      // ✅ Load data on mount
      onMounted(() => {
        fetchStudents()
        fetchPrograms()
      })

      return {
        students,
        programs,
        allCourses,
        selectedStudent,
        selectedProgram,
        selectedIndividualCourse,
        searchQuery,
        fetchStudents,
        fetchAllCourses,
        handleAddCourse,
        successMessage,
        filteredStudents,
      }
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
