<template>
  <div class="scrollable-view">
    <div class="Reports-wrapper">
      <div class="Reports-header">
        <div class="Reports-title">
          <h2><v-icon start>mdi-table</v-icon>Kompletionsrapporter</h2>
          <p class="subtitle">Följ elevs och grupps framsteg på modulnivå</p>
        </div>
        <v-spacer />
        <v-select
          v-model="selectedInstance"
          :items="courseInstances"
          :loading="instancesLoading"
          :disabled="instancesLoading"
          item-title="courseName"
          item-value="_id"
          label="Kursinstans"
          clearable
        />
      </div>

      <v-divider class="mb-4" />

      <div v-if="instancesError" class="alert alert-danger" role="alert">
        {{ instancesError }}
      </div>

      <div class="Reports-filters">
        <v-row>
          <v-col cols="12" sm="6" md="4">
            <v-select
              v-model="selectedStudent"
              :items="participants"
              :loading="participantsLoading"
              :disabled="participantsLoading || participants.length === 0"
              item-title="name"
              item-value="_id"
              label="Elev"
              density="compact"
              clearable
            />
          </v-col>

          <v-col cols="12" sm="6" md="4">
            <v-text-field
              v-model="searchQuery"
              placeholder="Sök efter elev eller modul..."
              prepend-inner-icon="mdi-magnify"
              density="compact"
              class="search-input"
            />
          </v-col>

          <v-col cols="12" sm="6" md="4">
            <v-btn
              color="primary"
              :disabled="!selectedInstance || !selectedStudent || participantsLoading"
              :loading="reportLoading"
              @click="loadReport"
            >
              Ladda rapport
            </v-btn>
          </v-col>
        </v-row>

        <div v-if="participantsError" class="alert alert-danger mt-2" role="alert">
          {{ participantsError }}
        </div>
        <div v-else-if="!selectedInstance" class="text-caption text-grey mt-2">
          Välj en kursinstans för att se elever.
        </div>
        <div v-else-if="!participantsLoading && participants.length === 0" class="text-caption text-grey mt-2">
          Inga elever i den här kursinstansen.
        </div>
      </div>

      <div v-if="reportLoading" class="loading-section">
        <v-progress-linear indeterminate />
      </div>
      <div v-else-if="reportError" class="alert alert-danger mt-4" role="alert">
        Kunde inte ladda rapport: {{ reportError }}
      </div>
      <div v-else-if="hasReport" class="Reports-content">
        <v-card>
          <v-card-title class="text-h5">Kompletionsrapport: {{ selectedInstanceName }}</v-card-title>
          <v-card-text>
            <v-row dense>
              <v-col cols="12" sm="6" md="4">
                <v-card class="stat-card gradient-green">
                  <v-card-subtitle>Totala moduler</v-card-subtitle>
                  <div class="text-h4">{{ totalModules }}</div>
                </v-card>
              </v-col>

              <v-col cols="12" sm="6" md="4">
                <v-card class="stat-card gradient-yellow">
                  <v-card-subtitle>Slutförda moduler</v-card-subtitle>
                  <div class="text-h4">{{ completedModules }}</div>
                </v-card>
              </v-col>

              <v-col cols="12" sm="6" md="4">
                <v-card class="stat-card gradient-blue">
                  <v-card-subtitle>Genomslagsfrekvens</v-card-subtitle>
                  <div class="text-h4">{{ completionRate }}%</div>
                </v-card>
              </v-col>
            </v-row>

            <v-divider class="my-4" />
            <div class="section-title">Komponentnivå detaljer</div>

            <div class="table-responsive">
              <table class="table table-striped table-sm">
                <thead>
                  <tr>
                    <th>Elev</th>
                    <th>Modul</th>
                    <th>Status</th>
                    <th>Planerat datum</th>
                    <th>Inlämnat</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="visibleTableData.length === 0">
                    <td colspan="5" class="text-muted">
                      {{ searchQuery ? 'Inga moduler matchar sökningen' : 'Inga moduler hittades' }}
                    </td>
                  </tr>
                  <tr v-for="item in visibleTableData" :key="item.moduleNumber">
                    <td>{{ studentColumn(item) }}</td>
                    <td>{{ moduleLabel(item) }}</td>
                    <td>
                      <span class="status-indicator" :class="statusClass(item.status)">
                        <v-icon size="18">{{ statusIcon(item.status) }}</v-icon>
                        {{ statusLabel(item.status) }}
                      </span>
                    </td>
                    <td>{{ formatDate(item.scheduledDate) }}</td>
                    <td>{{ formatDate(item.submittedAt) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </v-card-text>

          <v-card-actions>
            <v-btn
              color="primary"
              :disabled="!hasReport"
              @click="downloadReport"
            >
              Exportera CSV + PDF
            </v-btn>
            <v-spacer />
            <v-btn variant="text" @click="resetFilters">
              Återställ filter
            </v-btn>
          </v-card-actions>
        </v-card>
      </div>
      <v-alert v-else type="info" variant="tonal" class="mt-4">
        Välj kursinstans och elev och ladda sedan rapporten.
      </v-alert>
    </div>
  </div>
</template>

<script>
import { computed, onMounted, ref, watch } from 'vue'
import client from '@/api/client.js'
import { exportToCSV, exportToPDF } from '@/utils/exportUtils.js'

// Matches the convention in ResourceVisitsReport, extended with the normalized
// error shape produced by @/api/client.js (status/message/code/raw).
const readError = (err, fallback) =>
  err?.response?.data?.error?.message ||
  err?.response?.data?.error ||
  err?.response?.data?.message ||
  err?.message ||
  fallback

const STATUS_LABELS = { '✓': 'Klar', '✗': 'Ej klar', '–': 'Ej schemalagd' }
const STATUS_ICONS = {
  '✓': 'mdi-check-circle',
  '✗': 'mdi-close-circle-outline',
  '–': 'mdi-calendar-blank-outline',
}
const STATUS_CLASSES = {
  '✓': 'is-complete',
  '✗': 'is-incomplete',
  '–': 'is-unscheduled',
}

export default {
  name: 'Reports',
  setup() {
    const courseInstances = ref([])
    const instancesLoading = ref(false)
    const instancesError = ref('')

    const selectedInstance = ref('')
    const selectedStudent = ref('')
    const participants = ref([])
    const participantsLoading = ref(false)
    const participantsError = ref('')

    const searchQuery = ref('')
    const reportLoading = ref(false)
    const reportError = ref('')
    const hasReport = ref(false)
    const totalModules = ref(0)
    const completedModules = ref(0)
    const completionRate = ref(0)
    const tableData = ref([])

    const selectedInstanceName = computed(() => {
      if (!selectedInstance.value) return 'Ingen kurs vald'
      return courseInstances.value.find((i) => i._id === selectedInstance.value)?.courseName || ''
    })
    const selectedStudentName = computed(() =>
      participants.value.find((s) => s._id === selectedStudent.value)?.name || ''
    )

    const statusLabel = (status) => STATUS_LABELS[status] || 'Ej valt'
    const statusIcon = (status) => STATUS_ICONS[status] || 'mdi-help-circle-outline'
    const statusClass = (status) => STATUS_CLASSES[status] || 'is-unscheduled'
    const moduleLabel = (item) =>
      item.moduleName ? `Modul ${item.moduleNumber} · ${item.moduleName}` : `Modul ${item.moduleNumber}`
    const studentColumn = (item) => item.studentName || selectedStudentName.value || '–'

    const formatDate = (value) => {
      if (!value) return '–'
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return '–'
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    }

    const visibleTableData = computed(() => {
      const query = searchQuery.value.trim().toLowerCase()
      if (!query) return tableData.value
      return tableData.value.filter((item) =>
        [studentColumn(item), moduleLabel(item), statusLabel(item.status)]
          .join(' ')
          .toLowerCase()
          .includes(query)
      )
    })

    const clearReport = () => {
      hasReport.value = false
      tableData.value = []
      reportError.value = ''
      totalModules.value = 0
      completedModules.value = 0
      completionRate.value = 0
    }

    const loadCourseInstances = async () => {
      instancesLoading.value = true
      instancesError.value = ''
      try {
        const { data } = await client.get('/course-instances')
        courseInstances.value = Array.isArray(data) ? data : data.instances || []
      } catch (err) {
        courseInstances.value = []
        instancesError.value = readError(err, 'Kunde inte hämta kursinstanser.')
      } finally {
        instancesLoading.value = false
      }
    }

    const loadParticipants = async (instanceId = selectedInstance.value) => {
      if (!instanceId) {
        participants.value = []
        return
      }
      participantsLoading.value = true
      participantsError.value = ''
      try {
        const { data } = await client.get(`/learning/instances/${instanceId}/participants`)
        const list = Array.isArray(data) ? data : data.participants || []
        participants.value = list
          .filter((p) => (p.role || p.type || 'student') === 'student')
          .map((p) => ({
            _id: p.participantId || p.studentId || p._id,
            name: p.name || p.studentName || 'Elev',
          }))
          .filter((p) => p._id)
      } catch (err) {
        participants.value = []
        participantsError.value = readError(err, 'Kunde inte hämta elever.')
      } finally {
        participantsLoading.value = false
      }
    }

    watch(selectedInstance, async (instanceId) => {
      clearReport()
      selectedStudent.value = ''
      participants.value = []
      participantsError.value = ''
      if (instanceId) await loadParticipants(instanceId)
    })
    watch(selectedStudent, clearReport)

    const loadReport = async () => {
      if (!selectedInstance.value || !selectedStudent.value) {
        reportError.value = 'Välj både kursinstans och elev'
        return
      }

      reportLoading.value = true
      reportError.value = ''
      clearReport()
      const instanceId = selectedInstance.value
      const studentId = selectedStudent.value
      const isCurrentSelection = () =>
        selectedInstance.value === instanceId && selectedStudent.value === studentId

      try {
        const { data } = await client.get(`/learning/instances/${instanceId}/report/${studentId}`)
        if (!isCurrentSelection()) return
        if (!data?.success) {
          reportError.value = 'Kunde inte ladda rapporten.'
          return
        }

        totalModules.value = data.totalModules || 0
        completedModules.value = data.completedModules || 0
        completionRate.value = parseFloat(data.completionRate) || 0

        // Backend scheduledDates use the section index; moduleNumber is 1-based.
        const scheduleByNumber = new Map()
        ;(data.scheduledDates || []).forEach((sd) => {
          if (sd.date) scheduleByNumber.set(Number(sd.moduleIndex) + 1, sd.date)
        })

        const modules = data.modules || []
        if (modules.length > 0) {
          tableData.value = [...modules]
            .sort((a, b) => (a.moduleNumber ?? 0) - (b.moduleNumber ?? 0))
            .map((m) => ({
              moduleNumber: m.moduleNumber,
              moduleName: m.title,
              status: m.completed ? '✓' : m.scheduled ? '✗' : '–',
              scheduledDate: m.scheduleDate || scheduleByNumber.get(Number(m.moduleNumber)) || null,
              submittedAt: m.submissionDate || m.assignment?.submittedAt || null,
            }))
        } else {
          const completed = data.completedComponents || {}
          tableData.value = Object.entries(completed).map(([moduleNumber, value]) => ({
            moduleNumber,
            moduleName: typeof value === 'object' ? value.moduleName : undefined,
            status: typeof value === 'object' ? (value.completed ? '✓' : '✗') : value,
            scheduledDate: typeof value === 'object' ? value.scheduledDate : null,
            submittedAt: typeof value === 'object' ? value.submittedAt : null,
          }))
        }
        hasReport.value = true
      } catch (err) {
        if (isCurrentSelection()) reportError.value = readError(err, 'Kunde inte ladda rapporten.')
      } finally {
        reportLoading.value = false
      }
    }

    const downloadReport = () => {
      if (!hasReport.value) return
      const studentName = selectedStudentName.value || 'okänd'
      const rows = tableData.value.map((item) => [
        item.moduleNumber,
        item.status === '✓' || item.status === '✗' || item.status === '–'
          ? statusLabel(item.status)
          : 'Ej valt',
        item.scheduledDate ? formatDate(item.scheduledDate) : 'Ej planerat',
        item.submittedAt ? formatDate(item.submittedAt) : 'Ej uppfört',
      ])
      const headers = ['Modul', 'Status', 'Planerat datum', 'Inlämnat']
      exportToCSV(`rapport-${studentName}.csv`, headers, rows)
      exportToPDF(`rapport-${studentName}.pdf`, `Kompletionsrapport – ${studentName}`, headers, rows)
    }

    const resetFilters = () => {
      selectedInstance.value = ''
      selectedStudent.value = ''
      searchQuery.value = ''
      participants.value = []
      participantsError.value = ''
      instancesError.value = ''
      clearReport()
    }

    onMounted(loadCourseInstances)

    return {
      courseInstances,
      instancesLoading,
      instancesError,
      selectedInstance,
      selectedStudent,
      participants,
      participantsLoading,
      participantsError,
      searchQuery,
      reportLoading,
      reportError,
      hasReport,
      totalModules,
      completedModules,
      completionRate,
      tableData,
      visibleTableData,
      selectedInstanceName,
      selectedStudentName,
      statusLabel,
      statusIcon,
      statusClass,
      moduleLabel,
      studentColumn,
      loadCourseInstances,
      loadParticipants,
      loadReport,
      downloadReport,
      resetFilters,
      formatDate,
    }
  },
}
</script>

<style scoped>
.Reports-wrapper {
  padding: 24px;
}

.Reports-header {
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid #e0e0e0;
}

.Reports-title {
  margin: 0;
}

.subtitle {
  color: #666;
  font-size: 14px;
  margin-top: 4px;
}

.Reports-filters {
  margin-top: 20px;
}

.search-input {
  width: 100%;
  margin-bottom: 0;
}

.loading-section {
  padding: 24px 0;
}

.stat-card {
  background: white;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  text-align: center;
}

.gradient-green {
  background: linear-gradient(135deg, #48bb78, #38a169);
  color: white;
}

.gradient-yellow {
  background: linear-gradient(135deg, #f6c23e, #f2a92c);
  color: #212121;
}

.gradient-blue {
  background: linear-gradient(135deg, #40a0f5, #3085d6);
  color: white;
}

.section-title {
  font-size: 0.875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #6b7280;
  margin-bottom: 12px;
}

.table-responsive {
  overflow-x: auto;
}

.status-indicator {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 600;
  font-size: 0.85rem;
}

.status-indicator.is-complete {
  color: #15803d;
}

.status-indicator.is-incomplete {
  color: #b91c1c;
}

.status-indicator.is-unscheduled {
  color: #6b7280;
}
</style>
