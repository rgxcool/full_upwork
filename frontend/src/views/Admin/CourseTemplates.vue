<template>
  <div class="scrollable-view">
    <v-container class="py-5">
      <v-card class="pa-5 mb-5">
        <div class="d-flex flex-wrap align-center justify-space-between ga-3">
          <div>
            <v-card-title class="text-h4 font-weight-bold pa-0">
              Mall-bank (Kursmallar)
            </v-card-title>
            <p class="text-body-2 text-grey mt-1 mb-0">
              Återanvändbara kursstrukturer, moduler och delmoment – fristående från enskilda
              kursinstanser.
            </p>
          </div>

          <div class="d-flex ga-2">
            <v-btn
              variant="tonal"
              prepend-icon="mdi-refresh"
              :loading="loading"
              @click="fetchTemplates"
            >
              Uppdatera
            </v-btn>
            <v-btn color="primary" prepend-icon="mdi-plus" @click="openBuilderWithTemplate(null)">
              Ny kursmall i byggaren
            </v-btn>
          </div>
        </div>
      </v-card>

      <v-alert v-if="errorMessage" type="error" class="mb-4">{{ errorMessage }}</v-alert>

      <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-4" />

      <v-card v-else-if="!templates.length" class="pa-6 text-center">
        <p class="text-body-1 mb-3">Inga kursmallar sparade i mall-banken ännu.</p>
        <v-btn color="primary" prepend-icon="mdi-plus" @click="openBuilderWithTemplate(null)">
          Skapa första mallen
        </v-btn>
      </v-card>

      <v-row v-else>
        <v-col v-for="tpl in templates" :key="tpl._id || tpl.id" cols="12" md="6" lg="4">
          <v-card variant="outlined" class="pa-4 h-100 d-flex flex-column justify-space-between">
            <div>
              <div class="d-flex align-start justify-space-between ga-2 mb-2">
                <h3 class="text-h6 font-weight-bold mb-0">
                  {{ tpl.title || tpl.name || 'Namnlös mall' }}
                </h3>
                <v-chip v-if="tpl.courseCode" size="small" variant="tonal" color="primary">
                  {{ tpl.courseCode }}
                </v-chip>
              </div>

              <p class="text-body-2 text-grey mb-3">
                {{ tpl.description || 'Fristående kursmall utan kopplad kursinstans.' }}
              </p>

              <div class="text-caption text-grey-darken-1 mb-4">
                Moduler:
                <strong>{{ Array.isArray(tpl.modules) ? tpl.modules.length : 0 }}</strong>
              </div>
            </div>

            <div class="d-flex flex-wrap ga-2 pt-2">
              <v-btn
                size="small"
                color="primary"
                prepend-icon="mdi-pencil-box-outline"
                @click="openBuilderWithTemplate(tpl._id || tpl.id)"
              >
                Öppna i byggare
              </v-btn>

              <v-btn
                v-if="canDeleteTemplates"
                size="small"
                color="error"
                variant="text"
                prepend-icon="mdi-delete-outline"
                :loading="deletingId === (tpl._id || tpl.id)"
                @click="deleteTemplate(tpl)"
              >
                Ta bort
              </v-btn>
            </div>
          </v-card>
        </v-col>
      </v-row>
    </v-container>
  </div>
</template>

<script setup>
  import { ref, onMounted } from 'vue'
  import { useRouter } from 'vue-router'
  import api from '@/api/client'
  import { useToast } from '@/composables/useToast.js'
  import store from '@/store/store.js'

  const router = useRouter()
  const toast = useToast()

  const templates = ref([])
  const loading = ref(false)
  const errorMessage = ref('')
  const deletingId = ref(null)

  function extractTemplates(data) {
    if (Array.isArray(data)) return data
    if (Array.isArray(data?.templates)) return data.templates
    if (Array.isArray(data?.courseTemplates)) return data.courseTemplates
    if (Array.isArray(data?.data)) return data.data
    return []
  }

  async function fetchTemplates() {
    loading.value = true
    errorMessage.value = ''
    try {
      const { data } = await api.get('/course-templates')
      templates.value = extractTemplates(data)
    } catch (err) {
      errorMessage.value =
        err?.response?.data?.message || err?.response?.data?.error || 'Kunde inte hämta kursmallar.'
      toast.error(errorMessage.value)
    } finally {
      loading.value = false
    }
  }

  function openBuilderWithTemplate(templateId) {
    const query = templateId ? { templateId: String(templateId) } : {}
    router.push({ path: '/admin/course-card-builder', query }).catch(() => {
      router.push({ name: 'CourseCardBuilder', query }).catch(() => {})
    })
  }

  // Only admin/systemadmin hold courseTemplates:delete (config/roles.js).
  const canDeleteTemplates = ['admin', 'systemadmin'].includes(store.getters.userRole)

  async function deleteTemplate(tpl) {
    const id = tpl?._id || tpl?.id
    if (!id) return
    const name = tpl.templateName || tpl.title || 'mallen'
    if (!window.confirm(`Ta bort "${name}" från mall-banken? Befintliga kurskort påverkas inte.`)) {
      return
    }
    deletingId.value = id
    try {
      await api.delete(`/course-templates/${encodeURIComponent(id)}`)
      templates.value = templates.value.filter((item) => (item._id || item.id) !== id)
      toast.success('Mallen togs bort från mall-banken.')
    } catch (err) {
      toast.error(
        err?.response?.data?.message || err?.response?.data?.error || 'Kunde inte ta bort mallen.'
      )
    } finally {
      deletingId.value = null
    }
  }

  onMounted(() => {
    fetchTemplates()
  })
</script>
