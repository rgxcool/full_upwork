<template>
  <div class="logbook-tab-container">
    <v-row>
      <v-col cols="12">
        <v-card>
          <v-card-title>
            <v-icon left>mdi-notebook-outline</v-icon>
            Loggbok / Kits
          </v-card-title>
          <v-card-text>
            <p class="text-body-2 text-grey">
              Kits skickas vid APL-start och innehåller praktikinformation. Här visas elevens
              loggbok och du kan lägga till nya kits.
            </p>
          </v-card-text>

          <v-card-text v-if="loading" class="text-center">
            <v-progress-circular indeterminate></v-progress-circular>
          </v-card-text>

          <v-card-text v-else-if="error">
            <v-alert type="error">{{ error }}</v-alert>
          </v-card-text>

          <v-table v-else dense>
            <thead>
              <tr>
                <th class="text-left">Titel</th>
                <th class="text-left">Beskrivning</th>
                <th class="text-left">Startdatum</th>
                <th class="text-left">Slutdatum</th>
                <th class="text-left">Status</th>
                <th class="text-left">Åtgärder</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="kit in logbook" :key="kit.id">
                <td><strong>{{ kit.title }}</strong></td>
                <td>{{ kit.description || '–' }}</td>
                <td>{{ formatDate(kit.startDate) }}</td>
                <td>{{ formatDate(kit.endDate) }}</td>
                <td>
                  <v-chip :color="statusColor(kit.status)" size="small">
                    {{ statusLabel(kit.status) }}
                  </v-chip>
                </td>
                <td class="text-no-wrap">
                  <template v-if="canEdit">
                    <v-btn icon="mdi-pencil" size="small" variant="text" :aria-label="`Redigera ${kit.title}`" @click="openEdit(kit)" />
                    <v-btn icon="mdi-delete" size="small" variant="text" color="error" :aria-label="`Ta bort ${kit.title}`" @click="openDelete(kit)" />
                  </template>
                </td>
              </tr>
              <tr v-if="logbook.length === 0">
                <td colspan="6" class="text-center text-grey">Inga kits i loggboken ännu.</td>
              </tr>
            </tbody>
          </v-table>
        </v-card>
      </v-col>

      <v-col v-if="canEdit" cols="12">
        <v-card>
          <v-card-title>
            <v-icon left>mdi-plus</v-icon>
            Lägg till kit
          </v-card-title>
          <v-card-text>
            <v-form @submit.prevent="addKit">
              <v-text-field
                v-model="form.title"
                label="Titel *"
                required
                :error-messages="validationErrors.title"
              />
              <v-textarea
                v-model="form.description"
                label="Beskrivning"
                auto-grow
                rows="2"
              />
              <v-row>
                <v-col cols="6">
                  <v-text-field
                    v-model="form.startDate"
                    label="Startdatum"
                    type="date"
                  />
                </v-col>
                <v-col cols="6">
                  <v-text-field
                    v-model="form.endDate"
                    label="Slutdatum"
                    type="date"
                  />
                </v-col>
              </v-row>
            </v-form>
          </v-card-text>
          <v-card-actions>
            <v-spacer></v-spacer>
            <v-btn color="primary" :loading="saving" @click="addKit">
              Lägg till kit
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>

    <v-dialog v-model="editDialog" max-width="560">
      <v-card>
        <v-card-title>Redigera kit</v-card-title>
        <v-card-text>
          <v-text-field v-model="editForm.title" label="Titel *" :error-messages="editErrors.title" />
          <v-textarea v-model="editForm.description" label="Beskrivning" auto-grow rows="2" />
          <v-row>
            <v-col cols="6"><v-text-field v-model="editForm.startDate" label="Startdatum" type="date" /></v-col>
            <v-col cols="6"><v-text-field v-model="editForm.endDate" label="Slutdatum" type="date" /></v-col>
          </v-row>
        </v-card-text>
        <v-card-actions><v-spacer /><v-btn variant="text" @click="editDialog = false">Avbryt</v-btn><v-btn color="primary" :loading="updating" @click="updateKit">Spara</v-btn></v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="deleteDialog" max-width="420">
      <v-card>
        <v-card-title>Ta bort kit?</v-card-title>
        <v-card-text>Vill du ta bort “{{ selectedKit?.title }}”? Åtgärden kan inte ångras.</v-card-text>
        <v-card-actions><v-spacer /><v-btn variant="text" @click="deleteDialog = false">Avbryt</v-btn><v-btn color="error" :loading="deleting" @click="deleteKit">Ta bort</v-btn></v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script>
import { ref, computed, onMounted } from 'vue';
import client from '@/api/client.js';
import { useStore } from 'vuex';
import { useToast } from '@/composables/useToast.js';
import { LOGBOOK_ROLES } from '@/utils/aplKits.js';

