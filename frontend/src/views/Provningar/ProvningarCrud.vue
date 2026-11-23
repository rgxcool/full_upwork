<template>
  <div class="scrollable-view">
    <v-container class="my-5">
      <h2 class="mb-4">Hantera Prövningar</h2>

      <!-- Actions -->
      <v-row class="mb-2">
        <v-col cols="12" class="d-flex flex-wrap align-center provning-actions">
          <v-btn v-if="isAdmin" color="primary" @click="openForm()">Registrera Ny</v-btn>
          <v-btn v-if="isAdmin" color="secondary" variant="outlined" @click="showImport = true">
            Importera
          </v-btn>
          <v-btn color="secondary" variant="outlined" @click="exportExams">Exportera</v-btn>
          <span v-if="!isAdmin" class="text-caption ms-2">
            Visar prövningar där du är ansvarig lärare.
          </span>
        </v-col>
      </v-row>

      <!-- Search and Filter Bar -->
      <v-row class="mb-4" dense>
        <v-col cols="12" md="4">
          <v-text-field
            v-model="searchQuery"
            label="Sök elev, kurs eller personnummer"
            prepend-inner-icon="mdi-magnify"
            outlined
            dense
            clearable
          />
        </v-col>
        <v-col cols="12" md="3">
          <v-select
            v-model="filterStatus"
            :items="statusOptions"
            label="Status"
            outlined
            dense
            clearable
          />
        </v-col>
        <v-col cols="12" md="3">
          <v-select v-model="filterMonth" :items="months" label="Månad" outlined dense clearable />
        </v-col>
      </v-row>

      <!-- Exams Table -->
      <v-data-table
        :headers="headers"
        :items="filteredExams"
        :search="searchQuery"
        dense
        class="elevation-1"
      >
        <template #item.status="{ item }">
          <v-chip :color="statusColor(item.status)" small dark>
            {{ statusLabel(item.status) }}
          </v-chip>
        </template>
        <template #item.accommodations="{ item }">
          <span class="accommodation-icons">
            <v-icon v-if="item.accommodations?.extraTime" small title="Extra skrivtid" class="me-1">
              mdi-clock-plus-outline
            </v-icon>
            <v-icon v-if="item.accommodations?.computer" small title="Dator" class="me-1">
              mdi-laptop
            </v-icon>
            <v-icon
              v-if="item.accommodations?.separateRoom"
              small
              title="Sitter ensam"
              class="me-1"
            >
              mdi-account-off
            </v-icon>
            <v-menu
              v-if="item.accommodations?.notes?.trim()"
              location="top"
              :close-on-content-click="false"
            >
              <template #activator="{ props }">
                <v-btn
                  v-bind="props"
                  icon
                  variant="text"
                  size="x-small"
                  class="accommodation-note-trigger"
                  :title="`Visa anteckning: ${item.accommodations.notes}`"
                  :aria-label="`Visa anteckning om anpassning: ${item.accommodations.notes}`"
                >
                  <v-icon size="18">mdi-script-text-outline</v-icon>
                </v-btn>
              </template>
              <v-card min-width="260" max-width="360" class="accommodation-note-popup">
                <v-card-title class="text-subtitle-2">Anteckning om anpassning</v-card-title>
                <v-card-text class="accommodation-note-text">
                  {{ item.accommodations.notes }}
                </v-card-text>
              </v-card>
            </v-menu>
            <span
              v-if="
                !item.accommodations?.extraTime &&
                !item.accommodations?.computer &&
                !item.accommodations?.separateRoom &&
                !item.accommodations?.notes?.trim()
              "
              class="text-muted"
            >
              —
            </span>
          </span>
        </template>
        <template #item.decision="{ item }">
          <span>{{ decisionLabel(item.decision) }}</span>
        </template>
        <template #item.actions="{ item }">
          <v-icon small class="me-2" title="Beslut" @click="openDecision(item)">mdi-gavel</v-icon>
          <template v-if="isAdmin">
            <v-icon small class="me-2" title="Redigera" @click="openForm(item)">mdi-pencil</v-icon>
            <v-icon small color="red" title="Ta bort" @click="deleteExam(item._id)">
              mdi-delete
            </v-icon>
          </template>
        </template>
      </v-data-table>

      <ConfirmDialog
        v-model="showDeleteDialog"
        title="Ta bort prövning"
        message="Är du säker på att du vill ta bort denna prövning? Åtgärden går inte att ångra."
        confirm-label="Ta bort"
        danger
        :loading="deleting"
        @confirm="confirmDelete"
      />

      <!-- Inline Edit Form -->
      <v-dialog v-model="showForm" max-width="600px" persistent>
        <v-card>
          <v-card-title>{{ currentExam._id ? 'Redigera' : 'Registrera' }} Prövning</v-card-title>
          <v-card-text>
            <v-text-field v-model="currentExam.name" label="Namn" required />
            <v-text-field v-model="currentExam.personalNumber" label="Personnummer" required />
            <v-text-field v-model="currentExam.phone" label="Telefon" />
            <v-text-field v-model="currentExam.email" label="E-post" />
            <v-text-field v-model="currentExam.address" label="Adress" />
            <v-text-field v-model="currentExam.course" label="Kurs" required />
            <v-select
              v-model="currentExam.requestedMonth"
              :items="months"
              label="Önskad månad"
              required
            />
            <v-text-field v-model="currentExam.municipality" label="Kommun" />
            <v-select
              v-model="currentExam.teacherId"
              :items="teacherOptions"
              label="Lärare"
              clearable
              density="compact"
            />
            <v-text-field v-model="currentExam.paymentDate" type="date" label="Betalningsdatum" />
            <v-select v-model="currentExam.examMode" :items="examModeOptions" label="Tentatyp" />
            <v-text-field v-model="currentExam.examRoom" label="Rum" />
            <div class="text-subtitle-2 mt-2 mb-1">Anpassningar</div>
            <v-checkbox
              v-model="currentExam.accommodations.extraTime"
              label="Extra skrivtid"
              density="compact"
              hide-details
            />
            <v-checkbox
              v-model="currentExam.accommodations.computer"
              label="Dator"
              density="compact"
              hide-details
            />
            <v-checkbox
              v-model="currentExam.accommodations.separateRoom"
              label="Sitter ensam"
              density="compact"
              hide-details
            />
            <v-text-field
              v-model="currentExam.accommodations.notes"
              label="Anteckning om anpassning"
              density="compact"
            />
            <div class="text-subtitle-2 mt-2 mb-1">Material hämtat</div>
            <div v-for="level in MATERIAL_LEVELS" :key="level.key" class="d-flex align-center ga-2">
              <v-checkbox
                v-model="currentExam.materialReceived[level.key].status"
                :label="level.label"
                density="compact"
                hide-details
              />
              <v-text-field
                v-if="currentExam.materialReceived[level.key].status"
                v-model="currentExam.materialReceived[level.key].receivedDate"
                type="date"
                :label="`${level.label} – datum`"
                density="compact"
                hide-details
              />
            </div>
            <v-alert v-if="formError" type="error" density="compact" class="mt-2">
              {{ formError }}
            </v-alert>
          </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn text @click="closeForm()">Avbryt</v-btn>
            <v-btn color="primary" :loading="saving" :disabled="saving" @click="saveExam()">
              Spara
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>

      <!-- Decision Dialog -->
      <v-dialog v-model="showDecision" max-width="520px" persistent>
        <v-card>
          <v-card-title>Beslut för prövning</v-card-title>
          <v-card-text>
            <p v-if="decisionTarget" class="mb-2">
              <strong>{{ decisionTarget.name }}</strong>
              — {{ decisionTarget.course }} ({{ decisionTarget.requestedMonth }})
            </p>
            <v-textarea
              v-model="decisionComment"
              label="Motivering (krävs vid Neka)"
              rows="2"
              auto-grow
            />
            <v-alert v-if="decisionError" type="error" density="compact" class="mt-2">
              {{ decisionError }}
            </v-alert>
          </v-card-text>
          <v-card-actions class="flex-wrap">
            <v-btn text @click="closeDecision()">Avbryt</v-btn>
            <v-spacer />
            <v-btn
              color="red"
              :loading="savingDecision"
              :disabled="savingDecision"
              @click="submitDecision('deny')"
            >
              Neka
            </v-btn>
            <v-btn
              color="orange"
              :loading="savingDecision"
              :disabled="savingDecision"
              @click="submitDecision('move')"
            >
              Flytta fram
            </v-btn>
            <v-btn
              color="green"
              :loading="savingDecision"
              :disabled="savingDecision"
              @click="submitDecision('accept')"
            >
              Acceptera
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>

      <!-- Import Dialog -->
      <v-dialog v-model="showImport" max-width="550px" persistent>
        <v-card>
          <v-card-title>Importera prövningar</v-card-title>
          <v-card-text>
            <div
              class="import-dropzone"
              :class="{ 'dropzone-hover': isDragging }"
              @dragover.prevent="isDragging = true"
              @dragleave.prevent="isDragging = false"
              @drop.prevent="handleDrop"
            >
              <v-icon size="48" color="grey">mdi-cloud-upload-outline</v-icon>
              <p class="mt-2 mb-1">
                <strong>Dra och släpp</strong>
                en CSV- eller Excel-fil här
              </p>
              <p class="text-caption text-grey">eller</p>
              <v-btn size="small" variant="outlined" @click="$refs.fileInput.click()">
                Välj fil
              </v-btn>
              <input
                ref="fileInput"
                type="file"
                accept=".csv,.xlsx,.xls"
                class="d-none"
                @change="handleFileSelect"
              />
            </div>
            <div v-if="importFile" class="mt-3">
              <v-chip closable @click:close="importFile = null">
                <v-icon start>mdi-file-document</v-icon>
                {{ importFile.name }}
              </v-chip>
            </div>
            <v-alert
              v-if="importResult"
              :type="importResult.success ? 'success' : 'error'"
              class="mt-3"
              density="compact"
            >
              {{ importResult.message }}
              <div v-if="importResult.skipped?.length" class="mt-1 text-caption">
                Spragna rader: {{ importResult.skipped.length }} (t.ex. dubletter eller saknade
                fält)
              </div>
            </v-alert>
          </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn text @click="closeImport()">Avbryt</v-btn>
            <v-btn
              color="primary"
              :disabled="!importFile || importing"
              :loading="importing"
              @click="submitImport()"
            >
              Importera
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
    </v-container>
  </div>
