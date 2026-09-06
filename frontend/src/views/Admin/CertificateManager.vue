<template>
  <div class="scrollable-view">
    <v-container class="py-5">
      <PageHeader
        title="Intyg & Diplom"
        subtitle="Hantera underskrift, logotyp, mallar och förhandsvisning."
      />

      <v-progress-linear v-if="bootLoading" indeterminate color="primary" class="my-4" />

      <v-alert v-else-if="bootError" type="error" class="mb-4">{{ bootError }}</v-alert>

      <template v-else>
        <v-tabs v-model="tab" color="primary" class="mb-4">
          <v-tab value="settings">Inställningar</v-tab>
          <v-tab value="templates">Mallar</v-tab>
          <v-tab value="preview">Förhandsvisning</v-tab>
          <v-tab value="approve">Godkänn & generera</v-tab>
          <v-tab value="history">Historik</v-tab>
        </v-tabs>

        <v-window v-model="tab">
          <!-- ------------------------------------------------------------ -->
          <v-window-item value="settings">
            <v-card class="pa-5">
              <v-card-title class="text-h5 pa-0">Underskrift</v-card-title>
              <p class="text-body-2 text-grey mt-2">
                Ladda upp en PNG-signatur utan bakgrund (max 1 MB). Den visas automatiskt på intyg och diplom.
              </p>

              <div class="mt-4">
                <v-file-input
                  v-model="signatureFile"
                  accept=".png,image/png"
                  label="Signaturbild (PNG, transparent)"
                  prepend-icon="mdi-pen"
                  show-size
                  :loading="uploading === 'signature'"
                  :error-messages="uploadError"
                  @update:model-value="onSignaturePicked"
                />
                <div v-if="settings.signatureUrl" class="mt-3">
                  <p class="text-caption mb-1">Nuvarande signatur:</p>
                  <div class="preview-checkerboard">
                    <img :src="settings.signatureUrl" alt="Signatur" class="preview-signature" />
                  </div>
                  <v-btn
                    size="small"
                    variant="text"
                    color="error"
                    class="mt-2"
                    :loading="deleting === 'signature'"
                    @click="removeSignature"
                  >
                    Ta bort signatur
                  </v-btn>
                </div>
              </div>

              <v-divider class="my-5" />

              <v-card-title class="text-h5 pa-0">Logotyp</v-card-title>
              <p class="text-body-2 text-grey mt-2">
                Ladda upp din logotyp (PNG, JPEG eller WebP, max 2 MB).
              </p>

              <div class="mt-4">
                <v-file-input
                  v-model="logoFile"
                  accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                  label="Logotyp"
                  prepend-icon="mdi-image"
                  show-size
                  :loading="uploading === 'logo'"
                  :error-messages="uploadError"
                  @update:model-value="onLogoPicked"
                />
                <div v-if="settings.logoUrl" class="mt-3">
                  <p class="text-caption mb-1">Nuvarande logotyp:</p>
                  <img :src="settings.logoUrl" alt="Logotyp" class="preview-logo" />
                  <v-btn
                    size="small"
                    variant="text"
                    color="error"
                    class="mt-2"
                    :loading="deleting === 'logo'"
                    @click="removeLogo"
                  >
                    Ta bort logotyp
                  </v-btn>
                </div>
              </div>

              <v-divider class="my-5" />

              <v-card-title class="text-h5 pa-0">Signerare</v-card-title>
              <v-form ref="settingsForm" @submit.prevent="saveSettings">
                <v-row class="mt-2">
                  <v-col cols="12" md="6">
                    <v-text-field
                      v-model="settings.signerName"
                      label="Namn på underskrift"
                      density="compact"
                      variant="outlined"
                    />
                  </v-col>
                  <v-col cols="12" md="6">
                    <v-text-field
                      v-model="settings.signerTitle"
                      label="Titel (t.ex. Rektor)"
                      density="compact"
                      variant="outlined"
                    />
                  </v-col>
                  <v-col cols="12" md="6">
                    <v-text-field
                      v-model="settings.schoolName"
                      label="Skolans namn"
                      density="compact"
                      variant="outlined"
                    />
                  </v-col>
                </v-row>
                <div class="d-flex ga-2 mt-2">
                  <v-btn color="primary" :loading="savingSettings" @click="saveSettings">
                    Spara
                  </v-btn>
                </div>
              </v-form>
            </v-card>
          </v-window-item>

          <!-- ------------------------------------------------------------ -->
          <v-window-item value="templates">
            <v-card class="pa-5">
              <div class="d-flex align-center justify-space-between flex-wrap ga-2">
                <v-card-title class="text-h5 pa-0">Mallar</v-card-title>
                <v-select
                  v-model="selectedKey"
                  :items="templateOptions"
                  label="Typ"
                  density="compact"
                  variant="outlined"
                  style="max-width: 220px"
                  hide-details
                />
              </div>

              <template v-if="currentTemplate">
                <v-row class="mt-4">
                  <v-col cols="12" md="6">
                    <v-text-field
                      v-model="currentTemplate.title"
                      label="Titel"
                      density="compact"
                      variant="outlined"
                    />
                  </v-col>
                  <v-col cols="12" md="6">
                    <v-text-field
                      v-model="currentTemplate.subtitle"
                      label="Underrubrik"
                      density="compact"
                      variant="outlined"
                    />
                  </v-col>
                  <v-col cols="12" md="6">
                    <v-text-field
                      v-model="currentTemplate.bodyPrefix"
                      label="Inledningstext"
                      density="compact"
                      variant="outlined"
                    />
                  </v-col>
                  <v-col cols="12" md="6">
                    <v-text-field
                      v-model="currentTemplate.footerText"
                      label="Sidfotstext"
                      density="compact"
                      variant="outlined"
                    />
                  </v-col>
                </v-row>

                <v-row class="mt-2">
                  <v-col cols="12" md="4">
                    <v-switch v-model="currentTemplate.showGrade" label="Visa betyg" color="primary" hide-details />
                  </v-col>
                  <v-col cols="12" md="4">
                    <v-switch v-model="currentTemplate.showApl" label="Visa APL" color="primary" hide-details />
                  </v-col>
                  <v-col cols="12" md="4">
                    <v-switch v-model="currentTemplate.showPackage" label="Visa kurspaket" color="primary" hide-details />
                  </v-col>
                </v-row>

                <v-textarea
                  v-model="currentTemplate.html"
                  label="HTML-mall"
                  auto-grow
                  rows="22"
                  class="mt-4"
                  variant="outlined"
                  :hint="htmlHint"
                  persistent-hint
                />

                <div class="d-flex ga-2 mt-2">
                  <v-btn color="primary" :loading="savingTemplate" @click="saveTemplate">
                    Spara mall
                  </v-btn>
                  <v-btn variant="tonal" @click="loadTemplates">Ladda om</v-btn>
                </div>
              </template>
            </v-card>
          </v-window-item>

          <!-- ------------------------------------------------------------ -->
          <v-window-item value="preview">
            <v-card class="pa-5">
              <v-card-title class="text-h5 pa-0">Förhandsvisning</v-card-title>
              <p class="text-body-2 text-grey mt-2">
                Fyll i exempeldata och tryck på <em>Skriv ut</em> för att generera PDF:en från förhandsvisningen (välj "Spara som PDF" som skrivare).
              </p>

              <v-row class="mt-3">
                <v-col cols="12" md="4">
                  <v-text-field v-model="preview.studentName" label="Elevens namn" density="compact" variant="outlined" hide-details />
                </v-col>
                <v-col cols="12" md="4">
                  <v-text-field v-model="preview.personalNumber" label="Personnummer" density="compact" variant="outlined" hide-details />
                </v-col>
                <v-col cols="12" md="4">
                  <v-text-field v-model="preview.courseName" label="Kurs" density="compact" variant="outlined" hide-details />
                </v-col>
                <v-col cols="12" md="4" class="mt-3">
                  <v-text-field v-model="preview.courseCode" label="Kurskod" density="compact" variant="outlined" hide-details />
                </v-col>
                <v-col cols="12" md="4" class="mt-3">
                  <v-text-field v-model="preview.packageName" label="Kurspaket" density="compact" variant="outlined" hide-details />
                </v-col>
                <v-col cols="12" md="4" class="mt-3">
                  <v-text-field v-model="preview.grade" label="Betyg" density="compact" variant="outlined" hide-details />
                </v-col>
                <v-col cols="12" md="4" class="mt-3">
                  <v-text-field v-model="preview.periodStart" label="Startdatum" density="compact" variant="outlined" hide-details />
                </v-col>
                <v-col cols="12" md="4" class="mt-3">
                  <v-text-field v-model="preview.periodEnd" label="Slutdatum" density="compact" variant="outlined" hide-details />
                </v-col>
                <v-col cols="12" md="4" class="mt-3">
                  <v-text-field v-model="preview.teacherName" label="Lärare" density="compact" variant="outlined" hide-details />
                </v-col>
                <v-col cols="12" md="4" class="mt-3">
                  <v-text-field v-model="preview.completedAt" label="Slutförd" density="compact" variant="outlined" hide-details />
                </v-col>
                <v-col cols="12" md="4" class="mt-3">
                  <v-text-field v-model="preview.certificateNumber" label="Intygsnummer" density="compact" variant="outlined" hide-details />
                </v-col>
                <v-col cols="12" md="4" class="mt-3">
                  <v-text-field v-model="preview.issuedDate" label="Utfärdat datum" density="compact" variant="outlined" hide-details />
                </v-col>
                <v-col cols="12" md="6" class="mt-3">
                  <v-switch v-model="preview.showGrade" label="Visa betygspiller" color="primary" hide-details />
                </v-col>
                <v-col cols="12" md="6" class="mt-3">
                  <v-switch v-model="preview.showApl" label="Visa APL-piller" color="primary" hide-details />
                </v-col>
              </v-row>
            </v-card>

            <v-card class="pa-5 mt-4">
              <div class="d-flex align-center justify-space-between mb-4">
                <v-card-title class="text-h6 pa-0">{{ currentTemplate?.name }} – förhandsvisning</v-card-title>
                <div class="d-flex ga-2">
                  <v-btn variant="tonal" @click="resetPreview">Återställ</v-btn>
                  <v-btn color="primary" prepend-icon="mdi-printer" @click="printPreview">Skriv ut / PDF</v-btn>
                </div>
              </div>
              <div class="print-scroll">
                <iframe
                  ref="previewIframe"
                  :srcdoc="previewDoc"
                  class="preview-frame"
                  :class="currentTemplate?.orientation"
                  title="Förhandsvisning av mall"
                  @load="onPreviewLoad"
                />
              </div>
              <p v-if="missingSignature" class="text-body-2 text-warning mt-2">
                Ingen signatur har laddats upp ännu – ladda upp en i fliken "Inställningar".
              </p>
            </v-card>
          </v-window-item>

          <!-- ------------------------------------------------------------ -->
          <v-window-item value="approve">
            <v-card class="pa-5 mb-4">
              <v-card-title class="text-h5 pa-0">Kö för godkännande</v-card-title>
              <p class="text-body-2 text-grey mt-2">
                Här listas kursavslut som är berättigade till intyg/diplom. Skapa ett utkast, godkänn och generera PDF:en.
              </p>

              <v-row class="mt-4" align="end">
                <v-col cols="12" md="2">
                  <v-select
                    v-model="queue.type"
                    :items="[{title:'Studieintyg',value:'studieintyg'},{title:'Diplom',value:'diplom'}]"
                    label="Typ"
                    density="compact"
                    variant="outlined"
                    hide-details
                  />
                </v-col>
                <v-col cols="12" md="3">
                  <v-select
                    v-model="queue.courseId"
                    :items="courseOptions"
                    item-title="courseName"
                    item-value="_id"
                    label="Kurs"
                    density="compact"
                    variant="outlined"
                    hide-details
                    clearable
                  />
                </v-col>
                <v-col cols="12" md="3">
                  <v-text-field
                    v-model="queue.search"
                    label="Sök elev / personnummer"
                    density="compact"
                    variant="outlined"
                    hide-details
                    clearable
                  />
                </v-col>
                <v-col cols="12" md="2">
                  <v-btn color="primary" :loading="queueLoading" @click="loadCandidates">Sök</v-btn>
                </v-col>
              </v-row>
            </v-card>

            <v-card class="pa-5">
              <v-progress-linear
                v-if="queueLoading"
                indeterminate
                color="primary"
                class="mb-3"
              />
              <v-alert v-if="queueError" type="error" class="mb-3" dense>{{ queueError }}</v-alert>
              <v-alert
                v-else-if="!queueCandidates.length && !queueLoading"
                type="info"
                class="mb-3"
                dense
              >
                Inga berättigade kursavslut matchar filtret.
              </v-alert>

              <v-table v-if="queueCandidates.length" density="compact">
                <thead>
                  <tr>
                    <th>Elev</th>
                    <th>Personnr</th>
                    <th>Kurs/Kurspaket</th>
                    <th>Status</th>
                    <th class="text-right">Åtgärder</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="c in queueCandidates" :key="c.key">
                    <td>{{ c.studentName }}</td>
                    <td>{{ c.personalNumber }}</td>
                    <td>
                      {{ c.courseName }}
                      <div v-if="c.packageName" class="text-caption text-grey">
                        {{ c.packageName }}
                      </div>
                    </td>
                    <td><StatusBadge :label="c.eligible ? 'Berättigad' : c.ineligibleReason || 'Ej berättigad'" :type="c.eligible ? 'success' : 'error'" /></td>
                    <td class="text-right">
                      <v-btn
                        v-if="!c.record"
                        size="small"
                        color="primary"
                        variant="text"
                        :loading="actionId === c.key"
                        @click="createCandidate(c)"
                      >
                        Skapa
                      </v-btn>
                      <template v-else>
                        <v-btn
                          v-if="c.record.status === 'draft'"
                          size="small"
                          color="primary"
                          variant="text"
                          :loading="actionId === c.key"
                          @click="approveRecord(c.record)"
                        >
                          Godkänn
                        </v-btn>
                        <v-btn
                          v-if="['draft','approved'].includes(c.record.status)"
                          size="small"
                          color="primary"
                          variant="text"
                          :loading="actionId === c.key"
                          @click="generateRecord(c.record)"
                        >
                          Generera
                        </v-btn>
                        <v-btn
                          v-if="c.record.status === 'generated'"
                          size="small"
                          color="success"
                          variant="text"
                          @click="downloadRecord(c.record)"
                        >
                          Ladda ner
                        </v-btn>
                        <StatusBadge
                          v-else
                          :label="recordStatusLabel(c.record.status)"
                          :type="recordStatusType(c.record.status)"
                        />
                      </template>
                    </td>
                  </tr>
                </tbody>
              </v-table>

              <div v-if="queueTotalPages > 1" class="d-flex justify-center mt-4">
                <v-pagination v-model="queue.page" :length="queueTotalPages" @update:model-value="loadCandidates" />
              </div>
            </v-card>
          </v-window-item>

          <!-- ------------------------------------------------------------ -->
          <v-window-item value="history">
            <v-card class="pa-5 mb-4">
              <v-card-title class="text-h5 pa-0">Historik</v-card-title>
              <p class="text-body-2 text-grey mt-2">
                Alla intyg och diplom samt deras livscykel. Hämta PDF, visa historik eller återkalla.
              </p>

              <v-row class="mt-4" align="end">
                <v-col cols="12" md="2">
                  <v-select
                    v-model="hist.type"
                    :items="[{title:'Alla typer',value:''},{title:'Studieintyg',value:'studieintyg'},{title:'Diplom',value:'diplom'}]"
                    label="Typ"
                    density="compact"
                    variant="outlined"
                    hide-details
                  />
                </v-col>
                <v-col cols="12" md="2">
                  <v-select
                    v-model="hist.status"
                    :items="recordStatusFilters"
                    label="Status"
                    density="compact"
                    variant="outlined"
                    hide-details
                  />
                </v-col>
                <v-col cols="12" md="3">
                  <v-text-field
                    v-model="hist.search"
                    label="Sök elev / kurs / nummer"
                    density="compact"
                    variant="outlined"
                    hide-details
                    clearable
                  />
                </v-col>
                <v-col cols="12" md="2">
                  <v-btn color="primary" :loading="histLoading" @click="loadHistory">Sök</v-btn>
                </v-col>
              </v-row>
            </v-card>

            <v-card class="pa-5">
              <v-progress-linear v-if="histLoading" indeterminate color="primary" class="mb-3" />
              <v-alert v-if="histError" type="error" class="mb-3" dense>{{ histError }}</v-alert>
              <v-alert
                v-else-if="!histRecords.length && !histLoading"
                type="info"
                class="mb-3"
                dense
              >
                Inga intyg hittades.
              </v-alert>

              <v-table v-if="histRecords.length" density="compact">
                <thead>
                  <tr>
                    <th>Intygsnr</th>
                    <th>Elev</th>
                    <th>Typ</th>
                    <th>Kurs/Kurspaket</th>
                    <th>Status</th>
                    <th>Skapad</th>
                    <th class="text-right">Åtgärder</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="r in histRecords" :key="r._id">
                    <td>{{ r.certificateNumber || '–' }}</td>
                    <td>{{ r.studentName }}</td>
                    <td>{{ r.type === 'diplom' ? 'Diplom' : 'Studieintyg' }}</td>
                    <td>
                      {{ r.courseName }}
                      <div v-if="r.packageName" class="text-caption text-grey">{{ r.packageName }}</div>
                    </td>
                    <td>
                      <StatusBadge :label="recordStatusLabel(r.status)" :type="recordStatusType(r.status)" />
                    </td>
                    <td>{{ formatDate(r.createdAt) }}</td>
                    <td class="text-right">
                      <v-btn
                        v-if="r.status === 'generated'"
                        size="small"
                        color="success"
                        variant="text"
                        @click="downloadRecord(r)"
                      >
                        Ladda ner
                      </v-btn>
                      <v-btn
                        v-if="r.status !== 'revoked'"
                        size="small"
                        color="error"
                        variant="text"
                        @click="openRevoke(r)"
                      >
                        Återkalla
                      </v-btn>
                      <v-btn size="small" variant="text" @click="openHistory(r)">
                        Historik
                      </v-btn>
                    </td>
                  </tr>
                </tbody>
              </v-table>

              <div v-if="histTotalPages > 1" class="d-flex justify-center mt-4">
                <v-pagination v-model="hist.page" :length="histTotalPages" @update:model-value="loadHistory" />
              </div>
            </v-card>

            <!-- Revoke dialog -->
            <v-dialog v-model="revokeDialog" max-width="480">
              <v-card>
                <v-card-title>Återkalla intyg</v-card-title>
                <v-card-text>
                  <p class="text-body-2 text-grey">
                    Ange en orsak. Intyget markeras som återkallat och kan inte laddas ner längre.
                  </p>
                  <v-textarea
                    v-model="revokeReason"
                    label="Orsak"
                    rows="3"
                    variant="outlined"
                    class="mt-3"
                  />
                </v-card-text>
                <v-card-actions>
                  <v-spacer />
                  <v-btn text @click="revokeDialog = false">Avbryt</v-btn>
                  <v-btn color="error" :loading="revoking" @click="confirmRevoke">Återkalla</v-btn>
                </v-card-actions>
              </v-card>
            </v-dialog>

            <!-- History dialog -->
            <v-dialog v-model="historyDialog" max-width="560">
              <v-card>
                <v-card-title>Historik för intyg</v-card-title>
                <v-card-text>
                  <v-timeline v-if="historyEvents.length" density="compact" align="start">
                    <v-timeline-item
                      v-for="(ev, i) in historyEvents"
                      :key="i"
                      dot-color="primary"
                      size="small"
                    >
                      <div class="font-weight-medium">{{ historyLabel(ev.action) }}</div>
                      <div class="text-caption text-grey">{{ formatDate(ev.at) }}</div>
                      <div v-if="ev.note" class="text-body-2 mt-1">{{ ev.note }}</div>
                    </v-timeline-item>
                  </v-timeline>
                  <p v-else class="text-body-2 text-grey">Ingen historik.</p>
                </v-card-text>
                <v-card-actions>
                  <v-spacer />
                  <v-btn text @click="historyDialog = false">Stäng</v-btn>
                </v-card-actions>
              </v-card>
            </v-dialog>
          </v-window-item>
        </v-window>
      </template>
    </v-container>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch, nextTick } from 'vue'
