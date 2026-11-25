<template>
  <div class="scrollable-view">
    <section class="container py-4">
      <v-card class="pa-5">
        <v-card-title class="d-flex align-center text-h5">
          Betygsskalor (nationella prov)
        </v-card-title>
        <v-card-subtitle class="pb-4">
          Hantera poänggränser (min-poäng → betyg) per termin (t.ex. HT24) och ämne
          (Engelska/Svenska/Matematik).
          <br />
          Skalan ändras årligen och visas som förslag
          <br />
          när en lärare sätter nationella prov-poäng.
        </v-card-subtitle>

        <v-alert v-if="error" type="error" class="mb-4" dense>{{ error }}</v-alert>

        <div class="d-flex justify-end mb-4">
          <v-btn color="primary" prepend-icon="mdi-plus" @click="openCreateDialog">
            Lägg till betygsskala
          </v-btn>
        </div>

        <div v-if="loading" class="text-center py-8">
          <v-progress-circular indeterminate color="primary" size="40" />
        </div>

        <v-table v-else-if="scales.length > 0" hover>
          <thead>
            <tr>
              <th class="text-left">Termin</th>
              <th class="text-left">Ämne</th>
              <th class="text-left">Skala (min-poäng)</th>
              <th class="text-right">Åtgärder</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="scale in sortedScales" :key="scale._id">
              <td>{{ scale.term }}</td>
              <td>{{ scale.subject }}</td>
              <td>
                <v-chip
                  v-for="row in sortedScaleRows(scale.scale)"
                  :key="row.grade"
                  size="small"
                  class="me-1"
                  variant="outlined"
                >
                  {{ row.grade }} ≥ {{ row.min }}
                </v-chip>
              </td>
              <td class="text-right">
                <v-btn size="small" variant="text" color="primary" @click="openEditDialog(scale)">
                  Redigera
                </v-btn>
                <v-btn size="small" variant="text" color="error" @click="confirmDelete(scale)">
                  Ta bort
                </v-btn>
              </td>
            </tr>
          </tbody>
        </v-table>

        <div v-else class="text-center text-muted py-8">
          Inga betygsskalor ännu — lägg till en för t.ex. HT24.
        </div>
      </v-card>

      <v-dialog v-model="showDialog" max-width="560px">
        <v-card>
          <v-card-title>
            {{ editingId ? 'Redigera betygsskala' : 'Lägg till betygsskala' }}
          </v-card-title>
          <v-card-text>
            <v-form @submit.prevent="saveScale">
              <v-autocomplete
                class="grading-scale-term-select"
                v-model="form.term"
                :items="terms"
                label="Termin * (t.ex. HT24)"
                variant="outlined"
                hint="HT = hösttermin, VT = vårtermin"
                :menu-props="{
                  location: 'bottom',
                  origin: 'top',
                  locationStrategy: gradingScaleLocationStrategy,
                  attach: 'body',
                  target: '.grading-scale-term-select .v-field',
                  contentClass: 'grading-scale-term-menu',
                  zIndex: 10000,
                  maxHeight: 300,
                }"
                @update:search="onTermSearch"
              />
              <v-select
                class="grading-scale-subject-select"
                v-model="form.subject"
                :items="nationalSubjects"
                label="Ämne *"
                variant="outlined"
                :menu-props="{
                  location: 'bottom',
                  origin: 'top',
                  locationStrategy: gradingScaleLocationStrategy,
                  attach: 'body',
                  target: '.grading-scale-subject-select .v-field',
                  contentClass: 'grading-scale-subject-menu',
                  zIndex: 10000,
                  maxHeight: 300,
                }"
              />
              <p class="text-body-2 mb-2">Min-poäng för respektive betyg (F = under E:s gräns):</p>
              <div v-for="g in ['A', 'B', 'C', 'D', 'E']" :key="g" class="threshold-row">
                <span class="threshold-grade">{{ g }}</span>
                <v-text-field
                  v-model.number="form.thresholds[g]"
                  type="number"
                  min="0"
                  label="Min-poäng"
                  variant="outlined"
                  density="compact"
                  hide-details
                />
              </div>
            </v-form>
          </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn text @click="showDialog = false">Avbryt</v-btn>
            <v-btn color="primary" :disabled="!canSave()" @click="saveScale">Spara</v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
    </section>
  </div>
</template>

