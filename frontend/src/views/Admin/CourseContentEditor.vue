<template>
  <div class="scrollable-view">
    <v-container class="py-5">
      <v-card class="pa-5 mb-5">
        <v-card-title class="text-h4 font-weight-bold pa-0">Kursinnehåll</v-card-title>
        <p class="text-body-2 text-grey mt-2">
          Redigera moduler och sektioner för kursinstanser.
        </p>
      </v-card>

      <v-card class="pa-5 mb-5">
        <v-card-title class="text-h5 pa-0">Välj kursinstans</v-card-title>
        <v-card-text class="pa-0 mt-3">
          <v-select
            v-model="selectedInstanceId"
            :items="instanceOptions"
            label="Kursinstans"
            item-title="title"
            item-value="value"
            class="flex-grow-1"
            clearable
            @update:model-value="loadContent"
          />
        </v-card-text>
      </v-card>

      <v-card v-if="selectedInstanceId" class="pa-5">
        <div class="d-flex align-center justify-space-between">
          <v-card-title class="text-h5 pa-0">Innehåll</v-card-title>
          <v-btn size="small" variant="tonal" prepend-icon="mdi-refresh" :loading="contentLoading" @click="loadContent">
            Ladda
          </v-btn>
        </div>

        <v-progress-linear v-if="contentLoading" indeterminate color="primary" class="my-4" />
        <v-alert v-else-if="contentError" type="error" class="my-3">{{ contentError }}</v-alert>

        <v-card-text v-else class="pa-0 mt-3">
          <v-expansion-panels v-model="openPanels" multiple>
            <v-expansion-panel v-for="(mod, mi) in modules" :key="mi">
              <v-expansion-panel-title>
                Modul {{ mod.moduleNumber }} — {{ mod.title || 'Utan titel' }}
                <v-chip v-if="mod.isPartialExam" size="x-small" color="warning" class="ml-2">Deltenta</v-chip>
                <v-chip v-if="mod.isCaseStudy" size="x-small" color="info" class="ml-2">Fallstudie</v-chip>
              </v-expansion-panel-title>
              <v-expansion-panel-text>
                <v-text-field v-model="mod.title" label="Modultitel" variant="outlined" density="compact" class="mb-2" />
                <div class="d-flex gap-2 mb-3">
                  <v-checkbox v-model="mod.isPartialExam" label="Deltenta" density="compact" hide-details />
                  <v-checkbox v-model="mod.isCaseStudy" label="Fallstudie" density="compact" hide-details />
                </div>
                <v-text-field
                  v-model="mod.assignment.title"
                  label="Uppgiftstitel"
                  variant="outlined"
                  density="compact"
                  class="mb-2"
                />
                <v-textarea
                  v-model="mod.assignment.description"
                  label="Uppgiftsbeskrivning"
                  variant="outlined"
                  density="compact"
                  rows="2"
                  class="mb-3"
                />
                <v-divider class="my-2" />
                <div v-for="(sec, si) in mod.sections" :key="si" class="section-block mb-3">
                  <v-text-field v-model="sec.title" label="Sektionstitel" variant="outlined" density="compact" class="mb-2" />
                  <v-textarea v-model="sec.description" label="Beskrivning" variant="outlined" density="compact" rows="2" class="mb-2" />
                  <v-textarea v-model="sec.instructions" label="Instruktioner" variant="outlined" density="compact" rows="3" />
                </div>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>

          <div class="d-flex gap-2 mt-4">
            <v-btn size="small" color="primary" :loading="saving" @click="saveContent">Spara</v-btn>
            <v-btn size="small" variant="tonal" @click="loadContent">Återställ</v-btn>
          </div>
        </v-card-text>
      </v-card>
    </v-container>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import client from '@/api/client.js'
import { useToast } from '@/composables/useToast.js'

const toast = useToast()

const instances = ref([])
const selectedInstanceId = ref(null)
const modules = ref([])
const contentLoading = ref(false)
const contentError = ref(null)
const saving = ref(false)
const openPanels = ref([])

const instanceOptions = computed(() =>
  instances.value.map((i) => ({
    title: `${i.courseName}${i.courseCode ? ` (${i.courseCode})` : ''}`,
    value: i._id,
  }))
)

const normalizeModules = (raw) => {
  if (!Array.isArray(raw)) return []
  return raw.map((m) => ({
    moduleNumber: m.moduleNumber ?? 0,
    title: m.title ?? '',
    isPartialExam: !!m.isPartialExam,
    isCaseStudy: !!m.isCaseStudy,
    sections: (m.sections || []).map((s) => ({
      title: s.title ?? '',
      description: s.description ?? '',
      instructions: s.instructions ?? '',
    })),
    assignment: {
      title: m.assignment?.title ?? '',
      description: m.assignment?.description ?? '',
    },
  }))
}

const loadContent = async () => {
  if (!selectedInstanceId.value) { modules.value = []; return }
  contentLoading.value = true
  contentError.value = null
  try {
    const { data } = await client.get(`/course-instances/${selectedInstanceId.value}/content`)
    modules.value = normalizeModules(data?.modules || data?.content?.modules || data?.content || [])
  } catch (err) {
    contentError.value = 'Kunde inte hämta innehåll.'
    toast.error(contentError.value)
  } finally {
    contentLoading.value = false
  }
}

const saveContent = async () => {
  if (!selectedInstanceId.value) return
  saving.value = true
  try {
    await client.put(`/course-instances/${selectedInstanceId.value}/content`, { modules: modules.value })
    toast.success('Innehåll sparat.')
  } catch (err) {
    toast.error('Kunde inte spara innehåll.')
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  try {
    const { data } = await client.get('/course-instances')
    instances.value = Array.isArray(data) ? data : []
  } catch {
    toast.error('Kunde inte hämta kursinstanser.')
  }
})
</script>