import { normalizeError } from '@/api/client.js'
import { certificatesApi } from '@/api/certificates.js'
import { useToast } from '@/composables/useToast.js'
import PageHeader from '@/components/base/PageHeader.vue'
import StatusBadge from '@/components/base/StatusBadge.vue'
import { renderTemplate, SAMPLE_CERTIFICATE_DATA } from '@/utils/certificateTemplate.js'
import { triggerBlobDownload } from '@/utils/download.js'

const toast = useToast()

const tab = ref('settings')
const bootLoading = ref(true)
const bootError = ref(null)

const settings = reactive({
  signerName: '',
  signerTitle: 'Rektor',
  schoolName: 'Mindful Learning',
  logoUrl: null,
  signatureUrl: null,
})

const signatureFile = ref(null)
const logoFile = ref(null)
const uploading = ref(null)
const deleting = ref(null)
const uploadError = ref('')
const savingSettings = ref(false)

const templates = ref([])
const selectedKey = ref('diplom')
const savingTemplate = ref(false)

const preview = reactive({ ...prefixPreviewData() })

const previewIframe = ref(null)
let previewDocObj = null

function prefixPreviewData() {
  const d = SAMPLE_CERTIFICATE_DATA
  return {
    studentName: d.studentName,
    personalNumber: d.personalNumber,
    courseName: d.courseName,
    courseCode: d.courseCode,
    packageName: d.packageName,
    periodStart: d.periodStart,
    periodEnd: d.periodEnd,
    completedAt: d.completedAt,
    teacherName: d.teacherName,
    grade: d.grade,
    certificateNumber: d.certificateNumber,
    issuedDate: d.issuedDate,
    showGrade: true,
    showApl: true,
  }
}

