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
                Modul {{ mod.moduleNumber }} — {{ effectiveTitle(mod) }}
                <v-chip v-if="mod.isPartialExam" size="x-small" color="warning" class="ml-2">Deltenta</v-chip>
                <v-chip v-if="mod.isCaseStudy" size="x-small" color="info" class="ml-2">Fallstudie</v-chip>
                <v-chip v-if="mod.isHiddenFromStudent" size="x-small" color="grey" class="ml-2">Dold för elever</v-chip>
              </v-expansion-panel-title>
              <v-expansion-panel-text>
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

                <!-- Avsnitt (read-only, Slice 3). Staff see hidden modules too. -->
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

// Unlike the student view, staff must also see Avsnitt in hidden modules.
const avsnittFor = (mod) =>
  sortedAvsnitt(mod).filter((av) => visibleContentItems(av).length > 0)

// Slice 3 follow-up: the editor's Modultitel field controls the student-facing
// overlay. The structural module title stays on `mod.title` and is never
// written from this form. Empty overlay titles fall back to the structural
// title, matching buildVisibleModules() and student views.
const effectiveTitle = (mod) => mod.contentTitle || mod.title || 'Utan titel'

const normalizeModules = (rawModules, content) => {
  if (!Array.isArray(rawModules)) return []
  const contentByModule =
    content instanceof Map ? Object.fromEntries(content) : content || {}
  return rawModules.map((m) => {
    const moduleNumber = m.moduleNumber ?? 0
    const overlay = contentByModule[String(moduleNumber)] || {}
    return {
      moduleNumber,
      title: m.title ?? '',
      isPartialExam: !!m.isPartialExam,
      isCaseStudy: !!m.isCaseStudy,
      sections: (m.sections || []).map((s) => ({
        title: s.title ?? '',
        description: s.description ?? '',
        instructions: s.instructions ?? '',
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

const loadContent = async () => {
  if (!selectedInstanceId.value) { modules.value = []; return }
  contentLoading.value = true
  contentError.value = null
  try {
    const selectedInstance = instances.value.find(
      (i) => i._id === selectedInstanceId.value
    )
    const { data } = await client.get(
      `/course-instances/${selectedInstanceId.value}/content`
    )
    modules.value = normalizeModules(selectedInstance?.modules || [], data?.content)
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
    const content = {}
    for (const mod of modules.value) {
      content[String(mod.moduleNumber)] = {
        title: mod.contentTitle ?? mod.title ?? '',
        instructions: mod.instructions ?? '',
        isHiddenFromStudent: !!mod.isHiddenFromStudent,
      }
    }
    await client.put(`/course-instances/${selectedInstanceId.value}/content`, { content })
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
