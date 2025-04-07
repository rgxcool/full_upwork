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
          <input type="file" id="fileUpload" ref="fileInput" @change="handleFileUpload" hidden />
          <button class="btn btn-primary" type="submit">Upload</button>
        </div>
      </form>
    </div>

    <br />

    <div class="controls">
      <h2>Elever</h2>
      <input type="text" v-model="searchQuery" placeholder="Sök" class="mb-3 search-input" />

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
            <th>Edit</th>
            <th>Startdatum</th>
            <th>Slutdatum</th>
            <th>Slutprovsdatum</th>
            <th>Kommun</th>
            <th>Tel</th>
            <th>Email</th>
            <th>Övrigt</th>
            <th>Lärare</th>
            <th class="dropout-column">Avhopp</th>
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
                <ul v-if="student.education && student.education.length">
                  <li v-for="(edu, index) in student.education" :key="'edu-' + index">
                    <strong>{{ edu.type }}:</strong> {{ edu.name }}
                    <span v-if="edu.grade"
                      ><strong>({{ edu.grade }})</strong></span
                    >
                  </li>
                </ul>

                <ul v-if="student.program && student.program.programId">
                  <li>
                    <strong>Program:</strong> {{ student.program.programId.programName }}
                    <span v-if="student.program.grade">({{ student.program.grade }})</span>
                  </li>
                </ul>

                <ul v-if="student.coursePackages && student.coursePackages.length">
                  <li v-for="(pkg, index) in student.coursePackages" :key="'pkg-' + index">
                    <strong>Package:</strong> {{ pkg.coursePackageId.coursePackageName }}
                    <span v-if="pkg.grade">({{ pkg.grade }})</span>
                  </li>
                </ul>

                <ul v-if="student.courses && student.courses.length">
                  <li v-for="(course, index) in student.courses" :key="'course-' + index">
                    {{ getCourseName(course) }}
                    <span v-if="course.grade">({{ course.grade }})</span>
                  </li>
                </ul>
              </div>
            </td>

            <td>
              <button class="btn btn-secondary btn-xs" @click="openEditStudent(student)">
                Edit
              </button>
            </td>
            <dialog v-if="editingStudent" class="edit-dialog" open>
              <h3>Edit Student</h3>
              <form @submit.prevent="saveEditedStudent">
                <input v-model="editingStudent.name" placeholder="Name" required />
                <input v-model="editingStudent.email" placeholder="Email" required />
                <input v-model="editingStudent.phone" placeholder="Phone" />
                <input v-model="editingStudent.municipality" placeholder="Municipality" />
                <h4>Utbildning</h4>
                <div v-for="(edu, index) in editingStudent.education" :key="index" class="mb-2">
                  <v-autocomplete
                    v-model="editingStudent.education[index]"
                    :items="educationOptions"
                    item-title="name"
                    return-object
                    label="Add or edit education"
                    class="mb-2"
                  />

                  <!-- Grade dropdown for courses -->
                  <v-select
                    v-if="edu.type === 'Course'"
                    v-model="edu.grade"
                    :items="['A', 'B', 'C', 'D', 'E', 'F']"
                    label="Select grade"
                    class="mt-2"
                  />

                  <button class="btn btn-danger btn-xs" @click="removeEducation(index)">
                    Ta bort
                  </button>
                </div>

                <button class="btn btn-sm btn-secondary mt-2" @click="addEducation">
                  + Lägg till utbildning
                </button>

                <textarea
                  v-model="editingStudent.additionalInfo"
                  placeholder="Info"
                  rows="3"
                ></textarea>

                <!-- Add more fields as needed -->

                <button type="submit" class="btn btn-success">Save</button>
                <button @click="cancelEdit" class="btn btn-secondary" type="button">Cancel</button>
              </form>
            </dialog>
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
              <button
                class="btn btn-danger btn-xs delete-single-button"
                @click="deleteStudent(student._id)"
              >
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
  import { api } from '../../store/store.js'

  export default {
    data() {
      return {
        file: null,
        students: [],
        searchQuery: '',
        selectedFileName: '',
        uploadSuccess: false,
        editingStudent: null,
        educationOptions: [],
      }
    },

    computed: {
      filteredStudents() {
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
      async saveGrade(studentId, courseId, grade) {
        try {
          const response = await axios.put(
            `${import.meta.env.VITE_API_URL}/api/student/${studentId}/education/${courseId}/grade`,
            { grade }
          )
          console.log('✅ Grade updated:', response.data)
        } catch (error) {
          console.error('❌ Error updating grade:', error)
        }
      },
      openEditStudent(student) {
        this.editingStudent = { ...student } // clone so editing doesn't mutate directly
      },
      cancelEdit() {
        this.editingStudent = null
      },
      async saveEditedStudent() {
        try {
          const { data } = await axios.put(
            `${import.meta.env.VITE_API_URL}/api/student/${this.editingStudent._id}`,
            this.editingStudent
          )
          const index = this.students.findIndex((s) => s._id === data._id)
          if (index !== -1) this.students.splice(index, 1, data)
          this.editingStudent = null
        } catch (err) {
          console.error('❌ Failed to update student:', err)
          alert('Could not save student.')
        }
      },
      getCourseName(course) {
        if (!course || !course.courseId) return 'No course data'
        return course.courseId.courseName || 'Unnamed Course'
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
          // ✅ Use api instance so cookies (JWT) are sent!
          const response = await api.post('/upload/xlsxupload', formData, {
            headers: {
              'Content-Type': 'multipart/form-data',
            },
          })

          console.log('✅ Upload successful:', response.data)
          this.uploadSuccess = true

          setTimeout(() => {
            this.uploadSuccess = false
          }, 3000)

          this.fetchStudents()
        } catch (error) {
          console.error('❌ Error uploading file:', error.response?.data?.error || error)

          if (error.response?.status === 409) {
            alert('⚠️ Some students were already in the system and were not added.')
          } else if (error.response?.status === 401) {
            alert('❌ Du är inte inloggad. Vänligen logga in igen.')
          } else {
            alert('❌ Failed to upload students.')
          }
        }

        this.file = null
        this.selectedFileName = ''
        if (this.$refs.fileInput) {
          this.$refs.fileInput.value = ''
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
          console.log(`🚨 Student deleted!: ${studentId}`)
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
        console.log('📡 fetchStudents called')

        try {
          const response = await axios.get(`${import.meta.env.VITE_API_URL}/api/students`, {
            withCredentials: true,
          })
          console.log('✅ Students fetched:', response.data)

          this.students = response.data.map((student) => ({
            ...student,
            courses: student.courses ? [...student.courses] : [],
          }))
        } catch (error) {
          console.error('❌ Failed to fetch students:', error.response?.data || error)
          alert('Failed to fetch students.')
        }
      },
      async fetchEducationOptions() {
        try {
          const [programsRes, packagesRes, coursesRes] = await Promise.all([
            axios.get(`${import.meta.env.VITE_API_URL}/api/programs`, { withCredentials: true }),
            axios.get(`${import.meta.env.VITE_API_URL}/api/course-packages`, {
              withCredentials: true,
            }),
            axios.get(`${import.meta.env.VITE_API_URL}/api/courses`, { withCredentials: true }),
          ])

          this.educationOptions = [
            ...programsRes.data.map((p) => ({
              type: 'Program',
              name: p.programName,
              refId: p._id,
            })),
            ...packagesRes.data.map((p) => ({
              type: 'CoursePackage',
              name: p.coursePackageName,
              refId: p._id,
            })),
            ...coursesRes.data.map((c) => ({
              type: 'Course',
              name: c.courseName,
              refId: c._id,
            })),
          ]

          console.log('📘 Loaded education options:', this.educationOptions)
        } catch (err) {
          console.error('❌ Failed to load education options:', err)
        }
      },
      formatDate(value) {
        if (!value) return ''
        if (typeof value === 'string' && value.includes('T')) return value.split('T')[0]
        return value
      },
      addEducation() {
        if (!this.editingStudent.education) this.editingStudent.education = []
        this.editingStudent.education.push({
          type: '',
          name: '',
          refId: null,
          addedAt: new Date(),
          addedBy: this.$store.state.user?.name || 'unknown',
          grade: null,
          removedAt: null,
        })
      },
      removeEducation(index) {
        this.editingStudent.education.splice(index, 1)
      },
    },

    mounted() {
      this.fetchStudents()
      this.fetchEducationOptions()
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
    max-height: 59vh; /* ✅ Adjust height as needed */
    overflow-x: auto; /* ✅ Keeps horizontal scrolling */
    overflow-y: auto; /* ✅ Enables vertical scrolling */
    border: 1px solid #ddd; /* ✅ Adds a border for clarity */
  }

  /* Ensures table header stays visible while scrolling */
  .dynamic-table thead {
    position: sticky;
    top: 0;
    background-color: white; /* ✅ Ensures header is readable */
    z-index: 2;
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
  .edit-dialog {
    position: fixed;
    top: 10%;
    left: 50%;
    transform: translateX(-50%);
    background: white;
    padding: 20px;
    border-radius: 10px;
    z-index: 2000;
    max-height: 500px; /* ✅ max height */
    overflow-y: auto; /* ✅ enable vertical scroll */
    max-width: 500px;
    width: 100%;
  }

  .edit-dialog form > * {
    display: block;
    width: 100%;
    margin-bottom: 10px;
  }
</style>
