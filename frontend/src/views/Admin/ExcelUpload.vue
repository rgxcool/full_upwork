<template>
  <div class="scrollable-view">
    <div class="container">
      <!-- Upload success alert -->
      <div
        v-if="uploadSuccess"
        class="alert alert-success alert-dismissible fade show"
        role="alert"
        style="position: absolute; top: 60px; left: 50%; transform: translateX(-50%); z-index: 1050"
      >
        Students have been uploaded successfully!
      </div>

      <!-- File upload -->
      <!--
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
      -->
      <br />

      <div class="controls">
        <h2>Elever</h2>
        <input type="text" v-model="searchQuery" placeholder="Sök" class="mb-3 search-input" />
        <!-- 
        <button 
          v-if="$store.getters.isSystemAdmin" 
          class="btn btn-danger delete-all-btn" 
          @click="deleteAllStudents"
        >
          Delete All Students
        </button>
        -->
      </div>

      <!-- Student table -->
      <div class="table-container">
        <table v-if="filteredStudents.length > 0" class="dynamic-table">
          <thead>
            <tr>
              <th>Namn</th>
              <th>Personnummer</th>
              <th>Utbildning</th>
              <!-- <th>Edit</th> -->
              <th>Startdatum</th>
              <th>Slutdatum</th>
              <th>Slutprov</th>
              <th>Kommun</th>
              <th>Tel</th>
              <th>Email</th>
              <th>Övrigt</th>
              <th>Lärare</th>
              <!-- <th class="dropout-column">Avhopp</th> -->
              <!-- <th></th> -->
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
              <td class="course-cell">
                <div class="course-list">
                  <ul v-if="Array.isArray(student.education)">
                    <li v-for="edu in student.education" :key="edu._id || edu.refId?._id">
                      <strong>{{ edu.type }}:</strong>
                      {{ getEducationLabel(edu) }}
                      <span class="edu-grade">({{ edu.grade || '-' }})</span>
                    </li>
                  </ul>
                </div>
              </td>
              <!-- EDIT BUTTON
              <td>  
                <button class="btn btn-secondary btn-xs" @click="openEditStudent(student)">
                  Edit
                </button>
              </td>
              -->
              <td>{{ formatDate(student.startDate) }}</td>
              <td>{{ formatDate(student.endDate) }}</td>
              <td>{{ formatDate(student.finalExamDate) }}</td>
              <td>{{ student.municipality?.type || 'Ingen kommun' }}</td>
              <td>{{ student.phone }}</td>
              <td>{{ student.email }}</td>
              <td class="ovrigt-cell">
                <div class="comment-container" @click="toggleComment(student._id)">
                  <span
                    class="comment-text"
                    :class="{ truncated: !expandedComments.includes(student._id) }"
                    v-html="
                      formatComment(student.additionalInfo, expandedComments.includes(student._id))
                    "
                  ></span>
                  <span
                    v-if="
                      !expandedComments.includes(student._id) &&
                      student.additionalInfo?.length > 100
                    "
                    class="dots"
                  >
                    ⋯⋯⋯
                  </span>
                </div>
              </td>

              <td>{{ student.teacher }}</td>
              <!-- DROP OUT BUTTON
              <td class="dropout-column">
                <button
                  :class="['dropout-btn', student.dropout ? 'dropout-active' : 'dropout-inactive']"
                  @click="updateDropOut(student)"
                >
                  {{ student.dropout ? 'Avhopp' : 'Aktiv' }}
                </button>
              </td>
              <td>
                <button
                  class="btn btn-danger btn-xs delete-single-button"
                  @click="deleteStudent(student._id)"
                >
                  Delete
                </button>
              </td>
              -->
            </tr>
          </tbody>
        </table>
      </div>

      <!-- ✅ Fixed: Dialog moved OUTSIDE v-for loop -->
      <v-dialog v-model="editingStudentDialog" max-width="333px">
        <template #default>
          <v-card class="pa-4" v-if="editingStudent">
            <form @submit.prevent="saveEditedStudent">
              <div class="student-info-box">
                <p>
                  <strong>{{ editingStudent.name }}</strong>
                </p>
                <p>{{ editingStudent.email }}</p>
                <p>{{ editingStudent.phone }}</p>
                <p>{{ editingStudent.municipality?.type }}</p>
              </div>

              <h4>Utbildning</h4>
              <div
                v-for="(edu, index) in editingStudent.education.filter((e) => !e.removedAt)"
                :key="index"
                class="education-box"
              >
                <v-autocomplete
                  v-model="educationSelections[index]"
                  :items="educationOptions.filter((item) => item.type === 'Course')"
                  item-title="name"
                  return-object
                  label="Välj utbildning"
                  @update:modelValue="(val) => updateEducationEntry(val, index)"
                />

                <v-select
                  v-if="edu && edu.type === 'Course' && showGradeIndex === index"
                  v-model="edu.grade"
                  :items="['A', 'B', 'C', 'D', 'E', 'F']"
                  label="Select grade"
                />

                <div class="d-flex justify-center">
                  <div>
                    <label><strong>Låst</strong></label>
                    <input type="checkbox" v-model="edu.locked" />
                  </div>
                </div>

                <div class="education-controls">
                  <button
                    type="button"
                    class="btn btn-danger btn-xs left"
                    @click="confirmRemoveEducation(index)"
                  >
                    Ta bort
                  </button>
                  <button
                    type="button"
                    style="background-color: #007dc3ff; color: white"
                    class="btn btn-xs betyg-btn right"
                    @click="showGradeIndex = showGradeIndex === index ? null : index"
                  >
                    Betyg
                  </button>
                </div>
              </div>

              <!-- Handle adding a new education item -->
              <button
                v-if="!showEducationSelector"
                class="btn betyg-btn"
                style="width: 100%; background-color: #007dc3ff; color: white"
                @click.prevent="addEducation"
                type="button"
              >
                + Lägg till utbildning
              </button>

              <!-- Handle education selector -->
              <div v-if="showEducationSelector">
                <v-autocomplete
                  v-model="selectedEducation"
                  :items="educationOptions.filter((item) => item.type === 'Course')"
                  item-title="name"
                  return-object
                  label="Välj utbildning"
                />

                <button
                  class="btn btn-success btn-xs"
                  @click.prevent="confirmAddEducation"
                  type="button"
                >
                  Lägg till
                </button>
              </div>

              <!-- Other fields for final exam date, additional info -->
              <label for="finalExamDate" class="form-label">Slutprovdatum (24h)</label>
              <v-menu
                v-model="showFinalExamPicker"
                :close-on-content-click="false"
                offset-y
                transition=""
              >
                <template #activator="{ props }">
                  <v-text-field
                    v-bind="props"
                    v-model="formattedFinalExamDate"
                    label="Slutprovdatum"
                    readonly
                  />
                </template>
                <v-card min-width="300px" class="pa-2">
                  <v-date-picker
                    v-model="finalExamDate.date"
                    :reactive="false"
                    show-adjacent-months
                    color="primary"
                  />
                  <v-time-picker v-model="finalExamDate.time" format="24hr" />
                  <v-card-actions>
                    <v-spacer />
                    <v-btn color="green" @click="applyFinalExamDate">OK</v-btn>
                    <br />
                    <v-btn @click="showFinalExamPicker = false">Cancel</v-btn>
                  </v-card-actions>
                </v-card>
              </v-menu>

              <label for="additionalInfo" class="form-label">Kommentarer</label>
              <textarea
                id="additionalInfo"
                v-model="editingStudent.additionalInfo"
                placeholder="Skriv kommentarer här..."
                rows="3"
                class="highlighted-textarea"
                style="width: 100%"
              />

              <div class="education-controls">
                <button @click="cancelEdit" class="btn btn-secondary left" type="button">
                  Cancel
                </button>
                <button type="submit" class="btn btn-success right">Save</button>
              </div>
            </form>
          </v-card>
        </template>
      </v-dialog>
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
        editingStudentDialog: false,
        educationOptions: [],
        educationSelections: [],
        selectedEducation: null,
        showEducationSelector: false,
        showFinalExamPicker: false,
        finalExamDate: { date: null, time: null },
        formattedFinalExamDate: '',
        showGradeIndex: null,
        expandedComments: [],
      }
    },

    computed: {
      filteredStudents() {
        return this.students
          .map((student) => ({
            ...student,
            courses: student.courses || [],
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
      confirmRemoveEducation(index) {
        const confirmText = 'Är du säker på att du vill ta bort denna utbildning från eleven?'
        if (confirm(confirmText)) {
          this.removeEducation(index)
          this.saveEditedStudent() // 💾 Save immediately after removing
        }
      },

      getEducationLabel(edu) {
        // First try to use the name field (which we populated in the schema)
        if (edu.name) {
          return edu.name
        }

        // Fallback to refId if name is not available
        if (!edu.refId) return '(missing)'
        if (edu.type === 'Course') return edu.refId.courseName || '(no name)'
        if (edu.type === 'CoursePackage')
          return 'CoursePackage: ' + (edu.refId.coursePackageName || '(no name)')
        if (edu.type === 'Program') return edu.refId.programName || '(no name)'
        return '(invalid type)'
      },
      formatComment(text) {
        if (!text) return ''
        return text.replace(/\n/g, '<br />')
      },
      toggleComment(studentId) {
        if (this.expandedComments.includes(studentId)) {
          this.expandedComments = this.expandedComments.filter((id) => id !== studentId)
        } else {
          this.expandedComments.push(studentId)
        }
      },
      formatComment(text, expanded) {
        if (!text) return ''
        const safeText = text.replace(/</g, '&lt;').replace(/>/g, '&gt;')
        const display = expanded ? safeText : safeText.slice(0, 100)
        return display.replace(/\n/g, '<br />')
      },

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

      updateEducationSelection(val, index) {
        const current = this.editingStudent.education[index]
        this.editingStudent.education[index] = {
          ...current,
          type: val.type,
          name: val.name,
          refId: val.refId,
        }
      },

      updateEducationEntry(val, index) {
        const old = this.editingStudent.education[index]
        this.educationSelections.splice(index, 1, val)

        this.editingStudent.education[index] = {
          ...old,
          type: val.type,
          name: val.name, // name should already be a string
          refId: val.refId,
        }
      },

      applyFinalExamDate() {
        const { date, time } = this.finalExamDate

        if (!date || !time) {
          alert('Vänligen välj både datum och tid för slutprov.')
          return
        }

        // Convert raw `date` to ISO yyyy-mm-dd
        const parsedDate = new Date(date)
        if (isNaN(parsedDate.getTime())) {
          alert('❌ Ogiltigt datum.')
          return
        }

        const isoDatePart = parsedDate.toISOString().split('T')[0] // e.g., "2025-06-30"
        const isoString = `${isoDatePart}T${time}` // e.g., "2025-06-30T12:00"

        const finalDate = new Date(isoString)
        if (isNaN(finalDate.getTime())) {
          alert('❌ Ogiltigt kombinerat datum/tid.')
          return
        }

        this.editingStudent.finalExamDate = finalDate.toISOString()
        this.formattedFinalExamDate = `${isoDatePart} ${time}`
        this.showFinalExamPicker = false

        console.log('✅ Final ISO:', this.editingStudent.finalExamDate)
      },

      openEditStudent(student) {
        const clone = JSON.parse(JSON.stringify(student))

        if (typeof clone.municipality === 'string') {
          clone.municipality = { type: clone.municipality }
        } else if (!clone.municipality) {
          clone.municipality = { type: '' }
        }

        this.editingStudent = clone
        console.log(this.editingStudent, 'Current cloned student')
        this.editingStudentDialog = true // ✅ open the dialog

        this.educationSelections = clone.education.map((edu) => ({
          type: edu.type,
          name: edu.refId?.courseName || edu.name || '(unnamed)',
          refId: typeof edu.refId === 'object' ? edu.refId._id : edu.refId,
        }))

        if (clone.finalExamDate) {
          const dt = new Date(clone.finalExamDate)
          const date = dt.toISOString().slice(0, 10)
          const time = dt.toTimeString().slice(0, 5)
          const dateTimeString = `${date} ${time}`
          console.log('📅 Debug:', dateTimeString)

          this.finalExamDate.date = date
          this.finalExamDate.time = time
          this.formattedFinalExamDate = dateTimeString
          if (typeof clone.municipality === 'string') {
            clone.municipality = { type: clone.municipality }
          } else if (!clone.municipality) {
            clone.municipality = { type: '' }
          }
        } else {
          this.finalExamDate = { date: null, time: null }
          this.formattedFinalExamDate = ''
        }
      },

      // Save student after editing
      saveEditedStudent() {
        try {
          console.log('📤 Sending payload:', this.editingStudent)

          // 1. Save the edited student
          axios.put(
            `${import.meta.env.VITE_API_URL}/api/student/${this.editingStudent._id}`,
            this.editingStudent
          )

          // 2. Update frontend state immediately to reflect changes
          const updatedStudent = { ...this.editingStudent }

          // Find the student in the local list of students
          const index = this.students.findIndex((student) => student._id === updatedStudent._id)

          if (index !== -1) {
            // Replace the student data with the updated one
            this.students.splice(index, 1, updatedStudent)
          }

          // Close the dialog and reset the editingStudent data
          this.editingStudentDialog = false
          this.editingStudent = null
        } catch (error) {
          console.error('❌ Failed to update student:', error)
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
          const response = await api.post('uploads/upload/xlsxupload', formData, {
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

          if (error.response?.status === 422 && Array.isArray(error.response?.data?.reasons)) {
            const reasons = error.response.data.reasons
              .map((r) => `- ${r.student}: ${r.message}`)
              .join('\n')
            alert(`❌ Upload aborted due to unmatched courses:\n${reasons}`)
          } else if (error.response?.status === 409) {
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

          // Get student data and populate this.students
          this.students = response.data.map((student) => ({
            ...student,
            municipality: student.municipality || { type: '' },
            education: Array.isArray(student.education) ? student.education : [],
            courses: Array.isArray(student.courses) ? student.courses : [],
          }))
        } catch (error) {
          console.error('❌ Failed to fetch students:', error.response?.data || error)
          alert('Failed to fetch students.')
        }
      },

      async fetchEducationOptions() {
        try {
          const [programsRes, packagesRes, coursesRes] = await Promise.all([
            axios.get(`${import.meta.env.VITE_API_URL}/api/all-programs`, {
              withCredentials: true,
            }),
            axios.get(`${import.meta.env.VITE_API_URL}/api/all-course-packages`, {
              withCredentials: true,
            }),
            axios.get(`${import.meta.env.VITE_API_URL}/api/all-courses`, { withCredentials: true }),
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
              name: `${c.courseName}${c.courseCode ? ` (${c.courseCode})` : ''}`,
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
        this.showEducationSelector = true
      },

      confirmAddEducation() {
        if (!this.selectedEducation) return

        const { type, name, refId } = this.selectedEducation

        this.editingStudent.education.push({
          type,
          name,
          refId,
          addedAt: new Date(),
          addedBy: this.$store.state.user?.name || 'unknown',
          grade: '', // ✅ Explicit default
          municipality: this.editingStudent?.municipality || { type: '' },
          removedAt: null,
        })

        this.educationSelections.push({ type, name, refId })

        this.selectedEducation = null
        this.showEducationSelector = false
      },

      cancelEdit() {
        this.editingStudentDialog = false
        this.editingStudent = null
        this.selectedEducation = null
        this.educationSelections = []
        this.finalExamDate = { date: null, time: null }
        this.formattedFinalExamDate = ''
        this.showGradeIndex = null // 🔁 Reset grade toggles
      },

      removeEducation(index) {
        const edu = this.editingStudent.education[index]
        if (edu) {
          edu.removedAt = new Date().toISOString() // 🕒 Soft delete marker
        }
      },
    },
    mounted() {
      this.fetchStudents()
      this.fetchEducationOptions()
    },
  }
</script>

<style scoped>
  .align-right {
    margin-left: auto; /* Pushes the content to the right */
  }

  .justify-center {
    justify-content: center; /* Centers the checkbox horizontally */
  }

  .align-center {
    align-items: center; /* Centers the checkbox vertically */
  }

  /* Fix dialog clipping */
  .v-overlay__content {
    z-index: 3000 !important;
    position: fixed !important;
  }

  .betyg-btn {
    transition: background-color 0.3s ease, color 0.3s ease;
  }

  .betyg-btn:hover {
    background-color: #0056b3 !important;
    color: white !important;
  }

  .comment-display {
    white-space: pre-wrap;
    word-break: break-word;
    font-family: inherit;
  }

  .comment-container {
    max-width: none;
    cursor: pointer;
    position: relative;
    color: #333;
  }

  .comment-text.truncated {
    display: inline;
    white-space: nowrap;
  }

  .dots {
    color: green;
    font-weight: bold;
    margin-left: 4px;
  }

  .education-box {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    position: relative;
  }

  .education-controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .education-controls .left {
    margin-right: auto;
  }

  .education-controls .right {
    margin-left: auto;
  }

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
    max-height: 59vh;
    /* ✅ Adjust height as needed */
    overflow-x: auto;
    /* ✅ Keeps horizontal scrolling */
    overflow-y: auto;
    /* ✅ Enables vertical scrolling */
    border: 1px solid #ddd;
    /* ✅ Adds a border for clarity */
  }

  /* Ensures table header stays visible while scrolling */
  .dynamic-table thead {
    position: sticky;
    top: 0;
    background-color: white;
    /* ✅ Ensures header is readable */
    z-index: 2;
  }

  .dynamic-table {
    width: max-content;
    min-width: 100%;
    table-layout: auto;
    border-collapse: collapse;
  }

  th,
  td {
    padding: 4px 6px;
    /* Reduce padding */
    line-height: 1.2;
    /* Slightly tighter spacing */
    text-align: left;
    /* Ensure left alignment */
    vertical-align: top;
    /* Align to top so multi-line Övrigt expands downward */
    white-space: nowrap;
    /* Prevents unwanted wrapping by default */
    border: 1px solid #ddd;
    /* Add border */
  }

  /* Do not wrap inside the Övrigt column */
  td.ovrigt-cell,
  td.ovrigt-cell * {
    white-space: nowrap !important;
  }

  .course-list ul,
  .coursepackage-list ul {
    display: block;
    /* Ensure list items stack properly */
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: flex-start;
    max-height: none;
    /* ✅ Remove height restriction */
    overflow: visible;
    /* ✅ Ensure all items are visible */
    list-style: none;
    padding: 0;
    margin: 0;
    text-align: left;
  }

  .course-list li,
  .coursepackage-list {
    display: block;
    /* ✅ Ensure items stack */
    margin-bottom: 4px;
    /* ✅ Space between course names */
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
    padding: 2px 6px;
    /* Smaller padding */
    font-size: 10px;
    /* Smaller text */
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
    max-height: 500px;
    /* ✅ max height */
    overflow-y: auto;
    /* ✅ enable vertical scroll */
    max-width: 500px;
    width: 100%;
  }

  .edit-dialog form > * {
    display: block;
    width: 100%;
    margin-bottom: 10px;
  }

  .highlighted-textarea {
    border: 2px solid #007bff;
    border-radius: 6px;
    padding: 10px;
    font-size: 14px;
    background-color: #f9fcff;
    transition: border-color 0.3s, box-shadow 0.3s;
  }

  .highlighted-textarea:focus {
    border-color: #0056b3;
    outline: none;
    box-shadow: 0 0 5px rgba(0, 123, 255, 0.4);
  }

  .form-label {
    font-weight: bold;
    margin-bottom: 5px;
    display: block;
  }

  .section-heading {
    font-size: 16px;
    font-weight: bold;
    margin: 15px 0 5px 0;
  }

  .student-info-box {
    border: 1px solid #ccc;
    padding: 12px;
    border-radius: 8px;
    background-color: #f7f9fa;
    margin-bottom: 3px;
  }

  .student-info-box p {
    margin: 0;
  }

  .education-box {
    border: 1px solid #d2e3fc;
    border-left: 4px solid #4285f4;
    padding: 12px;
    border-radius: 6px;
    background-color: #f8fbff;
  }
</style>
