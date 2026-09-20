<template>
  <div class="apl-completed-container">
    <div class="completed-header">
      <h3>Avslutade praktiker</h3>
      <div class="header-actions">
        <v-text-field
          v-model="search"
          placeholder="Sök elev..."
          append-icon="mdi-magnify"
          dense
          clearable
          class="search-field"
        />
      </div>
    </div>

    <div v-if="loading" class="text-center pa-4">Laddar avslutade praktiker...</div>

    <div v-else-if="filteredRecords.length > 0" class="completed-list">
      <div v-for="record in filteredRecords" :key="record._id" class="completed-card">
        <div class="completed-card-header">
          <router-link :to="`/student/${record.studentId?._id}`" class="student-link">
            {{ record.studentId?.name || 'Okänd elev' }}
          </router-link>
          <v-chip color="green" size="small" label>Avslutad</v-chip>
        </div>
        <div class="completed-card-body">
          <div v-if="record.placementCompany" class="info-row">
            <strong>Praktikplats:</strong> {{ record.placementCompany }}
          </div>
          <div v-if="record.placementContact || record.studentId?.email || record.studentId?.phone" class="info-row contact-row">
            <strong>Kontakt:</strong>
            <span>{{ record.placementContact || '–' }}</span>
            <span v-if="record.studentId?.email"> · {{ record.studentId.email }}</span>
            <span v-if="record.studentId?.phone"> · {{ record.studentId.phone }}</span>
          </div>
          <div v-if="record.internshipStartDate || record.internshipEndDate" class="info-row">
            <strong>Period:</strong>
            {{ formatDate(record.internshipStartDate || record.aplStartDate) }}
            –
            {{ formatDate(record.internshipEndDate || record.aplEndDate) }}
          </div>
          <div v-if="record.completedAt" class="info-row">
            <strong>Avslutad:</strong> {{ formatDate(record.completedAt) }}
          </div>
          <div class="document-status-row" aria-label="Dokumentstatus">
            <span :class="['document-status', record.cvDocId ? 'is-present' : 'is-missing']">
              <v-icon size="16">{{ record.cvDocId ? 'mdi-check-circle' : 'mdi-minus-circle-outline' }}</v-icon>
              CV {{ record.cvDocId ? 'uppladdat' : 'saknas' }}
            </span>
            <span class="document-status contract-cell">
              <v-checkbox
                :model-value="Boolean(record.contractDocId)"
                :loading="uploadingContractId === record._id"
                hide-details
                dense
                class="contract-checkbox"
                :label="record.contractDocId ? 'Avtal mottaget' : 'Avtal ej mottaget'"
                @update:model-value="(v) => toggleContract(record, v)"
              />
              <input
                :ref="setContractInput(record._id)"
                type="file"
                accept=".pdf"
                style="display: none"
                @change="(e) => handleContractFile(record, e)"
              />
            </span>
          </div>
          <div v-if="record.notes" class="info-row notes">
            <strong>Anteckningar:</strong> {{ record.notes }}
          </div>
        </div>
      </div>
    </div>

    <div v-else class="empty-state">
      <v-icon size="48" color="grey">mdi-check-circle-outline</v-icon>
      <p>Inga avslutade praktiker</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import client from '@/api/client.js'
import { useToast } from '@/composables/useToast.js'

const toast = useToast()

const records = ref([])
const loading = ref(false)
const search = ref('')
const uploadingContractId = ref(null)
const contractInputs = ref({})

const filteredRecords = computed(() => {
  let result = records.value
  if (search.value) {
    const q = search.value.toLowerCase()
    result = result.filter(r =>
      r.studentId?.name?.toLowerCase().includes(q) ||
      r.placementCompany?.toLowerCase().includes(q)
    )
  }
  return result
})

function studentIdOf(record) {
  return record.studentId?._id || record.studentId || null
}

function setContractInput(id) {
  return (el) => {
    if (el) contractInputs.value[id] = el
  }
}

async function toggleContract(record, checked) {
  if (!record) return
  const sid = studentIdOf(record)
  if (!sid) return

  if (checked) {
    if (!record.contractDocId) {
      const input = contractInputs.value[record._id]
      if (input) input.click()
      else toast.error('Kunde inte öppna filväljaren.')
    }
    return
  }

  uploadingContractId.value = record._id
  try {
    await client.put(`/apl/records/${sid}`, { contractDocId: null })
    toast.success('Avtal borttaget.')
    await loadCompleted()
  } catch {
    toast.error('Kunde inte ta bort avtalet.')
  } finally {
    uploadingContractId.value = null
  }
}

async function handleContractFile(record, event) {
  const file = event.target.files?.[0]
  const sid = studentIdOf(record)
  if (!file || !sid) return
  uploadingContractId.value = record._id
  try {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('type', 'APL_CONTRACT')
    formData.append('studentId', sid)
    const { data } = await client.post('/documents/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    await client.put(`/apl/records/${sid}`, { contractDocId: data.document?._id || data._id })
    toast.success('Kontrakt uppladdat.')
    await loadCompleted()
  } catch (error) {
    toast.error(error.response?.data?.error || 'Kunde inte ladda upp kontrakt.')
  } finally {
    uploadingContractId.value = null
    event.target.value = ''
  }
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('sv-SE')
}

async function loadCompleted() {
  loading.value = true
  try {
    const { data } = await client.get('/apl/records', { params: { status: 'GREEN' } })
    records.value = data || []
  } catch {
    records.value = []
  } finally {
    loading.value = false
  }
}

onMounted(loadCompleted)
</script>

<style scoped>
.apl-completed-container {
  padding: 20px;
}
.completed-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}
.completed-header h3 { margin: 0; }
.search-field { max-width: 300px; }
.completed-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.completed-card {
  border: 1px solid #dee2e6;
  border-left: 4px solid #4caf50;
  border-radius: 8px;
  padding: 16px;
  background: #f8fff9;
}
.completed-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.student-link {
  font-weight: 600;
  color: #1976d2;
  text-decoration: none;
}
.student-link:hover { text-decoration: underline; }
.completed-card-body {
  font-size: 14px;
  color: #495057;
}
.info-row {
  margin-bottom: 4px;
}
.info-row.notes {
  font-style: italic;
  color: #6c757d;
  margin-top: 8px;
}
.document-status-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 12px;
}
.document-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
}
.document-status.is-present { color: #2e7d32; }
.document-status.is-missing { color: #b45309; }
.contract-cell {
  display: inline-flex;
  align-items: center;
}
.contract-checkbox {
  margin: 0;
}
.empty-state {
  text-align: center;
  padding: 40px;
  color: #6c757d;
}
</style>
