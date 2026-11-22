<template>
  <div class="course-card-builder">
    <header class="builder-header">
      <div>
        <h1>Kurskortsbyggare</h1>
        <p class="subtitle">
          Bygg moduler och delmoment med färgkodade textblock, inbäddad video och filer – spara och ladda fritt i mall-banken.
        </p>
      </div>
      <div class="header-actions">
        <button type="button" class="btn btn-secondary" @click="togglePreview">
          {{ previewMode ? 'Tillbaka till redigering' : 'Förhandsgranska' }}
        </button>
        <!-- #31: a loaded template is updated in place; "Spara som ny mall"
             is the explicit way to create a copy. -->
        <button
          v-if="selectedTemplateId"
          type="button"
          class="btn btn-primary"
          data-test="update-template"
          :disabled="isSavingTemplate || isUploading"
          @click="saveAsTemplate({ asNew: false })"
        >
          {{ isSavingTemplate ? 'Sparar mall...' : 'Uppdatera mall' }}
        </button>
        <button
          type="button"
          :class="['btn', selectedTemplateId ? 'btn-secondary' : 'btn-primary']"
          data-test="save-new-template"
          :disabled="isSavingTemplate || isUploading"
          @click="saveAsTemplate({ asNew: true })"
        >
          {{ isSavingTemplate ? 'Sparar mall...' : selectedTemplateId ? 'Spara som ny mall' : 'Spara som mall' }}
        </button>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="isSavingCard || isUploading || !selectedCourseInstanceId"
          @click="saveCourseCard"
        >
          {{ isSavingCard ? 'Sparar kurskort...' : 'Spara kurskort' }}
        </button>
      </div>
    </header>

    <div v-if="statusMessage" class="status-banner" :class="`status-${statusType}`">
      {{ statusMessage }}
    </div>

    <!-- Grunduppgifter & Mall-bank -->
    <section v-if="!previewMode" class="meta-card">
      <h2>Grunduppgifter &amp; Mall-bank</h2>
      <div class="meta-grid">
        <label class="field">
          <span>Mallens titel</span>
          <input
            v-model="cardData.title"
            type="text"
            placeholder="T.ex. Svenska 1 – Grundstruktur"
          />
        </label>
        <label class="field">
          <span>Kurskod / Benämning</span>
          <input v-model="cardData.courseCode" type="text" placeholder="T.ex. SVESVE01" />
        </label>
      </div>

      <div class="instance-bar">
        <div class="field field-grow">
          <v-autocomplete
            v-model="selectedTemplateId"
            :items="visibleTemplateItems"
            :search="templateSearch || ''"
            item-title="label"
            item-value="value"
            label="Välj mall från mall-banken"
            placeholder="Skriv minst 3 tecken"
            :loading="isLoadingTemplates || isLoadingTemplate"
            :disabled="isLoadingTemplates || isLoadingTemplate"
            :no-data-text="
              (templateSearch || '').length < 3
                ? 'Skriv minst 3 tecken för att söka'
                : 'Inga matchande mallar hittades'
            "
            :custom-filter="filterAutocompleteItem"
            :menu-props="{ maxHeight: '300px' }"
            clearable
            no-filter
            @update:search="onTemplateSearchUpdate"
            @update:model-value="onTemplateSelectionChange"
          />
        </div>

      </div>

      <div class="instance-bar">
        <div class="field field-grow">
          <v-autocomplete
            v-model="selectedCourseInstanceId"
            :items="visibleCourseInstanceItems"
            :search="courseInstanceSearch || ''"
            item-title="label"
            item-value="value"
            label="Koppla kurskort till kursinstans"
            placeholder="Skriv minst 3 tecken"
            :loading="isLoadingInstances"
            :disabled="isLoadingInstances"
            :no-data-text="
              (courseInstanceSearch || '').length < 3
                ? 'Skriv minst 3 tecken för att söka'
                : 'Inga matchande kursinstanser hittades'
            "
            :custom-filter="filterAutocompleteItem"
            :menu-props="{ maxHeight: '300px' }"
            clearable
            no-filter
            @update:search="onCourseInstanceSearchUpdate"
            @update:model-value="onCourseInstanceSelectionChange"
          />
        </div>
      </div>
    </section>

    <!-- Moduler & Sektioner -->
    <div v-if="!previewMode" class="modules-toolbar">
      <button type="button" class="btn btn-secondary" @click="addModule">
        + Lägg till modul
      </button>
    </div>

    <section class="modules-list">
      <div v-for="(mod, mIdx) in cardData.modules" :key="mod.id" class="module-card">
        <div class="module-header">
          <div class="module-title-row">
            <span class="module-badge">Modul {{ mod.moduleNumber }}</span>
            <input
              v-if="!previewMode"
              v-model="mod.title"
              type="text"
              class="module-title-input"
              placeholder="Modultitel"
            />
            <h2 v-else class="module-title-heading">{{ mod.title }}</h2>
            <span v-if="mod.isPartialExam" class="tag tag-exam">Delprov</span>
            <span v-if="mod.isCaseStudy" class="tag tag-case">Case</span>
          </div>

          <div v-if="!previewMode" class="module-actions">
            <button type="button" class="btn btn-ghost" @click="addSection(mIdx)">
              + Lägg till sektion
            </button>
            <button
              v-if="cardData.modules.length > 1"
              type="button"
              class="btn btn-sm btn-danger-ghost"
              @click="removeModule(mIdx)"
            >
              Ta bort modul
            </button>
          </div>
        </div>

        <div v-for="(sec, sIdx) in mod.sections" :key="sec.id" class="section-box">
          <div class="section-top">
            <input
              v-if="!previewMode"
              v-model="sec.title"
              type="text"
              class="section-title-input"
              placeholder="Sektionsrubrik (t.ex. Delmoment 1.1 – Introduktion)"
            />
            <h3 v-else class="section-title-heading">{{ sec.title }}</h3>

            <div v-if="!previewMode" class="block-toolbar">
              <button type="button" class="btn btn-sm" @click="addTextBlock(mIdx, sIdx)">
                + Textblock
              </button>
              <button type="button" class="btn btn-sm" @click="triggerVideoPicker(mIdx, sIdx)">
                + Video
              </button>
              <button type="button" class="btn btn-sm" @click="triggerImagePicker(mIdx, sIdx)">
                + Bild
              </button>
              <button type="button" class="btn btn-sm" @click="triggerFilePicker(mIdx, sIdx)">
                + Fil / PDF / Bild
              </button>
              <button
                v-if="mod.sections.length > 1"
                type="button"
                class="btn btn-sm btn-danger-ghost"
                @click="removeSection(mIdx, sIdx)"
              >
                Ta bort sektion
              </button>
            </div>
          </div>

          <!-- Dolda filväljare per sektion -->
          <input
            :ref="(el) => setInputRef(el, `video-${mIdx}-${sIdx}`)"
            type="file"
            accept="video/mp4,video/webm,video/quicktime,video/ogg,video/x-m4v,video/*"
            class="hidden-input"
            @change="(e) => onVideoSelected(e, mIdx, sIdx)"
          />
          <input
            :ref="(el) => setInputRef(el, `image-${mIdx}-${sIdx}`)"
            type="file"
            accept=".jpg,.jpeg,.png,.gif,.webp,.bmp,.tif,.tiff,.heic"
            class="hidden-input"
            @change="(e) => onImageSelected(e, mIdx, sIdx)"
          />
          <input
            :ref="(el) => setInputRef(el, `file-${mIdx}-${sIdx}`)"
            type="file"
            multiple
            class="hidden-input"
            @change="(e) => onFilesSelected(e, mIdx, sIdx)"
          />

          <!-- Delmoment / Blocks -->
          <div class="blocks-stack">
            <div
              v-for="(block, bIdx) in sec.blocks"
              :key="block.id"
              class="block-item"
              :class="`theme-${block.colorCode || 'default'}`"
            >
              <!-- 1. Färgkodat textblock med rubrik -->
              <template v-if="block.type === 'text'">
                <div v-if="!previewMode" class="block-controls">
                  <select
                    v-model="block.colorCode"
                    aria-label="Färgkod för textblock"
                    class="color-select"
                  >
                    <option value="default">Färg: Standard</option>
                    <option value="info">Färg: Blå (Info)</option>
                    <option value="success">Färg: Grön (Tips/Genomgång)</option>
                    <option value="warning">Färg: Gul (Viktigt)</option>
                    <option value="danger">Färg: Röd (Prov/Deadline)</option>
                  </select>
                  <button
                    type="button"
                    class="btn-icon"
                    title="Ta bort delmoment"
                    @click="removeBlock(mIdx, sIdx, bIdx)"
                  >
                    ✕
                  </button>
                </div>

                <template v-if="!previewMode">
                  <input
                    v-model="block.heading"
                    type="text"
                    class="block-heading-input"
                    placeholder="Rubrik för textblocket..."
                  />
                  <textarea
                    v-model="block.body"
                    rows="3"
                    class="block-body-textarea"
                    placeholder="Skriv textinnehåll för delmomentet..."
                  />
                </template>
                <template v-else>
                  <h4 v-if="block.heading" class="block-heading">{{ block.heading }}</h4>
                  <p class="block-body">{{ block.body }}</p>
                </template>
              </template>

              <!-- 2. Videoblock med inbäddad spelare -->
              <template v-else-if="block.type === 'video'">
                <div class="block-top-row">
                  <span class="block-type-pill">🎬 Video</span>
                  <button
                    v-if="!previewMode"
                    type="button"
                    class="btn-icon"
                    title="Ta bort video"
                    @click="removeBlock(mIdx, sIdx, bIdx)"
                  >
                    ✕
                  </button>
                </div>

                <input
                  v-if="!previewMode"
                  v-model="block.title"
                  type="text"
                  class="block-heading-input"
                  placeholder="Videotitel..."
                />
                <h4 v-else-if="block.title" class="block-heading">{{ block.title }}</h4>

                <div v-if="block.url" class="video-wrapper">
                  <video
                    :src="resolveMediaUrl(block.url)"
                    controls
                    preload="metadata"
                    class="embedded-video"
                  >
                    Din webbläsare stödjer inte inbäddad video.
                  </video>
                  <div class="file-meta">{{ block.fileName }}</div>
                </div>
                <div v-else class="empty-media">Ingen video vald ännu.</div>
              </template>

              <template v-else-if="block.type === 'image'">
                <div class="block-top-row">
                  <span class="block-type-pill">🖼️ Bild</span>
                  <button
                    v-if="!previewMode"
                    type="button"
                    class="btn-icon"
                    title="Ta bort bild"
                    @click="removeBlock(mIdx, sIdx, bIdx)"
                  >
                    ✕
                  </button>
                </div>

                <div v-if="!previewMode" class="image-editor-controls">
                  <label>
                    <span>Bildtext</span>
                    <input v-model="block.caption" type="text" placeholder="Bildtext (valfritt)" />
                  </label>
                  <label>
                    <span>Alternativtext</span>
                    <input v-model="block.altText" type="text" placeholder="Beskriv bilden" />
                  </label>
                  <label>
                    <span>Visning</span>
                    <select v-model="block.displayMode">
                      <option value="inline">Visa i modulen</option>
                      <option value="new-window">Öppna i nytt fönster</option>
                    </select>
                  </label>
                  <label>
                    <span>Bildstorlek</span>
                    <select v-model="block.imageWidth">
                      <option value="small">Liten</option>
                      <option value="medium">Mellan</option>
                      <option value="full">Full bredd</option>
                    </select>
                  </label>
                </div>

                <figure v-if="block.url" class="image-preview" :class="`image-width-${block.imageWidth || 'full'}`">
                  <a
                    v-if="previewMode && block.displayMode === 'new-window'"
                    :href="resolveMediaUrl(block.url)"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <img
                      :src="resolveMediaUrl(block.url)"
                      :alt="block.altText || block.caption || block.fileName"
                      class="embedded-image"
                    />
                  </a>
                  <img
                    v-else
                    :src="resolveMediaUrl(block.url)"
                    :alt="block.altText || block.caption || block.fileName"
                    class="embedded-image"
                  />
                  <figcaption v-if="block.caption">{{ block.caption }}</figcaption>
                </figure>
                <div v-else class="empty-media">Ingen bild vald ännu.</div>
              </template>

              <!-- 3. Uppladdade filer (Bild/PDF -> ny sida, övriga -> nedladdning) -->
              <template v-else-if="block.type === 'file'">
                <div class="file-row">
                  <div class="file-link-group">
                    <span class="file-icon" aria-hidden="true">
                      {{ getFileIcon(block) }}
                    </span>

                    <a
                      v-if="opensInNewTab(block)"
                      :href="resolveMediaUrl(block.url)"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="file-link"
                    >
                      {{ block.title || block.fileName }}
                    </a>

                    <a
                      v-else
                      :href="resolveMediaUrl(block.downloadUrl || block.url)"
                      :download="block.fileName"
                      class="file-link"
                    >
                      {{ block.title || block.fileName }}
                    </a>

                    <span class="file-action-hint">
                      {{ opensInNewTab(block) ? '(Öppnas i ny flik)' : '(Ladda ner)' }}
                    </span>
                  </div>

                  <button
                    v-if="!previewMode"
                    type="button"
                    class="btn-icon"
                    title="Ta bort fil"
                    @click="removeBlock(mIdx, sIdx, bIdx)"
                  >
                    ✕
                  </button>
                </div>
              </template>
            </div>

            <p v-if="!sec.blocks.length" class="empty-section">
              Inga delmoment i denna sektion ännu. Lägg till text, video, bild eller fil.
            </p>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, reactive, ref, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import api from '@/api/client'

