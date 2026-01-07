<template>
  <div v-if="isAdmin" class="permissions-container">
    <div class="card">
      <div class="card-header">
        <h3>Användarroller</h3>
      </div>
      <div class="card-body">
        <div v-if="!hasUser" class="alert alert-warning">
          <p>Ingen användare hittades för denna elev. En användare måste skapas innan roller kan tilldelas.</p>
        </div>
        <form @submit.prevent="savePermissions" class="permissions-form">
          <div class="form-group">
            <label for="roles" class="form-label">Roller</label>
            <div
              id="roles"
              class="roles-list"
              role="listbox"
              aria-multiselectable="true"
            >
              <div
                v-for="opt in availableRoles"
                :key="opt"
                class="role-item"
                :class="{ selected: selectedRoles.includes(opt) }"
                @click="toggleRole(opt)"
              >
                {{ opt }}
              </div>
            </div>
            <small class="form-help">Klicka för att välja/avmarkera roller.</small>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary" :disabled="isSaving || !hasUser">
              {{ isSaving ? 'Sparar...' : 'Spara roller' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
  <div v-else>
    <p>Du har inte behörighet att se denna sida.</p>
  </div>
</template>

<script>
import { ref, computed, onMounted } from 'vue';
import { useStore } from 'vuex';
import { api } from '@/store/store.js';

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
    const isSaving = ref(false);
    const selectedRoles = ref([]);
    
    // This should ideally come from a config file or an API endpoint
    const availableRoles = ref(['student', 'teacher', 'admin', 'systemadmin', 'parent', 'guardian']);

    const isAdmin = computed(() => store.getters.isAdmin);
    const hasUser = computed(() => {
      return props.student && props.student.user && props.student.user._id;
    });

    onMounted(() => {
      if (props.student && props.student.user && props.student.user.roles) {
        selectedRoles.value = [...props.student.user.roles];
      }
    });

    const toggleRole = (role) => {
      const index = selectedRoles.value.indexOf(role);
      if (index > -1) {
        selectedRoles.value.splice(index, 1);
      } else {
        selectedRoles.value.push(role);
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
      selectedRoles,
      availableRoles,
      toggleRole,
      savePermissions,
    };
  },
};
</script>

<style scoped>
.permissions-container {
  max-width: 800px;
}
.card {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
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
}
.role-item {
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  user-select: none;
}
.role-item:hover {
  background: #f1f3f5;
}
.role-item.selected {
  background: #e9f7ef;
  border-left: 4px solid #2c9316;
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
</style>