<template>
  <div class="scrollable-view">
    <v-container class="py-5">
      <v-card class="pa-5 mb-5">
        <v-card-title class="text-h4 font-weight-bold pa-0">Inlämningar & Deltagare</v-card-title>
        <p class="text-body-2 text-grey mt-2">
          Hantera inlämningar och deltagare för kursinstanser.
        </p>
      </v-card>

      <!-- Instance selector -->
      <v-card class="pa-5 mb-5">
        <v-card-title class="text-h5 pa-0">Välj kursinstans</v-card-title>
        <v-card-text class="pa-0 mt-3">
          <v-select
            v-model="selectedInstanceId"
            :items="instanceOptions"
            label="Kursinstans"
            item-title="title"
            item-value="value"
            :loading="instancesLoading"
            :disabled="instancesLoading"
            clearable
            @update:model-value="loadAll"
          />
          <v-alert v-if="instancesError" type="error" class="my-3">{{ instancesError }}</v-alert>
        </v-card-text>
      </v-card>

      <!-- No instance selected -->
      <v-card v-if="!selectedInstanceId" class="pa-5 mb-5">
        <div class="text-center text-grey py-8">
          Välj en kursinstans ovan för att se inlämningar, deltagare och rapport.
        </div>
      </v-card>

      <!-- Stegvis upplåsning (#112) -->
      <v-card v-if="selectedInstanceId" class="pa-5 mb-5">
        <v-card-title class="text-h5 pa-0">Stegvis upplåsning</v-card-title>
        <p class="text-body-2 text-grey mt-2 mb-2">
          När detta är på måste eleven markera varje avsnitt som klart, och lämna in modulens uppgift,
          innan nästa steg öppnas. Lägg introduktionen i modul 1 så öppnas resten av kursen först när den är klar.
        </p>
        <v-alert v-if="progressionError" type="error" variant="tonal" density="compact" class="mb-2">
          {{ progressionError }}
        </v-alert>
        <v-switch
          v-model="sequentialUnlock"
          :loading="progressionLoading"
          :disabled="progressionLoading"
          color="primary"
          hide-details
          :label="sequentialUnlock ? 'På – innehållet låses upp steg för steg' : 'Av – allt innehåll är öppet'"
          @update:model-value="saveProgression"
        />
      </v-card>

      <!-- Submissions -->
      <v-card v-if="selectedInstanceId" class="pa-5 mb-5">
        <div class="d-flex align-center justify-space-between">
          <v-card-title class="text-h5 pa-0">Inlämningar</v-card-title>
          <v-btn size="small" variant="tonal" prepend-icon="mdi-refresh" :loading="subLoading" @click="loadSubmissions">
            Uppdatera
          </v-btn>
        </div>

        <v-progress-linear v-if="subLoading" indeterminate color="primary" class="my-4" />
        <v-alert v-else-if="subError" type="error" class="my-3">{{ subError }}</v-alert>

        <v-table v-else dense class="mt-3">
          <thead>
            <tr>
              <th class="text-left">Elev</th>
              <th class="text-left">Modul</th>
              <th class="text-left">Inlämnat</th>
              <th class="text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="sub in submissions" :key="sub._id">
              <td>{{ sub.studentName || sub.studentId?.name || '–' }}</td>
              <td>{{ sub.moduleNumber ?? '–' }}</td>
              <td>{{ formatDateTime(sub.submittedAt) }}</td>
              <td>
                <v-chip size="x-small" :color="sub.feedback?.status === 'godkänd' ? 'success' : 'warning'">
                  {{ sub.feedback?.status || 'Väntar' }}
                </v-chip>
              </td>
            </tr>
            <tr v-if="submissions.length === 0">
              <td colspan="4" class="text-center text-grey">Inga inlämningar.</td>
            </tr>
          </tbody>
        </v-table>
      </v-card>

      <!-- Participants -->
      <v-card v-if="selectedInstanceId" class="pa-5 mb-5">
        <div class="d-flex align-center justify-space-between">
          <v-card-title class="text-h5 pa-0">Deltagare</v-card-title>
          <div class="d-flex gap-2">
            <v-btn size="small" color="primary" prepend-icon="mdi-plus" @click="showAddParticipant = true">
              Lägg till
            </v-btn>
            <v-btn size="small" variant="tonal" prepend-icon="mdi-refresh" :loading="partLoading" @click="loadParticipants">
              Uppdatera
            </v-btn>
          </div>
        </div>

        <v-progress-linear v-if="partLoading" indeterminate color="primary" class="my-4" />
        <v-alert v-else-if="partError" type="error" class="my-3">{{ partError }}</v-alert>

        <template v-else>
          <v-progress-linear v-if="activityLoading" indeterminate color="primary" class="my-2" />
          <v-alert v-else-if="activityError" type="error" class="my-3">{{ activityError }}</v-alert>
          <v-alert v-else-if="activityLoaded && activityResults.length === 0" type="info" variant="tonal" class="my-3">
            Ingen modulstatus tillgänglig för den här kursinstansen.
          </v-alert>

          <v-table v-else dense class="mt-3">
            <thead>
              <tr>
                <th class="text-left">Namn</th>
                <th class="text-left">Typ</th>
                <th class="text-left">Senast aktivitet</th>
                <th class="text-left">Modulstatus</th>
                <th class="text-left">Åtgärd</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in participants" :key="participantIdOf(p)">
                <td>{{ p.name || p.studentName || '–' }}</td>
                <td>{{ p.role || p.type || 'student' }}</td>
                <td>
                  <div class="d-flex align-center flex-wrap ga-2">
                    <span>{{ formatDateTime(p.lastActivity?.at) }}</span>
                    <v-chip
                      v-if="activityTypeLabel(p.lastActivity?.type)"
                      size="x-small"
                      variant="tonal"
                    >
                      {{ activityTypeLabel(p.lastActivity?.type) }}
                    </v-chip>
                  </div>
                </td>
                <td>
                  <div v-if="activityFor(p)" class="d-flex align-center flex-wrap ga-2">
                    <span class="text-body-2">{{ moduleStatusLabel(p) }}</span>
                    <v-chip
                      size="x-small"
                      :color="activityStatusTone(activityFor(p).overallStatus)"
                      variant="tonal"
                    >
                      {{ activityStatusLabel(activityFor(p).overallStatus) }}
                    </v-chip>
                  </div>
                  <span v-else class="text-caption text-grey">–</span>
                </td>
                <td>
                  <v-btn
                    v-if="(p.role || p.type) !== 'staff'"
                    size="x-small"
                    variant="tonal"
                    color="error"
                    :loading="removingId === participantIdOf(p)"
                    @click="removeParticipant(p)"
                  >
                    Ta bort
                  </v-btn>
                  <span v-else class="text-caption text-grey">–</span>
                </td>
              </tr>
              <tr v-if="participants.length === 0">
                <td colspan="5" class="text-center text-grey">Inga deltagare.</td>
              </tr>
            </tbody>
          </v-table>
        </template>

        <!-- Add participant dialog -->
        <v-dialog v-model="showAddParticipant" max-width="400">
          <v-card class="pa-4">
            <v-card-title class="text-h6">Lägg till deltagare</v-card-title>
            <v-card-text>
              <v-text-field v-model="newParticipantId" label="Elev-ID" density="compact" />
              <v-btn size="small" color="primary" :loading="addingParticipant" @click="addParticipant">
                Lägg till
              </v-btn>
            </v-card-text>
          </v-card>
        </v-dialog>
      </v-card>

      <!-- Reports -->
      <v-card v-if="selectedInstanceId" class="pa-5">
        <div class="d-flex align-center justify-space-between">
          <v-card-title class="text-h5 pa-0">Rapport</v-card-title>
          <v-btn size="small" variant="tonal" prepend-icon="mdi-refresh" :loading="reportLoading" @click="loadReport">
            Ladda
          </v-btn>
        </div>

        <v-progress-linear v-if="reportLoading" indeterminate color="primary" class="my-4" />
        <v-alert v-else-if="reportError" type="error" class="my-3">{{ reportError }}</v-alert>
        <v-alert v-else-if="!report" type="info" variant="tonal" class="my-3">
          Ingen rapport tillgänglig för den här kursinstansen.
        </v-alert>

        <v-card-text v-else-if="report" class="pa-0 mt-3">
          <v-row dense>
            <v-col cols="3">
              <div class="text-caption text-grey">Totalt</div>
              <div class="text-h6">{{ report.totalEnrollments }}</div>
            </v-col>
            <v-col cols="3">
              <div class="text-caption text-grey">Slutförda</div>
              <div class="text-h6">{{ report.totalCompletedStudents }}</div>
            </v-col>
            <v-col cols="3">
              <div class="text-caption text-grey">Genomsnittliga moduler</div>
              <div class="text-h6">{{ report.totalCompletedModules }}</div>
            </v-col>
            <v-col cols="3">
              <div class="text-caption text-grey">Slutförande</div>
              <div class="text-h6">{{ report.overallCompletionRate }}%</div>
            </v-col>
          </v-row>
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
  activityStatusLabel,
  activityStatusTone,
  activityToCard,
  currentModuleLabel,
} from '@/utils/currentModule.js'