const templateOptions = computed(() =>
  templates.value.map((t) => ({ title: t.name, value: t.key }))
)

const currentTemplate = computed(() =>
  templates.value.find((t) => t.key === selectedKey.value) || null
)

const htmlHint = computed(() =>
  'Använd {{placeholders}} såsom {{studentName}}, {{courseName}}, {{courseCode}}, {{grade}}. Villkorliga avsnitt: {{#showGrade}}…{{/showGrade}}.'
)

const missingSignature = computed(() => !settings.signatureUrl)

// ---- Approve & generate queue ----------------------------------------------
const queue = reactive({ type: 'studieintyg', courseId: '', search: '', page: 1 })
const queueLoading = ref(false)
const queueError = ref('')
const queueCandidates = ref([])
const queueTotalPages = ref(0)
const queueTotal = ref(0)
const actionId = ref(null)

const courseOptions = computed(() => {
  const seen = new Set()
  const opts = []
  for (const c of queueCandidates.value) {
    if (c._id && !seen.has(String(c._id))) {
      seen.add(String(c._id))
      opts.push({ _id: c._id, courseName: c.courseName })
    }
  }
  return opts
})

const recordStatusFilters = [
  { title: 'Alla statusar', value: '' },
  { title: 'Utkast', value: 'draft' },
  { title: 'Godkänd', value: 'approved' },
  { title: 'Genererad', value: 'generated' },
  { title: 'Återkallad', value: 'revoked' },
]

