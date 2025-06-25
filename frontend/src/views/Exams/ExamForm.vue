<template>
  <div class="container my-5">
    <h2 class="mb-4">Anmälan till prövning</h2>
    <form @submit.prevent="submitForm">
      <div class="row g-3">
        <v-container>
          <v-form>
            <v-autocomplete
              v-model="selectedStudent"
              :items="filteredStudents"
              :search="searchQuery"
              item-title="name"
              item-value="_id"
              label="Select a student"
              return-object
              outlined
              :menu-props="{ maxHeight: '300px', closeOnContentClick: false }"
              attach
              :no-data-text="'Please write student name'"
              @update:search="searchQuery = $event"
              :filter="() => true"
            />
          </v-form>
        </v-container>

        <!-- Elevuppgifter 
        <div class="col-md-6">
          <label class="form-label">Namn</label>
          <input v-model="form.name" type="text" class="form-control" required />
        </div>
        -->

        <div v-if="selectedStudent && selectedStudent.name" class="row g-3 mt-3">
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
        </div>
        <!-- Kurs & Önskad månad -->
        <v-autocomplete
          v-model="selectedCourse"
          :items="availableCourses"
          item-title="title"
          item-value="value"
          label="Välj kurs"
          outlined
          :menu-props="{ maxHeight: '300px' }"
          :no-data-text="'Ingen kurs tillgänglig'"
        />

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

        <div class="col-md-6">
          <v-autocomplete
            v-model="form.teacherId"
            :items="teachers"
            item-title="userId.username"
            item-value="_id"
            label="Ansvarig lärare"
            outlined
            clearable
            :no-data-text="'Inga lärare tillgängliga'"
            :menu-props="{ maxHeight: '300px' }"
          />
        </div>

        <!-- Material / Betalning -->
        <div class="col-md-6 form-check mt-4">
          <input
            v-model="form.materialReceived"
            type="checkbox"
            class="form-check-input"
            id="material"
          />
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
  import axios from 'axios'
  import { ref, computed, onMounted, watch } from 'vue'

  const students = ref([])
  const teachers = ref([])
  const isLoading = ref(false)
  const selectedStudent = ref(null)
  const searchQuery = ref('')
  const selectedCourse = ref(null)

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
    paymentDate: '',
  })

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

  const filteredStudents = computed(() => {
    if (!searchQuery.value) return students.value
    return students.value.filter((student) =>
      student.name.toLowerCase().includes(searchQuery.value.toLowerCase())
    )
  })

  const fetchInitialData = async () => {
    if (fetchState.value) return
    fetchState.value = true

    try {
      console.log('🔍 Fetching all students to filter them for autocomplete ...')
      const [studentsResponse] = await Promise.all([
        await axios.get(`${import.meta.env.VITE_API_URL}/api/students`, {
          withCredentials: true,
        }),
      ])

      students.value = studentsResponse.data

      console.log('✅ Students loaded:', students.value)
    } catch (error) {
      console.error('❌ Error fetching initial data:', error)
    } finally {
      isLoading.value = false
    }
  }

  const fetchState = ref(false) // Prevent multiple fetches

  watch(selectedStudent, (newStudent) => {
    console.log('👤 Selected student:', newStudent)

    // 🧹 Clear related fields when deselected
    if (!newStudent) {
      selectedCourse.value = null
      form.value.course = ''
      return
    }

    form.value.name = newStudent.name || ''
    form.value.personalNumber = newStudent.personalNumber || ''
    form.value.phone = newStudent.phone || ''
    form.value.email = newStudent.email || ''
    form.value.municipality = newStudent.municipality?.type || ''
  })

  const availableCourses = computed(() => {
    if (!selectedStudent.value?.education) return []

    return selectedStudent.value.education
      .filter((e) => e.type === 'Course' && (e.refId?.courseName || e.name))
      .map((e) => ({
        title: e.refId ? `${e.refId.courseName} (${e.refId.courseCode})` : e.name,
        value: e.refId?._id || e._id, // fallback to education._id if refId missing
      }))
  })

  watch(selectedCourse, (newCourseId) => {
    const selected = availableCourses.value.find((c) => c.value === newCourseId)
    form.value.course = selected?.title || ''
  })

  const fetchTeachers = async () => {
    try {
      const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/teachers`)
      teachers.value = res.data
        .filter((t) => t.userId && t.userId.username) // skip malformed ones
        .map((t) => ({
          ...t,
          userId: {
            username: t.userId.username,
          },
          _id: t._id,
        }))

      console.log('👨‍🏫 Teachers fetched:', teachers.value)
    } catch (err) {
      console.error('Kunde inte hämta lärare:', err)
    }
  }

  watch(
    teachers,
    (newVal) => {
      console.log('👨‍🏫 Teachers in frontend:', newVal)
    },
    { deep: true, immediate: true }
  )

  const submitForm = async () => {
    try {
      console.log('Skickar:', form.value)
      await axios.post(`${import.meta.env.VITE_API_URL}/api/exams`, form.value)
      alert('Registreringen lyckades!')
      Object.keys(form.value).forEach(
        (key) => (form.value[key] = typeof form.value[key] === 'boolean' ? false : '')
      )
    } catch (err) {
      console.error(err)
      alert('Fel vid registrering.')
    }
  }

  onMounted(fetchTeachers)
  onMounted(fetchInitialData)
</script>
