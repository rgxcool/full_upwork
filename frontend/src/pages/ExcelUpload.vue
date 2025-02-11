<template>
  <div>
    <br />
    <h1 class="title">Lägg till elever</h1>
    <div
      v-if="uploadSuccess"
      class="alert alert-success alert-dismissible fade show"
      role="alert"
      style="position: absolute; top: 60px; left: 50%; transform: translateX(-50%); z-index: 1050"
    >
      Eleverna har laddats upp! ✅
    </div>

    <!-- File input and button on the same line -->
    <div class="form-container">
      <form @submit.prevent="uploadFile">
        <div class="file-input-wrapper">
          <label for="fileUpload" class="custom-file-label">Välj fil</label>
          <span class="file-name">{{ selectedFileName || 'Ingen fil vald' }}</span>
          <input type="file" id="fileUpload" @change="handleFileUpload" hidden />
          <button class="btn btn-primary" type="submit">Lägg till</button>
        </div>
      </form>
    </div>
    <br />
    <h2>Elever</h2>

    <input type="text" v-model="searchQuery" placeholder="Sök" class="mb-3 search-input" />

    <div class="table-container">
      <table v-if="filteredStudents.length > 0" class="dynamic-table">
        <thead>
          <tr>
            <th>Namn</th>
            <th>Personnummer</th>
            <!-- <th>Program</th> -->
            <th>Kurser</th>
            <th>Startdatum</th>
            <th>Slutdatum</th>
            <th>Slutprov</th>
            <th>Kommun</th>
            <th>Tel</th>
            <th>Email</th>
            <th>Prov</th>
            <th>Övrigt</th>
            <th>Lärare</th>
            <th class="avhopp-column">Avhopp</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="student in filteredStudents" :key="student._id" :class="{ 'dropout-row': student.dropout }">
            <td>
              <ul>
                <li>{{ student.namn }}</li>
              </ul>
            </td>
            <td>{{ student.personnummer }}</td>
            <!-- <td>{{ student.program }}</td> -->
            <td class="course-cell">
              <div class="course-list">
                <ul>
                  <li v-for="(kurs, index) in student.kurspaket" :key="index">
                    {{ kurs || 'No course name' }}
                  </li>
                  <li v-for="(kurs, index) in student.courses" :key="index">
                    {{ kurs.courseId.courseName || 'No course name' }}
                    <span v-if="kurs.courseId.courseCode"> - {{ kurs.courseId.courseCode }}</span>
                  </li>
                </ul>
              </div>
            </td>

            <td>
              {{ student.startDatum ? student.startDatum.split('T')[0] : '' }}
            </td>
            <td>
              {{ student.slutDatum ? student.slutDatum.split('T')[0] : '' }}
            </td>
            <td>
              {{ student.slutprovDatum ? student.slutprovDatum.split('T')[0] : '' }}
              <!-- {{
                student.slutprovDatum && student.slutprovDatum.includes("T")
                  ? student.slutprovDatum.split("T")[1].split(":")[0]
                  : ""
              }}{{
                student.slutprovDatum && student.slutprovDatum.includes("T")
                  ? student.slutprovDatum.split("T")[1].split(":")[1]
                  : ""
              }} -->
            </td>
            <td>{{ student.kommun }}</td>
            <td>{{ student.telefon }}</td>
            <td>{{ student.mail }}</td>
            <td>{{ student.prov }}</td>
            <td>{{ student.ovrigt }}</td>
            <td>{{ student.teacher }}</td>
            <td class="avhopp-column">
              <input type="checkbox" class="custom-checkbox" :checked="student.dropout" @change="updateDropOut(student)" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script>
  import axios from 'axios'
  // import { now } from "core-js/core/date";

  export default {
    data() {
      return {
        file: null,
        students: [],
        searchQuery: '',
        teacherName: '',
        selectedFileName: '', // Holds the selected file name
        uploadSuccess: false, // New state for success message
      }
    },

    computed: {
      filteredStudents() {
        const query = this.searchQuery.toLowerCase()

        return this.students
          .filter((student) => Object.values(student).some((value) => String(value).toLowerCase().includes(query)))
          .sort((a, b) => {
            const dateA = a.slutDatum ? new Date(a.slutDatum) : new Date(0)
            const dateB = b.slutDatum ? new Date(b.slutDatum) : new Date(0)
            return dateA - dateB // Sort descending (latest dates first)
          })
      },
    },

    methods: {
      handleFileUpload(event) {
        this.selectedFileName = event.target.files.length > 0 ? event.target.files[0].name : 'Ingen fil vald'
        this.file = event.target.files[0]
        if (this.file) {
          const filename = this.file.name
          const parts = filename.split(' ')
          this.teacherName = parts[parts.length - 1].split('.')[0]
        }
      },

      async uploadFile() {
        if (!this.file) {
          alert('Please select an Excel file to upload.')
          return
        }

        console.log('🟢 Starting file upload process...')

        const formData = new FormData()
        formData.append('file', this.file)

        // ✅ Send the raw file to the backend
        try {
          const response = await axios.post(`${process.env.VUE_APP_API_URL}/api/xlsxupload`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          })

          console.log('✅ Response:', response.data)
          this.uploadSuccess = true

          setTimeout(() => {
            this.uploadSuccess = false
          }, 3000)

          this.fetchStudents()
        } catch (error) {
          console.error('❌ Error uploading file:', error)
        }
      },

      async updateDropOut(student) {
        try {
          const updatedStudent = {
            ...student,
            dropout: !student.dropout, // Toggle the dropout status
          }

          const response = await axios.put(`${process.env.VUE_APP_API_URL}/api/students/${student._id}`, updatedStudent)

          console.log('Updated student dropout status:', response.data)

          // Update the local state to reflect the change
          this.students = this.students.map((s) => (s._id === student._id ? response.data : s))
        } catch (error) {
          console.error('Error updating dropout status:', error)
          alert('Failed to update dropout status.')
        }
      },

      async fetchStudents() {
        try {
          console.log('📡 Fetching from API:', process.env.VUE_APP_API_URL)
          console.log('📡 Fetching from URL:', `${process.env.VUE_APP_API_URL}/api/students`)
          const response = await axios.get(`${process.env.VUE_APP_API_URL}/api/students`)
          console.log('API Response for students:', response.data) // Debug
          this.students = response.data
        } catch (error) {
          alert('Failed to fetch students.')
        }
      },

      formatExcelDate(value) {
        if (!value) return null
        if (value === 'Se studieplan') return value
        return new Date(Math.round((value - 25569) * 86400 * 1000)).toISOString() // Convert Excel serial date to YYYY-MM-DD
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

  .custom-checkbox:checked {
    accent-color: red;
    /* Modern browsers support this for changing checkbox color */
  }

  /* Optional: Styling the label when the checkbox is checked */
  .custom-checkbox:checked + label {
    color: red;
  }

  /* Ensure the page does not expand beyond the viewport */
  html,
  body {
    width: 100%;
    max-width: 100vw;
    overflow-x: hidden;
    margin: 0;
    padding: 0;
  }

  /* Debugging tool: Remove after checking */
  * {
    box-sizing: border-box;
    /* outline: 1px solid red; */
    /* Uncomment to debug */
  }

  /* Ensure table headers and cells do not stretch beyond the viewport */
  table.dynamic-table th,
  table.dynamic-table td {
    padding-left: 6px;
    padding-right: 6px;
    text-align: left;
    border: 3px solid #ddd;
    white-space: nowrap;
    max-width: 500px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Fix table layout issues */
  table.dynamic-table th {
    background-color: #f4f4f4;
  }

  /* Prevent unnecessary padding/margin from affecting layout */
  .search-input {
    margin: 10px 0;
    padding: 8px;
    width: 100%;
    box-sizing: border-box;
    font-size: 1rem;
  }

  /* Default td styling */
  td {
    position: relative;
    max-width: 500px;
    /* Set an initial width */
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
  }

  /* Ensure the table container allows overflow */
  .table-container {
    overflow: visible !important;
  }

  /* Ensure table doesn't restrict visibility */
  table.dynamic-table {
    table-layout: auto;
    width: 100%;
    border-collapse: collapse;
  }

  /* When hovering over a td, allow it to expand */
  td:hover {
    max-width: 500px !important;
    white-space: normal !important;
    overflow: visible !important;
    z-index: 10;
    background: rgba(0, 0, 0, 0.05);
    /* Optional highlight effect */
  }

  ul {
    list-style-type: none;
    padding: 0;
    margin: 0;
  }

  li {
    text-align: left;
    padding: 0;
    margin: 0;
  }

  .form-container {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    height: 4vh;
    /* Full height */
  }

  /* File input wrapper */
  .file-input-wrapper {
    display: flex;
    align-items: center;
  }

  /* Display selected file name */
  .file-name {
    font-size: 1rem;
    color: #333;
  }

  .search-input {
    margin: 10px 0;
    padding: 8px;
    width: 50vh;
    box-sizing: border-box;
    font-size: 1rem;
    border: 2px solid #007bff;
    /* Blue border */
    border-radius: 5px;
    /* Rounded corners */
    outline: none;
    /* Removes default focus outline */
  }

  /* Highlight border when focused */
  .search-input:focus {
    border-color: #0056b3;
    /* Darker blue on focus */
    box-shadow: 0 0 5px rgba(0, 91, 187, 0.5);
    /* Subtle glow effect */
  }

  /* Center title */
  .title {
    font-size: 2rem;
    font-weight: bold;
    text-align: center;
    margin-bottom: 10px;
  }

  /* Style for both buttons */
  .button {
    display: inline-block;
    padding: 8px 12px;
    background-color: #007bff;
    color: white;
    cursor: pointer;
    border: none;
    border-radius: 5px;
    font-size: 1rem;
    text-align: center;
    transition: background-color 0.2s ease-in-out;
  }

  /* Hover effect */
  .button:hover {
    background-color: #0056b3;
  }

  /* Style file label like a button */
  .custom-file-label {
    display: inline-block;
    padding: 8px 12px;
    background-color: #007bff;
    color: white;
    cursor: pointer;
    border-radius: 5px;
    font-size: 1rem;
    text-align: center;
    transition: background-color 0.2s ease-in-out;
  }

  /* Hover effect for file label */
  .custom-file-label:hover {
    background-color: #0056b3;
  }

  /* Keep buttons aligned */
  .file-input-wrapper {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  /* Button styling */
  .btn-primary {
    padding: 8px 12px;
    background-color: #007bff;
    color: white;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    font-size: 1rem;
    margin-left: 10vh;
  }

  .btn-primary:hover {
    background-color: #0056b3;
  }

  /* Success message styling */
  .success-message {
    margin-top: 10px;
    padding: 10px 15px;
    background-color: #28a745;
    /* Green background */
    color: white;
    font-size: 1rem;
    text-align: center;
    border-radius: 5px;
    font-weight: bold;
    animation: fadeIn 0.5s ease-in-out;
  }

  /* Fade-in animation */
  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }

    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Increase the checkbox size */
  .custom-checkbox {
    width: 23px;
    height: 23px;
    cursor: pointer;
  }

  /* Ensure consistent column width */
  th.avhopp-column,
  td.avhopp-column {
    width: 80px;
    /* Adjust width as needed */
    min-width: 80px;
    max-width: 80px;
    text-align: center;
  }

  /* Center the checkbox within the cell */
  td.avhopp-column {
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .course-cell {
    max-width: 500px;
    /* Adjust width as needed */
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    position: relative;
  }

  .course-list {
    max-height: none;
    /* Limit height to fit one line */
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    transition: max-height 0.3s ease-in-out;
  }
</style>
