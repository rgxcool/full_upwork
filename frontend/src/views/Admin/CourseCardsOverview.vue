<template>
  <div class="scrollable-view">
    <v-container class="py-5">
      <v-card class="pa-5 mb-5">
        <div class="d-flex align-center justify-space-between flex-wrap ga-3">
          <div>
            <v-btn
              v-if="selectedCard"
              variant="text"
              prepend-icon="mdi-arrow-left"
              class="mb-2"
              @click="backToList"
            >
              Kurskort
            </v-btn>
            <v-card-title class="text-h4 font-weight-bold pa-0">
              {{ selectedCard ? cardTitle(selectedCard) : 'Kurskort' }}
            </v-card-title>
            <p class="text-body-2 text-medium-emphasis mt-2 mb-0">
              <template v-if="selectedCard">
                Kurskod: {{ cardCourseCode(selectedCard) }}
                · Slutdatum {{ formatDate(selectedCard.endDate) }}
              </template>
              <template v-else>
                Kurskort sorterade efter slutdatum, med det närmaste slutdatumet först.
              </template>
            </p>
          </div>
          <v-autocomplete
            v-if="!selectedCard"
            v-model="selectedCardFilterId"
            v-model:search="filterText"
            :items="courseCardFilterItems"
            item-title="title"
            item-value="value"
            item-subtitle="subtitle"
            :custom-filter="filterCourseCardOption"
            label="Filtrera kurskort"
            placeholder="Sök titel, kurskod eller datum"
            variant="outlined"
            density="compact"
            hide-details
            clearable
            class="course-card-filter"
            @update:model-value="selectCourseCardFilter"
            @update:search="updateCourseCardFilter"
          />
          <v-btn
            variant="tonal"
            prepend-icon="mdi-refresh"
            :loading="loading"
            @click="loadCards"
          >
            Uppdatera
          </v-btn>
        </div>
      </v-card>

      <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-4" />
      <v-alert v-else-if="error" type="error" class="mb-4">{{ error }}</v-alert>
      <v-alert v-else-if="selectedCard && !currentModule" type="info">
        Kurskortet innehåller inga moduler.
      </v-alert>

      <v-card
        v-else-if="selectedCard && currentModule"
        class="module-view pa-5"
        :style="courseCardStyle(selectedCard)"
      >
        <div class="module-progress">
          <div>
            <div class="text-overline">
              Kurskod: {{ cardCourseCode(selectedCard) || '–' }}
            </div>
            <h2 class="text-h5 font-weight-bold">
              Modul {{ currentModule.moduleNumber }}: {{ currentModule.title || 'Namnlös modul' }}
            </h2>
          </div>
          <v-chip v-if="currentModule.isPartialExam" color="deep-orange" size="small">
            Delprov
          </v-chip>
          <v-chip v-else-if="currentModule.isCaseStudy" color="indigo" size="small">Case</v-chip>
        </div>

        <v-divider class="my-4" />

        <section
          v-for="(section, index) in currentModule.sections || []"
          :key="`${currentModule.moduleNumber}-${index}`"
          class="module-section"
        >
          <h3 class="text-h6 font-weight-bold">
            {{ section.title || `Delmoment ${currentModule.moduleNumber}.${index + 1}` }}
          </h3>
          <p v-if="section.description" class="section-copy">{{ section.description }}</p>
          <p v-if="section.instructions" class="section-copy">{{ section.instructions }}</p>
          <div
            v-for="(block, blockIndex) in section.blocks || []"
            :key="`${currentModule.moduleNumber}-${index}-${blockIndex}`"
            class="content-block"
          >
            <h4 v-if="block.type !== 'image' && (block.heading || block.title)">
              {{ block.heading || block.title }}
            </h4>
            <p v-if="block.body">{{ block.body }}</p>
            <a
              v-if="block.type === 'image' && block.displayMode === 'new-window' && imageUrl(block)"
              :href="imageUrl(block)"
              target="_blank"
              rel="noopener noreferrer"
            >
              {{ block.caption || block.title || block.fileName || 'Öppna bilden' }}
            </a>
            <figure
              v-else-if="block.type === 'image' && imageUrl(block)"
              class="course-image"
              :class="imageWidthClass(block)"
            >
              <img
                :src="imageUrl(block)"
                :alt="block.altText || block.caption || block.title || block.fileName || ''"
              />
              <figcaption v-if="block.caption">{{ block.caption }}</figcaption>
            </figure>
            <a
              v-else-if="block.type !== 'image' && resourceUrl(block)"
              :href="resourceUrl(block)"
              target="_blank"
              rel="noopener noreferrer"
            >
              {{ block.fileName || block.title || 'Öppna material' }}
            </a>
          </div>
        </section>

        <v-card v-if="currentModule.assignment?.title || currentModule.assignment?.description" class="assignment-card pa-4 mt-4" variant="outlined">
          <div class="text-overline">Inlämningsuppgift</div>
          <h3 class="text-h6">{{ currentModule.assignment.title || 'Uppgift' }}</h3>
          <p v-if="currentModule.assignment.description" class="mb-0 mt-2">
            {{ currentModule.assignment.description }}
          </p>
        </v-card>

        <CourseCardDiscussions
          :course-instance-id="selectedCard._id"
          :module-number="Number(currentModule.moduleNumber)"
          :module="currentModule"
          staff-view
        />

        <div class="module-navigation">
          <v-btn
            variant="tonal"
            prepend-icon="mdi-chevron-left"
            :disabled="currentModuleIndex === 0"
            @click="moveModule(-1)"
          >
            Föregående
          </v-btn>
          <span>Modul {{ currentModuleIndex + 1 }} av {{ selectedCard.modules.length }}</span>
          <v-btn
            color="primary"
            append-icon="mdi-chevron-right"
            :disabled="currentModuleIndex >= selectedCard.modules.length - 1"
            @click="moveModule(1)"
          >
            Nästa
          </v-btn>
        </div>
      </v-card>

      <v-alert v-else-if="route.params.courseInstanceId" type="warning">
        Kurskortet hittades inte.
      </v-alert>
      <v-alert v-else-if="cards.length === 0" type="info">
        Det finns inga kurskort att visa.
      </v-alert>
      <v-alert v-else-if="filteredCards.length === 0" type="info">
        Inga kurskort matchar filtret.
      </v-alert>

      <div v-else-if="!route.params.courseInstanceId" class="course-card-grid">
        <v-card
          v-for="card in filteredCards"
          :key="card._id"
          :class="['course-card', { 'course-card-actionable': canUseCardAction(card) }]"
          variant="outlined"
          :role="canUseCardAction(card) ? 'link' : undefined"
          :tabindex="canUseCardAction(card) ? 0 : undefined"
          :style="courseCardStyle(card)"
          @click="activateCard(card)"
          @keydown.enter="activateCard(card)"
          @keydown.space.prevent="activateCard(card)"
        >
          <div class="course-card-heading">
            <div>
              <div v-if="cardCourseCode(card)" class="text-overline">
                Kurskod: {{ cardCourseCode(card) }}
              </div>
              <h2 class="text-h6 font-weight-bold">
                {{ cardTitle(card) }}
              </h2>
            </div>
            <v-chip size="small" :color="card.isActive ? 'success' : 'default'">
              {{ card.isActive ? 'Aktiv' : 'Inaktiv' }}
            </v-chip>
          </div>

          <v-divider class="my-3" />

          <div class="course-dates">
            <div>
              <span class="text-caption text-medium-emphasis">Startdatum</span>
              <div>{{ formatDate(card.startDate) }}</div>
            </div>
            <div>
              <span class="text-caption text-medium-emphasis">Slutdatum</span>
              <div class="font-weight-bold">{{ formatDate(card.endDate) }}</div>
            </div>
          </div>

          <div v-if="card.coursePoints || card.courseExtent" class="text-body-2 mt-3">
            <span v-if="card.coursePoints">Poäng: {{ card.coursePoints }}</span>
            <span v-if="card.coursePoints && card.courseExtent"> · </span>
            <span v-if="card.courseExtent">Omfattning: {{ card.courseExtent }}</span>
          </div>

          <div v-if="teacherName(card.responsibleTeacher)" class="text-body-2 mt-3">
            Ansvarig lärare: {{ teacherName(card.responsibleTeacher) }}
          </div>

          <div v-if="card.modules?.length" class="text-body-2 text-medium-emphasis mt-3">
            {{ card.modules.length }} {{ card.modules.length === 1 ? 'modul' : 'moduler' }}
          </div>
          <div class="card-action">
            <v-btn
              v-if="hasLinkedCourseCard(card)"
              variant="tonal"
              color="primary"
              append-icon="mdi-arrow-right"
              @click.stop="openCard(card)"
            >
              Öppna kurskortet
            </v-btn>
            <v-btn
              v-else
              variant="tonal"
              color="primary"
              append-icon="mdi-pencil"
              :disabled="!canEditContent(card)"
              :title="
                canEditContent(card)
                  ? 'Redigera kursinnehållet'
                  : 'Endast ansvarig lärare eller administratör kan redigera innehållet'
              "
              @click.stop="editCourseCard(card)"
            >
              Redigera
            </v-btn>
            <v-btn
              v-if="canDeleteCards"
              class="ml-2 delete-card-btn"
              variant="text"
              color="error"
              prepend-icon="mdi-delete-outline"
              :aria-label="`Ta bort kurskortet ${cardTitle(card)}`"
              @click.stop="askDeleteCard(card)"
            >
              Ta bort
            </v-btn>
          </div>
        </v-card>
      </div>

      <v-dialog v-model="deleteDialog" max-width="480">
        <v-card>
          <v-card-title class="text-h6">Ta bort kurskort?</v-card-title>
          <v-card-text>
            <p>
              <strong>{{ cardToDelete ? cardTitle(cardToDelete) : '' }}</strong>
              <span v-if="cardToDelete">
                ({{ formatDate(cardToDelete.startDate) }} – {{ formatDate(cardToDelete.endDate) }})
              </span>
            </p>
            <p class="mt-2">
              Kurskortet och dess diskussioner tas bort permanent. Kurskort med kopplade elever
              kan inte tas bort.
            </p>
            <v-alert v-if="deleteError" type="error" variant="tonal" class="mt-3">
              {{ deleteError }}
            </v-alert>
          </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn variant="text" :disabled="deleting" @click="deleteDialog = false">Avbryt</v-btn>
            <v-btn color="error" variant="flat" :loading="deleting" @click="confirmDeleteCard">
              Ta bort
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
    </v-container>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { teacherColor, teacherDisplayName } from '@/utils/teacherName.js'