const recordStatusLabel = (s) =>
  ({ draft: 'Utkast', approved: 'Godkänd', generated: 'Genererad', revoked: 'Återkallad' }[s] || s || '–')

const recordStatusType = (s) =>
  ({ draft: 'info', approved: 'warning', generated: 'success', revoked: 'error' }[s] || 'default')

const historyLabel = (a) =>
  ({ created: 'Skapad', edited: 'Redigerad', approved: 'Godkänd', generated: 'Genererad', downloaded: 'Nedladdad', revoked: 'Återkallad' }[a] || a)

const loadCandidates = async () => {
  queueLoading.value = true
  queueError.value = ''
  try {
    const { data } = await certificatesApi.getCandidates({
      type: queue.type,
      courseId: queue.courseId || undefined,
      search: queue.search || undefined,
      page: queue.page,
      limit: 20,
    })
    queueCandidates.value = data.candidates || []
    queueTotalPages.value = data.totalPages || 0
    queueTotal.value = data.total || 0
  } catch (err) {
    queueError.value = normalizeError(err).message
    toast.error(queueError.value)
  } finally {
    queueLoading.value = false
  }
}

const createCandidate = async (c) => {
  actionId.value = c.key
  try {
    const { data } = await certificatesApi.create({
      enrollmentId: c.enrollmentId,
      type: queue.type,
    })
    toast.success(`Utkast skapat för ${data.studentName || c.studentName}.`)
    await loadCandidates()
  } catch (err) {
    toast.error(normalizeError(err).message)
  } finally {
    actionId.value = null
  }
}

