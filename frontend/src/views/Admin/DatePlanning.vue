<template>
  <div class="container-fluid py-4">
    <h2>Datumplanering</h2>
    <p class="text-muted">
      Förhandsgranska och tillämpa en 5-, 10- eller 20-veckorsplan för en
      befintlig kursinstans. Sparade schemaparametrar för läraren används när
      de finns, annars används jämnt fördelade veckor.
    </p>

    <div class="row mb-3">
      <div class="col-md-6">
        <label for="date-plan-instance" class="form-label">Kursinstans</label>
        <select id="date-plan-instance" v-model="instanceId" class="form-select">
          <option value="">Välj kursinstans</option>
          <option v-for="instance in instances" :key="instance._id" :value="instance._id">
            {{ instance.courseName }} ({{ formatDate(instance.startDate) }} – {{ formatDate(instance.endDate) }})
          </option>
        </select>
      </div>
      <div class="col-md-3">
        <label for="date-plan-length" class="form-label">Kurslängd</label>
        <select id="date-plan-length" v-model="lengthWeeks" class="form-select">
          <option value="">Samma som kursen</option>
          <option value="5">5 veckor</option>
          <option value="10">10 veckor</option>
          <option value="20">20 veckor</option>
        </select>
      </div>
    </div>

    <div class="mb-3">
      <button
        type="button"
        class="btn btn-primary me-2"
        :disabled="!instanceId || isLoading"
        @click="preview"
      >
        Förhandsgranska
      </button>
      <button
        type="button"
        class="btn btn-outline-primary"
        :disabled="!instanceId || isApplying"
        @click="apply"
      >
        Tillämpa plan
      </button>
    </div>

    <div v-if="errorMessage" class="alert alert-danger" role="alert">
      {{ errorMessage }}
    </div>
    <div v-if="successMessage" class="alert alert-success" role="alert">
      {{ successMessage }}
    </div>

    <div v-if="previewPlan" class="card">
      <div class="card-header">Föreslagen plan ({{ previewPlan.lengthWeeks }} veckor)</div>
      <div class="card-body">
        <p class="mb-2">
          Startdatum: {{ previewPlan.startDate }} · Slutdatum:
          {{ previewPlan.endDate }} · Offset:
          {{ previewPlan.source === 'saved' ? 'lärarens sparade värden' : 'standard' }}
        </p>
        <table class="table table-sm">
          <thead>
            <tr>
              <th>Modul</th>
              <th>Startdatum</th>
              <th>Slutdatum</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(module, index) in previewPlan.moduleDates" :key="index">
              <td>Modul {{ index + 1 }}</td>
              <td>{{ module.startDate }}</td>
              <td>{{ module.endDate }}</td>
            </tr>
          </tbody>
        </table>
        <p class="text-muted mb-0">
          Undervisningstillfällen: {{ previewPlan.sectionDates.join(', ') }}
        </p>
      </div>
    </div>
  </div>
</template>

<script>
import { onMounted, ref } from 'vue'
import client from '@/api/client.js'

const readError = (err, fallback) =>
  err.response?.data?.error?.message ||
  err.response?.data?.error ||
  err.response?.data?.message ||
  fallback

export default {
  name: 'DatePlanning',
  setup() {
    const instances = ref([])
    const instanceId = ref('')
    const lengthWeeks = ref('')
    const previewPlan = ref(null)
    const isLoading = ref(false)
    const isApplying = ref(false)
    const errorMessage = ref('')
    const successMessage = ref('')

    const formatDate = (value) => (value ? String(value).slice(0, 10) : '')

    const payload = () => {
      const body = { instanceId: instanceId.value }
      if (lengthWeeks.value !== '') body.lengthWeeks = Number(lengthWeeks.value)
      return body
    }

    const loadInstances = async () => {
      try {
        const response = await client.get('/course-instances')
        instances.value = response.data?.instances || []
      } catch (err) {
        errorMessage.value = readError(err, 'Kunde inte hämta kursinstanser.')
      }
    }

    const preview = async () => {
      if (!instanceId.value) return
      isLoading.value = true
      errorMessage.value = ''
      successMessage.value = ''
      try {
        const response = await client.post('/date-plan/preview', payload())
        previewPlan.value = response.data?.datePlan || null
        if (!previewPlan.value) {
          errorMessage.value = 'Ingen plan kunde beräknas.'
        }
      } catch (err) {
        previewPlan.value = null
        errorMessage.value = readError(err, 'Kunde inte förhandsgranska planen.')
      } finally {
        isLoading.value = false
      }
    }

    const apply = async () => {
      if (!instanceId.value) return
      isApplying.value = true
      errorMessage.value = ''
      successMessage.value = ''
      try {
        const response = await client.put('/date-plan/apply', payload())
        previewPlan.value = response.data?.datePlan || null
        successMessage.value =
          response.data?.message || 'Datumplanen har tillämpats.'
        await loadInstances()
      } catch (err) {
        errorMessage.value = readError(err, 'Kunde inte tillämpa planen.')
      } finally {
        isApplying.value = false
      }
    }

    onMounted(loadInstances)

    return {
      instances,
      instanceId,
      lengthWeeks,
      previewPlan,
      isLoading,
      isApplying,
      errorMessage,
      successMessage,
      formatDate,
      preview,
      apply,
    }
  },
}
</script>
