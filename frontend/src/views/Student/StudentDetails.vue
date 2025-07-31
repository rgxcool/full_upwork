<template>
  <div class="scrollable-view">
    <div class="student-details-container">
      <div class="header-section">
        <h1 class="page-title">Elevdetaljer</h1>
        <div class="breadcrumb">
          <router-link to="/admin/users" class="breadcrumb-link">← Tillbaka till Admin</router-link>
        </div>
      </div>

      <div v-if="loading" class="loading">
        <div class="spinner"></div>
        <p>Laddar elevinformation...</p>
      </div>

      <div v-else-if="error" class="error-message">
        <p>{{ error }}</p>
      </div>

      <div v-else-if="student" class="content-grid">
        <!-- Basic Information Card -->
        <div class="card">
          <div class="card-header">
            <h3>Grundläggande Information</h3>
            <button
              v-if="isAdmin"
              @click="toggleEditMode"
              class="btn btn-sm"
              :class="editMode ? 'btn-secondary' : 'btn-primary'"
            >
              {{ editMode ? 'Avbryt' : 'Redigera' }}
            </button>
          </div>
          <div class="card-body">
            <div class="info-grid">
              <div class="info-item">
                <label>Namn:</label>
                <input
                  v-if="editMode && isAdmin"
                  v-model="editData.name"
                  type="text"
                  class="form-control"
                />
                <span v-else>{{ student.name || 'Ej angivet' }}</span>
              </div>

              <div class="info-item">
                <label>Personnummer:</label>
                <input
                  v-if="editMode && isAdmin"
                  v-model="editData.personalNumber"
                  type="text"
                  class="form-control"
                />
                <span v-else>{{ student.personalNumber || 'Ej angivet' }}</span>
              </div>

              <div class="info-item">
                <label>Telefon:</label>
                <input
                  v-if="editMode && isAdmin"
                  v-model="editData.phone"
                  type="text"
                  class="form-control"
                />
                <span v-else>{{ student.phone || 'Ej angivet' }}</span>
              </div>

              <div class="info-item">
                <label>E-post:</label>
                <input
                  v-if="editMode && isAdmin"
                  v-model="editData.email"
                  type="email"
                  class="form-control"
                />
                <span v-else>{{ student.email || 'Ej angivet' }}</span>
              </div>

              <div class="info-item">
                <label>Kommun:</label>
                <select
                  v-if="editMode && isAdmin"
                  v-model="editData.municipality.type"
                  class="form-control"
                >
                  <option value="">Välj kommun</option>
                  <option
                    v-for="municipality in municipalities"
                    :key="municipality"
                    :value="municipality"
                  >
                    {{ municipality }}
                  </option>
                </select>
                <span v-else>{{ student.municipality?.type || 'Ej angivet' }}</span>
              </div>
            </div>

            <div v-if="editMode && isAdmin" class="edit-actions">
              <button @click="saveChanges" class="btn btn-success" :disabled="saving">
                {{ saving ? 'Sparar...' : 'Spara ändringar' }}
              </button>
              <button @click="cancelEdit" class="btn btn-secondary">Avbryt</button>
            </div>
          </div>
        </div>

        <!-- Status Card -->
        <div class="card">
          <div class="card-header">
            <h3>Status</h3>
          </div>
          <div class="card-body">
            <div class="info-grid">
              <div class="info-item">
                <label>Startdatum:</label>
                <input
                  v-if="editMode && isAdmin"
                  v-model="editData.startDate"
                  type="date"
                  class="form-control"
                />
                <span v-else>{{ formatDate(student.startDate) || 'Ej angivet' }}</span>
              </div>

              <div class="info-item">
                <label>Slutdatum:</label>
                <input
                  v-if="editMode && isAdmin"
                  v-model="editData.endDate"
                  type="date"
                  class="form-control"
                />
                <span v-else>{{ formatDate(student.endDate) || 'Ej angivet' }}</span>
              </div>

              <div class="info-item">
                <label>Provstatus:</label>
                <input
                  v-if="editMode && isAdmin"
                  v-model="editData.exam"
                  type="text"
                  class="form-control"
                />
                <span v-else>{{ student.exam || 'Ej angivet' }}</span>
              </div>

              <div class="info-item">
                <label>Övrigt:</label>
                <textarea
                  v-if="editMode && isAdmin"
                  v-model="editData.additionalInfo"
                  class="form-control"
                  rows="3"
                ></textarea>
                <span v-else>{{ student.additionalInfo || 'Ej angivet' }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Education Card -->
        <div class="card">
          <div class="card-header">
            <h3>Utbildning</h3>
            <div v-if="student.enrollmentStats" class="enrollment-stats">
              <span class="stat-item">
                <strong>{{ student.enrollmentStats.totalEnrollments }}</strong>
                totalt
              </span>
              <span class="stat-item">
                <strong>{{ student.enrollmentStats.activeEnrollments }}</strong>
                aktiva
              </span>
            </div>
          </div>
          <div class="card-body">
            <div v-if="student.education && student.education.length > 0" class="education-list">
              <div
                v-for="(edu, index) in student.education"
                :key="edu._id || index"
                class="education-item"
                :class="{ 'enrollment-item': edu.isEnrollment }"
              >
                <div class="education-header">
                  <span class="education-type">{{ edu.type }}</span>
                  <span v-if="edu.isEnrollment" class="enrollment-badge">Inskriven</span>
                  <span class="education-name">
                    {{ getEducationName(edu) }}
                  </span>
                </div>

                <div class="education-details">
                  <div v-if="edu.startDate && edu.endDate" class="education-dates">
                    {{ formatDate(edu.startDate) }} - {{ formatDate(edu.endDate) }}
                  </div>

                  <div v-if="edu.status" class="education-status">
                    Status:
                    <span :class="'status-' + edu.status">{{ edu.status }}</span>
                  </div>

                  <div v-if="edu.grade" class="education-grade">Betyg: {{ edu.grade }}</div>

                  <div v-if="edu.isEnrollment && edu.courseInstance" class="course-instance-info">
                    Kursinstans: {{ edu.courseInstance.courseName }} ({{
                      formatDate(edu.courseInstance.startDate)
                    }}
                    - {{ formatDate(edu.courseInstance.endDate) }})
                  </div>
                </div>
              </div>
            </div>
            <div v-else class="no-education">Ingen utbildning registrerad</div>
          </div>
        </div>

        <!-- Comments Card -->
        <div class="card">
          <div class="card-header">
            <h3>Kommentarer</h3>
            <button v-if="canComment" @click="showCommentModal = true" class="btn btn-primary btn-sm">
              Lägg till kommentar
            </button>
          </div>
          <div class="card-body">
            <div
              v-if="student.commentHistory && student.commentHistory.length > 0"
              class="comments-list"
            >
              <div
                v-for="(comment, index) in activeComments"
                :key="comment._id"
                class="comment-item"
                :class="{ deleted: comment.isDeleted }"
              >
                <div class="comment-header">
                  <span class="comment-author">{{ comment.author }}</span>
                  <span class="comment-date">{{ formatDate(comment.date) }}</span>
                  <span class="comment-role">{{ comment.authorRole }}</span>
                </div>

                <div class="comment-content">
                  <span v-if="comment.isDeleted" class="deleted-text">[RADERAD]</span>
                  <span v-else>{{ comment.comment }}</span>
                </div>

                <div v-if="comment.editedAt" class="comment-edited">
                  Redigerad {{ formatDate(comment.editedAt) }}
                </div>

                <div class="comment-actions">
                  <button
                    v-if="canEditComment(comment)"
                    @click="editComment(comment)"
                    class="btn btn-sm btn-outline-primary"
                  >
                    Redigera
                  </button>
                  <button
                    v-if="canDeleteComment(comment)"
                    @click="deleteComment(comment._id)"
                    class="btn btn-sm btn-outline-danger"
                  >
                    Radera
                  </button>
                </div>
              </div>
            </div>
            <div v-else class="no-comments">Inga kommentarer än</div>
          </div>
        </div>

        <!-- Change History Card (Admin only) -->
        <div v-if="isAdmin" class="card">
          <div class="card-header">
            <h3>Ändringshistorik</h3>
          </div>
          <div class="card-body">
            <div v-if="changeHistory && changeHistory.length > 0" class="history-list">
              <div v-for="(change, index) in changeHistory" :key="index" class="history-item">
                <div class="history-header">
                  <span class="history-date">{{ formatDate(change.timestamp) }}</span>
                  <span class="history-user">{{ change.changedByRole }}</span>
                </div>
                <div class="history-changes">
                  <div v-for="field in change.changes" :key="field" class="change-item">
                    <strong>{{ field }}:</strong>
                    <span class="change-from">{{ change.previousValues[field] || 'tomt' }}</span>
                    <span class="change-arrow">→</span>
                    <span class="change-to">{{ change.newValues[field] || 'tomt' }}</span>
                  </div>
                </div>
              </div>
            </div>
            <div v-else class="no-history">Ingen ändringshistorik</div>
          </div>
        </div>
      </div>

      <!-- Comment Modal -->
      <div v-if="showCommentModal" class="modal-overlay" @click="showCommentModal = false">
        <div class="modal-content" @click.stop>
          <div class="modal-header">
            <h3>Lägg till kommentar</h3>
            <button @click="showCommentModal = false" class="close-btn">&times;</button>
          </div>
          <div class="modal-body">
            <textarea
              v-model="newComment"
              class="form-control"
              rows="4"
              placeholder="Skriv din kommentar här..."
            ></textarea>
          </div>
          <div class="modal-footer">
            <button @click="addComment" class="btn btn-primary" :disabled="!newComment.trim()">
              Lägg till
            </button>
            <button @click="showCommentModal = false" class="btn btn-secondary">Avbryt</button>
          </div>
        </div>
      </div>

      <!-- Edit Comment Modal -->
      <div v-if="showEditModal" class="modal-overlay" @click="showEditModal = false">
        <div class="modal-content" @click.stop>
          <div class="modal-header">
            <h3>Redigera kommentar</h3>
            <button @click="showEditModal = false" class="close-btn">&times;</button>
          </div>
          <div class="modal-body">
            <textarea v-model="editingComment.comment" class="form-control" rows="4"></textarea>
          </div>
          <div class="modal-footer">
            <button @click="saveEditedComment" class="btn btn-primary">Spara</button>
            <button @click="showEditModal = false" class="btn btn-secondary">Avbryt</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
  import { ref, computed, onMounted } from 'vue'
  import { useRoute } from 'vue-router'
  import { useStore } from 'vuex'
  import { api } from '@/store/store.js'

  export default {
    name: 'StudentDetails',
    setup() {
      const route = useRoute()
      const store = useStore()

      const student = ref(null)
      const loading = ref(true)
      const error = ref(null)
      const editMode = ref(false)
      const saving = ref(false)
      const showCommentModal = ref(false)
      const showEditModal = ref(false)
      const newComment = ref('')
      const editingComment = ref(null)
      const changeHistory = ref([])

      const editData = ref({})

      const municipalities = [
        'Botkyrka',
        'Danderyd',
        'Huddinge',
        'Järfälla',
        'KCNO',
        'Lidingö',
        'Norrtälje',
        'Nykvarn',
        'Privat kunder',
        'Salem',
        'Sigtuna',
        'Sollentuna',
        'Solna',
        'Sundbyberg',
        'Södertälje',
        'Täby',
        'Upplands Bro',
        'Upplands Väsby',
        'Vallentuna',
        'Vaxholm',
        'Växjö',
        'Österåker',
      ]

      // Computed properties
      const isAdmin = computed(() => store.getters.isAdmin)
      const userRole = computed(() => store.getters.userRole)
      const userId = computed(() => store.getters.userId)

      const canComment = computed(() =>
        ['teacher', 'admin', 'systemadmin'].includes(userRole.value)
      )

      const activeComments = computed(() => {
        if (!student.value?.commentHistory) return []
        return student.value.commentHistory.filter((comment) => !comment.isDeleted)
      })

      // Methods
      const loadStudent = async () => {
        try {
          loading.value = true
          error.value = null

          const response = await api.get(`/student-details/${route.params.id}`)
          student.value = response.data

          // Initialize edit data
          editData.value = {
            name: student.value.name || '',
            personalNumber: student.value.personalNumber || '',
            phone: student.value.phone || '',
            email: student.value.email || '',
            municipality: { type: student.value.municipality?.type || '' },
            startDate: student.value.startDate
              ? new Date(student.value.startDate).toISOString().split('T')[0]
              : '',
            endDate: student.value.endDate
              ? new Date(student.value.endDate).toISOString().split('T')[0]
              : '',
            exam: student.value.exam || '',
            additionalInfo: student.value.additionalInfo || '',
          }

          // Load change history if admin
          if (isAdmin.value) {
            await loadChangeHistory()
          }
        } catch (err) {
          console.error('Error loading student:', err)
          error.value = 'Kunde inte ladda elevinformation'
        } finally {
          loading.value = false
        }
      }

      const loadChangeHistory = async () => {
        try {
          const response = await api.get(`/student-details/${route.params.id}/history`)
          changeHistory.value = response.data.changeHistory
        } catch (err) {
          console.error('Error loading change history:', err)
        }
      }

      const toggleEditMode = () => {
        editMode.value = !editMode.value
      }

      const saveChanges = async () => {
        try {
          saving.value = true

          const response = await api.put(`/student-details/${route.params.id}`, editData.value)

          // Update local data
          Object.assign(student.value, response.data.student)

          editMode.value = false

          // Reload change history
          if (isAdmin.value) {
            await loadChangeHistory()
          }
        } catch (err) {
          console.error('Error saving changes:', err)
          alert('Kunde inte spara ändringar')
        } finally {
          saving.value = false
        }
      }

      const cancelEdit = () => {
        editMode.value = false
        // Reset edit data
        editData.value = {
          name: student.value.name || '',
          personalNumber: student.value.personalNumber || '',
          phone: student.value.phone || '',
          email: student.value.email || '',
          municipality: { type: student.value.municipality?.type || '' },
          startDate: student.value.startDate
            ? new Date(student.value.startDate).toISOString().split('T')[0]
            : '',
          endDate: student.value.endDate
            ? new Date(student.value.endDate).toISOString().split('T')[0]
            : '',
          exam: student.value.exam || '',
          additionalInfo: student.value.additionalInfo || '',
        }
      }

      const addComment = async () => {
        try {
          const response = await api.post(`/student-details/${route.params.id}/comments`, {
            comment: newComment.value,
          })

          student.value.commentHistory = response.data.commentHistory
          newComment.value = ''
          showCommentModal.value = false
        } catch (err) {
          console.error('Error adding comment:', err)
          alert('Kunde inte lägga till kommentar')
        }
      }

      const editComment = (comment) => {
        editingComment.value = { ...comment }
        showEditModal.value = true
      }

      const saveEditedComment = async () => {
        try {
          await api.put(
            `/student-details/${route.params.id}/comments/${editingComment.value._id}`,
            {
              comment: editingComment.value.comment,
            }
          )

          // Update local comment
          const commentIndex = student.value.commentHistory.findIndex(
            (c) => c._id === editingComment.value._id
          )
          if (commentIndex !== -1) {
            student.value.commentHistory[commentIndex] = editingComment.value
          }

          showEditModal.value = false
          editingComment.value = null
        } catch (err) {
          console.error('Error editing comment:', err)
          alert('Kunde inte redigera kommentar')
        }
      }

      const deleteComment = async (commentId) => {
        if (!confirm('Är du säker på att du vill radera denna kommentar?')) return

        try {
          await api.delete(`/student-details/${route.params.id}/comments/${commentId}`)

          // Update local comment
          const commentIndex = student.value.commentHistory.findIndex((c) => c._id === commentId)
          if (commentIndex !== -1) {
            student.value.commentHistory[commentIndex].isDeleted = true
            student.value.commentHistory[commentIndex].comment = '[DELETED]'
          }
        } catch (err) {
          console.error('Error deleting comment:', err)
          alert('Kunde inte radera kommentar')
        }
      }

      const canEditComment = (comment) => {
        return comment.authorId === userId.value || isAdmin.value
      }

      const canDeleteComment = (comment) => {
        return comment.authorId === userId.value || isAdmin.value
      }

      const getEducationName = (edu) => {
        if (!edu.refId) return 'Okänd'

        if (edu.type === 'Course') {
          return edu.refId.courseName || 'Okänd kurs'
        } else if (edu.type === 'CoursePackage') {
          return edu.refId.coursePackageName || 'Okänt kurspaket'
        } else if (edu.type === 'Program') {
          return edu.refId.programName || 'Okänt program'
        }

        return 'Okänd'
      }

      const formatDate = (date) => {
        if (!date) return ''
        return new Date(date).toLocaleDateString('sv-SE')
      }

      onMounted(() => {
        loadStudent()
      })

      return {
        student,
        loading,
        error,
        editMode,
        saving,
        editData,
        municipalities,
        showCommentModal,
        showEditModal,
        newComment,
        editingComment,
        changeHistory,
        isAdmin,
        userRole,
        userId,
        canComment,
        activeComments,
        toggleEditMode,
        saveChanges,
        cancelEdit,
        addComment,
        editComment,
        saveEditedComment,
        deleteComment,
        canEditComment,
        canDeleteComment,
        getEducationName,
        formatDate,
      }
    },
  }
</script>

<style scoped>
  .student-details-container {
    padding: 20px;
    max-width: 1200px;
    margin: 0 auto;
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
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .card-header h3 {
    margin: 0;
    color: #2c3e50;
  }

  .card-body {
    padding: 20px;
  }

  .info-grid {
    display: grid;
    gap: 15px;
  }

  .info-item {
    display: flex;
    flex-direction: column;
  }

  .info-item label {
    font-weight: 500;
    margin-bottom: 5px;
    color: #6c757d;
  }

  .form-control {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 14px;
  }

  .edit-actions {
    margin-top: 20px;
    display: flex;
    gap: 10px;
  }

  .btn {
    padding: 8px 16px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    text-decoration: none;
    display: inline-block;
  }

  .btn-primary {
    background: #007bff;
    color: white;
  }

  .btn-secondary {
    background: #6c757d;
    color: white;
  }

  .btn-success {
    background: #28a745;
    color: white;
  }

  .btn-danger {
    background: #dc3545;
    color: white;
  }

  .btn-outline-primary {
    background: transparent;
    color: #007bff;
    border: 1px solid #007bff;
  }

  .btn-outline-danger {
    background: transparent;
    color: #dc3545;
    border: 1px solid #dc3545;
  }

  .btn-sm {
    padding: 4px 8px;
    font-size: 12px;
  }

  .education-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .education-item {
    padding: 10px;
    border: 1px solid #dee2e6;
    border-radius: 4px;
  }

  .education-header {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  .education-type {
    background: #007bff;
    color: white;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 12px;
  }

  .education-name {
    font-weight: 500;
  }

  .education-grade {
    margin-top: 5px;
    color: #6c757d;
  }

  .comments-list {
    display: flex;
    flex-direction: column;
    gap: 15px;
  }

  .comment-item {
    padding: 15px;
    border: 1px solid #dee2e6;
    border-radius: 4px;
  }

  .comment-item.deleted {
    opacity: 0.6;
  }

  .comment-header {
    display: flex;
    gap: 10px;
    align-items: center;
    margin-bottom: 10px;
  }

  .comment-author {
    font-weight: 500;
  }

  .comment-date {
    color: #6c757d;
    font-size: 12px;
  }

  .comment-role {
    background: #6c757d;
    color: white;
    padding: 2px 6px;
    border-radius: 8px;
    font-size: 10px;
  }

  .comment-content {
    margin-bottom: 10px;
  }

  .deleted-text {
    color: #dc3545;
    font-style: italic;
  }

  .comment-edited {
    font-size: 12px;
    color: #6c757d;
    margin-bottom: 10px;
  }

  .comment-actions {
    display: flex;
    gap: 10px;
  }

  .history-list {
    display: flex;
    flex-direction: column;
    gap: 15px;
  }

  .history-item {
    padding: 15px;
    border: 1px solid #dee2e6;
    border-radius: 4px;
  }

  .history-header {
    display: flex;
    gap: 10px;
    align-items: center;
    margin-bottom: 10px;
  }

  .history-date {
    font-weight: 500;
  }

  .history-user {
    background: #28a745;
    color: white;
    padding: 2px 6px;
    border-radius: 8px;
    font-size: 10px;
  }

  .change-item {
    display: flex;
    gap: 10px;
    align-items: center;
    margin-bottom: 5px;
  }

  .change-arrow {
    color: #6c757d;
  }

  .change-from {
    color: #dc3545;
    text-decoration: line-through;
  }

  .change-to {
    color: #28a745;
  }

  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-content {
    background: white;
    border-radius: 8px;
    width: 90%;
    max-width: 500px;
    max-height: 80vh;
    overflow-y: auto;
  }

  .modal-header {
    padding: 20px;
    border-bottom: 1px solid #dee2e6;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .modal-header h3 {
    margin: 0;
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: #6c757d;
  }

  .modal-body {
    padding: 20px;
  }

  .modal-footer {
    padding: 20px;
    border-top: 1px solid #dee2e6;
    display: flex;
    gap: 10px;
    justify-content: flex-end;
  }

  .loading {
    text-align: center;
    padding: 40px;
  }

  .spinner {
    border: 4px solid #f3f3f3;
    border-top: 4px solid #007bff;
    border-radius: 50%;
    width: 40px;
    height: 40px;
    animation: spin 1s linear infinite;
    margin: 0 auto 20px;
  }

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  .error-message {
    text-align: center;
    padding: 40px;
    color: #dc3545;
  }

  .no-education,
  .no-comments,
  .no-history {
    text-align: center;
    color: #6c757d;
    font-style: italic;
    padding: 20px;
  }

  .enrollment-stats {
    display: flex;
    gap: 15px;
    font-size: 14px;
  }

  .stat-item {
    color: #6c757d;
  }

  .enrollment-item {
    border-left: 4px solid #28a745;
    background-color: #f8fff9;
  }

  .enrollment-badge {
    background: #28a745;
    color: white;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 10px;
    margin-left: 10px;
  }

  .education-details {
    margin-top: 10px;
    font-size: 14px;
    color: #6c757d;
  }

  .education-dates {
    margin-bottom: 5px;
  }

  .education-status {
    margin-bottom: 5px;
  }

  .status-enrolled {
    color: #28a745;
    font-weight: 500;
  }

  .status-active {
    color: #007bff;
    font-weight: 500;
  }

  .status-completed {
    color: #6c757d;
    font-weight: 500;
  }

  .status-dropped {
    color: #dc3545;
    font-weight: 500;
  }

  .course-instance-info {
    margin-top: 5px;
    font-size: 12px;
    color: #495057;
    background: #f8f9fa;
    padding: 5px;
    border-radius: 4px;
  }
</style>