const emit = defineEmits(['template-saved'])
const route = useRoute()

const previewMode = ref(false)
const inputRefs = ref({})
const objectUrls = new Set()

const selectedTemplateId = ref(String(route.query?.templateId || ''))
const courseTemplates = ref([])
const isLoadingTemplates = ref(false)
const isLoadingTemplate = ref(false)
const courseInstances = ref([])
const selectedCourseInstanceId = ref(String(route.query?.courseInstanceId || ''))
const isLoadingInstances = ref(false)
const templateSearch = ref('')
const courseInstanceSearch = ref('')

const isSavingTemplate = ref(false)
const isSavingCard = ref(false)
const isUploading = ref(false)
const statusMessage = ref('')
const statusType = ref('info')

const toSafeText = (val) => {
  if (val === null || val === undefined) return ''
  if (typeof val === 'string' || typeof val === 'number') return String(val)
  if (typeof val === 'object') {
    return String(val.title ?? val.name ?? val.label ?? '')
  }
  return ''
}

function setStatus(msg, type = 'info') {
  statusMessage.value = msg
  statusType.value = type
}

function formatTemplateLabel(tpl) {
  const name = toSafeText(
    tpl.templateName || tpl.title || tpl.name || tpl.courseCode || 'Namnlös mall'
  )
  const modCount = Array.isArray(tpl.modules) ? tpl.modules.length : 0
  return `${name} (${modCount} moduler)`
}

