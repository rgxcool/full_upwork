<template>
  <div class="scrollable-view">
    <v-container class="py-5">
      <v-card class="pa-5 mb-5">
        <v-card-title class="text-h4 font-weight-bold pa-0">Kursinnehåll</v-card-title>
        <p class="text-body-2 text-grey mt-2">
          Hantera och redigera modulposter i
          <code>content</code>
          för vald kursinstans.
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
        <div class="d-flex flex-wrap align-center justify-space-between ga-2">
          <v-card-title class="text-h5 pa-0">Moduler &amp; innehåll</v-card-title>

          <div class="d-flex flex-wrap align-center ga-2">
            <v-btn-toggle v-model="editorMode" mandatory density="compact" variant="outlined">
              <v-btn value="form" size="small">Formulär</v-btn>
              <v-btn value="json" size="small">JSON</v-btn>
            </v-btn-toggle>

            <v-btn
              size="small"
              color="secondary"
              variant="tonal"
              prepend-icon="mdi-plus"
              :disabled="contentLoading || saving"
              @click="addModule"
            >
              Lägg till modul
            </v-btn>

            <v-btn
              size="small"
              variant="tonal"
              prepend-icon="mdi-refresh"
              :loading="contentLoading"
              @click="loadContent"
            >
              Ladda
            </v-btn>
          </div>
        </div>

        <v-progress-linear v-if="contentLoading" indeterminate color="primary" class="my-4" />
        <v-alert v-else-if="contentError" type="error" class="my-3">{{ contentError }}</v-alert>

        <v-card-text v-else class="pa-0 mt-4">
          <!-- Formulärläge per modul -->
          <template v-if="editorMode === 'form'">
            <v-alert v-if="sortedModuleKeys.length === 0" type="info" variant="tonal" class="mb-4">
              Inga moduler i innehållet ännu. Klicka på
              <strong>Lägg till modul</strong>
              för att skapa en.
            </v-alert>

            <div v-for="modKey in sortedModuleKeys" :key="modKey" class="mb-4">
              <v-card variant="outlined" class="pa-4">
                <div class="d-flex align-center justify-space-between mb-3">
                  <div class="text-subtitle-1 font-weight-bold">Modul {{ modKey }}</div>
                  <v-btn
                    size="small"
                    color="error"
                    variant="text"
                    prepend-icon="mdi-delete-outline"
                    :disabled="saving"
                    @click="removeModule(modKey)"
                  >
                    Ta bort
                  </v-btn>
                </div>

                <v-text-field
                  v-model="moduleMap[modKey].title"
                  label="Titel"
                  variant="outlined"
                  density="comfortable"
                  class="mb-3"
                />

                <v-textarea
                  v-model="moduleMap[modKey].instructions"
                  label="Instruktioner"
                  variant="outlined"
                  rows="4"
                  auto-grow
                  class="mb-2"
                />

                <v-switch
                  v-model="moduleMap[modKey].isHiddenFromStudent"
                  label="Dölj för elev (isHiddenFromStudent)"
                  color="warning"
                  hide-details
                  density="compact"
                />
              </v-card>
            </div>
          </template>

          <!-- JSON-läge -->
          <template v-else>
            <v-textarea
              v-model="jsonText"
              label="Kursinnehåll (JSON)"
              variant="outlined"
              rows="14"
              auto-grow
            />
          </template>

          <div class="d-flex ga-2 mt-4">
            <v-btn color="primary" :loading="saving" @click="saveContent">Spara</v-btn>
            <v-btn variant="tonal" :disabled="saving" @click="loadContent">Återställ</v-btn>
          </div>
        </v-card-text>
      </v-card>
    </v-container>
  </div>
</template>

