<template>
  <v-card class="pa-6" elevation="2" rounded="lg">
    <v-form ref="formRef" @submit.prevent="submitPlan">
      <v-container fluid>
        <v-row
          v-for="(question, index) in questions"
          :key="index"
          class="mb-4 outlined"
          color="primary"
        >
          <v-col cols="12">
            <h4 class="text-subtitle-1 mb-2">{{ question.label }}</h4>

            <!-- Radio buttons -->
            <v-radio-group
              v-if="question.type === 'radio'"
              v-model="answers[question.key]"
              :inline="true"
              density="comfortable"
            >
              <v-radio
                v-for="option in question.options"
                :key="option"
                :label="option"
                :value="option"
                :color="primary"
                :class="outlined"
              />
            </v-radio-group>

            <!-- Checkboxes -->
            <div v-else-if="question.type === 'checkbox'">
              <v-checkbox
                v-for="option in question.options"
                :key="option"
                :label="option"
                :value="option"
                color="primary"
                class="outlined"
                v-model="answers[question.key]"
                density="comfortable"
              />
            </div>

            <!-- Select dropdown -->
            <v-select
              v-else-if="question.type === 'select'"
              :items="question.options"
              v-model="answers[question.key]"
              label="Välj ett alternativ"
              variant="outlined"
            />

            <!-- Teacher autocomplete -->
            <v-autocomplete
              v-else-if="question.key === 'teacherName'"
              v-model="answers[question.key]"
              :items="teachers"
              item-title="label"
              item-value="_id"
              label="Välj ansvarig lärare"
              variant="outlined"
              color="primary"
              clearable
              :menu-props="{ maxHeight: '300px' }"
            />

            <!-- Text input -->
            <v-text-field
              v-else-if="question.type === 'text'"
              v-model="answers[question.key]"
              variant="outlined"
              label="Svar"
            />

            <!-- Date picker -->
            <v-text-field
              v-else-if="question.type === 'date'"
              type="date"
              v-model="answers[question.key]"
              variant="outlined"
              label="Datum"
              color="primary"
            />

            <!-- Textarea -->
            <v-textarea
              v-else-if="question.type === 'textarea'"
              v-model="answers[question.key]"
              variant="outlined"
              label="Kommentar"
              auto-grow
            />
          </v-col>
        </v-row>

        <v-row>
          <v-col cols="12" class="text-end">
            <v-btn type="submit" color="primary" size="large" elevation="1">
              💾 Spara Handlingsplan
            </v-btn>
          </v-col>
        </v-row>
      </v-container>
    </v-form>
  </v-card>
</template>

<script setup>
  import { ref, onMounted, computed } from 'vue'
  import axios from 'axios'
  import html2pdf from 'html2pdf.js'

  const questions = ref([])
  const answers = ref({})
  const formRef = ref(null)
  const teachers = ref([])

  const props = defineProps(['userData'])

  const selectedTeacherLabel = computed(
    () => teachers.value.find((t) => t._id === answers.value.teacherName)?.label || 'Okänd'
  )

  const fetchTeachers = async () => {
    try {
      const res = await axios.get('/api/teachers')
      teachers.value = res.data
        .filter((t) => t.userId && t.userId.username)
        .map((t) => ({
          _id: t._id,
          label: t.userId.username,
        }))
    } catch (error) {
      console.error('Kunde inte hämta lärare:', error)
    }
  }

  const fetchQuestions = async () => {
    try {
      const response = await axios.get('/api/form-questions/ACTION_PLAN')
      if (response.data && response.data.questions) {
        questions.value = response.data.questions
        questions.value.forEach((q) => {
          if (q.type === 'checkbox') {
            answers.value[q.key] = []
          } else if (q.key === 'studentName') {
            answers.value[q.key] = props.userData.name || ''
          } else {
            answers.value[q.key] = ''
          }
        })
      }
    } catch (error) {
      console.error('Kunde inte hämta frågor:', error)
    }
  }

  onMounted(() => {
    fetchQuestions()
    fetchTeachers()
  })

  /*
    const getInputComponent = (type) => {
      switch (type) {
        case 'text':
        case 'date':
          return 'input'
        case 'textarea':
          return 'textarea'
        case 'select':
          return 'select' // Anpassa efter dina behov
      case 'radio':
              return 'radio'
        default:
          return 'input'
      }
    }
    */

  const submitPlan = async () => {
    try {
      const options = {
        margin: 0.5,
        filename: 'action_plan.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' },
      }

      await html2pdf()
        .from(formRef.value)
        .set(options)
        .outputPdf('blob')
        .then(async (pdfBlob) => {
          const formData = new FormData()
          formData.append('file', pdfBlob, 'action_plan.pdf')
          formData.append('studentId', props.userData._id)

          return axios.post('/api/documents/upload', formData)
        })
        .then(() => {
          axios.put(`/api/notifications/resolve/${props.userData._id}`)
        })
        .then(() => {
          alert('Handlingsplan sparad och PDF skapad!')
        })

        .catch((error) => {
          console.error('Kunde inte spara handlingsplan:', error)
          alert('Kunde inte spara handlingsplan.')
        })
    } catch (error) {
      console.error('Kunde inte spara handlingsplan:', error)
      console.error('Error response and message:', error.response || error.message)
    }
  }
</script>

<style scoped>
  .nav-tabs {
    margin-bottom: 15px;
  }

  .form-label {
    margin-bottom: 0.5rem;
  }
</style>