function extractTemplatesList(data) {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.templates)) return data.templates
  if (Array.isArray(data?.courseTemplates)) return data.courseTemplates
  if (Array.isArray(data?.data)) return data.data
  return []
}

function extractInstancesList(data) {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.instances)) return data.instances
  if (Array.isArray(data?.courseInstances)) return data.courseInstances
  if (Array.isArray(data?.data)) return data.data
  return []
}

function formatCourseInstanceLabel(instance) {
  const name = toSafeText(instance.courseName || instance.name)
  const code = toSafeText(instance.courseCode)
  return [name, code].filter(Boolean).join(' - ') || 'Namnlös kursinstans'
}

function normalizeAutocompleteText(value) {
  return toSafeText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function onTemplateSearchUpdate(query) {
  templateSearch.value = toSafeText(query)
}

function onCourseInstanceSearchUpdate(query) {
  courseInstanceSearch.value = toSafeText(query)
}

function levenshteinDistance(a, b) {
  const rows = a.length + 1
  const cols = b.length + 1
  const matrix = Array.from({ length: rows }, () => Array(cols).fill(0))
  for (let i = 0; i < rows; i++) matrix[i][0] = i
  for (let j = 0; j < cols; j++) matrix[0][j] = j
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      matrix[i][j] =
        a[i - 1] === b[j - 1]
          ? matrix[i - 1][j - 1]
          : 1 + Math.min(matrix[i - 1][j], matrix[i][j - 1], matrix[i - 1][j - 1])
    }
  }
  return matrix[a.length][b.length]
}

function rankAutocompleteItems(items, query) {
  const normalizedQuery = normalizeAutocompleteText(query)
  if (normalizedQuery.length < 3) return items

  return items
    .map((item) => {
      const text = normalizeAutocompleteText(item.label)
      const words = text.split(/\s+/).filter(Boolean)
      let score = -levenshteinDistance(normalizedQuery, text.slice(0, normalizedQuery.length))
      if (text === normalizedQuery) score += 100
      else if (text.startsWith(normalizedQuery)) score += 80
      else if (words.some((word) => word.startsWith(normalizedQuery))) score += 60
      else if (text.includes(normalizedQuery)) score += 40
      else if (normalizedQuery.split(/\s+/).every((word) => text.includes(word))) score += 20
      return { item, score, text }
    })
    .filter(({ text, score }) => {
      if (text.includes(normalizedQuery)) return true
      if (normalizedQuery.split(/\s+/).every((word) => text.includes(word))) return true
      if (text.startsWith(normalizedQuery) || score > 0) return true
      return levenshteinDistance(normalizedQuery, text.slice(0, normalizedQuery.length)) <= 2
    })
    .sort((a, b) => b.score - a.score || a.text.localeCompare(b.text, 'sv'))
    .slice(0, 15)
    .map(({ item }) => item)
}