<script setup>
  import { ref, computed, watch, onMounted } from 'vue'
  import client from '@/api/client.js'
  import { useToast } from '@/composables/useToast.js'

  const toast = useToast()

  const instances = ref([])
  const selectedInstanceId = ref(null)
  const moduleMap = ref({})
  const jsonText = ref('{}')
  const editorMode = ref('form')
  const contentLoading = ref(false)
  const contentError = ref(null)
  const saving = ref(false)

  const instanceOptions = computed(() =>
    instances.value.map((i) => ({
      title: `${i.courseName}${i.courseCode ? ` (${i.courseCode})` : ''}`,
      value: i._id,
    }))
  )

  const sortedModuleKeys = computed(() =>
    Object.keys(moduleMap.value).sort((a, b) => {
      const numA = Number(a)
      const numB = Number(b)
      if (!Number.isNaN(numA) && !Number.isNaN(numB) && numA !== numB) {
        return numA - numB
      }
      return a.localeCompare(b, 'sv')
    })
  )

  const normalizeIncomingContent = (rawContent) => {
    const normalized = {}
    if (!rawContent || typeof rawContent !== 'object' || Array.isArray(rawContent)) {
      return normalized
    }
    for (const [key, entry] of Object.entries(rawContent)) {
      const strKey = String(key).trim()
      if (!strKey) continue
      normalized[strKey] = {
        title: entry?.title ?? '',
        instructions: entry?.instructions ?? '',
        isHiddenFromStudent: Boolean(entry?.isHiddenFromStudent),
      }
    }
    return normalized
  }

  const syncJsonFromMap = () => {
    jsonText.value = JSON.stringify(moduleMap.value, null, 2)
  }

  watch(editorMode, (newMode, oldMode) => {
    if (oldMode === 'form' && newMode === 'json') {
      syncJsonFromMap()
    } else if (oldMode === 'json' && newMode === 'form') {
      try {
        const parsed = JSON.parse(jsonText.value)
        moduleMap.value = normalizeIncomingContent(parsed)
      } catch {
        toast.error('Ogiltig JSON – kunde inte växla till formulärläge.')
        editorMode.value = 'json'
      }
    }
  })

  const addModule = () => {
    if (editorMode.value === 'json') {
      try {
        moduleMap.value = normalizeIncomingContent(JSON.parse(jsonText.value))
      } catch {
        toast.error('Ogiltig JSON – åtgärda syntaxen innan du lägger till modul.')
        return
      }
    }

    const numericKeys = Object.keys(moduleMap.value)
      .map((k) => Number(k))
      .filter((n) => Number.isInteger(n) && n > 0)
    const nextKey = String((numericKeys.length ? Math.max(...numericKeys) : 0) + 1)

    moduleMap.value = {
      ...moduleMap.value,
      [nextKey]: {
        title: `Modul ${nextKey}`,
        instructions: '',
        isHiddenFromStudent: false,
      },
    }

    if (editorMode.value === 'json') {
      syncJsonFromMap()
    }
  }

  const removeModule = (keyToRemove) => {
    const updated = { ...moduleMap.value }
    delete updated[String(keyToRemove)]
    moduleMap.value = updated

    if (editorMode.value === 'json') {
      syncJsonFromMap()
    }
  }

  const loadContent = async () => {
    if (!selectedInstanceId.value) {
      moduleMap.value = {}
      jsonText.value = '{}'
      contentError.value = null
      return
    }

    contentLoading.value = true
    contentError.value = null

    try {
      const { data } = await client.get(`/course-instances/${selectedInstanceId.value}/content`)
      const parsedData =
        typeof data?.content === 'string' ? JSON.parse(data.content) : data?.content
      moduleMap.value = normalizeIncomingContent(parsedData)
      syncJsonFromMap()
    } catch (err) {
      contentError.value = 'Kunde inte hämta innehåll.'
      toast.error(contentError.value)
    } finally {
      contentLoading.value = false
    }
  }

  const saveContent = async () => {
    if (!selectedInstanceId.value) return

    let payloadToSend
    if (editorMode.value === 'json') {
      let parsed
      try {
        parsed = JSON.parse(jsonText.value)
      } catch {
        toast.error('Ogiltigt JSON-format. Kontrollera syntaxen innan du sparar.')
        return
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        toast.error('Innehållet måste vara ett JSON-objekt med modulnycklar.')
        return
      }
      payloadToSend = normalizeIncomingContent(parsed)
      moduleMap.value = { ...payloadToSend }
    } else {
      payloadToSend = normalizeIncomingContent(moduleMap.value)
    }

    saving.value = true
    try {
      await client.put(`/course-instances/${selectedInstanceId.value}/content`, {
        content: payloadToSend,
        syncModules: true,
      })
      toast.success('Innehåll sparat.')
      await loadContent()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Kunde inte spara innehåll.')
    } finally {
      saving.value = false
    }
  }

  onMounted(async () => {
    try {
      const { data } = await client.get('/course-instances')
      instances.value = Array.isArray(data) ? data : data?.instances || []
    } catch {
      toast.error('Kunde inte hämta kursinstanser.')
    }
  })
</script>