export default {
  name: 'LogbookTab',
  props: {
    student: {
      type: Object,
      required: true,
    },
  },
  setup(props) {
    const store = useStore();
    const toast = useToast();

    const logbook = ref([]);
    const loading = ref(true);
    const error = ref(null);
    const saving = ref(false);
    const updating = ref(false);
    const deleting = ref(false);
    const editDialog = ref(false);
    const deleteDialog = ref(false);
    const selectedKit = ref(null);
    const editErrors = ref({});
    const editForm = ref({ title: '', description: '', startDate: '', endDate: '' });
    const validationErrors = ref({});

    const form = ref({
      title: '',
      description: '',
      startDate: '',
      endDate: '',
    });

    const canEdit = computed(() => {
      const role = store.getters.userRole || store.state.user?.role;
      return LOGBOOK_ROLES.includes(role);
    });

    const statusLabel = (status) => {
      const labels = {
        pending: 'Väntar',
        active: 'Aktiv',
        completed: 'Klar',
        archived: 'Arkiverad',
      };
      return labels[status] || status || 'Väntar';
    };

    const statusColor = (status) => {
      const colors = {
        pending: 'grey',
        active: 'blue',
        completed: 'success',
        archived: 'purple',
      };
      return colors[status] || 'grey';
    };

    const formatDate = (date) => {
      if (!date) return '–';
      const d = new Date(date);
      return d.toLocaleDateString('sv-SE');
    };

    const fetchLogbook = async () => {
      try {
        loading.value = true;
        error.value = null;
        const response = await client.get(`/students/${props.student._id}/logbook`);
        logbook.value = response.data.logbook || [];
      } catch (err) {
        console.error('Error fetching logbook:', err);
        error.value = 'Kunde inte hämta loggboken.';
      } finally {
        loading.value = false;
      }
    };

    // Date inputs expect the local calendar day. Using toISOString() here would
    // shift a kit date backwards for timezones ahead of UTC (Sweden), the same
    // way the global date search used to.
    const dateInput = (value) => {
      if (!value) return '';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '';
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    // Prefer the API's explanation (e.g. "Titel krävs.") over axios's generic
    // "Request failed with status code 400".
    const errorMessage = (err, fallback) =>
      err?.response?.data?.message || err?.response?.data?.error || err?.message || fallback;

    const openEdit = (kit) => {
      selectedKit.value = kit;
      editErrors.value = {};
      editForm.value = {
        title: kit.title || '',
        description: kit.description || '',
        startDate: dateInput(kit.startDate),
        endDate: dateInput(kit.endDate),
      };
      editDialog.value = true;
    };

    const openDelete = (kit) => {
      selectedKit.value = kit;
      deleteDialog.value = true;
    };

    const updateKit = async () => {
      editErrors.value = {};
      if (!editForm.value.title.trim()) {
        editErrors.value.title = 'Titel är obligatorisk.';
        return;
      }
      updating.value = true;
      try {
        const response = await client.patch(`/students/${props.student._id}/logbook/${selectedKit.value.id}`, {
          title: editForm.value.title.trim(),
          description: editForm.value.description || '',
          // Send null (not undefined) so clearing a date is persisted.
          startDate: editForm.value.startDate || null,
          endDate: editForm.value.endDate || null,
        });
        logbook.value = response.data.logbook || [];
        editDialog.value = false;
        toast.success('Kit uppdaterades.');
      } catch (err) {
        toast.error(errorMessage(err, 'Ett fel uppstod när kit skulle uppdateras.'));
      } finally {
        updating.value = false;
      }
    };

    const deleteKit = async () => {
      deleting.value = true;
      try {
        const response = await client.delete(`/students/${props.student._id}/logbook/${selectedKit.value.id}`);
        logbook.value = response.data.logbook || [];
        deleteDialog.value = false;
        toast.success('Kit togs bort.');
      } catch (err) {
        toast.error(errorMessage(err, 'Ett fel uppstod när kit skulle tas bort.'));
      } finally {
        deleting.value = false;
      }
    };

    const addKit = async () => {
      validationErrors.value = {};
      if (!form.value.title || !form.value.title.trim()) {
        validationErrors.value.title = 'Titel är obligatorisk.';
        return;
      }

      saving.value = true;
      try {
        const payload = {
          title: form.value.title.trim(),
          description: form.value.description || undefined,
        };
        if (form.value.startDate) payload.startDate = new Date(form.value.startDate).toISOString();
        if (form.value.endDate) payload.endDate = new Date(form.value.endDate).toISOString();

        const response = await client.post(`/students/${props.student._id}/logbook`, payload);
        logbook.value = response.data.logbook || [];
        form.value = { title: '', description: '', startDate: '', endDate: '' };
        toast.success('Kit lades till i loggboken.');
      } catch (err) {
        console.error('Error adding kit:', err);
        toast.error(errorMessage(err, 'Ett fel uppstod när kit skulle läggas till.'));
      } finally {
        saving.value = false;
      }
    };

    onMounted(() => {
      fetchLogbook();
    });

    return {
      logbook,
      loading,
      error,
      saving,
      updating,
      deleting,
      editDialog,
      deleteDialog,
      selectedKit,
      editErrors,
      editForm,
      validationErrors,
      form,
      canEdit,
      statusLabel,
      statusColor,
      formatDate,
      addKit,
      openEdit,
      openDelete,
      updateKit,
      deleteKit,
    };
  },
};
</script>

<style scoped>
.logbook-tab-container {
  padding: 16px 0;
}
</style>