const visibleTemplateItems = computed(() =>
  rankAutocompleteItems(
    (courseTemplates.value || []).map((tpl) => ({
      value: String(tpl._id || tpl.id || ''),
      label: formatTemplateLabel(tpl),
    })),
    templateSearch.value
  )
)

const visibleCourseInstanceItems = computed(() =>
  rankAutocompleteItems(
    (courseInstances.value || []).map((instance) => ({
      value: String(instance._id || instance.id || ''),
      label: formatCourseInstanceLabel(instance),
    })),
    courseInstanceSearch.value
  )
)

function filterAutocompleteItem(value, query, item) {
  const search = normalizeAutocompleteText(query)
  if (search.length < 3) return false
  const raw = item?.raw || item?.value || item || value
  return normalizeAutocompleteText(raw?.label || raw || value).includes(search)
}

async function fetchCourseInstances() {
  isLoadingInstances.value = true
  try {
    const { data } = await api.get('/course-instances')
    courseInstances.value = extractInstancesList(data)
  } catch (err) {
    setStatus(
      `Kunde inte hämta kursinstanser (${err?.response?.data?.message || err.message}).`,
      'warning'
    )
  } finally {
    isLoadingInstances.value = false
  }
}

async function fetchCourseTemplates() {
  isLoadingTemplates.value = true
  try {
    const { data } = await api.get('/course-templates')
    courseTemplates.value = extractTemplatesList(data)
  } catch (err) {
    setStatus(
      `Kunde inte hämta mallar från mall-banken (${err?.response?.data?.message || err.message}).`,
      'warning'
    )
  } finally {
    isLoadingTemplates.value = false
  }
}

function onTemplateSelectionChange() {
  if (!selectedTemplateId.value) {
    templateSearch.value = ''
    return
  }
  loadTemplateById(selectedTemplateId.value)
}

async function onCourseInstanceSelectionChange() {
  if (!selectedCourseInstanceId.value) {
    courseInstanceSearch.value = ''
    return
  }
  isLoadingTemplate.value = true
  try {
    const instanceId = encodeURIComponent(selectedCourseInstanceId.value)
    const [{ data: instanceData }, { data: contentData }] = await Promise.all([
      api.get(`/course-instances/${instanceId}`),
      api.get(`/course-instances/${instanceId}/content`),
    ])
    const instance = instanceData?.instance || instanceData?.data || instanceData
    if (instance?.courseName) cardData.title = toSafeText(instance.courseName)
    if (instance?.courseCode) cardData.courseCode = toSafeText(instance.courseCode)
    if (instance?.cardContent?.title) cardData.title = toSafeText(instance.cardContent.title)
    if (instance?.cardContent?.courseCode) {
      cardData.courseCode = toSafeText(instance.cardContent.courseCode)
    }
    if (Array.isArray(instance?.modules) && instance.modules.length) {
      cardData.modules = normalizeLoadedModules(instance.modules)
    } else if (Array.isArray(instanceData?.modules) && instanceData.modules.length) {
      cardData.modules = normalizeLoadedModules(instanceData.modules)
    }
    if (instance?.cardContent?.modules) {
      cardData.modules = normalizeLoadedModules(instance.cardContent.modules)
    }
    templateSearch.value = ''
    courseInstanceSearch.value = ''
    const content = contentData?.content
    if (content && typeof content === 'object') {
      cardData.modules.forEach((mod) => {
        const entry = content[String(mod.moduleNumber)]
        if (entry?.title) mod.title = toSafeText(entry.title)
      })
    }
    const hasCourseCard =
      instance?.courseTemplateId ||
      instance?.cardContent?.title ||
      instance?.cardContent?.modules?.length ||
      instance?.modules?.length
    setStatus(
      hasCourseCard
        ? 'Laddade kurskortet från kursinstansen.'
        : 'Laddade kursinstansen. Välj en mall eller använd standardinnehållet.',
      hasCourseCard ? 'success' : 'info'
    )
  } catch (err) {
    setStatus(
      `Kunde inte ladda kurskortet från kursinstansen: ${err?.response?.data?.message || err.message}`,
      'error'
    )
  } finally {
    isLoadingTemplate.value = false
  }
}

function formatUploadError(err, fallbackLabel) {
  const status = err?.response?.status
  const serverMsg = err?.response?.data?.message
  if (status === 401) {
    return 'Du behöver vara inloggad för att ladda upp kurskortsmaterial.'
  }
  if (status === 403) {
    return (
      serverMsg ||
      'Du saknar behörighet (lärare, admin eller systemadmin) för att ladda upp kurskortsmaterial.'
    )
  }
  return serverMsg || `Kunde inte ladda upp "${fallbackLabel}" (${err.message}).`
}

function createDefaultModules() {
  return Array.from({ length: 5 }, (_, idx) => {
    const moduleNumber = idx + 1
    return {
      id: `mod-${moduleNumber}-${crypto.randomUUID?.() || idx}`,
      moduleNumber,
      title: `Modul ${moduleNumber}`,
      isPartialExam: moduleNumber === 3,
      isCaseStudy: moduleNumber === 5,
      sections: [
        {
          id: `sec-${moduleNumber}-1-${crypto.randomUUID?.() || 'a'}`,
          title: `Delmoment ${moduleNumber}.1`,
          blocks: [],
        },
      ],
    }
  })
}

