<template>
  <div class="permission-matrix-editor">
    <div v-if="loading" class="loading-text">Laddar behörigheter...</div>
    <div v-else-if="loadError" class="alert alert-danger">{{ loadError }}</div>
    <template v-else>
      <div class="permission-matrix-container">
        <table class="permission-matrix editable">
          <thead>
            <tr>
              <th>Funktion</th>
              <th class="permission-toggle-header">Tillåt</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="feature in features" :key="feature.value">
              <td class="feature-name">{{ feature.label }}</td>
              <td class="permission-cell editable-cell">
                <label class="permission-checkbox">
                  <input
                    type="checkbox"
                    :checked="hasPermission(feature.value)"
                    :disabled="saving || !user"
                    @change="togglePermission(feature.value, $event.target.checked)"
                  />
                  <span class="checkmark"></span>
                </label>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="form-actions mt-3">
        <button
          class="btn btn-primary"
          :disabled="saving || !hasChanges"
          @click="savePermissions"
        >
          {{ saving ? 'Sparar...' : 'Spara behörigheter' }}
        </button>
      </div>
    </template>
  </div>
</template>

<script>
import { ref, computed, onMounted, watch } from 'vue';
import client from '@/api/client.js';
import { useToast } from '@/composables/useToast.js';

// Fallback catalog used if GET /permissions is unavailable. The backend is the
// source of truth so new features appear without a frontend release.
const FALLBACK_FEATURES = [
  { value: 'calendar_final_exam', label: 'Kalender (slutprov)' },
  { value: 'search_content', label: 'Söka efter innehåll' },
  { value: 'search_users', label: 'Söka efter användare' },
  { value: 'statistics', label: 'Statistik' },
  { value: 'manage_users_permissions', label: 'Hantering av användar och åtkomstbehörigheter' },
  { value: 'hierarchy_management', label: 'Hierarkihantering' },
  { value: 'own_settings', label: 'Egna inställningar (ex profilbild)' },
  { value: 'add_municipalities_courses', label: 'Lägga till kommuner, kurser etc' },
  { value: 'course_templates', label: 'Kursmallar (kursmoduler)' },
  { value: 'messaging', label: 'Meddelanden' },
  { value: 'mass_messaging', label: 'Massutskick' },
  { value: 'evaluations', label: 'Utvärderingar' },
  { value: 'course_management', label: 'Kurshantering' },
  { value: 'student_documents', label: 'Elevdokument' },
];

const FALLBACK_MATRIX = {
  calendar_final_exam: { systemadmin: true, admin: true, teacher: true, syv: true, specped: true, coordinator: false, student: false },
  search_content: { systemadmin: true, admin: true, teacher: true, syv: true, specped: true, coordinator: true, student: false },
  search_users: { systemadmin: true, admin: true, teacher: true, syv: true, specped: true, coordinator: true, student: false },
  statistics: { systemadmin: true, admin: true, teacher: true, syv: true, specped: true, coordinator: false, student: false },
  manage_users_permissions: { systemadmin: true, admin: true, teacher: false, syv: false, specped: false, coordinator: false, student: false },
  hierarchy_management: { systemadmin: true, admin: false, teacher: false, syv: false, specped: false, coordinator: false, student: false },
  own_settings: { systemadmin: true, admin: true, teacher: true, syv: true, specped: true, coordinator: true, student: true },
  add_municipalities_courses: { systemadmin: true, admin: false, teacher: false, syv: false, specped: false, coordinator: false, student: false },
  course_templates: { systemadmin: true, admin: true, teacher: true, syv: false, specped: false, coordinator: false, student: false },
  messaging: { systemadmin: true, admin: true, teacher: true, syv: true, specped: true, coordinator: true, student: true },
  mass_messaging: { systemadmin: true, admin: true, teacher: false, syv: false, specped: false, coordinator: false, student: false },
  evaluations: { systemadmin: true, admin: true, teacher: true, syv: true, specped: true, coordinator: false, student: false },
  course_management: { systemadmin: true, admin: true, teacher: true, syv: false, specped: false, coordinator: false, student: false },
  student_documents: { systemadmin: true, admin: true, teacher: true, syv: true, specped: true, coordinator: false, student: true },
};