<script setup>
  import { ref, computed, onMounted, onScopeDispose, watch } from 'vue'
  import client from '@/api/client.js'
  import { useConfirm } from '@/composables/useConfirm.js'
  import { useToast } from '@/composables/useToast.js'

  const toast = useToast()

  const nationalSubjects = ['Svenska', 'Engelska', 'Matematik']
  const GRADE_ORDER = ['A', 'B', 'C', 'D', 'E']

  const scales = ref([])
  const terms = ref([])
  const loading = ref(true)
  const error = ref('')
  const showDialog = ref(false)
  const editingId = ref(null)
  const form = ref({ term: '', subject: '', thresholds: {} })

  const gradingScaleLocationStrategy = (data, _props, contentStyles) => {
    const updateLocation = () => {
      const target = data.target.value
      const content = data.contentEl.value
      if (!target || Array.isArray(target) || !content) return

      const rect = target.getBoundingClientRect()
      Object.assign(contentStyles.value, {
        position: 'fixed',
        top: `${rect.bottom}px`,
        left: `${rect.left}px`,
        minWidth: `${rect.width}px`,
        maxWidth: `${Math.max(0, window.innerWidth - rect.left - 12)}px`,
      })
    }

    watch([data.target, data.contentEl], updateLocation, { immediate: true })
    window.addEventListener('scroll', updateLocation, true)
    onScopeDispose(() => window.removeEventListener('scroll', updateLocation, true))

    return { updateLocation }
  }

  const sortedScales = computed(() =>
    [...scales.value].sort(
      (a, b) => a.term.localeCompare(b.term) || a.subject.localeCompare(b.subject)
    )
  )

  const sortedScaleRows = (scale) =>
    [...(scale || [])].sort((a, b) => GRADE_ORDER.indexOf(a.grade) - GRADE_ORDER.indexOf(b.grade))

  const loadScales = async () => {
    try {
      const [scaleRes, termRes] = await Promise.all([
        client.get('/grading-scale'),
        client.get('/grading-scale/terms'),
      ])
      scales.value = scaleRes.data || []
      terms.value = termRes.data || []
      error.value = ''
    } catch (err) {
      error.value = err.message || 'Kunde inte hämta betygsskalor.'
    } finally {
      loading.value = false
    }
  }

  const resetForm = () => {
    editingId.value = null
    form.value = { term: '', subject: '', thresholds: {} }
  }

  const openCreateDialog = () => {
    resetForm()
    showDialog.value = true
  }

  const openEditDialog = (scale) => {
    editingId.value = scale._id
    const thresholds = {}
    for (const row of scale.scale || []) {
      if (row && row.grade && row.min !== undefined) thresholds[row.grade] = row.min
    }
    form.value = { term: scale.term, subject: scale.subject, thresholds }
    showDialog.value = true
  }

  const onTermSearch = (text) => {
    const candidate = String(text || '')
      .trim()
      .toUpperCase()
    if (/^(HT|VT)\d{2}$/.test(candidate) && !terms.value.includes(candidate)) {
      terms.value = [...terms.value, candidate].sort()
    }
  }

  const canSave = () => {
    const term = String(form.value.term || '').trim()
    if (!/^(HT|VT)\d{2}$/i.test(term)) return false
    if (!nationalSubjects.includes(form.value.subject)) return false
    const values = GRADE_ORDER.map((g) => form.value.thresholds[g])
    return values.some((v) => typeof v === 'number' && v >= 0)
  }

  const buildScalePayload = () => {
    const scale = GRADE_ORDER.map((grade) => ({
      grade,
      min: form.value.thresholds[grade],
    })).filter((row) => typeof row.min === 'number' && row.min >= 0)
    return {
      term: String(form.value.term).trim().toUpperCase(),
      subject: form.value.subject,
      scale,
    }
  }

  const saveScale = async () => {
    if (!canSave()) return
    try {
      if (editingId.value) {
        await client.put(`/grading-scale/${editingId.value}`, buildScalePayload())
        toast.success('Betygsskala uppdaterad!')
      } else {
        await client.post('/grading-scale', buildScalePayload())
        toast.success('Betygsskala tillagd!')
      }
      showDialog.value = false
      await loadScales()
    } catch (err) {
      toast.error(err.message || 'Kunde inte spara betygsskala.')
    }
  }

  const confirmDelete = async (scale) => {
    const { confirm } = useConfirm()
    if (!(await confirm({ title: 'Ta bort betygsskala', message: `Är du säker på att du vill ta bort betygsskalan för ${scale.term} ${scale.subject}?`, danger: true }))) return
    try {
      await client.delete(`/grading-scale/${scale._id}`)
      toast.success('Betygsskala borttagen!')
      await loadScales()
    } catch (err) {
      toast.error(err.message || 'Kunde inte ta bort betygsskala.')
    }
  }

  onMounted(loadScales)
</script>

<style scoped>
  .threshold-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
  }

  .threshold-grade {
    font-weight: 700;
    min-width: 20px;
    text-align: center;
  }

  .text-muted {
    color: #888;
    font-style: italic;
  }
</style>
