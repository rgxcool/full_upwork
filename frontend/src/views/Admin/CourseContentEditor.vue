<template>
  <div class="scrollable-view">
    <v-container class="py-5">
      <v-card class="pa-5 mb-5">
        <v-card-title class="text-h4 font-weight-bold pa-0">Kursinnehåll</v-card-title>
        <p class="text-body-2 text-grey mt-2">
          Redigera moduler och sektioner för kursinstanser. Fältet
          <strong>Modultitel</strong> styr den titel eleven ser; den strukturella modultiteln och
          Avsnitt visas här som read-only.
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

        <v-card-text v-else class="pa-0 mt-3">
          <!-- Formulärläge: shipped Slice 3/4 editor plus add/remove controls. -->
          <template v-if="editorMode === 'form'">
            <v-alert v-if="sortedModules.length === 0" type="info" variant="tonal" class="mb-4">
              Inga moduler i innehållet ännu. Klicka på
              <strong>Lägg till modul</strong> för att skapa en.
            </v-alert>

            <v-expansion-panels v-model="openPanels" multiple>
              <v-expansion-panel v-for="(mod, mi) in sortedModules" :key="mi">
                <v-expansion-panel-title>
                  Modul {{ mod.moduleNumber }} — {{ effectiveTitle(mod) }}
                  <v-chip v-if="mod.isPartialExam" size="x-small" color="warning" class="ml-2">Deltenta</v-chip>
                  <v-chip v-if="mod.isCaseStudy" size="x-small" color="info" class="ml-2">Fallstudie</v-chip>
                  <v-chip v-if="mod.isHiddenFromStudent" size="x-small" color="grey" class="ml-2">Dold för elever</v-chip>
                </v-expansion-panel-title>
                <v-expansion-panel-text>
                  <div class="d-flex justify-end mb-2">
                    <v-btn
                      size="small"
                      color="error"
                      variant="text"
                      prepend-icon="mdi-delete-outline"
                      :disabled="saving"
                      @click="removeModule(mod.moduleNumber)"
                    >
                      Ta bort
                    </v-btn>
                  </div>

                  <v-text-field
                    v-model="mod.contentTitle"
                    label="Modultitel"
                    variant="outlined"
                    density="compact"
                    class="mb-2"
                  />
                  <div class="d-flex gap-2 mb-3">
                    <v-checkbox v-model="mod.isPartialExam" label="Deltenta" density="compact" hide-details />
                    <v-checkbox v-model="mod.isCaseStudy" label="Fallstudie" density="compact" hide-details />
                  </div>
                  <v-switch
                    v-model="mod.isHiddenFromStudent"
                    label="Dölj för elever"
                    color="warning"
                    density="compact"
                    hide-details
                    class="mb-3"
                  />

                  <v-divider class="my-2" />
                  <div v-for="(sec, si) in mod.sections" :key="si" class="section-block mb-3">
                    <v-text-field v-model="sec.title" label="Sektionstitel" variant="outlined" density="compact" class="mb-2" />
                    <v-textarea v-model="sec.description" label="Beskrivning" variant="outlined" density="compact" rows="2" class="mb-2" />
                    <v-textarea v-model="sec.instructions" label="Instruktioner" variant="outlined" density="compact" rows="3" />
                  </div>

                  <!-- Avsnitt (read-only, Slice 3/4). Staff see hidden modules too. -->
                  <div v-if="avsnittFor(mod).length" class="avsnitt-block mt-3">
                    <div class="avsnitt-heading">Avsnitt</div>
                    <div
                      v-for="av in avsnittFor(mod)"
                      :key="av.avsnittId || av.order"
                      class="avsnitt-block"
                    >
                      <div class="avsnitt-heading-row">
                        <div class="avsnitt-title">{{ av.title || `Avsnitt ${av.order || ''}` }}</div>
                        <span v-if="av.plannedDate" class="avsnitt-planned-date">
                          {{ PLANNED_DATE_LABEL }}: {{ av.plannedDate }}
                        </span>
                      </div>
                      <ul class="content-item-list">
                        <li
                          v-for="item in visibleContentItems(av)"
                          :key="item.contentId || item.order"
                          class="content-item"
                        >
                          <span class="content-type-chip">{{ contentItemLabel(item.type) }}</span>
                          <span class="content-title">{{ contentMeta(item).title }}</span>
                          <a
                            v-if="contentMeta(item).url"
                            :href="contentMeta(item).url"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="content-link"
                          >
                            {{ contentMeta(item).linkText }}
                          </a>
                          <span v-if="contentMeta(item).durationText" class="content-duration">
                            {{ contentMeta(item).durationText }}
                          </span>
                        </li>
                      </ul>
                    </div>
                  </div>

                  <v-divider class="my-2" />
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
                </v-expansion-panel-text>
              </v-expansion-panel>
            </v-expansion-panels>
          </template>

          <!-- JSON-läge från mindful/main -->
          <template v-else>
            <v-textarea
              v-model="jsonText"
              label="Kursinnehåll (JSON)"
              variant="outlined"
              rows="14"
              auto-grow
            />
          </template>

          <div class="d-flex gap-2 mt-4">
            <v-btn size="small" color="primary" :loading="saving" @click="saveContent">Spara</v-btn>
            <v-btn size="small" variant="tonal" :disabled="saving" @click="loadContent">Återställ</v-btn>
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
import {
  contentItemLabel,
  contentMeta,
  formatPlannedDate,
  PLANNED_DATE_LABEL,
  sortedAvsnitt,
  visibleContentItems,
} from '@/utils/courseContent.js'