const approveRecord = async (record) => {
  actionId.value = record._id
  try {
    await certificatesApi.approve(record._id)
    toast.success('Intyg godkänt.')
    await loadCandidates()
  } catch (err) {
    toast.error(normalizeError(err).message)
  } finally {
    actionId.value = null
  }
}

const generateRecord = async (record) => {
  actionId.value = record._id
  try {
    await certificatesApi.generate(record._id)
    toast.success('PDF genererad.')
    await loadCandidates()
    if (tab.value === 'history') await loadHistory()
  } catch (err) {
    toast.error(normalizeError(err).message)
  } finally {
    actionId.value = null
  }
}

const downloadRecord = async (record) => {
  try {
    const res = await certificatesApi.download(record._id)
    triggerBlobDownload(res.data, `${record.type}-${record.studentName || 'cert'}.pdf`)
  } catch (err) {
    toast.error(normalizeError(err).message)
  }
}

watch(
  () => [queue.type, queue.courseId],
  () => {
    queue.page = 1
    if (tab.value === 'approve') loadCandidates()
  }
)

// ---- History ---------------------------------------------------------------
const hist = reactive({ type: '', status: '', search: '', page: 1 })
const histLoading = ref(false)
const histError = ref('')
const histRecords = ref([])
const histTotalPages = ref(0)
const revokeDialog = ref(false)
const revokeReason = ref('')
const revoking = ref(false)
const revokeTarget = ref(null)
const historyDialog = ref(false)
const historyEvents = ref([])

