<template>
  <div class="scrollable-view">
    <div class="course-matching-container">
      <div class="header-section">
        <h3 class="page-title">Kursmatchning</h3>
        <!-- Removed Tillbaka till Admin link and breadcrumb -->
      </div>

      <div class="content-grid">
        <!-- Batch Processing -->
        <div class="card">
          <div class="card-header">
            <h5>Batch-bearbetning av studenter</h5>
          </div>
          
          <div class="card-body">
          <!--   Debug section
            <div
              class="debug-info"
              style="background: #f0f0f0; padding: 10px; margin: 10px 0; border-radius: 5px"
            >
              <h6>Debug Info:</h6>
              <p>
                <strong>Is Logged In:</strong>
                {{ isLoggedIn }}
              </p>
              <p>
                <strong>User Role:</strong>
                {{ userRole }}
              </p>
              <p>
                <strong>Is Admin:</strong>
                {{ isAdmin }}
              </p>
              <p>
                <strong>API Base URL:</strong>
                {{ api.defaults.baseURL }}
              </p>
            </div>
            -->
            <div class="form-group">
              <label for="studentFile">Excel-fil med studenter:</label>
              <input
                type="file"
                id="studentFile"
                ref="studentFileInput"
                @change="handleFileChange"
                accept=".xlsx,.xls"
                class="form-control"
                style="display: none;"
              />
              <button type="button" class="btn btn-logo" @click="triggerFileSelect">
                Välj fil
              </button>
              <span class="selected-file-name" v-if="selectedFile">
                {{ selectedFile.name }}
              </span>
            </div>

            <div v-if="uploadedStudents.length > 0" class="upload-summary">
              <h6>Uppladdade studenter ({{ uploadedStudents.length }}):</h6>
              <div class="student-list scrollable-student-list">
                <div
                  v-for="(student, index) in uploadedStudents"
                  :key="index"
                  class="student-item"
                >
                  {{ student.name }} - {{ getEnrollmentCount(student.email) }} kurser
                </div>
              </div>
              <div v-if="uploadedStudents.length > 5" class="more-students">
                ... och {{ uploadedStudents.length - 5 }} till
              </div>
            </div>

            <button
              class="btn btn-success"
              @click="processStudents"
              :disabled="isProcessing || !selectedFile"
            >
              {{ isProcessing ? 'Bearbetar...' : 'Bearbeta studenter' }}
            </button>

            <div v-if="processingResults" class="processing-results">
              <h6>Bearbetningsresultat:</h6>
              <div class="result-stats">
                <div class="stat-item">
                  <span class="stat-label">Inskrivningar skapade:</span>
                  <span class="stat-value success">{{ processingResults.enrollments.length }}</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">Varningar:</span>
                  <span class="stat-value warning">{{ processingResults.warnings.length }}</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">Fel:</span>
                  <span class="stat-value error">{{ processingResults.errors.length }}</span>
                </div>
              </div>

              <!-- Scrollable list of created enrollments -->
              <div v-if="processingResults.enrollments.length > 0" class="enrollments-scroll-list">
                <h6>Skapade inskrivningar:</h6>
                <ul>
                  <li v-for="(enrollment, idx) in processingResults.enrollments" :key="enrollment._id || idx">
                    {{ enrollment.studentEmail }} –
                    <span v-if="enrollment.courseInstanceName">{{ enrollment.courseInstanceName }}</span>
                    <span v-else>kursinstans</span>
                    – {{ enrollment.startDate ? (new Date(enrollment.startDate)).toLocaleDateString() : '' }} till {{ enrollment.endDate ? (new Date(enrollment.endDate)).toLocaleDateString() : '' }} – {{ enrollment.status }}
                  </li>
                </ul>
              </div>

              <div v-if="processingResults.warnings.length > 0" class="warnings-section">
                <h6>Varningar:</h6>
                <div class="warning-list">
                  <div
                    v-for="(warning, index) in processingResults.warnings"
                    :key="index"
                    class="warning-item"
                  >
                    <strong>{{ warning.type }}:</strong>
                    {{ warning.message }}
                  </div>
                </div>
              </div>

              <div v-if="processingResults.errors.length > 0" class="errors-section">
                <h6>Fel:</h6>
                <div class="error-list">
                  <div
                    v-for="(error, index) in processingResults.errors"
                    :key="index"
                    class="error-item"
                  >
                    <strong>{{ error.courseName }}:</strong>
                    {{ error.error }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
  import { ref, onMounted, computed } from 'vue'
  import { api } from '@/store/store.js'
  import { useStore } from 'vuex'

  export default {
    name: 'CourseMatching',
    setup() {
      const store = useStore()
      const selectedFile = ref(null) // Store file here
      const uploadedStudents = ref([]) // Populated from backend response
      const isProcessing = ref(false)
      const processingResults = ref(null)
      const courses = ref([])
      // Remove statistics and statsFilters

      const studentFileInput = ref(null)

      const triggerFileSelect = () => {
        if (studentFileInput.value) studentFileInput.value.click()
      }

      const handleFileChange = (event) => {
        const file = event.target.files[0]
        if (!file) return
        selectedFile.value = file
        uploadedStudents.value = []
        processingResults.value = null
      }

      const processStudents = async () => {
        if (!selectedFile.value) return
        isProcessing.value = true
        try {
          const formData = new FormData()
          formData.append('file', selectedFile.value)
          const response = await api.post('/upload-students', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          })
          // Populate students and results from backend
          uploadedStudents.value = response.data.results.students || []
          processingResults.value = response.data.results || null
        } catch (error) {
          console.error('Error processing students:', error)
          if (error.response?.status === 422 && Array.isArray(error.response?.data?.reasons)) {
            const reasons = error.response.data.reasons
              .map(r => `- ${r.student}: ${r.message}`)
              .join('\n')
            alert(`Uppladdning avbröts p.g.a. omatchade kurser:\n${reasons}`)
          } else {
            alert('Ett fel uppstod vid bearbetning av studenter.')
          }
        } finally {
          isProcessing.value = false
        }
      }

      const loadCourses = async () => {
        try {
          const response = await api.get('/courses')
          courses.value = response.data
        } catch (error) {
          console.error('Error loading courses:', error)
        }
      }

      // Remove loadStatistics and statsFilters logic

      onMounted(() => {
        loadCourses()
      })

      // Computed properties for authentication status
      const isLoggedIn = computed(() => store.getters.isLoggedIn)
      const userRole = computed(() => store.getters.userRole)
      const isAdmin = computed(() => store.getters.isAdmin)

      // Helper to count enrollments per student
      const getEnrollmentCount = (email) => {
        if (!processingResults.value || !processingResults.value.enrollments) return 0;
        return processingResults.value.enrollments.filter(e => e.studentEmail === email).length;
      };

      return {
        isLoggedIn,
        userRole,
        isAdmin,
        api,
        studentFileInput,
        selectedFile,
        uploadedStudents,
        isProcessing,
        processingResults,
        courses,
        // Remove statistics and statsFilters from returned object
        handleFileChange,
        triggerFileSelect,
        processStudents,
        // Remove loadStatistics,
        getEnrollmentCount,
      }
    },
  }