import client from '@/api/client.js'
import store from '@/store/store.js'
import CourseCardDiscussions from '@/components/CourseCardDiscussions.vue'

const route = useRoute()
const router = useRouter()
const cards = ref([])
const loading = ref(false)
const error = ref('')
const filterText = ref(typeof route.query.filter === 'string' ? route.query.filter : '')
const selectedCardFilterId = ref(
  typeof route.query.filterId === 'string' ? route.query.filterId : null
)

const courseCardFilterItems = computed(() => [
  ...cards.value.map((card) => ({
    title: cardTitle(card),
    subtitle: [
      cardCourseCode(card) ? `Kurskod: ${cardCourseCode(card)}` : '',
      `Start ${formatDate(card.startDate)}`,
      `Slut ${formatDate(card.endDate)}`,
    ]
      .filter(Boolean)
      .join(' · '),
    searchText: cardSearchText(card),
    value: String(card._id),
  })),
])

const normalizeFilterText = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('sv-SE')
    .trim()

const matchesFilter = (searchableText, query) => {
  const normalizedText = normalizeFilterText(searchableText)
  const terms = normalizeFilterText(query).split(/\s+/).filter(Boolean)
  return terms.every((term) => normalizedText.includes(term))
}

const filteredCards = computed(() => {
  const selectedCard = cards.value.find(
    (card) => String(card._id) === String(selectedCardFilterId.value)
  )
  if (selectedCard) return [selectedCard]
  if (!filterText.value.trim()) return cards.value
  return cards.value.filter((card) => matchesFilter(cardSearchText(card), filterText.value))
})