const loadHistory = async () => {
  histLoading.value = true
  histError.value = ''
  try {
    const { data } = await certificatesApi.list({
      type: hist.type || undefined,
      status: hist.status || undefined,
      search: hist.search || undefined,
      page: hist.page,
      limit: 20,
    })
    histRecords.value = data.records || []
    histTotalPages.value = data.totalPages || 0
  } catch (err) {
    histError.value = normalizeError(err).message
    toast.error(histError.value)
  } finally {
    histLoading.value = false
  }
}

const openRevoke = (record) => {
  revokeTarget.value = record
  revokeReason.value = ''
  revokeDialog.value = true
}

const confirmRevoke = async () => {
  if (!revokeTarget.value) return
  revoking.value = true
  try {
    await certificatesApi.revoke(revokeTarget.value._id, revokeReason.value)
    toast.success('Intyg återkallat.')
    revokeDialog.value = false
    await loadHistory()
  } catch (err) {
    toast.error(normalizeError(err).message)
  } finally {
    revoking.value = false
  }
}

const openHistory = async (record) => {
  historyEvents.value = []
  historyDialog.value = true
  try {
    const { data } = await certificatesApi.history(record._id)
    historyEvents.value = data || []
  } catch (err) {
    toast.error(normalizeError(err).message)
  }
}

