<template>
  <div class="scrollable-view">
    <div class="earnings-container">
      <h2>Total Earnings: {{ formatKr(report.totalEarnings) }} kr</h2>

      <div class="filters">
        <label>
          Från
          <input type="date" v-model="startDate" />
        </label>
        <label>
          Till
          <input type="date" v-model="endDate" />
        </label>
        <button class="btn btn-sm btn-primary" :disabled="loading" @click="loadReport">
          {{ loading ? 'Laddar...' : 'Uppdatera' }}
        </button>
      </div>

      <div class="summary">
        <div class="stat">
          <span>Genomfört (realiserat)</span>
          <strong>{{ formatKr(report.totalEarnings) }} kr</strong>
        </div>
        <div class="stat">
          <span>Prognos</span>
          <strong>{{ formatKr(report.totalForecasted) }} kr</strong>
        </div>
        <div class="stat">
          <span>Totalt</span>
          <strong>{{ formatKr(report.totalRevenue) }} kr</strong>
        </div>
      </div>

      <h3>Earnings per Municipality</h3>
      <table>
        <thead>
          <tr>
            <th>Municipality</th>
            <th>Realiserat</th>
            <th>Prognos</th>
            <th>Totalt</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in report.byMunicipality" :key="row.municipality">
            <td>{{ row.municipality }}</td>
            <td>{{ formatKr(row.realized) }} kr</td>
            <td>{{ formatKr(row.forecasted) }} kr</td>
            <td>{{ formatKr(row.revenue) }} kr</td>
          </tr>
          <tr v-if="!report.byMunicipality.length">
            <td colspan="4">Inga data</td>
          </tr>
        </tbody>
      </table>

      <h3>Earnings per Course</h3>
      <table>
        <thead>
          <tr>
            <th>Kurs</th>
            <th>Realiserat</th>
            <th>Prognos</th>
            <th>Totalt</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in report.byCourse" :key="row.course">
            <td>{{ row.course }}</td>
            <td>{{ formatKr(row.realized) }} kr</td>
            <td>{{ formatKr(row.forecasted) }} kr</td>
            <td>{{ formatKr(row.revenue) }} kr</td>
          </tr>
          <tr v-if="!report.byCourse.length">
            <td colspan="4">Inga data</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
  import { ref, onMounted } from 'vue'
  import client from '@/api/client.js'
  import { useToast } from '@/composables/useToast.js'

  const toast = useToast()
  const loading = ref(false)
  const startDate = ref('')
  const endDate = ref('')

  const report = ref({
    totalEarnings: 0,
    totalRevenue: 0,
    totalForecasted: 0,
    byMunicipality: [],
    byCourse: [],
  })

  const formatKr = (value) => {
    const num = Number(value) || 0
    return num.toLocaleString('sv-SE')
  }

  const loadReport = async () => {
    loading.value = true
    try {
      const params = {}
      if (startDate.value) params.startDate = startDate.value
      if (endDate.value) params.endDate = endDate.value
      const res = await client.get('/students/earnings', { params })
      report.value = {
        totalEarnings: res.data.totalEarnings || 0,
        totalRevenue: res.data.totalRevenue || 0,
        totalForecasted: res.data.totalForecasted || 0,
        byMunicipality: res.data.byMunicipality || [],
        byCourse: res.data.byCourse || [],
      }
    } catch (err) {
      toast.error('Kunde inte ladda intäkter.')
    } finally {
      loading.value = false
    }
  }

  onMounted(loadReport)
</script>

<style scoped>
  .earnings-container {
    max-width: 800px;
    margin: auto;
    padding: 1rem;
  }
  .filters {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin: 0.5rem 0 1rem;
  }
  .filters label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.9rem;
  }
  .summary {
    display: flex;
    gap: 1rem;
    margin-bottom: 1rem;
  }
  .stat {
    flex: 1;
    border: 1px solid #ddd;
    border-radius: 6px;
    padding: 0.75rem;
    text-align: center;
  }
  .stat span {
    display: block;
    font-size: 0.8rem;
    color: #666;
  }
  .stat strong {
    display: block;
    font-size: 1.15rem;
    margin-top: 0.2rem;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 1.5rem;
  }
  th,
  td {
    border: 1px solid #ccc;
    padding: 0.6rem;
    text-align: left;
  }
</style>