const toast = useToast()

const instances = ref([])
const selectedInstanceId = ref(null)
const instancesLoading = ref(false)
const instancesError = ref('')

const submissions = ref([])
const subLoading = ref(false)
const subError = ref(null)

const participants = ref([])
const partLoading = ref(false)
const partError = ref(null)

const activityResults = ref([])
const activityLoading = ref(false)
const activityError = ref(null)
const activityLoaded = ref(false)

const showAddParticipant = ref(false)
const newParticipantId = ref('')
const addingParticipant = ref(false)
const removingId = ref(null)

const sequentialUnlock = ref(false)
const progressionLoading = ref(false)
const progressionError = ref(null)

const loadProgression = async () => {
  if (!selectedInstanceId.value) return
  progressionLoading.value = true
  progressionError.value = null
  try {
    const { data } = await client.get(`/learning/instances/${selectedInstanceId.value}/modules`)
    sequentialUnlock.value = !!data.instance?.sequentialUnlock
  } catch (e) {
    progressionError.value = e?.response?.data?.error || 'Kunde inte hämta inställningen.'
  } finally {
    progressionLoading.value = false
  }
}

const saveProgression = async (value) => {
  progressionLoading.value = true
  progressionError.value = null
  try {
    await client.put(`/learning/instances/${selectedInstanceId.value}/progression`, {
      sequentialUnlock: !!value,
    })
    toast.success(value ? 'Stegvis upplåsning är på' : 'Stegvis upplåsning är av')
  } catch (e) {
    sequentialUnlock.value = !value
    progressionError.value = e?.response?.data?.error || 'Kunde inte spara inställningen.'
  } finally {
    progressionLoading.value = false
  }
}

