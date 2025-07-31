<template>
  <div class="scrollable-view">
    <div class="course-instances-container">
      <div class="header-section">
        <h3 class="page-title">Kursinstanser</h3>
        <button class="btn btn-danger" style="margin-left: 20px;" @click="deleteAllCourseInstances">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24">
            <path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
          </svg>
          Radera alla kursinstanser
        </button>
      </div>

      <!-- Filters -->
      <div class="filters-section">
        <div class="filter-group">
          <label for="courseFilter">Kurs:</label>
          <select id="courseFilter" v-model="filters.courseId" @change="loadInstances">
            <option value="">Alla kurser</option>
            <option v-for="course in courses" :key="course._id" :value="course._id">
              {{ course.courseName }} ({{ course.courseCode }})
            </option>
          </select>
        </div>

        <div class="filter-group">
          <label for="dateFilter">Period:</label>
          <input type="date" id="startDate" v-model="filters.startDate" @change="loadInstances" />
          <span>till</span>
          <input type="date" id="endDate" v-model="filters.endDate" @change="loadInstances" />
        </div>

        <div class="filter-group">
          <label for="statusFilter">Status:</label>
          <select id="statusFilter" v-model="filters.isActive" @change="loadInstances">
            <option value="">Alla</option>
            <option value="true">Aktiva</option>
            <option value="false">Inaktiva</option>
          </select>
        </div>

        <button class="btn btn-primary" @click="showCreateModal = true">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24">
            <path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
          </svg>
          Skapa ny instans
        </button>
      </div>

      <!-- Statistics -->
      <div class="stats-section" v-if="statistics">
        <div class="stat-card">
          <h4>Totalt antal instanser</h4>
          <p class="stat-number">{{ statistics.totalInstances }}</p>
        </div>
        <div class="stat-card">
          <h4>Aktiva instanser</h4>
          <p class="stat-number">{{ statistics.activeInstances }}</p>
        </div>
        <div class="stat-card">
          <h4>Totalt antal inskrivningar</h4>
          <p class="stat-number">{{ statistics.totalEnrollments }}</p>
        </div>
        <div class="stat-card">
          <h4>Genomsnittlig inskrivning per instans</h4>
          <p class="stat-number">{{ statistics.averageEnrollments }}</p>
        </div>
      </div>

      <!-- Instances Table -->
      <div class="table-container">
        <table class="table">
          <thead>
            <tr>
              <th @click="setSort('courseName')">Kursnamn <span v-if="sortKey === 'courseName'">{{ sortOrder === 'asc' ? '▲' : '▼' }}</span></th>
              <th @click="setSort('courseCode')">Kurskod <span v-if="sortKey === 'courseCode'">{{ sortOrder === 'asc' ? '▲' : '▼' }}</span></th>
              <th @click="setSort('startDate')">Startdatum <span v-if="sortKey === 'startDate'">{{ sortOrder === 'asc' ? '▲' : '▼' }}</span></th>
              <th @click="setSort('endDate')">Slutdatum <span v-if="sortKey === 'endDate'">{{ sortOrder === 'asc' ? '▲' : '▼' }}</span></th>
              <th @click="setSort('slutprovDate')">Slutprov datum <span v-if="sortKey === 'slutprovDate'">{{ sortOrder === 'asc' ? '▲' : '▼' }}</span></th>
              <th @click="setSort('enrollmentCount')">Inskrivningar <span v-if="sortKey === 'enrollmentCount'">{{ sortOrder === 'asc' ? '▲' : '▼' }}</span></th>
              <th @click="setSort('isActive')">Status <span v-if="sortKey === 'isActive'">{{ sortOrder === 'asc' ? '▲' : '▼' }}</span></th>
              <th @click="setSort('createdBy')">Skapad av <span v-if="sortKey === 'createdBy'">{{ sortOrder === 'asc' ? '▲' : '▼' }}</span></th>
              <th @click="setSort('responsibleTeacher')">Ansvarig lärare <span v-if="sortKey === 'responsibleTeacher'">{{ sortOrder === 'asc' ? '▲' : '▼' }}</span></th>
              <th>Åtgärder</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="instance in sortedInstances" :key="instance._id">
              <td>{{ instance.courseName }}</td>
              <td>{{ instance.courseCode }}</td>
              <td>{{ formatDate(instance.startDate) }}</td>
              <td>{{ formatDate(instance.endDate) }}</td>
              <td>{{ formatDate(instance.slutprovDate) || '-' }}</td>
              <td>
                <span class="enrollment-count">{{ instance.enrollmentCount }}</span>
                <button
                  class="btn btn-sm btn-outline-primary ms-2"
                  @click="viewEnrollments(instance._id)"
                  title="Visa inskrivningar"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"
                    />
                  </svg>
                </button>
              </td>
              <td>
                <span :class="['status-badge', instance.isActive ? 'active' : 'inactive']">
                  {{ instance.isActive ? 'Aktiv' : 'Inaktiv' }}
                </span>
              </td>
              <td>{{ instance.createdBy?.username || 'System' }}</td>
              <td>{{ instance.responsibleTeacher?.userId?.username || '-' }}</td>
              <td>
                <button
                  class="btn btn-sm btn-outline-secondary me-1"
                  @click="editInstance(instance)"
                  title="Redigera"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
                    />
                  </svg>
                </button>
                <button
                  class="btn btn-sm btn-outline-danger"
                  @click="deleteInstance(instance._id)"
                  title="Ta bort"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
                    />
                  </svg>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Create/Edit Modal -->
      <div class="modal fade" id="instanceModal" tabindex="-1" ref="instanceModal">
        <div class="modal-dialog modal-lg">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">{{ editingInstance ? 'Redigera' : 'Skapa ny' }} kursinstans</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <form @submit.prevent="saveInstance">
                <div class="row">
                  <div class="col-md-6">
                    <div class="form-group">
                      <label for="mainCourseId">Huvudkurs *</label>
                      <select
                        id="mainCourseId"
                        v-model="instanceForm.mainCourseId"
                        class="form-control"
                        required
                        :disabled="editingInstance"
                      >
                        <option value="">Välj kurs</option>
                        <option v-for="course in courses" :key="course._id" :value="course._id">
                          {{ course.courseName }} ({{ course.courseCode }})
                        </option>
                      </select>
                    </div>
                  </div>
                  <div class="col-md-6">
                    <div class="form-group">
                      <label for="version">Version</label>
                      <input
                        type="text"
                        id="version"
                        v-model="instanceForm.version"
                        class="form-control"
                        placeholder="1.0"
                      />
                    </div>
                  </div>
                </div>

                <div class="row">
                  <div class="col-md-6">
                    <div class="form-group">
                      <label for="startDate">Startdatum *</label>
                      <input
                        type="date"
                        id="startDate"
                        v-model="instanceForm.startDate"
                        class="form-control"
                        required
                      />
                    </div>
                  </div>
                  <div class="col-md-6">
                    <div class="form-group">
                      <label for="endDate">Slutdatum *</label>
                      <input
                        type="date"
                        id="endDate"
                        v-model="instanceForm.endDate"
                        class="form-control"
                        required
                      />
                    </div>
                  </div>
                </div>

                <div class="row">
                  <div class="col-md-6">
                    <div class="form-group">
                      <label for="courseName">Kursnamn</label>
                      <input
                        type="text"
                        id="courseName"
                        v-model="instanceForm.courseName"
                        class="form-control"
                        placeholder="Lämna tomt för att använda huvudkursens namn"
                      />
                    </div>
                  </div>
                  <div class="col-md-6">
                    <div class="form-group">
                      <label for="courseCode">Kurskod</label>
                      <input
                        type="text"
                        id="courseCode"
                        v-model="instanceForm.courseCode"
                        class="form-control"
                        placeholder="Lämna tomt för att använda huvudkursens kod"
                      />
                    </div>
                  </div>
                </div>

                <div class="row">
                  <div class="col-md-6">
                    <div class="form-group">
                      <label for="coursePoints">Poäng</label>
                      <input
                        type="text"
                        id="coursePoints"
                        v-model="instanceForm.coursePoints"
                        class="form-control"
                      />
                    </div>
                  </div>
                  <div class="col-md-6">
                    <div class="form-group">
                      <label for="courseExtent">Omfattning</label>
                      <input
                        type="text"
                        id="courseExtent"
                        v-model="instanceForm.courseExtent"
                        class="form-control"
                      />
                    </div>
                  </div>
                </div>

                <div class="form-group">
                  <label for="notes">Anteckningar</label>
                  <textarea
                    id="notes"
                    v-model="instanceForm.notes"
                    class="form-control"
                    rows="3"
                  ></textarea>
                </div>

                <div class="form-check">
                  <input
                    type="checkbox"
                    id="isActive"
                    v-model="instanceForm.isActive"
                    class="form-check-input"
                  />
                  <label class="form-check-label" for="isActive">Aktiv</label>
                </div>
              </form>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Avbryt</button>
              <button
                type="button"
                class="btn btn-primary"
                @click="saveInstance"
                :disabled="isSaving"
              >
                {{ isSaving ? 'Sparar...' : editingInstance ? 'Uppdatera' : 'Skapa' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Enrollments Modal -->
      <div class="modal fade" id="enrollmentsModal" tabindex="-1" ref="enrollmentsModal">
        <div class="modal-dialog modal-xl">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Inskrivningar för {{ selectedInstance?.courseName }}</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div v-if="enrollments.length === 0" class="text-center py-4">
                <p>Inga inskrivningar för denna kursinstans.</p>
              </div>
              <div v-else>
                <table class="table table-sm">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Status</th>
                      <th>Startdatum</th>
                      <th>Slutdatum</th>
                      <th>Betyg</th>
                      <th>Närvaro</th>
                      <th>Åtgärder</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="enrollment in enrollments" :key="enrollment._id">
                      <td>{{ enrollment.studentId?.name || 'Okänd student' }}</td>
                      <td>
                        <span :class="['status-badge', getStatusClass(enrollment.status)]">
                          {{ getStatusText(enrollment.status) }}
                        </span>
                      </td>
                      <td>{{ formatDate(enrollment.startDate) }}</td>
                      <td>{{ formatDate(enrollment.endDate) }}</td>
                      <td>{{ enrollment.grade || '-' }}</td>
                      <td>
                        {{
                          enrollment.attendancePercentage
                            ? `${enrollment.attendancePercentage}%`
                            : '-'
                        }}
                      </td>
                      <td>
                        <button
                          class="btn btn-sm btn-outline-primary"
                          @click="viewStudentDetails(enrollment.studentId?._id)"
                        >
                          Visa student
                        </button>
                        <button
                          v-if="enrollment.studentId && enrollment.studentId._id"
                          class="btn btn-sm btn-outline-danger ms-2"
                          @click="deleteEnrollment(enrollment._id)"
                          title="Ta bort inskrivning"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24">
                            <path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                          </svg>
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <button
                v-if="enrollments.some(e => !e.studentId || !e.studentId._id)"
                class="btn btn-danger mt-3"
                @click="deleteUnknownEnrollments"
              >
                Ta bort alla okända elever
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
  import { ref, onMounted, computed, watch } from 'vue'
  import { useStore } from 'vuex'
  import { api } from '@/store/store.js'

  export default {
    name: 'CourseInstances',
    setup() {
      const store = useStore()

      const instances = ref([])
      const courses = ref([])
      const enrollments = ref([])
      const selectedInstance = ref(null)
      const showCreateModal = ref(false)
      const editingInstance = ref(null)
      const isSaving = ref(false)

      const filters = ref({
        courseId: '',
        startDate: '',
        endDate: '',
        isActive: '',
      })

      const instanceForm = ref({
        mainCourseId: '',
        startDate: '',
        endDate: '',
        courseName: '',
        courseCode: '',
        coursePoints: '',
        courseExtent: '',
        version: '1.0',
        notes: '',
        isActive: true,
      })

      const statistics = computed(() => {
        if (instances.value.length === 0) return null

        const totalInstances = instances.value.length
        const activeInstances = instances.value.filter((i) => i.isActive).length
        const totalEnrollments = instances.value.reduce(
          (sum, i) => sum + (i.enrollmentCount || 0),
          0
        )
        const averageEnrollments =
          totalInstances > 0 ? (totalEnrollments / totalInstances).toFixed(1) : 0

        return {
          totalInstances,
          activeInstances,
          totalEnrollments,
          averageEnrollments,
        }
      })

      const sortKey = ref('')
      const sortOrder = ref('asc')

      const setSort = (key) => {
        if (sortKey.value === key) {
          sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
        } else {
          sortKey.value = key
          sortOrder.value = 'asc'
        }
      }

      const sortedInstances = computed(() => {
        if (!sortKey.value) return instances.value
        return [...instances.value].sort((a, b) => {
          let aVal = a[sortKey.value]
          let bVal = b[sortKey.value]
          // Handle nested fields
          if (sortKey.value === 'createdBy') {
            aVal = a.createdBy?.username || ''
            bVal = b.createdBy?.username || ''
          } else if (sortKey.value === 'responsibleTeacher') {
            aVal = a.responsibleTeacher?.userId?.username || ''
            bVal = b.responsibleTeacher?.userId?.username || ''
          } else if (sortKey.value === 'enrollmentCount') {
            aVal = a.enrollmentCount || 0
            bVal = b.enrollmentCount || 0
          } else if (sortKey.value === 'isActive') {
            aVal = a.isActive ? 1 : 0
            bVal = b.isActive ? 1 : 0
          }
          // Date fields
          if (sortKey.value === 'startDate' || sortKey.value === 'endDate' || sortKey.value === 'slutprovDate') {
            aVal = aVal ? new Date(aVal) : new Date(0)
            bVal = bVal ? new Date(bVal) : new Date(0)
          }
          if (aVal < bVal) return sortOrder.value === 'asc' ? -1 : 1
          if (aVal > bVal) return sortOrder.value === 'asc' ? 1 : -1
          return 0
        })
      })

      const loadCourses = async () => {
        try {
          const response = await api.get('/courses')
          courses.value = response.data
        } catch (error) {
          console.error('Error loading courses:', error)
        }
      }

      const loadInstances = async () => {
        try {
          const params = new URLSearchParams()
          if (filters.value.courseId) params.append('courseId', filters.value.courseId)
          if (filters.value.startDate) params.append('startDate', filters.value.startDate)
          if (filters.value.endDate) params.append('endDate', filters.value.endDate)
          if (filters.value.isActive !== '') params.append('isActive', filters.value.isActive)

          const response = await api.get(`/course-instances?${params.toString()}`)
          instances.value = response.data.instances
        } catch (error) {
          console.error('Error loading instances:', error)
        }
      }

      const saveInstance = async () => {
        isSaving.value = true
        try {
          if (editingInstance.value) {
            await api.put(`/course-instances/${editingInstance.value._id}`, instanceForm.value)
          } else {
            await api.post('/course-instances', instanceForm.value)
          }

          await loadInstances()
          closeModal()
        } catch (error) {
          console.error('Error saving instance:', error)
          alert('Ett fel uppstod när instansen skulle sparas.')
        } finally {
          isSaving.value = false
        }
      }

      const editInstance = (instance) => {
        editingInstance.value = instance
        instanceForm.value = {
          mainCourseId: instance.mainCourseId._id,
          startDate: instance.startDate.split('T')[0],
          endDate: instance.endDate.split('T')[0],
          courseName: instance.courseName,
          courseCode: instance.courseCode,
          coursePoints: instance.coursePoints,
          courseExtent: instance.courseExtent,
          version: instance.version,
          notes: instance.notes,
          isActive: instance.isActive,
        }
        showCreateModal.value = true
      }

      const deleteInstance = async (instanceId) => {
        if (!confirm('Är du säker på att du vill ta bort denna kursinstans?')) return

        try {
          await api.delete(`/course-instances/${instanceId}`)
          await loadInstances()
        } catch (error) {
          console.error('Error deleting instance:', error)
          alert('Ett fel uppstod när instansen skulle tas bort.')
        }
      }

      const viewEnrollments = async (instanceId) => {
        try {
          const response = await api.get(`/course-instances/${instanceId}/enrollments`)
          enrollments.value = response.data.enrollments
          selectedInstance.value = instances.value.find((i) => i._id === instanceId)

          const modal = new bootstrap.Modal(document.getElementById('enrollmentsModal'))
          modal.show()
        } catch (error) {
          console.error('Error loading enrollments:', error)
        }
      }

      const viewStudentDetails = (studentId) => {
        if (studentId) {
          window.open(`/detaljer/Elev/${studentId}`, '_blank')
        }
      }

      const closeModal = () => {
        showCreateModal.value = false
        editingInstance.value = null
        instanceForm.value = {
          mainCourseId: '',
          startDate: '',
          endDate: '',
          courseName: '',
          courseCode: '',
          coursePoints: '',
          courseExtent: '',
          version: '1.0',
          notes: '',
          isActive: true,
        }
      }

      const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('sv-SE')
      }

      const getStatusClass = (status) => {
        const classes = {
          enrolled: 'enrolled',
          active: 'active',
          completed: 'completed',
          dropped: 'dropped',
          inactive: 'inactive',
          suspended: 'suspended',
        }
        return classes[status] || 'enrolled'
      }

      const getStatusText = (status) => {
        const texts = {
          enrolled: 'Inskriven',
          active: 'Aktiv',
          completed: 'Slutförd',
          dropped: 'Avbruten',
          inactive: 'Inaktiv',
          suspended: 'Avstängd',
        }
        return texts[status] || status
      }

      const deleteAllCourseInstances = async () => {
        if (!confirm('Är du säker på att du vill ta bort ALLA kursinstanser och tillhörande data? Detta går inte att ångra.')) return;
        try {
          await api.delete('/course-instances/all');
          await loadInstances();
          alert('Alla kursinstanser och tillhörande data har raderats.');
        } catch (error) {
          console.error('Error deleting all course instances:', error);
          alert('Ett fel uppstod när alla kursinstanser skulle tas bort.');
        }
      };

      const deleteEnrollment = async (enrollmentId) => {
        if (!confirm('Är du säker på att du vill ta bort denna inskrivning?')) return;
        try {
          await api.delete(`/enrollments/${enrollmentId}`);
          await viewEnrollments(selectedInstance.value._id);
        } catch (error) {
          console.error('Error deleting enrollment:', error);
          alert('Ett fel uppstod när inskrivningen skulle tas bort.');
        }
      };

      const deleteUnknownEnrollments = async () => {
        if (!confirm('Ta bort ALLA okända elever från denna kursinstans?')) return;
        try {
          const unknowns = enrollments.value.filter(e => !e.studentId || !e.studentId._id);
          for (const e of unknowns) {
            await api.delete(`/enrollments/${e._id}`);
          }
          await viewEnrollments(selectedInstance.value._id);
        } catch (error) {
          console.error('Error deleting unknown enrollments:', error);
          alert('Ett fel uppstod när okända elever skulle tas bort.');
        }
      };

      onMounted(() => {
        loadCourses()
        loadInstances()
      })

      // Watch for showCreateModal changes to show/hide the modal
      watch(showCreateModal, (newValue) => {
        if (newValue) {
          const modal = new bootstrap.Modal(document.getElementById('instanceModal'))
          modal.show()
          
          // Listen for modal hidden event to reset showCreateModal
          const modalElement = document.getElementById('instanceModal')
          const handleModalHidden = () => {
            showCreateModal.value = false
            modalElement.removeEventListener('hidden.bs.modal', handleModalHidden)
          }
          modalElement.addEventListener('hidden.bs.modal', handleModalHidden)
        }
      })

      return {
        instances,
        courses,
        enrollments,
        selectedInstance,
        showCreateModal,
        editingInstance,
        isSaving,
        filters,
        instanceForm,
        statistics,
        loadInstances,
        saveInstance,
        editInstance,
        deleteInstance,
        viewEnrollments,
        viewStudentDetails,
        closeModal,
        formatDate,
        getStatusClass,
        getStatusText,
        deleteAllCourseInstances,
        deleteEnrollment,
        deleteUnknownEnrollments,
        sortKey,
        sortOrder,
        setSort,
        sortedInstances,
      }
    },
  }
</script>

<style scoped>
  .course-instances-container {
    padding: 20px;
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

  .breadcrumb-link:hover {
    text-decoration: underline;
  }

  .filters-section {
    display: flex;
    gap: 20px;
    align-items: end;
    margin-bottom: 30px;
    padding: 20px;
    background: #f8f9fa;
    border-radius: 8px;
    flex-wrap: wrap;
  }

  .filter-group {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .filter-group label {
    font-weight: 500;
    font-size: 14px;
  }

  .filter-group input,
  .filter-group select {
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 14px;
  }

  .stats-section {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 20px;
    margin-bottom: 30px;
  }

  .stat-card {
    background: white;
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    text-align: center;
  }

  .stat-card h4 {
    margin: 0 0 10px 0;
    font-size: 14px;
    color: #666;
  }

  .stat-number {
    margin: 0;
    font-size: 24px;
    font-weight: bold;
    color: #2c9316;
  }

  .table-container {
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    overflow: hidden;
  }

  .table {
    margin: 0;
  }

  .table th {
    background: #f8f9fa;
    border-bottom: 2px solid #dee2e6;
    font-weight: 600;
  }

  .enrollment-count {
    font-weight: bold;
    color: #2c9316;
  }

  .status-badge {
    padding: 4px 8px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 500;
  }

  .status-badge.active {
    background: #d4edda;
    color: #155724;
  }

  .status-badge.inactive {
    background: #f8d7da;
    color: #721c24;
  }

  .status-badge.enrolled {
    background: #cce5ff;
    color: #004085;
  }

  .status-badge.completed {
    background: #d1ecf1;
    color: #0c5460;
  }

  .status-badge.dropped {
    background: #f8d7da;
    color: #721c24;
  }

  .status-badge.inactive {
    background: #e2e3e5;
    color: #383d41;
  }

  .status-badge.suspended {
    background: #fff3cd;
    color: #856404;
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

  .form-check {
    margin-top: 15px;
  }

  .btn {
    padding: 8px 16px;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    font-size: 14px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .btn-primary {
    background: #2c9316;
    color: white;
  }

  .btn-primary:hover {
    background: #1e6b0f;
  }

  .btn-secondary {
    background: #6c757d;
    color: white;
  }

  .btn-outline-primary {
    background: transparent;
    color: #2c9316;
    border: 1px solid #2c9316;
  }

  .btn-outline-secondary {
    background: transparent;
    color: #6c757d;
    border: 1px solid #6c757d;
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

  @media (max-width: 768px) {
    .filters-section {
      flex-direction: column;
      align-items: stretch;
    }

    .stats-section {
      grid-template-columns: 1fr;
    }
  }
</style>
