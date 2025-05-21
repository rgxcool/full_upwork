<template>
  <div class="container my-5">
    <h2 class="mb-4">Anmälan till prövning</h2>
    <form @submit.prevent="submitForm">
      <div class="row g-3">

        <!-- Elevuppgifter -->
        <div class="col-md-6">
          <label class="form-label">Namn</label>
          <input v-model="form.name" type="text" class="form-control" required />
        </div>

        <div class="col-md-6">
          <label class="form-label">Personnummer</label>
          <input v-model="form.personalNumber" type="text" class="form-control" required />
        </div>

        <div class="col-md-6">
          <label class="form-label">Telefonnummer</label>
          <input v-model="form.phone" type="tel" class="form-control" />
        </div>

        <div class="col-md-6">
          <label class="form-label">Mejladress</label>
          <input v-model="form.email" type="email" class="form-control" required />
        </div>

        <div class="col-md-12">
          <label class="form-label">Adress</label>
          <input v-model="form.address" type="text" class="form-control" />
        </div>

        <!-- Kurs & Önskad månad -->
        <div class="col-md-6">
          <label class="form-label">Kurs</label>
          <input v-model="form.course" type="text" class="form-control" required />
        </div>

        <div class="col-md-6">
          <label class="form-label">Önskad månad för prövning</label>
          <select v-model="form.requestedMonth" class="form-select" required>
            <option value="">Välj månad</option>
            <option v-for="month in months" :key="month" :value="month">{{ month }}</option>
          </select>
        </div>

        <div class="col-md-6">
          <label class="form-label">Kommun (för betygsregistrering)</label>
          <input v-model="form.municipality" type="text" class="form-control" />
        </div>

        <!-- Lärare -->
        <div class="col-md-6">
          <label class="form-label">Ansvarig lärare</label>
          <select v-model="form.teacherId" class="form-select" required>
            <option disabled value="">Välj lärare</option>
            <option v-for="teacher in teachers" :key="teacher._id" :value="teacher._id">
              {{ teacher.name }}
            </option>
          </select>
        </div>

        <!-- Material / Betalning -->
        <div class="col-md-6 form-check mt-4">
          <input v-model="form.materialReceived" type="checkbox" class="form-check-input" id="material" />
          <label class="form-check-label" for="material">Material hämtat (SVE/SVA 1 eller 3)</label>
        </div>

        <div class="col-md-6">
          <label class="form-label">Betalningsdatum</label>
          <input v-model="form.paymentDate" type="date" class="form-control" />
        </div>

        <!-- Submit -->
        <div class="col-12 mt-4">
          <button type="submit" class="btn btn-primary">Registrera</button>
        </div>

      </div>
    </form>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'

const form = ref({
  name: '',
  personalNumber: '',
  phone: '',
  email: '',
  address: '',
  course: '',
  requestedMonth: '',
  municipality: '',
  teacherId: '',
  materialReceived: false,
  paymentDate: ''
})

const teachers = ref([])
const months = [
  'Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni',
  'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December'
]

const fetchTeachers = async () => {
  try {
    const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/teachers`)
    teachers.value = res.data
  } catch (err) {
    console.error('Kunde inte hämta lärare:', err)
  }
}

const submitForm = async () => {
  try {
    console.log('Skickar:', form.value)
    await axios.post(`${import.meta.env.VITE_API_URL}/api/exams`, form.value)
    alert('Registreringen lyckades!')
    Object.keys(form.value).forEach(key => form.value[key] = typeof form.value[key] === 'boolean' ? false : '')
  } catch (err) {
    console.error(err)
    alert('Fel vid registrering.')
  }
}

onMounted(fetchTeachers)
</script>
