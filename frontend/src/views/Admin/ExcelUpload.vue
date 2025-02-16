<template>
  <div class="container">
    <div
      v-if="uploadSuccess"
      class="alert alert-success alert-dismissible fade show"
      role="alert"
      style="position: absolute; top: 60px; left: 50%; transform: translateX(-50%); z-index: 1050"
    >
      Students have been uploaded successfully!
    </div>

    <!-- File input and button on the same line -->
    <div class="form-container">
      <form @submit.prevent="uploadFile">
        <div class="file-input-wrapper">
          <label for="fileUpload" class="custom-file-label">Choose File</label>
          <span class="file-name">{{ selectedFileName || 'No file selected' }}</span>
          <input type="file" id="fileUpload" @change="handleFileUpload" hidden />
          <button class="btn btn-primary" type="submit">Upload</button>
        </div>
      </form>
    </div>

    <br />

    <div class="controls">
      <h2>Students</h2>
      <input type="text" v-model="searchQuery" placeholder="Search" class="mb-3 search-input" />

      <!-- Delete All Students Button -->
      <button class="btn btn-danger delete-all-btn" @click="deleteAllStudents">
        Delete All Students
      </button>
    </div>

    <div class="table-container">
      <table v-if="filteredStudents.length > 0" class="dynamic-table">
        <thead>
          <tr>
            <th>Namn</th>
            <th>Personnummer</th>
            <!-- <th>Course Packages</th> -->
            <th>Utbildning</th>
            <th>Startdatum</th>
            <th>Slutdatum</th>
            <th>Slutprovsdatum</th>
            <th>Kommun</th>
            <th>Tel</th>
            <th>Email</th>
            <th>Övrigt</th>
            <th>Lärare</th>
            <th class="dropout-column">Avhopp</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="student in filteredStudents"
            :key="student._id"
            :class="{ 'dropout-row': student.dropout }"
          >
            <td>{{ student.name }}</td>
            <td>{{ student.personalNumber }}</td>

            <!-- <td class="coursepackage-cell">
              <div class="coursepackage-list">
                <ul>
                  <li
                    v-for="(coursePackage, index) in student.coursePackages"
                    :key="'package-' + index"
                  >
                    {{
                      coursePackage.coursePackageId?.coursePackageName || 'No course package name'
                    }}
                  </li>
                </ul>
              </div>
            </td> -->

            <td class="course-cell">
              <div class="course-list">
                <ul>
                  <!-- ✅ Ensure Vue properly iterates over all courses -->
                  <li v-for="(course, index) in student.courses" :key="'course-' + index">
                    <!-- ✅ Check if course.courseId exists -->
                    {{ course.courseId?.courseName || 'No course name' }}
                    <span v-if="course.courseId?.courseCode">
                      - {{ course.courseId.courseCode }}
                    </span>
                  </li>
                </ul>
              </div>
            </td>

            <td>{{ formatDate(student.startDate) }}</td>
            <td>{{ formatDate(student.endDate) }}</td>
            <td>{{ formatDate(student.finalExamDate) }}</td>
            <td>{{ student.municipality }}</td>
            <td>{{ student.phone }}</td>
            <td>{{ student.email }}</td>
            <td>{{ student.additionalInfo }}</td>
            <td>{{ student.teacher }}</td>
            <td class="dropout-column">
              <button
                :class="['dropout-btn', student.dropout ? 'dropout-active' : 'dropout-inactive']"
                @click="updateDropOut(student)"
              >
                {{ student.dropout ? 'Avhopp' : 'Aktiv' }}
              </button>
            </td>

            <td>
              <!-- Delete Single Student Button -->
              <button class="btn btn-danger btn-xs" @click="deleteStudent(student._id)">
                Delete
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script>
  import axios from 'axios'

  export default {
    data() {
      return {
        file: null,
        students: [],
        searchQuery: '',
        selectedFileName: '',
        uploadSuccess: false,
      }
    },

    computed: {
      filteredStudents() {
        //console.log('🔎 Debugging student courses in computed property:', this.students)
        return this.students
          .map((student) => ({
            ...student,
            courses: student.courses || [], // Ensure courses array is always iterable
          }))
          .filter((student) => {
            const query = this.searchQuery.toLowerCase()
            return Object.values(student).some((value) =>
              String(value).toLowerCase().includes(query)
            )
          })
      },
    },

    methods: {
      getCourseName(course) {
        //console.log('🔍 Debugging Course:', course) // See what's happening
        if (!course) return 'No course data'

        // Check for populated course object
        if (course.courseId && typeof course.courseId === 'object') {
          return course.courseId.courseName || 'Unnamed Course'
        }

        // Directly stored course name
        if (course.courseName) {
          return course.courseName
        }

        return 'Unknown Course'
      },

      handleFileUpload(event) {
        this.selectedFileName =
          event.target.files.length > 0 ? event.target.files[0].name : 'No file selected'
        this.file = event.target.files[0]
      },

      async uploadFile() {
        if (!this.file) {
          alert('Please select an Excel file to upload.')
          return
        }

        console.log('🟢 Starting file upload process...')

        const formData = new FormData()
        formData.append('file', this.file)

        try {
          const response = await axios.post(
            `${import.meta.env.VITE_API_URL}/api/upload/xlsxupload`,
            formData,
            {
              headers: { 'Content-Type': 'multipart/form-data' },
            }
          )

          console.log('Response:', response.data)
          this.uploadSuccess = true

          setTimeout(() => {
            this.uploadSuccess = false
          }, 3000)

          this.fetchStudents()
        } catch (error) {
          console.error('❌ Error uploading file:', error)
        }

        this.file = null
        this.selectedFileName = ''
        if (this.$refs.fileInput) {
          this.$refs.fileInput.value = '' // ✅ Reset input safely
        }
      },

      async updateDropOut(student) {
        try {
          const response = await axios.put(
            `${import.meta.env.VITE_API_URL}/api/student/${student._id}`,
            { dropout: !student.dropout }
          )

          console.log('Updated student data:', response.data)

          this.students = this.students.map((s) =>
            s._id === student._id ? { ...response.data } : s
          )
        } catch (error) {
          console.error('Error updating dropout status:', error)
          alert('Failed to update dropout status.')
        }
      },

      async deleteStudent(studentId) {
        if (!confirm('Are you sure you want to delete this student?')) return

        try {
          await axios.delete(`${import.meta.env.VITE_API_URL}/api/student/${studentId}`)
          console.log(`Deleted student with ID: ${studentId}`)
          this.students = this.students.filter((s) => s._id !== studentId)
        } catch (error) {
          console.error('Error deleting student:', error)
          alert('Failed to delete student.')
        }
      },

      async deleteAllStudents() {
        if (!confirm('⚠️ Are you sure you want to delete ALL students? This cannot be undone.'))
          return

        try {
          await axios.delete(`${import.meta.env.VITE_API_URL}/api/students`)
          console.log('🚨 All students deleted!')
          this.students = []
        } catch (error) {
          console.error('Error deleting all students:', error)
          alert('Failed to delete all students.')
        }
      },

      async fetchStudents() {
        try {
          //console.log('📡 Fetching from API:', `${import.meta.env.VITE_API_URL}/api/students`)
          const response = await axios.get(`${import.meta.env.VITE_API_URL}/api/students`)

          //console.log('API Response for students:', response.data)

          // ✅ Force Vue reactivity by mapping courses properly
          this.students = response.data.map((student) => ({
            ...student,
            courses: student.courses ? [...student.courses] : [],
          }))
        } catch (error) {
          alert('Failed to fetch students.')
        }
      },
      formatDate(value) {
        if (!value) return ''
        if (typeof value === 'string' && value.includes('T')) return value.split('T')[0]
        return value
      },
    },

    mounted() {
      this.fetchStudents()
    },
  }