</script>

<style scoped>
  .scrollable-view {
    width: 100%;
    height: 100%;
    overflow: auto;
    box-sizing: border-box;
    padding-bottom: 180px;
  }
  .course-matching-container {
    height: 100%;
    overflow: auto;
  }

  .header-section {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 30px;
  }

  .page-title {
    margin: 0;
    color: #2c3e50;
  }

  .breadcrumb {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .breadcrumb-link {
    color: #2c9316;
    text-decoration: none;
    font-weight: 500;
  }

  .content-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
    gap: 20px;
  }

  .card {
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    overflow: hidden;
  }

  .card-header {
    background: #f8f9fa;
    padding: 15px 20px;
    border-bottom: 1px solid #dee2e6;
  }

  .card-header h5 {
    margin: 0;
    color: #2c3e50;
  }

  .card-body {
    padding: 20px;
  }

  .form-group {
    margin-bottom: 15px;
  }

  .form-group label {
    font-weight: 500;
    margin-bottom: 5px;
    display: block;
  }

  .form-control {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 14px;
  }

  .threshold-value {
    margin-left: 10px;
    font-weight: bold;
    color: #2c9316;
  }

  .search-result {
    margin-top: 20px;
    padding: 15px;
    border-radius: 4px;
  }

  .match-success {
    background: #d4edda;
    border: 1px solid #c3e6cb;
    color: #155724;
  }

  .match-failure {
    background: #f8d7da;
    border: 1px solid #f5c6cb;
    color: #721c24;
  }

  .match-info {
    margin-bottom: 5px;
  }

  .upload-summary {
    margin: 15px 0;
    padding: 15px;
    background: #f8f9fa;
    border-radius: 4px;
  }

  .student-list {
    max-height: 150px;
    overflow-y: auto;
  }

  .student-item {
    padding: 5px 0;
    border-bottom: 1px solid #eee;
  }

  .more-students {
    font-style: italic;
    color: #666;
    padding: 5px 0;
  }

  .processing-results {
    margin-top: 20px;
    padding: 15px;
    background: #f8f9fa;
    border-radius: 4px;
  }

  .result-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 10px;
    margin-bottom: 15px;
  }

  .stat-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .stat-label {
    font-weight: 500;
  }

  .stat-value {
    font-weight: bold;
  }

  .stat-value.success {
    color: #28a745;
  }

  .stat-value.warning {
    color: #ffc107;
  }

  .stat-value.error {
    color: #dc3545;
  }

  .warnings-section,
  .errors-section {
    margin-top: 15px;
  }

  .warning-list,
  .error-list {
    max-height: 100px;
    overflow-y: auto;
  }

  .warning-item,
  .error-item {
    padding: 5px 0;
    border-bottom: 1px solid #eee;
    font-size: 14px;
  }

  .statistics-section {
    margin-top: 20px;
  }

  .stats-table {
    max-height: 300px;
    overflow-y: auto;
  }

  .table {
    font-size: 14px;
  }

  .table th {
    background: #f8f9fa;
    position: sticky;
    top: 0;
  }

  .btn {
    padding: 8px 16px;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    font-size: 14px;
    margin-right: 10px;
  }

  .btn-primary {
    background: #2c9316;
    color: white;
  }

  /* Logo blue button */
  .btn-logo {
    background: #2b5cab; /* approximate Mindful logo blue */
    color: #ffffff;
  }
  .btn-logo:hover {
    filter: brightness(0.95);
  }
  .selected-file-name {
    margin-left: 8px;
    font-size: 13px;
    color: #2c3e50;
  }

  .btn-success {
    background: #28a745;
    color: white;
  }

  .btn-info {
    background: #17a2b8;
    color: white;
  }

  .btn-outline-primary {
    background: transparent;
    color: #2c9316;
    border: 1px solid #2c9316;
  }

  .btn-sm {
    padding: 4px 8px;
    font-size: 12px;
  }

  .text-success {
    color: #28a745;
  }

  .text-danger {
    color: #dc3545;
  }

  .text-primary {
    color: #007bff;
  }

  .scrollable-student-list {
    max-height: 120px; /* About 3 students high */
    overflow-y: auto;
    border: 1px solid #eee;
    border-radius: 4px;
    padding: 4px 0;
    margin-bottom: 8px;
  }

  .enrollments-scroll-list {
    max-height: 160px;
    overflow-y: auto;
    border: 1px solid #eee;
    border-radius: 4px;
    padding: 6px 10px;
    margin-bottom: 12px;
    background: #fafbfc;
  }
  .enrollments-scroll-list ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .enrollments-scroll-list li {
    padding: 2px 0;
    font-size: 0.97em;
    border-bottom: 1px solid #f0f0f0;
  }
  .enrollments-scroll-list li:last-child {
    border-bottom: none;
  }

  @media (max-width: 768px) {
    .content-grid {
      grid-template-columns: 1fr;
    }

    .result-stats {
      grid-template-columns: 1fr;
    }
  }
</style>
