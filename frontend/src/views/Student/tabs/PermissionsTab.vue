<template>
  <div v-if="isAdmin" class="permissions-container">
    <!-- User Creation Section -->
    <div v-if="!hasUser" class="card">
      <div class="card-header">
        <h3>Skapa användare</h3>
      </div>
      <div class="card-body">
        <div class="alert alert-warning">
          <p>Ingen användare hittades för denna elev. En användare måste skapas innan roller kan tilldelas.</p>
        </div>
        <button 
          @click="createUserForStudent" 
          class="btn btn-primary"
          :disabled="isCreatingUser"
        >
          {{ isCreatingUser ? 'Skapar...' : 'Skapa användare för elev' }}
        </button>
        <div v-if="createdUserPassword" class="alert alert-info mt-3">
          <p><strong>Användare skapad!</strong></p>
          <p>Lösenord: <code>{{ createdUserPassword }}</code></p>
          <p class="small">Spara detta lösenord säkert. Användaren kan byta lösenord vid första inloggningen.</p>
        </div>
      </div>
    </div>

    <!-- Roles Section -->
    <div v-if="hasUser" class="card">
      <div class="card-header">
        <h3>Användarroller</h3>
      </div>
      <div class="card-body">
        <form @submit.prevent="savePermissions" class="permissions-form">
          <div class="form-group">
            <label for="roles" class="form-label">Välj roller</label>
            <div
              id="roles"
              class="roles-list"
              role="listbox"
              aria-multiselectable="true"
            >
              <div
                v-for="role in availableRoles"
                :key="role.value"
                class="role-item"
                :class="{ selected: selectedRoles.includes(role.value) }"
                @click="toggleRole(role.value)"
              >
                {{ role.label }}
              </div>
            </div>
            <small class="form-help">Klicka för att välja/avmarkera roller.</small>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary" :disabled="isSaving">
              {{ isSaving ? 'Sparar...' : 'Spara roller' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Permission Matrix Section -->
    <div v-if="hasUser" class="card mt-4">
      <div class="card-header">
        <h3>Behörighetsmatris</h3>
      </div>
      <div class="card-body">
        <div class="permission-matrix-container">
          <table class="permission-matrix">
            <thead>
              <tr>
                <th>Funktion</th>
                <th v-for="role in availableRoles" :key="role.value" class="role-header">
                  {{ role.label }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="feature in features" :key="feature.value">
                <td class="feature-name">{{ feature.label }}</td>
                <td 
                  v-for="role in availableRoles" 
                  :key="`${feature.value}-${role.value}`"
                  class="permission-cell"
                  :class="getPermissionClass(role.value, feature.value)"
                >
                  {{ getPermissionText(role.value, feature.value) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="permission-legend mt-3">
          <p class="small"><strong>Förklaring:</strong></p>
          <ul class="small">
            <li><span class="legend-yes">Ja</span> - Full tillgång</li>
            <li><span class="legend-limited">Begränsad</span> - Begränsad tillgång (se text)</li>
            <li><span class="legend-no">Nej</span> - Ingen tillgång</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
  <div v-else>
    <p>Du har inte behörighet att se denna sida.</p>
  </div>
</template>

<script>
import { ref, computed, onMounted, watch } from 'vue';
import { useStore } from 'vuex';
import { api } from '@/store/store.js';
import { useRoute } from 'vue-router';

// Permission matrix based on requirements
const PERMISSION_MATRIX = {
  calendar_final_exam: {
    systemadmin: 'Skapa, redigera, ändra till tidigare version',
    admin: 'Skapa, redigera',
    teacher: 'Endast titta',
    syv: 'Lägga in mö',
    specped: 'Lägga in mö',
    coordinator: 'Nej',
    student: 'Endast deras egna inbokade slutprov',
  },
  search_content: {
    systemadmin: 'Ja',
    admin: 'Ja',
    teacher: 'Ja',
    syv: 'Ja',
    specped: 'Ja',
    coordinator: 'Ja',
    student: 'Nej',
  },
  search_users: {
    systemadmin: 'Ja',
    admin: 'Ja',
    teacher: 'Ja',
    syv: 'Ja',
    specped: 'Ja',
    coordinator: 'Ja',
    student: 'Nej',
  },
  statistics: {
    systemadmin: 'Ja',
    admin: 'Ja',
    teacher: 'Ja',
    syv: 'Ja',
    specped: 'Ja',
    coordinator: 'Nej',
    student: 'Nej',
  },
  manage_users_permissions: {
    systemadmin: 'Ja',
    admin: 'Ja',
    teacher: 'Nej',
    syv: 'Nej',
    specped: 'Nej',
    coordinator: 'Nej',
    student: 'Nej',
  },
  hierarchy_management: {
    systemadmin: 'Ja',
    admin: 'Nej',
    teacher: 'Nej',
    syv: 'Nej',
    specped: 'Nej',
    coordinator: 'Nej',
    student: 'Nej',
  },
  own_settings: {
    systemadmin: 'Ja',
    admin: 'Ja',
    teacher: 'Ja',
    syv: 'Ja',
    specped: 'Ja',
    coordinator: 'Ja',
    student: 'Ja',
  },
  add_municipalities_courses: {
    systemadmin: 'Ja',
    admin: 'Nej',
    teacher: 'Nej',
    syv: 'Nej',
    specped: 'Nej',
    coordinator: 'Nej',
    student: 'Nej',
  },
};

const FEATURES = [
  { value: 'calendar_final_exam', label: 'Kalender (slutprov)' },
  { value: 'search_content', label: 'Söka efter innehåll' },
  { value: 'search_users', label: 'Söka efter användare' },
  { value: 'statistics', label: 'Statistik' },
  { value: 'manage_users_permissions', label: 'Hantering av användar och åtkomstbehörigheter' },
  { value: 'hierarchy_management', label: 'Hierarkihantering?' },
  { value: 'own_settings', label: 'Egna inställningar (ex profilbild)' },
  { value: 'add_municipalities_courses', label: 'Lägga till kommuner, kurser etc' },
];

const ROLES = [
  { value: 'systemadmin', label: 'Systemadministratör' },
  { value: 'admin', label: 'Administratör' },
  { value: 'teacher', label: 'Lärare' },
  { value: 'syv', label: 'SYV' },
  { value: 'specped', label: 'Specped.' },
  { value: 'coordinator', label: 'Praktiksamordnar' },
  { value: 'student', label: 'Elev' },
];

export default {
  name: 'PermissionsTab',
  props: {
    student: {
      type: Object,
      required: true,
    },
  },
  setup(props) {
    const store = useStore();
    const route = useRoute();
    const isSaving = ref(false);
    const isCreatingUser = ref(false);
    const createdUserPassword = ref(null);
    const selectedRoles = ref([]);
    const availableRoles = ref(ROLES);
    const features = ref(FEATURES);

    const isAdmin = computed(() => store.getters.isAdmin);
    const hasUser = computed(() => {
      return props.student && props.student.user && props.student.user._id;
    });

    const getPermissionText = (role, feature) => {
      return PERMISSION_MATRIX[feature]?.[role] || 'Nej';
    };

    const getPermissionClass = (role, feature) => {
      const permission = getPermissionText(role, feature);
      if (permission === 'Ja') {
        return 'permission-yes';
      } else if (permission === 'Nej') {
        return 'permission-no';
      } else {
        return 'permission-limited';
      }
    };

    onMounted(() => {
      if (props.student && props.student.user && props.student.user.roles) {
        selectedRoles.value = [...props.student.user.roles];
      }
    });

    // Watch for student changes
    watch(() => props.student, (newStudent) => {
      if (newStudent && newStudent.user && newStudent.user.roles) {
        selectedRoles.value = [...newStudent.user.roles];
      } else {
        selectedRoles.value = [];
      }
      createdUserPassword.value = null;
    }, { deep: true });

    const toggleRole = (role) => {
      const index = selectedRoles.value.indexOf(role);
      if (index > -1) {
        selectedRoles.value.splice(index, 1);
      } else {
        selectedRoles.value.push(role);
      }
    };

    const createUserForStudent = async () => {
      if (!props.student || !props.student._id) {
        alert('Student information saknas.');
        return;
      }

      isCreatingUser.value = true;
      try {
        const response = await api.post('/users/create-for-student', {
          studentId: props.student._id,
          email: props.student.email,
          name: props.student.name,
        });
        
        createdUserPassword.value = response.data.tempPassword;
        
        // Reload student data to get the new user
        // Emit event to parent to reload
        window.location.reload(); // Simple reload for now
      } catch (error) {
        console.error('Error creating user:', error);
        alert('Kunde inte skapa användare. ' + (error.response?.data?.message || error.message));
      } finally {
        isCreatingUser.value = false;
      }
    };

    const savePermissions = async () => {
      isSaving.value = true;
      try {
        if (!props.student || !props.student.user || !props.student.user._id) {
          alert('Ingen användare hittades för denna elev. Kan inte spara roller.');
          return;
        }
        await api.put(`/users/${props.student.user._id}/roles`, {
          roles: selectedRoles.value,
        });
        alert('Rollerna har uppdaterats!');
        // Reload to get updated user data
        window.location.reload();
      } catch (error) {
        console.error('Error saving permissions:', error);
        alert('Kunde inte spara roller.');
      } finally {
        isSaving.value = false;
      }
    };

    return {
      isAdmin,
      hasUser,
      isSaving,
      isCreatingUser,
      createdUserPassword,
      selectedRoles,
      availableRoles,
      features,
      toggleRole,
      savePermissions,
      createUserForStudent,
      getPermissionText,
      getPermissionClass,
    };
  },
};
</script>

<style scoped>
.permissions-container {
  max-width: 1200px;
}

.card {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  margin-bottom: 20px;
}

.card-header {
  background: #f8f9fa;
  padding: 15px 20px;
  border-bottom: 1px solid #dee2e6;
}

.card-header h3 {
  margin: 0;
  color: #2c3e50;
}

.card-body {
  padding: 20px;
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: #495057;
}

.form-help {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.875rem;
  color: #6c757d;
}

.roles-list {
  border: 1px solid #ced4da;
  border-radius: 6px;
  max-height: 220px;
  overflow: auto;
  background: white;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px;
}

.role-item {
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  user-select: none;
  border: 1px solid #ced4da;
  border-radius: 4px;
  transition: all 0.2s;
}

.role-item:hover {
  background: #f1f3f5;
  border-color: #007bff;
}

.role-item.selected {
  background: #e9f7ef;
  border-color: #28a745;
  border-width: 2px;
  font-weight: 500;
}

.form-actions {
  margin-top: 1rem;
}

.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.btn-primary {
  background: #007bff;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #0056b3;
}

.btn-primary:disabled {
  background: #6c757d;
  cursor: not-allowed;
  opacity: 0.6;
}

.alert {
  padding: 12px 16px;
  border-radius: 4px;
  margin-bottom: 1rem;
}

.alert-warning {
  background-color: #fff3cd;
  border: 1px solid #ffc107;
  color: #856404;
}

.alert-info {
  background-color: #d1ecf1;
  border: 1px solid #bee5eb;
  color: #0c5460;
}

.alert-info code {
  background: #fff;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: monospace;
  font-weight: bold;
}

.mt-3 {
  margin-top: 1rem;
}

.mt-4 {
  margin-top: 1.5rem;
}

.small {
  font-size: 0.875rem;
}

/* Permission Matrix Styles */
.permission-matrix-container {
  overflow-x: auto;
}

.permission-matrix {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.permission-matrix thead {
  background: #007bff;
  color: white;
}

.permission-matrix th {
  padding: 12px 8px;
  text-align: center;
  font-weight: 600;
  border: 1px solid #0056b3;
}

.permission-matrix th:first-child {
  text-align: left;
  background: #0056b3;
}

.permission-matrix td {
  padding: 10px 8px;
  border: 1px solid #dee2e6;
  text-align: center;
  font-size: 13px;
}

.permission-matrix .feature-name {
  text-align: left;
  font-weight: 500;
  background: #f8f9fa;
  min-width: 250px;
}

.permission-cell {
  vertical-align: middle;
}

.permission-yes {
  background: #d4edda;
  color: #155724;
  font-weight: 500;
}

.permission-no {
  background: #f8d7da;
  color: #721c24;
}

.permission-limited {
  background: #fff3cd;
  color: #856404;
}

.permission-legend {
  padding-top: 15px;
  border-top: 1px solid #dee2e6;
}

.permission-legend ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.permission-legend li {
  margin: 5px 0;
}

.legend-yes,
.legend-limited,
.legend-no {
  display: inline-block;
  width: 20px;
  height: 20px;
  border-radius: 3px;
  margin-right: 8px;
  vertical-align: middle;
}

.legend-yes {
  background: #d4edda;
  border: 1px solid #c3e6cb;
}

.legend-limited {
  background: #fff3cd;
  border: 1px solid #ffeaa7;
}

.legend-no {
  background: #f8d7da;
  border: 1px solid #f5c6cb;
}
</style>