</script>

<style scoped>
  .dropout-row {
    background-color: rgba(255, 0, 0, 0.2);
  }
  /* Dropout Button Styling */
  .dropout-btn {
    display: inline-block;
    width: 70px;
    padding: 0px;
    font-size: 14px;
    font-weight: bold;
    text-align: center;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    transition: background 0.3s ease, color 0.3s ease;
  }

  /* Dropout is Active */
  .dropout-active {
    background-color: #dc3545;
    color: white;
  }

  /* Dropout is Inactive */
  .dropout-inactive {
    background-color: #28a745;
    color: white;
  }

  /* Hover Effects */
  .dropout-btn:hover {
    opacity: 0.8;
  }

  .custom-checkbox:checked {
    accent-color: red;
  }

  .container {
    width: 100%;
    max-width: 100%;
    margin: 0 auto;
    padding: 20px;
    box-sizing: border-box;
  }

  .table-container {
    width: 100%;
    overflow-x: auto; /* Enables horizontal scrolling if needed */
  }

  .dynamic-table {
    width: 100%;
    table-layout: auto;
    border-collapse: collapse;
  }
  th,
  td {
    padding: 4px 6px; /* Reduce padding */
    line-height: 1.2; /* Slightly tighter spacing */
    text-align: left; /* Ensure left alignment */
    vertical-align: middle; /* Center content vertically */
    white-space: nowrap; /* Prevents unwanted wrapping */
    border: 1px solid #ddd; /* Add border */
  }

  .course-list ul,
  .coursepackage-list ul {
    display: block; /* Ensure list items stack properly */
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: flex-start;
    max-height: none; /* ✅ Remove height restriction */
    overflow: visible; /* ✅ Ensure all items are visible */
    list-style: none;
    padding: 0;
    margin: 0;
    text-align: left;
  }

  .course-list li,
  .coursepackage-list {
    display: block; /* ✅ Ensure items stack */
    margin-bottom: 4px; /* ✅ Space between course names */
  }

  .custom-file-label {
    display: inline-block;
    padding: 8px 12px;
    background-color: #007bff;
    color: white;
    cursor: pointer;
    border-radius: 5px;
    transition: background-color 0.2s ease-in-out;
  }

  .custom-file-label:hover {
    background-color: #0056b3;
  }

  .btn-primary {
    padding: 8px 12px;
    background-color: #007bff;
    color: white;
    border: none;
    border-radius: 5px;
    cursor: pointer;
  }

  .btn-primary:hover {
    background-color: #0056b3;
  }

  .btn-xs {
    padding: 2px 6px; /* Smaller padding */
    font-size: 10px; /* Smaller text */
    line-height: 1;
  }
</style>
