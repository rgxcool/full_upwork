<template>
  <div class="scrollable-view">
    <v-container class="py-5">
      <v-card class="pa-5 mb-5">
        <v-card-title class="text-h4 font-weight-bold pa-0">Avklarade kurser & paket</v-card-title>
        <p class="text-body-2 text-grey mt-2">
          Kurser och kurspaket som markerats som avklarade av genomförandescanen — med
          slutförandedatum och ansvarig lärare.
        </p>
      </v-card>

      <v-card class="pa-5">
        <div class="d-flex align-center justify-space-between mb-3">
          <v-text-field
            v-model="search"
            label="Sök elev/kurs"
            density="compact"
            hide-details
            clearable
            class="mr-4"
            style="max-width: 340px"
            @keyup.enter="load(1)"
          />
          <div class="d-flex align-center ga-2">
            <v-select
              v-model="typeFilter"
              :items="[{title:'Alla typer', value:''},{title:'Kurs', value:'course'},{title:'Kurspaket', value:'course_package'}]"
              label="Typ"
              density="compact"
              hide-details
              style="max-width: 180px"
              @update:model-value="load(1)"
            />
            <v-btn size="small" variant="tonal" prepend-icon="mdi-refresh" :loading="loading" @click="load(page)">
              Uppdatera
            </v-btn>
          </div>
        </div>

        <v-progress-linear v-if="loading" indeterminate color="primary" class="my-4" />
        <v-alert v-else-if="error" type="error" class="my-3">{{ error }}</v-alert>

        <v-table v-else dense class="mt-3">
          <thead>
            <tr>
              <th class="text-left">Elev</th>
              <th class="text-left">Kurs / paket</th>
              <th class="text-left">Typ</th>
              <th class="text-left">Avslutad</th>
              <th class="text-left">Ansv. lärare</th>
              <th class="text-left">Kommun</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in events" :key="e._id">
              <td>
                <router-link :to="`/student/${e.studentId}`" class="text-decoration-none">
                  {{ e.studentName }}
                </router-link>
              </td>
              <td>{{ e.completionType === 'course_package' ? e.packageName : e.courseName }}</td>
              <td>
                <v-chip size="x-small" :color="e.completionType === 'course_package' ? 'primary' : 'info'">
                  {{ e.completionType === 'course_package' ? 'Kurspaket' : 'Kurs' }}
                </v-chip>
              </td>
              <td>{{ formatDate(e.completionDate) }}</td>
              <td>{{ e.teacherName || '–' }}</td>
              <td>{{ e.municipality || '–' }}</td>
            </tr>
            <tr v-if="events.length === 0">
              <td colspan="6" class="text-center text-grey">Inga avslutade kurser ännu.</td>
            </tr>
          </tbody>
        </v-table>

        <div v-if="totalPages > 1" class="d-flex align-center justify-center mt-4">
          <v-btn size="small" variant="tonal" :disabled="page <= 1" prepend-icon="mdi-chevron-left" @click="load(page - 1)">
            Föregående
          </v-btn>
          <span class="mx-3 text-body-2">{{ page }} / {{ totalPages }}</span>
          <v-btn size="small" variant="tonal" :disabled="page >= totalPages" append-icon="mdi-chevron-right" @click="load(page + 1)">
            Nästa
          </v-btn>
        </div>
      </v-card>
    </v-container>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import client from '@/api/client.js'
import { useToast } from '@/composables/useToast.js'

const toast = useToast()

const events = ref([])
const loading = ref(true)
const error = ref(null)
const search = ref('')
const typeFilter = ref('')
const page = ref(1)
const totalPages = ref(1)

const formatDate = (value) => (value ? new Date(value).toLocaleDateString('sv-SE') : '–')

const load = async (targetPage = 1) => {
  loading.value = true
  error.value = null
  try {
    const { data } = await client.get('/completions/overview', {
      params: {
        page: targetPage,
        limit: 25,
        search: search.value || undefined,
        completionType: typeFilter.value || undefined,
      },
    })
    events.value = data.events || []
    totalPages.value = data.totalPages || 1
    page.value = data.page || 1
  } catch (err) {
    error.value = 'Kunde inte hämta avklarade kurser.'
    toast.error(error.value)
  } finally {
    loading.value = false
  }
}

onMounted(() => load(1))
</script>