function normalizeLoadedModules(rawModules = []) {
  return (Array.isArray(rawModules) ? rawModules : []).map((m, idx) => {
    const modNum = Number(m?.moduleNumber ?? idx + 1)
    const sections = Array.isArray(m?.sections) ? m.sections : []

    return {
      ...m,
      id: m?.id || `mod-${modNum}-${idx}-${crypto.randomUUID?.() || idx}`,
      moduleNumber: modNum,
      title: toSafeText(m?.title) || `Modul ${modNum}`,
      isPartialExam: Boolean(m?.isPartialExam),
      isCaseStudy: Boolean(m?.isCaseStudy),
      sections: sections.map((sec, sIdx) => ({
        ...sec,
        id: sec?.id || `sec-${modNum}-${sIdx + 1}-${sIdx}-${crypto.randomUUID?.() || sIdx}`,
        title: toSafeText(sec?.title) || `Delmoment ${modNum}.${sIdx + 1}`,
        blocks: Array.isArray(sec?.blocks) ? sec.blocks : [],
      })),
    }
  })
}

const cardData = reactive({
  title: '',
  courseCode: '',
  modules: createDefaultModules(),
})

function addModule() {
  const nextNumber =
    (cardData.modules || []).reduce((max, m, idx) => {
      const num = Number(m?.moduleNumber ?? idx + 1)
      return Number.isFinite(num) && num > max ? num : max
    }, 0) + 1

  cardData.modules.push({
    id: `mod-${nextNumber}-${crypto.randomUUID?.() || Date.now()}`,
    moduleNumber: nextNumber,
    title: `Modul ${nextNumber}`,
    isPartialExam: nextNumber === 3,
    isCaseStudy: nextNumber === 5,
    sections: [
      {
        id: `sec-${nextNumber}-1-${crypto.randomUUID?.() || 'a'}`,
        title: `Delmoment ${nextNumber}.1`,
        blocks: [],
      },
    ],
  })
}

function removeModule(mIdx) {
  if (!Array.isArray(cardData.modules) || cardData.modules.length <= 1) return
  const [removed] = cardData.modules.splice(mIdx, 1)

  for (const sec of removed?.sections || []) {
    for (const blk of sec?.blocks || []) {
      if (blk?.url && objectUrls.has(blk.url)) {
        URL.revokeObjectURL(blk.url)
        objectUrls.delete(blk.url)
      }
    }
  }

  cardData.modules.forEach((mod, idx) => {
    mod.moduleNumber = idx + 1
  })
}