const formatDate = (v) => {
  if (!v) return '–'
  return new Date(v).toLocaleDateString('sv-SE')
}

watch(
  () => [hist.type, hist.status],
  () => {
    hist.page = 1
    if (tab.value === 'history') loadHistory()
  }
)

watch(tab, (v) => {
  if (v === 'approve') loadCandidates()
  if (v === 'history') loadHistory()
})

const loadAll = async () => {
  bootLoading.value = true
  bootError.value = null
  try {
    const [settingsRes, templatesRes] = await Promise.all([
      certificatesApi.getSettings(),
      certificatesApi.getTemplates(),
    ])
    Object.assign(settings, {
      signerName: settingsRes.data.signerName || '',
      signerTitle: settingsRes.data.signerTitle || 'Rektor',
      schoolName: settingsRes.data.schoolName || 'Mindful Learning',
      logoUrl: settingsRes.data.logoUrl || null,
      signatureUrl: settingsRes.data.signatureUrl || null,
    })
    templates.value = templatesRes.data
    if (!templates.value.find((t) => t.key === selectedKey.value) && templates.value.length) {
      selectedKey.value = templates.value[0].key
    }
  } catch (err) {
    bootError.value = normalizeError(err).message
    toast.error(bootError.value)
  } finally {
    bootLoading.value = false
  }
}

const loadSettings = async () => {
  try {
    const { data } = await certificatesApi.getSettings()
    Object.assign(settings, {
      signerName: data.signerName || '',
      signerTitle: data.signerTitle || 'Rektor',
      schoolName: data.schoolName || 'Mindful Learning',
      logoUrl: data.logoUrl || null,
      signatureUrl: data.signatureUrl || null,
    })
  } catch (err) {
    toast.error(normalizeError(err).message)
  }
}

const loadTemplates = async () => {
  try {
    const { data } = await certificatesApi.getTemplates()
    templates.value = data
  } catch (err) {
    toast.error(normalizeError(err).message)
  }
}

const saveSettings = async () => {
  savingSettings.value = true
  try {
    const { data } = await certificatesApi.updateSettings({
      signerName: settings.signerName,
      signerTitle: settings.signerTitle,
      schoolName: settings.schoolName,
    })
    Object.assign(settings, {
      signerName: data.signerName || '',
      signerTitle: data.signerTitle || 'Rektor',
      schoolName: data.schoolName || 'Mindful Learning',
    })
    toast.success('Inställningar sparade.')
  } catch (err) {
    toast.error(normalizeError(err).message)
  } finally {
    savingSettings.value = false
  }
}

const onSignaturePicked = async (file) => {
  uploadError.value = ''
  if (!file) return
  if (file.type !== 'image/png') {
    uploadError.value = 'Signatur måste vara en PNG-fil.'
    signatureFile.value = null
    return
  }
  uploading.value = 'signature'
  try {
    const fd = new FormData()
    fd.append('file', file)
    const { data } = await certificatesApi.uploadSignature(fd)
    settings.signatureUrl = data.signatureUrl
    toast.success('Signatur uppladdad.')
  } catch (err) {
    uploadError.value = normalizeError(err).message
    toast.error(uploadError.value)
  } finally {
    uploading.value = null
    signatureFile.value = null
  }
}

