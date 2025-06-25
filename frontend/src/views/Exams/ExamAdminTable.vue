<template>
  <div class="container my-5">
    <h2 class="mb-4">Prövningselever</h2>

    <!-- Sök & Filter -->
    <div class="row g-3 mb-4">
      <div class="col-md-4">
        <input v-model="search" type="text" class="form-control" placeholder="Sök på namn" />
      </div>
      <div class="col-md-4">
        <select v-model="filterMonth" class="form-select">
          <option value="">Alla månader</option>
          <option v-for="month in months" :key="month" :value="month">{{ month }}</option>
        </select>
      </div>
      <div class="col-md-4">
        <select v-model="filterStatus" class="form-select">
          <option value="">Alla statusar</option>
          <option value="intresse">Intresse</option>
          <option value="scheduled">Godkänd</option>
          <option value="moved">Flyttad</option>
          <option value="denied">Nekad</option>
        </select>
      </div>
    </div>

    <!-- Lista -->
    <table class="table table-bordered table-striped align-middle">
      <thead class="table-light">
        <tr>
          <th>Namn</th>
          <th>Kurs</th>
          <th>Månad</th>
          <th>Lärare</th>
          <th>Status</th>
          <th>Material</th>
          <th>Betalning</th>
          <th>Beslut</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="exam in filteredExams" :key="exam._id">
          <td>{{ exam.name }}</td>
          <td>{{ exam.course }}</td>
          <td>{{ exam.requestedMonthFormatted }}</td>
          <td>{{ exam.teacherId?.name || '–' }}</td>
          <td>{{ exam.status }}</td>
          <td>
            <span v-if="exam.materialReceived?.status" class="badge bg-success">Ja</span>
            <span v-else class="badge bg-secondary">Nej</span>
          </td>
          <td>{{ formatDate(exam.paymentDate) }}</td>
          <td>
            <div class="mb-2">
              <select v-model="decisions[exam._id].decision" class="form-select form-select-sm">
                <option value="">Välj</option>
                <option value="accept">Godkänn</option>
                <option value="move">Flytta</option>
                <option value="deny">Neka</option>
              </select>
            </div>
            <textarea
              v-model="decisions[exam._id].comment"
              rows="2"
              class="form-control form-control-sm mb-1"
              placeholder="Kommentar"
            ></textarea>
            <div class="d-flex justify-content-between align-items-start">
              <button class="btn btn-sm btn-primary" @click="submitDecision(exam._id)">
                Spara
              </button>
              <button class="btn btn-sm btn-danger ms-2" @click="deleteExam(exam._id)">
                Ta bort
              </button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
  import { ref, onMounted, computed } from 'vue'
  import axios from 'axios'

  const exams = ref([])
  const search = ref('')
  const filterMonth = ref('')
  const filterStatus = ref('')

  const decisions = ref({})

  // Generera månader dynamiskt
  const months = computed(() => {
    const currentYear = new Date().getFullYear()
    return Array.from({ length: 12 }, (_, i) => {
      const month = new Date(currentYear, i, 1)
      return month.toLocaleString('sv-SE', { month: 'long' })
    })
  })

  const fetchExams = async () => {
    try {
      const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/exams`)
      exams.value = res.data.map((exam) => ({
        ...exam,
        requestedMonthFormatted: formatRequestedMonth(exam.requestedMonth),
      }))

      // Initiera beslut-fält
      res.data.forEach((e) => {
        decisions.value[e._id] = {
          decision: e.decision || '',
          comment: e.comment || '',
        }
      })
    } catch (err) {
      console.error('Fel vid hämtning:', err)
    }
  }

  // Formattera månad för visning
  const formatRequestedMonth = (monthYear) => {
    if (!monthYear) return ''
    const [year, month] = monthYear.split('-')
    return new Date(year, month - 1).toLocaleString('sv-SE', { month: 'long', year: 'numeric' })
  }

  const formatDate = (date) => {
    if (!date) return ''
    return new Date(date).toLocaleDateString('sv-SE')
  }

  const submitDecision = async (id) => {
    const { decision, comment } = decisions.value[id]
    if (!decision) {
      alert('Beslut krävs')
      return
    }

    try {
      await axios.put(`${import.meta.env.VITE_API_URL}/api/exams/${id}/decision`, {
        decision,
        comment,
      })
      alert('Beslut sparat')
      fetchExams()
    } catch (err) {
      console.error(err)
      alert('Fel vid beslutssparning')
    }
  }

  const deleteExam = async (id) => {
    if (!confirm('Är du säker på att du vill ta bort denna prövning?')) return
    try {
      await axios.delete(`${import.meta.env.VITE_API_URL}/api/exams/${id}`)
      alert('Prövning borttagen')
      fetchExams()
    } catch (err) {
      console.error('Fel vid borttagning:', err)
      alert('Kunde inte ta bort prövningen.')
    }
  }

  onMounted(fetchExams)

  const filteredExams = computed(() => {
    return exams.value.filter((e) => {
      const matchSearch = e.name.toLowerCase().includes(search.value.toLowerCase())
      const matchMonth =
        !filterMonth.value ||
        e.requestedMonthFormatted.toLowerCase().includes(filterMonth.value.toLowerCase())
      const matchStatus = !filterStatus.value || e.status === filterStatus.value
      return matchSearch && matchMonth && matchStatus
    })
  })
</script>
