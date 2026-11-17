<template>
  <div class="container-fluid py-4">
    <h2>Resursbesök</h2>
    <p class="text-muted">
      Översikt över vilka lärresurser eleverna har öppnat. Besök räknas högst en
      gång per elev, resurs och dag.
    </p>

    <div class="row mb-3 align-items-end">
      <div class="col-md-3">
        <label for="visit-resource-type" class="form-label">Resurstyp</label>
        <select id="visit-resource-type" v-model="resourceType" class="form-select">
          <option value="">Alla typer</option>
          <option value="course_card">Kurskort</option>
          <option value="lesson">Lektion</option>
          <option value="document">Dokument</option>
          <option value="support_resource">Stödresurs</option>
        </select>
      </div>
      <div class="col-md-3">
        <label for="visit-from" class="form-label">Från och med</label>
        <input id="visit-from" v-model="from" type="date" class="form-control" />
      </div>
      <div class="col-md-3">
        <label for="visit-to" class="form-label">Till och med</label>
        <input id="visit-to" v-model="to" type="date" class="form-control" />
      </div>
      <div class="col-md-3">
        <button type="button" class="btn btn-primary w-100" :disabled="isLoading" @click="applyFilters">
          Sök
        </button>
      </div>
    </div>

    <div v-if="errorMessage" class="alert alert-danger" role="alert">
      {{ errorMessage }}
    </div>

    <template v-if="report">
      <div class="row mb-3">
        <div class="col-md-6">
          <div class="card">
            <div class="card-body">
              <h6 class="card-subtitle text-muted">Totalt antal besök</h6>
              <h3 class="card-title mb-0">{{ report.summary.totalVisits }}</h3>
            </div>
          </div>
        </div>
        <div class="col-md-6">
          <div class="card">
            <div class="card-body">
              <h6 class="card-subtitle text-muted">Unika elever</h6>
              <h3 class="card-title mb-0">{{ report.summary.uniqueStudents }}</h3>
            </div>
          </div>
        </div>
      </div>

      <div v-if="topResources.length" class="mb-3">
        <strong>Mest besökta resurser:</strong>
        <span v-for="(count, name) in report.summary.byResource" :key="name" class="badge bg-secondary me-1">
          {{ name }} ({{ count }})
        </span>
      </div>

      <div class="table-responsive">
        <table class="table table-striped table-sm">
          <thead>
            <tr>
              <th>Elev</th>
              <th>Resurs</th>
              <th>Typ</th>
              <th>Kommun</th>
              <th>Besökt</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="visit in report.visits" :key="visit._id">
              <td>{{ visit.studentName }}</td>
              <td>{{ visit.resourceName || visit.resourceId || '—' }}</td>
              <td>{{ resourceTypeLabel(visit.resourceType) }}</td>
              <td>{{ visit.municipality || '—' }}</td>
              <td>{{ formatDate(visit.visitedAt) }}</td>
            </tr>
            <tr v-if="!report.visits.length">
              <td colspan="5" class="text-muted">Inga resursbesök för de valda filtren.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="d-flex align-items-center gap-2">
        <button type="button" class="btn btn-outline-secondary btn-sm" :disabled="page <= 1" @click="prevPage">
          Föregående
        </button>
        <span>Sida {{ report.page }}</span>
        <button
          type="button"
          class="btn btn-outline-secondary btn-sm"
          :disabled="page * report.limit >= report.total"
          @click="nextPage"
        >
          Nästa
        </button>
      </div>
    </template>
  </div>
</template>

<script>
import { computed, onMounted, ref } from 'vue'
import client from '@/api/client.js'

const readError = (err, fallback) =>
  err.response?.data?.error?.message ||
  err.response?.data?.error ||
  err.response?.data?.message ||
  fallback

const TYPE_LABELS = {
  course_card: 'Kurskort',
  lesson: 'Lektion',
  document: 'Dokument',
  support_resource: 'Stödresurs',
}

export default {
  name: 'ResourceVisitsReport',
  setup() {
    const resourceType = ref('')
    const from = ref('')
    const to = ref('')
    const page = ref(1)
    const limit = ref(20)
    const report = ref(null)
    const errorMessage = ref('')
    const isLoading = ref(false)

    const topResources = computed(() =>
      Object.entries(report.value?.summary?.byResource || {})
    )

    const formatDate = (value) =>
      value ? new Date(value).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' }) : ''

    const resourceTypeLabel = (type) => TYPE_LABELS[type] || type || '—'

    const load = async () => {
      isLoading.value = true
      errorMessage.value = ''
      try {
        const params = { page: page.value, limit: limit.value }
        if (resourceType.value) params.resourceType = resourceType.value
        if (from.value) params.from = from.value
        if (to.value) params.to = to.value
        const response = await client.get('/resource-visits/report', { params })
        report.value = response.data
      } catch (err) {
        report.value = null
        errorMessage.value = readError(err, 'Kunde inte hämta resursbesök.')
      } finally {
        isLoading.value = false
      }
    }

    const applyFilters = () => {
      page.value = 1
      load()
    }

    const prevPage = () => {
      if (page.value > 1) {
        page.value -= 1
        load()
      }
    }

    const nextPage = () => {
      page.value += 1
      load()
    }

    onMounted(load)

    return {
      resourceType,
      from,
      to,
      page,
      limit,
      report,
      errorMessage,
      isLoading,
      topResources,
      formatDate,
      resourceTypeLabel,
      applyFilters,
      prevPage,
      nextPage,
    }
  },
}
</script>