const onLogoPicked = async (file) => {
  uploadError.value = ''
  if (!file) return
  uploading.value = 'logo'
  try {
    const fd = new FormData()
    fd.append('file', file)
    const { data } = await certificatesApi.uploadLogo(fd)
    settings.logoUrl = data.logoUrl
    toast.success('Logotyp uppladdad.')
  } catch (err) {
    uploadError.value = normalizeError(err).message
    toast.error(uploadError.value)
  } finally {
    uploading.value = null
    logoFile.value = null
  }
}

const removeSignature = async () => {
  deleting.value = 'signature'
  try {
    const { data } = await certificatesApi.deleteSignature()
    settings.signatureUrl = data.signatureUrl || null
    toast.success('Signatur borttagen.')
  } catch (err) {
    toast.error(normalizeError(err).message)
  } finally {
    deleting.value = null
  }
}

const removeLogo = async () => {
  deleting.value = 'logo'
  try {
    const { data } = await certificatesApi.deleteLogo()
    settings.logoUrl = data.logoUrl || null
    toast.success('Logotyp borttagen.')
  } catch (err) {
    toast.error(normalizeError(err).message)
  } finally {
    deleting.value = null
  }
}

const saveTemplate = async () => {
  if (!currentTemplate.value) return
  savingTemplate.value = true
  try {
    const t = currentTemplate.value
    await certificatesApi.updateTemplate(t.key, {
      title: t.title,
      subtitle: t.subtitle,
      bodyPrefix: t.bodyPrefix,
      footerText: t.footerText,
      html: t.html,
      showGrade: t.showGrade,
      showApl: t.showApl,
      showPackage: t.showPackage,
    })
    toast.success('Mall sparad.')
  } catch (err) {
    toast.error(normalizeError(err).message)
  } finally {
    savingTemplate.value = false
  }
}

// ---- Preview rendering ----------------------------------------------------
const buildPreviewData = () => {
  const schoolName = settings.schoolName || 'Mindful Learning'
  const signerName = settings.signerName || ''
  const signerTitle = settings.signerTitle || 'Rektor'
  return {
    ...preview,
    schoolName,
    signerName,
    signerTitle,
    logoUrl: settings.logoUrl || '',
    signatureUrl: settings.signatureUrl || '',
  }
}

const previewDoc = computed(() => {
  if (!currentTemplate.value) return ''
  const data = buildPreviewData()
  const html = renderTemplate(currentTemplate.value.html, data, {
    showGrade: preview.showGrade,
    showApl: preview.showApl,
  })
  return html
})

const onPreviewLoad = () => {
  previewDocObj = previewIframe.value?.contentDocument
}

const printPreview = () => {
  const win = previewIframe.value?.contentWindow
  if (!win) return
  win.focus()
  win.print()
}

const resetPreview = () => {
  Object.assign(preview, prefixPreviewData())
  refreshPreviewFrame()
}

const refreshPreviewFrame = async () => {
  await nextTick()
  const frame = previewIframe.value
  if (frame) frame.contentWindow?.location?.reload()
}

watch(
  () => [selectedKey.value, settings.logoUrl, settings.signatureUrl],
  () => {
    if (tab.value === 'preview') refreshPreviewFrame()
  }
)

function _noop() {}

onMounted(loadAll)</script>

<style scoped>
.preview-checkerboard {
  display: inline-block;
  padding: 12px 24px;
  background:
    linear-gradient(45deg, #eee 25%, transparent 25%),
    linear-gradient(-45deg, #eee 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #eee 75%),
    linear-gradient(-45deg, transparent 75%, #eee 75%);
  background-size: 16px 16px;
  background-position: 0 0, 0 8px, 8px -8px, -8px 0;
  border: 1px solid #ddd;
  border-radius: 8px;
}

.preview-signature {
  max-height: 64px;
  background: transparent;
}

.preview-logo {
  max-height: 56px;
  width: auto;
  display: block;
}

.print-scroll {
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  overflow: auto;
  background: #0b3a45;
}

.preview-frame {
  width: 100%;
  border: 0;
  display: block;
  margin: 0 auto;
  background: #fff;
}

.preview-frame.landscape {
  height: 620px;
  background: #0b3a45;
}

.preview-frame.portrait {
  height: 780px;
}
</style>