</template>

<script setup>
  import { ref, computed, onMounted } from 'vue'
  import client from '@/api/client.js'
  import { teacherDisplayName } from '@/utils/teacherName.js'
  import { useToast } from '@/composables/useToast.js'
  import ConfirmDialog from '@/components/base/ConfirmDialog.vue'
  import { exportToCSV } from '@/utils/exportUtils.js'
  import { useStore } from 'vuex'

  const toast = useToast()

  const exams = ref([])
  const showForm = ref(false)
  const createEmptyExam = () => ({
    status: 'intresse',
    name: '',
    personalNumber: '',
    phone: '',
    email: '',
    address: '',
    course: '',
    requestedMonth: '',
    municipality: '',
    teacherId: null,
    paymentDate: '',
    examMode: 'onsite',
    examRoom: '',
    accommodations: {
      extraTime: false,
      computer: false,
      separateRoom: false,
      notes: '',
    },
    materialReceived: {
      status: false,
      receivedDate: '',
      level1: { status: false, receivedDate: '' },
      level3: { status: false, receivedDate: '' },
    },
  })

  const MATERIAL_LEVELS = [
    { key: 'level1', label: 'SVE/SVA 1' },
    { key: 'level3', label: 'SVE/SVA 3' },
  ]
  const store = useStore()
  const isAdmin = computed(() => store.getters.isAdmin)
  const currentExam = ref(createEmptyExam())
  const searchQuery = ref('')
  const filterStatus = ref('')
  const filterMonth = ref('')
  const showImport = ref(false)
  const importFile = ref(null)
  const isDragging = ref(false)
  const importing = ref(false)
  const importResult = ref(null)
  const formError = ref(null)
  const saving = ref(false)
  const showDeleteDialog = ref(false)
  const deleting = ref(false)
  const deleteTargetId = ref(null)

  const teachers = ref([])
  const showDecision = ref(false)
  const decisionTarget = ref(null)
  const decisionComment = ref('')
  const decisionError = ref(null)
  const savingDecision = ref(false)

  const teacherOptions = computed(() =>
    teachers.value.map((teacher) => ({
      title: teacherDisplayName(teacher, 'Namnlös lärare'),
      value: teacher._id,
    }))
  )

  const toDateInput = (value) => {
    if (!value) return ''
    const date = new Date(value)
    if (isNaN(date.getTime())) return ''
    return date.toISOString().slice(0, 10)
  }

  const headers = [
    { title: 'Namn', key: 'name' },
    { title: 'Kurs', key: 'course' },
    { title: 'Månad', key: 'requestedMonth' },
    { title: 'Kommun', key: 'municipality' },
    { title: 'Status', key: 'status', sortable: true },
    { title: 'Beslut', key: 'decision', sortable: false },
    { title: 'Anpassningar', key: 'accommodations', sortable: false },
    { title: 'Åtgärder', key: 'actions', sortable: false },
  ]

  const decisionLabel = (decision) => {
    const map = { accept: 'Accepterad', move: 'Flyttad', deny: 'Nekad' }
    return map[decision] || '—'
  }

  const examModeOptions = [
    { title: 'På plats', value: 'onsite' },
    { title: 'Distans', value: 'remote' },
  ]

  const statusOptions = [
    { title: 'Intresse', value: 'intresse' },
    { title: 'Scheduled', value: 'scheduled' },
    { title: 'Flyttad', value: 'moved' },
    { title: 'Nekad', value: 'denied' },
  ]

  const months = [
    'Januari',
    'Februari',
    'Mars',
    'April',
    'Maj',
    'Juni',
    'Juli',
    'Augusti',
    'September',
    'Oktober',
    'November',
    'December',
  ]

  const statusColor = (status) => {
    const map = { intresse: 'blue', scheduled: 'green', moved: 'orange', denied: 'red' }
    return map[status] || 'grey'
  }

  const statusLabel = (status) => {
    const map = { intresse: 'Intresse', scheduled: 'Scheduled', moved: 'Flyttad', denied: 'Nekad' }
    return map[status] || status
  }

  const filteredExams = computed(() => {
    return exams.value.filter((exam) => {
      const matchesSearch =
        !searchQuery.value ||
        exam.name?.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
        exam.course?.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
        exam.personalNumber?.includes(searchQuery.value)
      const matchesStatus = !filterStatus.value || exam.status === filterStatus.value
      const matchesMonth = !filterMonth.value || exam.requestedMonth === filterMonth.value
      return matchesSearch && matchesStatus && matchesMonth
    })
  })

  const fetchExams = async () => {
    try {
      // Admins see every prövning; teachers get only their own (GET /exams is
      // teacher-scoped on the server).
      const { data } = await client.get(isAdmin.value ? '/admin/exams' : '/exams')
      exams.value = data
    } catch (error) {
      toast.error('Kunde inte hämta provningar')
    }
  }

  const fetchTeachers = async () => {
    try {
      const { data } = await client.get('/teachers')
      teachers.value = Array.isArray(data) ? data : []
    } catch (error) {
      // Non-fatal: the teacher select simply stays empty.
      console.error('Kunde inte hämta lärare:', error)
    }
  }

  // Bulk download of the current (filtered) registrations as CSV, mirroring the
  // import columns so an export can be re-imported unchanged.
  const exportExams = () => {
    const headers = [
      'Namn',
      'Personnummer',
      'Telefon',
      'E-post',
      'Adress',
      'Kurs',
      'Önskad månad',
      'Kommun',
      'Lärare',
      'Betalningsdatum',
      'Material SVE/SVA 1',
      'Material SVE/SVA 3',
      'Status',
    ]
    const rows = filteredExams.value.map((exam) => [
      exam.name || '',
      exam.personalNumber || '',
      exam.phone || '',
      exam.email || '',
      exam.address || '',
      exam.course || '',
      exam.requestedMonth || '',
      exam.municipality || '',
      teacherDisplayName(exam.teacherId) || exam.teacherName || '',
      exam.paymentDate ? new Date(exam.paymentDate).toLocaleDateString('sv-SE') : '',
      exam.materialReceived?.level1?.status ? 'Ja' : 'Nej',
      exam.materialReceived?.level3?.status ? 'Ja' : 'Nej',
      exam.status || '',
    ])
    exportToCSV('provningar-export.csv', headers, rows)
  }

  const openForm = (exam = {}) => {
    formError.value = null
    const examData = { ...exam }
    // teacherId is populated by GET /admin/exams; the form needs the raw id.
    if (examData.teacherId && typeof examData.teacherId === 'object') {
      examData.teacherId = examData.teacherId._id
    }
    const levelFrom = (lvl) => ({
      status: Boolean(lvl?.status),
      receivedDate: toDateInput(lvl?.receivedDate),
    })
    const materialReceived = {
      status: Boolean(exam.materialReceived?.status),
      receivedDate: toDateInput(exam.materialReceived?.receivedDate),
      level1: levelFrom(exam.materialReceived?.level1),
      level3: levelFrom(exam.materialReceived?.level3),
    }
    const accommodations =
      exam.accommodations && !Array.isArray(exam.accommodations) ? { ...exam.accommodations } : {}
    currentExam.value = {
      status: 'intresse',
      ...examData,
      paymentDate: toDateInput(examData.paymentDate),
      materialReceived,
      accommodations: {
        extraTime: false,
        computer: false,
        separateRoom: false,
        notes: '',
        ...accommodations,
      },
    }
    showForm.value = true
  }

  const openDecision = (exam) => {
    decisionTarget.value = exam
    decisionComment.value = exam.comment || ''
    decisionError.value = null
    showDecision.value = true
  }

  const closeDecision = () => {
    showDecision.value = false
    decisionTarget.value = null
    decisionComment.value = ''
    decisionError.value = null
  }

  const submitDecision = async (decision) => {
    if (!decisionTarget.value?._id) return
    if (decision === 'deny' && !decisionComment.value?.trim()) {
      decisionError.value = 'Motivering krävs för att neka en prövning.'
      return
    }
    savingDecision.value = true
    decisionError.value = null
    try {
      await client.put(`/exams/${decisionTarget.value._id}/decision`, {
        decision,
        comment: decisionComment.value,
      })
      toast.success(`Beslut sparat: ${decisionLabel(decision)}`)
      closeDecision()
      await fetchExams()
    } catch (err) {
      decisionError.value = err.response?.data?.error || 'Kunde inte spara beslutet.'
    } finally {
      savingDecision.value = false
    }
  }

  const closeForm = () => {
    showForm.value = false
    formError.value = null
    currentExam.value = createEmptyExam()
  }

  const saveExam = async () => {
    formError.value = null
    if (!currentExam.value.name?.trim() || !currentExam.value.course?.trim()) {
      formError.value = 'Namn och kurs måste fyllas i.'
      return
    }
    if (!currentExam.value.requestedMonth) {
      formError.value = 'Välj önskad månad.'
      return
    }
    saving.value = true
    try {
      const payload = { ...currentExam.value }
      delete payload._id
      delete payload.__v
      delete payload.createdAt
      delete payload.updatedAt
      if (!payload.paymentDate) delete payload.paymentDate
      if (payload.materialReceived && !payload.materialReceived.receivedDate) {
        delete payload.materialReceived.receivedDate
      }
      if (payload.teacherId && typeof payload.teacherId === 'object') {
        payload.teacherId = payload.teacherId._id
      }
      if (currentExam.value._id) {
        await client.put(`/exams/${currentExam.value._id}`, payload)
      } else {
        await client.post('/exams', payload)
      }
      toast.success('Prövning sparad!')
      closeForm()
      await fetchExams()
    } catch (err) {
      formError.value = err.response?.data?.message || 'Kunde inte spara prövning.'
    } finally {
      saving.value = false
    }
  }

  const deleteExam = (id) => {
    deleteTargetId.value = id
    showDeleteDialog.value = true
  }

  const confirmDelete = async () => {
    if (!deleteTargetId.value) return
    deleting.value = true
    try {
      await client.delete(`/exams/${deleteTargetId.value}`)
      toast.success('Prövning borttagen.')
      showDeleteDialog.value = false
      deleteTargetId.value = null
      await fetchExams()
    } catch {
      toast.error('Kunde inte ta bort prövningen.')
    } finally {
      deleting.value = false
    }
  }

  const handleFileSelect = (event) => {
    const file = event.target.files[0]
    if (file) setImportFile(file)
  }

  const handleDrop = (event) => {
    isDragging.value = false
    const file = event.dataTransfer.files[0]
    if (file) setImportFile(file)
  }

  const setImportFile = (file) => {
    const ext = file.name.split('.').pop().toLowerCase()
    if (!['csv', 'xlsx', 'xls'].includes(ext)) {
      toast.error('Endast CSV och Excel-filer är tillåtna')
      return
    }
    importFile.value = file
    importResult.value = null
  }

  const closeImport = () => {
    showImport.value = false
    importFile.value = null
    importResult.value = null
    isDragging.value = false
  }

  const submitImport = async () => {
    if (!importFile.value) return
    importing.value = true
    importResult.value = null

    try {
      const ext = importFile.value.name.split('.').pop().toLowerCase()
      const type = ext === 'csv' ? 'csv' : 'excel'
      let fileData

      if (type === 'csv') {
        fileData = await importFile.value.text()
      } else {
        const buffer = await importFile.value.arrayBuffer()
        fileData = Array.from(new Uint8Array(buffer))
      }

      const { data } = await client.post('/exams/import', { file: fileData, type })
      importResult.value = data
      if (data.saved?.length) {
        toast.success(`Import klar: ${data.saved.length} sparade`)
        fetchExams()
      }
    } catch (err) {
      importResult.value = {
        success: false,
        message: err.response?.data?.error || 'Kunde inte importera filen',
      }
    } finally {
      importing.value = false
    }
  }

  onMounted(() => {
    fetchExams()
    // The teacher picker is only used by the admin edit form.
    if (isAdmin.value) fetchTeachers()
  })

  defineExpose({
    exams,
    filteredExams,
    searchQuery,
    currentExam,
    showForm,
    showDecision,
    showDeleteDialog,
    showImport,
    importFile,
    isDragging,
    decisionComment,
    decisionError,
    openForm,
    closeForm,
    openDecision,
    closeDecision,
    submitDecision,
    deleteExam,
    confirmDelete,
    setImportFile,
    closeImport,
    handleFileSelect,
    handleDrop,
    submitImport,
    exportExams,
    statusLabel,
    statusColor,
    decisionLabel,
  })
</script>

<style scoped>
  .import-dropzone {
    border: 2px dashed #ccc;
    border-radius: 8px;
    padding: 32px;
    text-align: center;
    transition:
      border-color 0.2s,
      background 0.2s;
    cursor: pointer;
  }
  .import-dropzone:hover,
  .import-dropzone.dropzone-hover {
    border-color: #1976d2;
    background: rgba(25, 118, 210, 0.04);
  }
  .gap-2 {
    gap: 8px;
  }
  .provning-actions {
    gap: 8px;
  }
  .accommodation-icons {
    display: inline-flex;
    align-items: center;
    min-height: 24px;
  }
  .accommodation-note-trigger {
    color: #1976d2;
    margin: -4px 0;
  }
  .accommodation-note-popup {
    border: 1px solid #d6d6d6;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
  }
  .accommodation-note-text {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
</style>
