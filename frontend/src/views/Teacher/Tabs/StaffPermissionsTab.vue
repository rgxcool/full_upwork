<template>
  <div class="staff-permissions-tab">
    <div v-if="!isAdmin" class="alert alert-warning">
      Du har inte behörighet att se eller ändra behörigheter.
    </div>
    <div v-else class="card">
      <div class="card-header">
        <h3>Behörigheter</h3>
        <p class="small text-muted">
          Klicka på kryssrutor för att aktivera/inaktivera behörigheter för denna användare.
          Behörigheter som inte är explicit satta följer användarens roll.
        </p>
      </div>
      <div class="card-body">
        <div v-if="loading" class="loading-text">Laddar användare...</div>
        <div v-else-if="error" class="alert alert-danger">
          {{ error }}
          <button class="btn btn-sm btn-secondary ms-2" @click="loadUser">Försök igen</button>
        </div>
        <PermissionMatrixEditor v-else-if="user" :user="user" @saved="loadUser" />
        <div v-else class="alert alert-warning">
          Ingen användare är kopplad till denna personalprofil.
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, watch } from 'vue';
import { useStore } from 'vuex';
import client from '@/api/client.js';
import PermissionMatrixEditor from '@/components/PermissionMatrixEditor.vue';

export default {
  name: 'StaffPermissionsTab',
  components: { PermissionMatrixEditor },
  props: {
    teacher: { type: Object, required: true },
  },
  setup(props) {
    const store = useStore();
    const loading = ref(true);
    const error = ref(null);
    const user = ref(null);

    const isAdmin = computed(() => {
      const roles = store.getters.userRoles || [];
      return roles.some((r) => ['admin', 'systemadmin'].includes(r));
    });

    const teacherUserId = () =>
      props.teacher?.user?._id || props.teacher?.userId?._id || props.teacher?.userId;

    const loadUser = async () => {
      const userId = teacherUserId();
      if (!userId) {
        loading.value = false;
        user.value = null;
        return;
      }
      loading.value = true;
      error.value = null;
      try {
        const { data } = await client.get(`/users/${userId}`);
        user.value = data;
      } catch (err) {
        console.error('Error fetching staff user permissions:', err);
        error.value = 'Kunde inte hämta behörigheter för användaren.';
        user.value = null;
      } finally {
        loading.value = false;
      }
    };

    onMounted(() => {
      if (isAdmin.value) loadUser();
      else loading.value = false;
    });

    watch(
      () => teacherUserId(),
      () => {
        if (isAdmin.value) loadUser();
      }
    );

    return {
      isAdmin,
      loading,
      error,
      user,
      loadUser,
    };
  },
};
</script>

<style scoped>
.staff-permissions-tab .card {
  border: 1px solid #dee2e6;
  border-radius: 6px;
}

.card-header {
  padding: 16px 20px;
  border-bottom: 1px solid #dee2e6;
}

.card-header h3 {
  margin: 0 0 4px;
}

.card-body {
  padding: 20px;
}

.loading-text {
  color: #6b7280;
}
</style>