const toast = useToast()

const instances = ref([])
const selectedInstanceId = ref(null)
const modules = ref([])
const jsonText = ref('{}')
const editorMode = ref('form')
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

const sortedModules = computed(() =>
  [...modules.value].sort((a, b) => {
    const numA = Number(a.moduleNumber)
    const numB = Number(b.moduleNumber)
    if (!Number.isNaN(numA) && !Number.isNaN(numB) && numA !== numB) return numA - numB
    return String(a.moduleNumber).localeCompare(String(b.moduleNumber), 'sv')
  })
)

// Unlike the student view, staff must also see Avsnitt in hidden modules.
const avsnittFor = (mod) =>
  sortedAvsnitt(mod).filter((av) => visibleContentItems(av).length > 0)

// Slice 3 follow-up: the editor's Modultitel field controls the student-facing
// overlay. The structural module title stays on `mod.title` and is never
// written from this form. Empty overlay titles fall back to the structural
// title, matching buildVisibleModules() and student views.
const effectiveTitle = (mod) => mod.contentTitle || mod.title || 'Utan titel'

const normalizeIncomingContent = (rawContent) => {
  const normalized = {}
  if (!rawContent || typeof rawContent !== 'object' || Array.isArray(rawContent)) return normalized
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

// Union of structural modules and content keys: keeps shipped Avsnitt/Slice 4
// structure while also showing modules added in the teammate's JSON mode.
const normalizeModules = (rawModules, rawContent) => {
  const contentByModule = normalizeIncomingContent(rawContent)
  const structural = Array.isArray(rawModules) ? rawModules : []
  const structuralByNumber = new Map(
    structural.map((m) => [String(m.moduleNumber ?? 0), m])
  )
  const keys = new Set([
    ...structural.map((m) => String(m.moduleNumber ?? 0)),
    ...Object.keys(contentByModule),
  ])

  return [...keys].map((key) => {
    const m = structuralByNumber.get(key) || {
      moduleNumber: Number(key) || key,
      title: `Modul ${key}`,
    }
    const moduleNumber = m.moduleNumber ?? Number(key)
    const overlay = contentByModule[key] || contentByModule[String(moduleNumber)] || {}
    return {
      moduleNumber,
      title: m.title ?? '',
      isPartialExam: !!m.isPartialExam,
      isCaseStudy: !!m.isCaseStudy,
      sections: (m.sections || []).map((s) => ({
        title: s.title ?? '',
        description: s.description ?? '',
        instructions: s.instructions ?? '',
        blocks: Array.isArray(s.blocks) ? s.blocks : [],
      })),
      // Slice 4: keep the generated planned date read-only; the content PUT
      // below still sends only title/instructions/hide overlay fields.
      avsnitt: Array.isArray(m.avsnitt)
        ? m.avsnitt.map((av) => ({
            ...av,
            plannedDate: formatPlannedDate(av.plannedDate) || null,
          }))
        : [],
      assignment: {
        title: m.assignment?.title ?? '',
        description: m.assignment?.description ?? '',
      },
      // Effective student-facing title, seeded from the structural title when
      // no overlay exists (D4). Saving writes only the content overlay.
      contentTitle: overlay.title || m.title || '',
      instructions: overlay.instructions ?? '',
      isHiddenFromStudent: !!overlay.isHiddenFromStudent,
    }
  })
}

const contentPayloadFromModules = (mods) => {
  const payload = {}
  for (const mod of mods) {
    payload[String(mod.moduleNumber)] = {
      title: mod.contentTitle ?? mod.title ?? '',
      instructions: mod.instructions ?? '',
      isHiddenFromStudent: !!mod.isHiddenFromStudent,
    }
  }
  return payload
}

const syncJsonFromMap = () => {
  jsonText.value = JSON.stringify(contentPayloadFromModules(modules.value), null, 2)
}

watch(editorMode, (newMode, oldMode) => {
  if (oldMode === 'form' && newMode === 'json') {
    syncJsonFromMap()
  } else if (oldMode === 'json' && newMode === 'form') {
    try {
      const parsed = JSON.parse(jsonText.value)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('not an object')
      }
      modules.value = normalizeModules(modules.value, parsed)
    } catch {
      toast.error('Ogiltig JSON – kunde inte växla till formulärläge.')
      editorMode.value = 'json'
    }
  }
})