function resolveMediaUrl(url) {
  if (!url) return ''
  if (url.startsWith('blob:') || url.startsWith('http://') || url.startsWith('https://')) {
    return url
  }
  const base = (api?.defaults?.baseURL || '').replace(/\/+$/, '')
  if (url.startsWith('/api/') && base.endsWith('/api')) {
    return `${base.slice(0, -4)}${url}`
  }
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`
}

function setInputRef(el, key) {
  if (el) {
    inputRefs.value[key] = el
  }
}

function togglePreview() {
  previewMode.value = !previewMode.value
}

function addSection(mIdx) {
  const mod = cardData.modules[mIdx]
  if (!Array.isArray(mod.sections)) mod.sections = []
  const nextNum = mod.sections.length + 1
  mod.sections.push({
    id: `sec-${mod.moduleNumber}-${nextNum}-${crypto.randomUUID?.() || nextNum}`,
    title: `Delmoment ${mod.moduleNumber}.${nextNum}`,
    blocks: [],
  })
}

function removeSection(mIdx, sIdx) {
  const mod = cardData.modules?.[mIdx]
  if (!mod || !Array.isArray(mod.sections)) return
  if (mod.sections.length <= 1) {
    setStatus('En modul måste ha minst en sektion.', 'warning')
    return
  }
  mod.sections.splice(sIdx, 1)
}

function addTextBlock(mIdx, sIdx) {
  const sec = cardData.modules[mIdx].sections[sIdx]
  if (!Array.isArray(sec.blocks)) sec.blocks = []
  sec.blocks.push({
    id: `blk-${crypto.randomUUID?.() || Date.now()}-${Math.random()}`,
    type: 'text',
    heading: '',
    body: '',
    colorCode: 'default',
  })
}

function removeBlock(mIdx, sIdx, bIdx) {
  const blocks = cardData.modules[mIdx].sections[sIdx].blocks
  const [removed] = blocks.splice(bIdx, 1)
  if (removed?.url && objectUrls.has(removed.url)) {
    URL.revokeObjectURL(removed.url)
    objectUrls.delete(removed.url)
  }
}

function triggerVideoPicker(mIdx, sIdx) {
  inputRefs.value[`video-${mIdx}-${sIdx}`]?.click()
}

function triggerImagePicker(mIdx, sIdx) {
  inputRefs.value[`image-${mIdx}-${sIdx}`]?.click()
}

function triggerFilePicker(mIdx, sIdx) {
  inputRefs.value[`file-${mIdx}-${sIdx}`]?.click()
}

function registerObjectUrl(file) {
  const url = URL.createObjectURL(file)
  objectUrls.add(url)
  return url
}

async function uploadToBackend(file) {
  const formData = new FormData()
  formData.append('file', file)

  const { data } = await api.post('/documents/course-material', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

async function onVideoSelected(event, mIdx, sIdx) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return

  const sec = cardData.modules[mIdx].sections[sIdx]
  if (!Array.isArray(sec.blocks)) sec.blocks = []

  const fallbackUrl = registerObjectUrl(file)
  const block = reactive({
    id: `vid-${crypto.randomUUID?.() || Date.now()}`,
    type: 'video',
    title: file.name.replace(/\.[^/.]+$/, ''),
    fileName: file.name,
    mimeType: file.type || 'video/mp4',
    size: file.size,
    url: fallbackUrl,
    fileId: null,
  })

  sec.blocks.push(block)
  isUploading.value = true

  try {
    const uploaded = await uploadToBackend(file)
    block.url = uploaded.url
    block.fileId = uploaded.fileId
    block.mimeType = uploaded.mimeType || block.mimeType
    URL.revokeObjectURL(fallbackUrl)
    objectUrls.delete(fallbackUrl)
    setStatus(`Videon "${file.name}" laddades upp.`, 'success')
  } catch (err) {
    const status = err?.response?.status
    const msg = formatUploadError(err, file.name)
    if (status === 401 || status === 403) {
      setStatus(`${msg} Visas tillfälligt lokalt i förhandsgranskningen.`, 'error')
    } else {
      setStatus(`${msg} Visas lokalt för förhandsgranskning.`, 'warning')
    }
  } finally {
    isUploading.value = false
  }
}

async function onImageSelected(event, mIdx, sIdx) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return

  if (!/\.(jpe?g|png|gif|webp|bmp|tif|tiff|heic)$/i.test(file.name)) {
    setStatus('Välj en giltig bildfil.', 'error')
    return
  }

  const sec = cardData.modules[mIdx].sections[sIdx]
  if (!Array.isArray(sec.blocks)) sec.blocks = []

  const fallbackUrl = registerObjectUrl(file)
  const block = reactive({
    id: `img-${crypto.randomUUID?.() || Date.now()}`,
    type: 'image',
    title: file.name,
    caption: '',
    altText: '',
    imageWidth: 'full',
    displayMode: 'inline',
    fileName: file.name,
    mimeType: file.type,
    size: file.size,
    url: fallbackUrl,
    fileId: null,
  })

  sec.blocks.push(block)
  isUploading.value = true

  try {
    const uploaded = await uploadToBackend(file)
    block.url = uploaded.url
    block.fileId = uploaded.fileId
    block.mimeType = uploaded.mimeType || block.mimeType
    URL.revokeObjectURL(fallbackUrl)
    objectUrls.delete(fallbackUrl)
    setStatus(`Bilden "${file.name}" laddades upp.`, 'success')
  } catch (err) {
    const status = err?.response?.status
    const msg = formatUploadError(err, file.name)
    if (status === 401 || status === 403) {
      setStatus(`${msg} Visas tillfälligt lokalt i förhandsgranskningen.`, 'error')
    } else {
      setStatus(`${msg} Visas lokalt för förhandsgranskning.`, 'warning')
    }
  } finally {
    isUploading.value = false
  }
}

function isImageOrPdf(item) {
  if (typeof item.openInNewTab === 'boolean') return item.openInNewTab
  const mime = (item.mimeType || '').toLowerCase()
  const name = (item.fileName || item.title || '').toLowerCase()
  return (
    mime.startsWith('image/') ||
    mime === 'application/pdf' ||
    /\.(png|jpe?g|gif|webp|bmp|tif|tiff|heic|pdf)$/i.test(name)
  )
}

function opensInNewTab(item) {
  return isImageOrPdf(item)
}

function getFileIcon(item) {
  const mime = (item.mimeType || '').toLowerCase()
  const name = (item.fileName || item.title || '').toLowerCase()

  if (mime === 'application/pdf' || name.endsWith('.pdf')) return '📄'
  if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|tif|tiff|heic)$/i.test(name))
    return '🖼️'
  if (/\.(doc|docx|odt|rtf)$/i.test(name)) return '📝'
  if (/\.(xls|xlsx|csv|ods)$/i.test(name)) return '📊'
  if (/\.(ppt|pptx|odp)$/i.test(name)) return '📽️'
  return '📎'
}

async function onFilesSelected(event, mIdx, sIdx) {
  const files = Array.from(event.target.files || [])
  event.target.value = ''
  if (!files.length) return

  const sec = cardData.modules[mIdx].sections[sIdx]
  if (!Array.isArray(sec.blocks)) sec.blocks = []
  const targetBlocks = sec.blocks
  isUploading.value = true

  for (const file of files) {
    const fallbackUrl = registerObjectUrl(file)
    const block = reactive({
      id: `file-${crypto.randomUUID?.() || Date.now()}-${Math.random()}`,
      type: 'file',
      title: file.name,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      url: fallbackUrl,
      downloadUrl: fallbackUrl,
      openInNewTab: isImageOrPdf({ fileName: file.name, mimeType: file.type }),
      fileId: null,
    })
    targetBlocks.push(block)

    try {
      const uploaded = await uploadToBackend(file)
      block.url = uploaded.url
      block.downloadUrl = uploaded.downloadUrl || uploaded.url
      block.fileId = uploaded.fileId
      block.mimeType = uploaded.mimeType || block.mimeType
      block.openInNewTab =
        typeof uploaded.openInNewTab === 'boolean' ? uploaded.openInNewTab : block.openInNewTab
      URL.revokeObjectURL(fallbackUrl)
      objectUrls.delete(fallbackUrl)
      setStatus(`Filen "${file.name}" laddades upp.`, 'success')
    } catch (err) {
      const status = err?.response?.status
      const msg = formatUploadError(err, file.name)
      if (status === 401 || status === 403) {
        setStatus(`${msg} Visas tillfälligt lokalt i förhandsgranskningen.`, 'error')
      } else {
        setStatus(`${msg} Visas lokalt för förhandsgranskning.`, 'warning')
      }
    }
  }

  isUploading.value = false
}

function serializeModuleContentMap() {
  const mapPayload = {}
  ;(cardData.modules || []).forEach((mod, idx) => {
    const key = String(mod.moduleNumber ?? idx + 1)
    const firstSection = mod.sections?.[0]
    const firstTextBlock = firstSection?.blocks?.find((b) => b.type === 'text')
    const instructions =
      toSafeText(mod.instructions) ||
      toSafeText(firstSection?.instructions) ||
      toSafeText(firstTextBlock?.body) ||
      ''

    mapPayload[key] = {
      title: toSafeText(mod.title) || `Modul ${key}`,
      instructions,
      isHiddenFromStudent: Boolean(mod.isHiddenFromStudent),
    }
  })
  return mapPayload
}

function serializeContent() {
  const cleanModules = (cardData.modules || []).map((mod, idx) => ({
    id: mod.id || `mod-${idx + 1}`,
    moduleNumber: Number(mod.moduleNumber ?? idx + 1),
    title: toSafeText(mod.title) || `Modul ${idx + 1}`,
    isPartialExam: !!mod.isPartialExam,
    isCaseStudy: !!mod.isCaseStudy,
    sections:
      Array.isArray(mod.sections) && mod.sections.length > 0
        ? mod.sections.map((sec, sIdx) => ({
            id: sec.id || `sec-${idx + 1}-${sIdx + 1}`,
            title: toSafeText(sec.title) || `Delmoment ${idx + 1}.${sIdx + 1}`,
            blocks: (sec.blocks || []).map((blk) => ({
              id: blk.id,
              type: blk.type,
              title: toSafeText(blk.title),
              heading: toSafeText(blk.heading),
              body: toSafeText(blk.body),
              caption: toSafeText(blk.caption),
              altText: toSafeText(blk.altText),
              imageWidth: ['small', 'medium', 'full'].includes(blk.imageWidth)
                ? blk.imageWidth
                : 'full',
              displayMode: blk.displayMode === 'new-window' ? 'new-window' : 'inline',
              colorCode: blk.colorCode || 'default',
              fileId: blk.fileId || null,
              fileName: toSafeText(blk.fileName),
              mimeType: toSafeText(blk.mimeType),
              size: blk.size || 0,
              url: blk.url && !String(blk.url).startsWith('blob:') ? String(blk.url) : '',
              downloadUrl:
                blk.downloadUrl && !String(blk.downloadUrl).startsWith('blob:')
                  ? String(blk.downloadUrl)
                  : '',
              openInNewTab: !!blk.openInNewTab,
            })),
          }))
        : [
            {
              id: `sec-${idx + 1}-1`,
              title: `Delmoment ${idx + 1}.1`,
              blocks: [],
            },
          ],
  }))

  return {
    title: toSafeText(cardData.title),
    courseCode: toSafeText(cardData.courseCode),
    modules: cleanModules,
  }
}

async function loadTemplateById(templateId) {
  if (!templateId) return
  isLoadingTemplate.value = true
  try {
    const fromList = (courseTemplates.value || []).find(
      (t) => String(t._id || t.id) === String(templateId)
    )
    let tpl = fromList
    if (!tpl) {
      const { data } = await api.get(`/course-templates/${encodeURIComponent(templateId)}`)
      tpl = data?.template || data?.data || data
    }

    if (!tpl) {
      setStatus('Mallen kunde inte hittas i mall-banken.', 'warning')
      return
    }

    cardData.title = toSafeText(tpl.templateName || tpl.title || tpl.name)
    cardData.courseCode = toSafeText(tpl.courseCode)
    if (Array.isArray(tpl.cardContent?.modules) && tpl.cardContent.modules.length) {
      cardData.title =
        toSafeText(tpl.cardContent.title) ||
        toSafeText(tpl.templateName || tpl.title || tpl.name)
      cardData.courseCode =
        toSafeText(tpl.cardContent.courseCode) || toSafeText(tpl.courseCode)
      cardData.modules = normalizeLoadedModules(tpl.cardContent.modules)
    } else if (Array.isArray(tpl.modules) && tpl.modules.length) {
      cardData.modules = normalizeLoadedModules(tpl.modules)
    }
    templateSearch.value = ''

    setStatus(
      `Laddade mallen "${toSafeText(tpl.templateName || tpl.title || tpl.name || 'Mall')}" från mall-banken.`,
      'success'
    )
  } catch (err) {
    setStatus(
      `Kunde inte ladda mall: ${err?.response?.data?.message || err?.response?.data?.error || err.message}`,
      'error'
    )
  } finally {
    isLoadingTemplate.value = false
  }
}

async function saveAsTemplate({ asNew = true } = {}) {
  const snapshot = serializeContent()
  const updateId = !asNew && selectedTemplateId.value ? String(selectedTemplateId.value) : ''
  const cleanTitle = toSafeText(cardData.title).trim()
  const cleanCode = toSafeText(cardData.courseCode).trim()
  const templateTitle =
    cleanTitle ||
    (cleanCode ? `${cleanCode} – Kursmall` : `Kursmall (${new Date().toISOString().slice(0, 10)})`)

  isSavingTemplate.value = true
  try {
    const payload = {
      templateName: templateTitle,
      title: templateTitle,
      name: templateTitle,
      courseCode: cleanCode,
      description: `Fristående kursmall (${snapshot.modules.length} moduler).`,
      modules: snapshot.modules,
      content: serializeModuleContentMap(),
      isTemplate: true,
    }

    const { data } = updateId
      ? await api.put(`/course-templates/${encodeURIComponent(updateId)}`, payload)
      : await api.post('/course-templates', payload)
    const created = data?.template || data?.data || data
    const createdId = created?._id || created?.id || updateId || ''

    await fetchCourseTemplates()
    if (createdId) {
      selectedTemplateId.value = String(createdId)
    }

    setStatus(
      updateId
        ? `Uppdaterade "${templateTitle}" i mall-banken.`
        : `Sparade "${templateTitle}" som ny mall i mall-banken.`,
      'success'
    )
    emit('template-saved', created)
  } catch (err) {
    const status = err?.response?.status
    const data = err?.response?.data
    const serverMsg =
      typeof data === 'string'
        ? data
        : data?.error ||
          data?.message ||
          (Array.isArray(data?.errors) ? data.errors.map((e) => e.msg || e.message).join(', ') : '')

    setStatus(
      `Kunde inte spara som mall${status ? ` (${status})` : ''}: ${serverMsg || err.message}`,
      'error'
    )
  } finally {
    isSavingTemplate.value = false
  }
}

async function saveCourseCard() {
  if (!selectedCourseInstanceId.value) {
    setStatus('Välj en kursinstans att koppla kurskortet till.', 'warning')
    return
  }

  const snapshot = serializeContent()
  isSavingCard.value = true
  try {
    const instanceId = encodeURIComponent(selectedCourseInstanceId.value)
    await api.put(`/course-instances/${instanceId}/content`, {
      content: serializeModuleContentMap(),
      modules: snapshot.modules,
      cardContent: snapshot,
      courseTemplateId: selectedTemplateId.value || null,
      syncModules: true,
    })
    setStatus('Kurskortet sparades och kopplades till kursinstansen.', 'success')
  } catch (err) {
    setStatus(
      `Kunde inte spara kurskortet: ${err?.response?.data?.message || err?.response?.data?.error || err.message}`,
      'error'
    )
  } finally {
    isSavingCard.value = false
  }
}

onMounted(async () => {
  if (route.query.courseName) cardData.title = toSafeText(route.query.courseName)
  if (route.query.courseCode) cardData.courseCode = toSafeText(route.query.courseCode)

  await Promise.all([fetchCourseTemplates(), fetchCourseInstances()])
  if (selectedCourseInstanceId.value) {
    const selectedInstance = courseInstances.value.find(
      (instance) => String(instance._id || instance.id) === selectedCourseInstanceId.value
    )
    if (selectedInstance) {
      courseInstanceSearch.value = formatCourseInstanceLabel(selectedInstance)
    }
    await onCourseInstanceSelectionChange()
  }
  if (selectedTemplateId.value) {
    await loadTemplateById(selectedTemplateId.value)
  }
})

onBeforeUnmount(() => {
  for (const url of objectUrls) {
    URL.revokeObjectURL(url)
  }
  objectUrls.clear()
})
</script>

<style scoped>
.course-card-builder {
  max-width: 980px;
  margin: 0 auto;
  padding: 24px;
  font-family: system-ui, -apple-system, sans-serif;
  color: #1f2937;
}

.builder-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 18px;
  flex-wrap: wrap;
}

.subtitle {
  margin: 4px 0 0;
  color: #6b7280;
}

.header-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.status-banner {
  padding: 10px 14px;
  border-radius: 8px;
  margin-bottom: 16px;
  font-size: 0.9rem;
  border: 1px solid transparent;
}

.status-info {
  background: #eff6ff;
  border-color: #bfdbfe;
  color: #1e40af;
}

.status-success {
  background: #f0fdf4;
  border-color: #bbf7d0;
  color: #166534;
}

.status-warning {
  background: #fffbeb;
  border-color: #fde68a;
  color: #92400e;
}

.status-error {
  background: #fef2f2;
  border-color: #fecaca;
  color: #991b1b;
}

.meta-card,
.module-card {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 18px;
  margin-bottom: 20px;
}

.meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
  margin-top: 12px;
}

.instance-bar {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  margin-top: 14px;
  flex-wrap: wrap;
}

.instance-buttons {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.field-grow {
  flex: 1;
  min-width: 240px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.9rem;
}

.field input,
.instance-select {
  padding: 8px 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #ffffff;
}

.modules-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}

.module-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}

.module-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  flex: 1;
}

.module-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.module-badge {
  background: #eef2ff;
  color: #3730a3;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 0.85rem;
}

.module-title-input,
.section-title-input,
.block-heading-input,
.image-editor-controls input,
.image-editor-controls select {
  padding: 7px 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.95rem;
}

.module-title-input {
  min-width: 220px;
}

.tag {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 6px;
}

.tag-exam {
  background: #fef2f2;
  color: #b91c1c;
}

.tag-case {
  background: #f0fdf4;
  color: #15803d;
}

.section-box {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 14px;
  margin-top: 12px;
  background: #f9fafb;
}

.section-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.block-toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.blocks-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.block-item {
  border-radius: 8px;
  padding: 12px 14px;
  border-left: 4px solid #9ca3af;
  background: #ffffff;
}

.theme-default {
  border-left-color: #6b7280;
  background: #ffffff;
}

.theme-info {
  border-left-color: #2563eb;
  background: #eff6ff;
}

.theme-success {
  border-left-color: #16a34a;
  background: #f0fdf4;
}

.theme-warning {
  border-left-color: #d97706;
  background: #fffbeb;
}

.theme-danger {
  border-left-color: #dc2626;
  background: #fef2f2;
}

.block-controls,
.block-top-row,
.file-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.block-heading-input {
  width: 100%;
  margin-bottom: 8px;
  background: #ffffff;
}

.block-body-textarea {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #ffffff;
  resize: vertical;
}

.block-heading {
  margin: 0 0 6px;
}

.block-body {
  margin: 0;
  white-space: pre-line;
}

.embedded-video {
  width: 100%;
  max-height: 360px;
  border-radius: 6px;
  background: #000000;
}

.image-editor-controls {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
  margin-bottom: 12px;
}

.image-editor-controls label {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 0.85rem;
}

.image-preview {
  margin: 0;
  max-width: 100%;
}

.image-width-small {
  width: min(100%, 240px);
}

.image-width-medium {
  width: min(100%, 480px);
}

.image-width-full {
  width: 100%;
}

.embedded-image {
  display: block;
  width: 100%;
  max-width: 100%;
  max-height: 600px;
  border-radius: 6px;
  object-fit: contain;
}

.image-preview figcaption {
  margin-top: 6px;
  color: #6b7280;
  font-size: 0.85rem;
}

.file-link-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.file-link {
  font-weight: 600;
  color: #1d4ed8;
  text-decoration: underline;
}

.file-action-hint,
.file-meta,
.empty-section,
.empty-media {
  font-size: 0.85rem;
  color: #6b7280;
}

.color-select {
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid #d1d5db;
  background: #ffffff;
  font-size: 0.85rem;
}

.btn {
  padding: 8px 14px;
  border-radius: 6px;
  border: 1px solid #d1d5db;
  background: #ffffff;
  cursor: pointer;
  font-weight: 500;
}

.btn-primary {
  background: #2563eb;
  border-color: #2563eb;
  color: #ffffff;
}

.btn-secondary {
  background: #f3f4f6;
}

.btn-sm {
  padding: 5px 10px;
  font-size: 0.85rem;
}

.btn-ghost,
.btn-danger-ghost,
.btn-icon {
  background: transparent;
  border: none;
  cursor: pointer;
}

.btn-danger-ghost {
  color: #b91c1c;
}

.hidden-input {
  display: none;
}
</style>