const selectedCard = computed(
  () => cards.value.find((card) => String(card._id) === String(route.params.courseInstanceId)) || null
)

const currentModuleIndex = computed(() => {
  const modules = selectedCard.value?.modules || []
  const requestedNumber = Number(route.query.module)
  const index = modules.findIndex((module) => Number(module.moduleNumber) === requestedNumber)
  return index < 0 ? 0 : index
})

const currentModule = computed(
  () => selectedCard.value?.modules?.[currentModuleIndex.value] || null
)

const formatDate = (value) => {
  if (!value) return '–'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '–' : date.toLocaleDateString('sv-SE')
}

const cardTitle = (card) => card.cardContent?.title || card.courseName || 'Namnlös kurs'
const cardCourseCode = (card) => card.cardContent?.courseCode || card.courseCode || ''

const searchDate = (value) => {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? ''
    : `${date.toISOString().slice(0, 10)} ${date.toLocaleDateString('sv-SE')}`
}

const cardSearchText = (card) =>
  [
    cardTitle(card),
    cardCourseCode(card),
    'start',
    'startdatum',
    searchDate(card.startDate),
    'slut',
    'slutdatum',
    searchDate(card.endDate),
  ]
    .filter(Boolean)
    .join(' ')

const filterCourseCardOption = (value, query, item) => {
  const rawItem = item?.raw || item?.value || item
  return matchesFilter(rawItem?.searchText || rawItem?.title || value, query)
}