export default {
  name: 'PermissionMatrixEditor',
  props: {
    // User document (must contain `_id`, `roles` and `permissions`).
    user: { type: Object, default: null },
  },
  emits: ['saved'],
  setup(props, { emit }) {
    const toast = useToast();
    const loading = ref(true);
    const loadError = ref(null);
    const saving = ref(false);
    const features = ref(FALLBACK_FEATURES);
    const permissionMatrix = ref(FALLBACK_MATRIX);
    const customPermissions = ref({});
    const originalPermissions = ref({});

    const normalize = (obj) => {
      if (!obj || typeof obj !== 'object') return {};
      const normalized = {};
      Object.keys(obj).sort().forEach((key) => {
        const value = obj[key];
        if (value !== undefined && value !== null) normalized[key] = value;
      });
      return normalized;
    };

    const hasChanges = computed(
      () =>
        JSON.stringify(normalize(customPermissions.value)) !==
        JSON.stringify(normalize(originalPermissions.value))
    );

    const syncFromUser = () => {
      const permissions = props.user?.permissions;
      customPermissions.value =
        permissions && typeof permissions === 'object'
          ? JSON.parse(JSON.stringify(permissions))
          : {};
      originalPermissions.value = JSON.parse(
        JSON.stringify(customPermissions.value)
      );
    };

    const loadCatalog = async () => {
      try {
        const { data } = await client.get('/permissions');
        if (Array.isArray(data?.features) && data.features.length > 0) {
          features.value = data.features.map((feature) => ({
            value: feature.key,
            label: feature.label,
          }));
        }
        if (data?.permissionMatrix && typeof data.permissionMatrix === 'object') {
          permissionMatrix.value = data.permissionMatrix;
        }
      } catch (error) {
        // Non-fatal: keep the fallback catalog.
        console.error('Error loading permission catalog:', error);
      }
    };

    const hasPermission = (feature) => {
      if (
        customPermissions.value &&
        Object.prototype.hasOwnProperty.call(customPermissions.value, feature)
      ) {
        return customPermissions.value[feature] === true;
      }
      const roles = props.user?.roles || [];
      return roles.some((role) => permissionMatrix.value[feature]?.[role] === true);
    };

    const togglePermission = (feature, enabled) => {
      customPermissions.value = {
        ...customPermissions.value,
        [feature]: enabled,
      };
    };

    const savePermissions = async () => {
      if (!props.user?._id) {
        toast.error('Ingen användare hittades. Kan inte spara behörigheter.');
        return;
      }
      saving.value = true;
      try {
        await client.put(`/users/${props.user._id}/permissions`, {
          permissions: customPermissions.value,
        });
        originalPermissions.value = JSON.parse(
          JSON.stringify(customPermissions.value)
        );
        toast.success('Behörigheterna har uppdaterats!');
        emit('saved', customPermissions.value);
      } catch (error) {
        console.error('Error saving permissions:', error);
        const message = error.response?.data?.message || 'Kunde inte spara behörigheter.';
        toast.error(message);
      } finally {
        saving.value = false;
      }
    };

    onMounted(async () => {
      syncFromUser();
      await loadCatalog();
      loading.value = false;
    });

    watch(
      () => props.user,
      () => {
        syncFromUser();
        loadError.value = null;
      },
      { deep: true }
    );

    return {
      loading,
      loadError,
      saving,
      features,
      hasChanges,
      hasPermission,
      togglePermission,
      savePermissions,
    };
  },
};
</script>

<style scoped>
.permission-matrix-container {
  overflow-x: auto;
}

.permission-matrix {
  width: 100%;
  border-collapse: collapse;
}

.permission-matrix th,
.permission-matrix td {
  padding: 10px 12px;
  border-bottom: 1px solid #e5e7eb;
  text-align: left;
}

.permission-toggle-header {
  text-align: center;
  width: 90px;
}

.permission-cell {
  text-align: center;
}

.permission-checkbox {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  gap: 6px;
}

.feature-name {
  font-weight: 500;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
}
</style>