const addModule = () => {
  if (editorMode.value === 'json') {
    try {
      const parsed = JSON.parse(jsonText.value)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('not an object')
      }
      modules.value = normalizeModules(modules.value, parsed)
    } catch {
      toast.error('Ogiltig JSON – åtgärda syntaxen innan du lägger till modul.')
      return
    }
  }

  const nextNumber =
    modules.value.reduce((max, mod) => {
      const num = Number(mod.moduleNumber)
      return Number.isInteger(num) && num > max ? num : max
    }, 0) + 1

  modules.value = [
    ...modules.value,
    {
      moduleNumber: nextNumber,
      title: `Modul ${nextNumber}`,
      isPartialExam: false,
      isCaseStudy: false,
      sections: [],
      // Keep generated Slice 4 Avsnitt dates when the backend re-syncs modules.
      avsnitt: [],
      assignment: { title: '', description: '' },
      contentTitle: `Modul ${nextNumber}`,
      instructions: '',
      isHiddenFromStudent: false,
    },
  ]
  syncJsonFromMap()
}

const removeModule = (moduleNumber) => {
  modules.value = modules.value.filter(
    (mod) => String(mod.moduleNumber) !== String(moduleNumber)
  )
  syncJsonFromMap()
}

const loadContent = async () => {
  if (!selectedInstanceId.value) {
    modules.value = []
    jsonText.value = '{}'
    contentError.value = null
    return
  }
  contentLoading.value = true
  contentError.value = null
  try {
    const selectedInstance = instances.value.find(
      (i) => i._id === selectedInstanceId.value
    )
    const { data } = await client.get(
      `/course-instances/${selectedInstanceId.value}/content`
    )
    const parsedData =
      typeof data?.content === 'string' ? JSON.parse(data.content) : data?.content
    modules.value = normalizeModules(selectedInstance?.modules || [], parsedData)
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

  if (editorMode.value === 'json') {
    try {
      const parsed = JSON.parse(jsonText.value)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('not an object')
      }
      modules.value = normalizeModules(modules.value, parsed)
    } catch {
      toast.error('Ogiltigt JSON-format. Kontrollera syntaxen innan du sparar.')
      return
    }
  }

  saving.value = true
  try {
    // mindful/main's syncModules keeps added/removed modules on the course
    // card. The backend preserves existing Avsnitt dates while merging, so
    // never send the read-only structure back from this editor.
    await client.put(`/course-instances/${selectedInstanceId.value}/content`, {
      content: contentPayloadFromModules(modules.value),
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

<style scoped>
.avsnitt-heading {
  font-size: 0.9rem;
  font-weight: 700;
  margin-bottom: 0.35rem;
}
.avsnitt-block {
  margin: 0.5rem 0;
}
.avsnitt-heading-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.25rem 0.75rem;
  margin-bottom: 0.35rem;
}
.avsnitt-title {
  font-size: 0.95rem;
  font-weight: 600;
  margin-bottom: 0;
}
.avsnitt-planned-date {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--v-theme-primary, #1d4f43);
}
.content-item-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.content-item {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.4rem 0.6rem;
  padding: 0.25rem 0;
  font-size: 0.9rem;
}
.content-type-chip {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  padding: 0.1rem 0.4rem;
  border-radius: 0.25rem;
  background: var(--v-theme-surface-variant, #e8e8e8);
  color: inherit;
}
.content-link {
  font-size: 0.85rem;
}
.content-duration {
  font-size: 0.8rem;
  opacity: 0.7;
}
</style>