const syncFilterQuery = () => {
  const query = { ...route.query }
  const text = filterText.value.trim()
  if (text) query.filter = text
  else delete query.filter
  if (selectedCardFilterId.value && text) query.filterId = selectedCardFilterId.value
  else delete query.filterId

  if (
    query.filter === route.query.filter &&
    query.filterId === route.query.filterId
  ) return
  router.replace({ query })
}

watch([filterText, selectedCardFilterId], syncFilterQuery)
watch(
  () => [route.query.filter, route.query.filterId],
  ([filter, filterId]) => {
    const nextFilter = typeof filter === 'string' ? filter : ''
    const nextFilterId = typeof filterId === 'string' ? filterId : null
    if (filterText.value !== nextFilter) filterText.value = nextFilter
    if (selectedCardFilterId.value !== nextFilterId) {
      selectedCardFilterId.value = nextFilterId
    }
  }
)

const selectCourseCardFilter = (value) => {
  selectedCardFilterId.value = value ? String(value) : null
  if (value) {
    const card = cards.value.find((item) => String(item._id) === String(value))
    if (card) filterText.value = cardTitle(card)
  }
}

const updateCourseCardFilter = (value) => {
  filterText.value = String(value || '')
  const selectedCard = cards.value.find(
    (card) => String(card._id) === String(selectedCardFilterId.value)
  )
  if (
    selectedCard &&
    normalizeFilterText(filterText.value) !== normalizeFilterText(cardTitle(selectedCard))
  ) {
    selectedCardFilterId.value = null
  }
}

const teacherName = (teacher) => teacherDisplayName(teacher) || teacher?.subject || ''

const hasLinkedCourseCard = (card) =>
  Boolean(
    card.courseTemplateId ||
      card.cardContent?.title?.trim?.() ||
      card.cardContent?.modules?.length ||
      card.modules?.length
  )

const canEditContent = (card) => {
  const role = store.getters.userRole
  if (role === 'admin' || role === 'systemadmin') return true
  if (role !== 'teacher') return false

  const currentUserId = String(store.state.user?.userId || store.state.user?._id || '')
  // responsibleTeacher is the teacher's User (populated) or its id (#102).
  const teacherUserId = String(card.responsibleTeacher?._id || card.responsibleTeacher || '')
  return Boolean(currentUserId && currentUserId === teacherUserId)
}

const canUseCardAction = (card) => hasLinkedCourseCard(card) || canEditContent(card)

const courseCardStyle = (card) => {
  const color = teacherColor(card.responsibleTeacher)
  const safeColor =
    typeof color === 'string' && /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(color)
      ? color
      : '#94a3b8'
  return { '--teacher-color': safeColor }
}

const safeMediaUrl = (value) => {
  const url = String(value || '').trim()
  return /^https?:\/\//i.test(url) || (url.startsWith('/') && !url.startsWith('//'))
    ? url
    : ''
}

const resourceUrl = (block) => safeMediaUrl(block?.downloadUrl || block?.url)
const imageUrl = (block) => safeMediaUrl(block?.url)
const imageWidthClass = (block) =>
  ['small', 'medium'].includes(block?.imageWidth)
    ? `course-image-${block.imageWidth}`
    : 'course-image-full'

const openCard = (card) => {
  const firstModule = card.modules?.[0]
  router.push({
    name: 'CourseCardsOverview',
    params: { courseInstanceId: card._id },
    query: {
      ...(filterText.value.trim() ? { filter: filterText.value.trim() } : {}),
      ...(selectedCardFilterId.value ? { filterId: selectedCardFilterId.value } : {}),
      ...(firstModule ? { module: String(firstModule.moduleNumber) } : {}),
    },
  })
}

const editCourseCard = (card) => {
  if (!canEditContent(card)) return
  router.push({
    name: 'CourseCardBuilder',
    query: {
      courseInstanceId: String(card._id),
      courseName: card.courseName || '',
      courseCode: card.courseCode || '',
    },
  })
}

const activateCard = (card) => {
  if (hasLinkedCourseCard(card)) {
    openCard(card)
  } else {
    editCourseCard(card)
  }
}

const backToList = () =>
  router.push({
    name: 'CourseCardsOverview',
    query: {
      ...(filterText.value.trim() ? { filter: filterText.value.trim() } : {}),
      ...(selectedCardFilterId.value ? { filterId: selectedCardFilterId.value } : {}),
    },
  })