const report = ref(null)
const reportLoading = ref(false)
const reportError = ref(null)

const instanceOptions = computed(() =>
  instances.value.map((i) => ({
    title: `${i.courseName}${i.courseCode ? ` (${i.courseCode})` : ''}`,
    value: i._id,
  }))
)

const formatDateTime = (d) => {
  if (!d) return 'Aldrig'
  const date = new Date(d)
  if (Number.isNaN(date.getTime())) return 'Aldrig'
  return date.toLocaleString('sv-SE')
}

// The participants endpoint sends the student/teacher id as `participantId`.
const participantIdOf = (p) => p?.participantId || p?.studentId || p?._id

// Batch activity results key rows by studentId (a string over HTTP, an
// ObjectId in service tests). Normalise both so the tables can be joined
// without an extra lookup.
const studentIdKey = (value) => {
  const id = value && typeof value === 'object' ? value._id || value.toString() : value
  return id === null || id === undefined ? '' : String(id)
}

const activityByStudent = computed(() => {
  const byStudent = new Map()
  for (const result of activityResults.value) {
    const key = studentIdKey(result?.studentId)
    if (key) byStudent.set(key, result)
  }
  return byStudent
})

const activityFor = (participant) => activityByStudent.value.get(studentIdKey(participantIdOf(participant))) || null

const moduleStatusLabel = (participant) => {
  const activity = activityFor(participant)
  if (!activity) return '–'
  return currentModuleLabel(activityToCard(activity)) || '–'
}

const ACTIVITY_TYPE_LABELS = { login: 'Inloggning', submission: 'Inlämning' }
const activityTypeLabel = (type) => ACTIVITY_TYPE_LABELS[type] || ''