const moveModule = (offset) => {
  const nextModule = selectedCard.value?.modules?.[currentModuleIndex.value + offset]
  if (!nextModule) return
  router.push({
    name: 'CourseCardsOverview',
    params: { courseInstanceId: selectedCard.value._id },
    query: {
      ...(filterText.value.trim() ? { filter: filterText.value.trim() } : {}),
      ...(selectedCardFilterId.value ? { filterId: selectedCardFilterId.value } : {}),
      module: String(nextModule.moduleNumber),
    },
  })
}

const loadCards = async () => {
  loading.value = true
  error.value = ''
  try {
    const { data } = await client.get('/course-cards/all')
    cards.value = Array.isArray(data?.cards) ? data.cards : []
    if (
      selectedCardFilterId.value &&
      !cards.value.some((card) => String(card._id) === String(selectedCardFilterId.value))
    ) {
      selectedCardFilterId.value = null
    }
  } catch (requestError) {
    error.value = requestError?.response?.data?.error || 'Kunde inte hämta kurskorten.'
  } finally {
    loading.value = false
  }
}

// Admin-only delete. The server refuses (409) while students are linked and
// returns a Swedish reason, which is shown in the dialog.
const canDeleteCards = computed(() =>
  ['admin', 'systemadmin'].includes(store.getters.userRole)
)
const deleteDialog = ref(false)
const cardToDelete = ref(null)
const deleting = ref(false)
const deleteError = ref('')

const askDeleteCard = (card) => {
  cardToDelete.value = card
  deleteError.value = ''
  deleteDialog.value = true
}

const confirmDeleteCard = async () => {
  if (!cardToDelete.value) return
  deleting.value = true
  deleteError.value = ''
  try {
    await client.delete(`/course-instances/${encodeURIComponent(cardToDelete.value._id)}`)
    cards.value = cards.value.filter((card) => card._id !== cardToDelete.value._id)
    deleteDialog.value = false
    cardToDelete.value = null
  } catch (requestError) {
    deleteError.value =
      requestError?.response?.data?.error || 'Kunde inte ta bort kurskortet. Försök igen.'
  } finally {
    deleting.value = false
  }
}

onMounted(loadCards)
</script>

<style scoped>
.course-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
  gap: 1rem;
}

.course-card-filter {
  flex: 1 1 260px;
  max-width: 380px;
}

.course-card {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 1.25rem;
  border-color: var(--teacher-color);
  background-color: color-mix(in srgb, var(--teacher-color) 17%, white);
  transition:
    background-color 160ms ease,
    transform 160ms ease,
    box-shadow 160ms ease;
}

.course-card-actionable {
  cursor: pointer;
}

.course-card:hover,
.course-card:focus-visible {
  filter: brightness(0.94);
  transform: translateY(-2px);
  box-shadow: 0 6px 18px rgb(15 23 42 / 12%);
  outline: none;
}

.course-card-heading,
.course-dates {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.course-card-heading h2 {
  overflow-wrap: anywhere;
}

.course-dates > div {
  min-width: 0;
}

.card-action {
  display: flex;
  align-self: flex-end;
  margin-top: auto;
  padding-top: 1rem;
}

.course-image {
  margin: 0.75rem 0;
  max-width: 100%;
}

.course-image-small {
  width: min(100%, 240px);
}

.course-image-medium {
  width: min(100%, 480px);
}

.course-image-full {
  width: 100%;
}

.course-image img {
  display: block;
  width: 100%;
  max-width: 100%;
  max-height: 600px;
  border-radius: 6px;
  object-fit: contain;
}

.course-image figcaption {
  margin-top: 6px;
  color: rgb(51 65 85 / 75%);
  font-size: 0.9rem;
}

.module-view {
  border-left: 6px solid var(--teacher-color);
  background: color-mix(in srgb, var(--teacher-color) 8%, white);
}

.module-progress,
.module-navigation {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.module-section {
  padding: 1rem 0;
  border-bottom: 1px solid rgb(148 163 184 / 35%);
}

.module-section:last-of-type {
  border-bottom: 0;
}

.section-copy,
.content-block p {
  white-space: pre-wrap;
}

.content-block {
  margin: 0.75rem 0;
  padding: 0.75rem 1rem;
  border-left: 3px solid var(--teacher-color);
  background: rgb(255 255 255 / 75%);
}

.module-navigation {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid rgb(148 163 184 / 35%);
}

@media (max-width: 600px) {
  .module-progress,
  .module-navigation {
    flex-wrap: wrap;
  }

  .module-navigation > span {
    order: -1;
    width: 100%;
    text-align: center;
  }
}
</style>