const loadSubmissions = async () => {
  if (!selectedInstanceId.value) return
  subLoading.value = true
  subError.value = null
  try {
    const { data } = await client.get(`/learning/instances/${selectedInstanceId.value}/submissions`)
    submissions.value = Array.isArray(data) ? data : data.submissions || []
  } catch (err) {
    subError.value = 'Kunde inte hämta inlämningar.'
    toast.error(subError.value)
  } finally {
    subLoading.value = false
  }
}

const loadParticipants = async () => {
  if (!selectedInstanceId.value) return
  partLoading.value = true
  partError.value = null
  try {
    const { data } = await client.get(`/learning/instances/${selectedInstanceId.value}/participants`)
    // `lastActivity: { type, at }` is already computed by the backend using the
    // most recent of login/submission. Rendering it directly avoids N+1 requests
    // and a second, divergent precedence rule in the client.
    participants.value = Array.isArray(data) ? data : data.participants || []
  } catch (err) {
    partError.value = 'Kunde inte hämta deltagare.'
    toast.error(partError.value)
  } finally {
    partLoading.value = false
  }
}

const loadActivity = async () => {
  const instanceId = selectedInstanceId.value
  if (!instanceId) return
  activityLoading.value = true
  activityError.value = null
  activityLoaded.value = false
  activityResults.value = []
  try {
    const { data } = await client.post(`/learning/instances/${instanceId}/activity-status/batch`, {})
    if (selectedInstanceId.value !== instanceId) return
    if (data?.error) throw new Error(data.error)
    activityResults.value = Array.isArray(data?.activityResults) ? data.activityResults : []
    activityLoaded.value = true
  } catch (err) {
    if (selectedInstanceId.value === instanceId) {
      activityError.value = 'Kunde inte hämta modulstatus.'
      toast.error(activityError.value)
    }
  } finally {
    if (selectedInstanceId.value === instanceId) activityLoading.value = false
  }
}

const loadAll = () => {
  subError.value = null
  partError.value = null
  reportError.value = null
  activityError.value = null
  if (!selectedInstanceId.value) {
    submissions.value = []
    participants.value = []
    report.value = null
    activityResults.value = []
    activityLoading.value = false
    activityLoaded.value = false
    return
  }
  loadSubmissions()
  loadParticipants()
  loadReport()
  loadActivity()
  loadProgression()
}

const addParticipant = async () => {
  if (!newParticipantId.value.trim()) return
  addingParticipant.value = true
  try {
    await client.post(`/learning/instances/${selectedInstanceId.value}/participants`, {
      participantId: newParticipantId.value.trim(),
      role: 'student',
    })
    toast.success('Deltagare tillagd.')
    newParticipantId.value = ''
    showAddParticipant.value = false
    await loadParticipants()
  } catch (err) {
    toast.error('Kunde inte lägga till deltagare.')
  } finally {
    addingParticipant.value = false
  }
}

const removeParticipant = async (p) => {
  const id = participantIdOf(p)
  if (!id || !confirm('Ta bort deltagare från kursen?')) return
  removingId.value = id
  try {
    await client.delete(`/learning/instances/${selectedInstanceId.value}/participants/${id}`)
    toast.success('Deltagare borttagen.')
    await loadParticipants()
  } catch {
    toast.error('Kunde inte ta bort deltagare.')
  } finally {
    removingId.value = null
  }
}

const loadReport = async () => {
  if (!selectedInstanceId.value) return
  reportLoading.value = true
  reportError.value = null
  try {
    const { data } = await client.get(`/learning/instances/${selectedInstanceId.value}/reports`)
    report.value = data
  } catch {
    reportError.value = 'Kunde inte hämta rapport.'
    toast.error(reportError.value)
  } finally {
    reportLoading.value = false
  }
}

onMounted(async () => {
  instancesLoading.value = true
  instancesError.value = ''
  try {
    const { data } = await client.get('/course-instances')
    instances.value = Array.isArray(data) ? data : []
  } catch {
    instancesError.value = 'Kunde inte hämta kursinstanser.'
    toast.error(instancesError.value)
  } finally {
    instancesLoading.value = false
  }
})
</script>
