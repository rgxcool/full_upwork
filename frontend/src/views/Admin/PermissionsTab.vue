<template>
  <div class="scrollable-view">
    <h3 class="page-title">Behörigheter och roller</h3>

    <div class="card">
      <h4>Rollbehörigheter (standard)</h4>
      <p class="hint">Standardbehörigheter per roll. Individuella överridningar kan ändras per användare via "Redigera" på användarsidan.</p>
      <div class="table-wrapper">
        <table class="matrix-table">
          <thead>
            <tr>
              <th class="feature-col">Feature</th>
              <th v-for="role in roles" :key="role.key" class="role-col">{{ role.label }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="feature in features" :key="feature.key">
              <td class="feature-label">{{ feature.label }}</td>
              <td
                v-for="role in roles"
                :key="role.key"
                :class="['status-cell', getCellClass(role.key, feature.key)]"
              >
                {{ getCellLabel(role.key, feature.key) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <h4>Rollrättigheter (RBAC)</h4>
      <p class="hint">Rollbaserade åtkomstbehörigheter för resurser.</p>
      <div class="table-wrapper">
        <table class="matrix-table">
          <thead>
            <tr>
              <th class="feature-col">Behörighet</th>
              <th v-for="role in roles" :key="role.key" class="role-col">{{ role.label }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="perm in rbacPermissions" :key="perm.key">
              <td class="feature-label">{{ perm.label }}</td>
              <td
                v-for="role in roles"
                :key="role.key"
                :class="['status-cell', hasRbacPerm(role.key, perm.key) ? 'granted' : 'denied']"
              >
                {{ hasRbacPerm(role.key, perm.key) ? 'Ja' : 'Nej' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script>
import { useToast } from '@/composables/useToast.js'

const PERMISSIONS_API = '/api/permissions'

const ROLE_OPTIONS = [
  { key: 'systemadmin', label: 'Systemadmin' },
  { key: 'admin', label: 'Admin' },
  { key: 'teacher', label: 'Lärare' },
  { key: 'coordinator', label: 'Koordinator' },
  { key: 'syv', label: 'SYV' },
  { key: 'specped', label: 'Specped' },
  { key: 'student', label: 'Elev' },
]

const FEATURE_OPTIONS = [
  { key: 'calendar_final_exam', label: 'Kalender (slutprov)' },
  { key: 'search_content', label: 'Söka efter innehåll' },
  { key: 'search_users', label: 'Söka efter användare' },
  { key: 'statistics', label: 'Statistik' },
  { key: 'manage_users_permissions', label: 'Hantering av användare och åtkomstbehörigheter' },
  { key: 'hierarchy_management', label: 'Hierarkihantering' },
  { key: 'own_settings', label: 'Egna inställningar' },
  { key: 'add_municipalities_courses', label: 'Lägga till kommuner, kurser etc.' },
  { key: 'course_templates', label: 'Kursmallar (kursmoduler)' },
]

const PERMISSION_MATRIX = {
  calendar_final_exam: { systemadmin: true, admin: true, teacher: true, syv: true, specped: true, coordinator: false, student: false },
  search_content: { systemadmin: true, admin: true, teacher: true, syv: true, specped: true, coordinator: true, student: false },
  search_users: { systemadmin: true, admin: true, teacher: true, syv: true, specped: true, coordinator: true, student: false },
  statistics: { systemadmin: true, admin: true, teacher: true, syv: true, specped: true, coordinator: false, student: false },
  manage_users_permissions: { systemadmin: true, admin: true, teacher: false, syv: false, specped: false, coordinator: false, student: false },
  hierarchy_management: { systemadmin: true, admin: false, teacher: false, syv: false, specped: false, coordinator: false, student: false },
  own_settings: { systemadmin: true, admin: true, teacher: true, syv: true, specped: true, coordinator: true, student: true },
  add_municipalities_courses: { systemadmin: true, admin: false, teacher: false, syv: false, specped: false, coordinator: false, student: false },
  course_templates: { systemadmin: true, admin: true, teacher: true, syv: false, specped: false, coordinator: false, student: false },
}

export default {
  name: 'PermissionsTab',
  setup() {
    const toast = useToast()
    const roles = ref(ROLE_OPTIONS)
    const features = ref(FEATURE_OPTIONS)
    const permissionMatrix = ref(PERMISSION_MATRIX)
    const rbacPermissions = ref([]) // loaded separately if needed

    const loadPermissions = async () => {
      try {
        const res = await client.get(PERMISSIONS_API)
        roles.value = res.data.roles
        features.value = res.data.features
        permissionMatrix.value = res.data.permissionMatrix
        // rbacPermissions could also be loaded but keeping existing RBAC table separate for now
      } catch (err) {
        toast.error('Kunde inte ladda behörigheter från server.')
        console.error('Error loading permissions:', err)
      }
    }

    onMounted(loadPermissions)

    const getCellClass = (roleKey, featureKey) => {
      return permissionMatrix.value[featureKey]?.[roleKey] ? 'granted' : 'denied'
    }

    const getCellLabel = (roleKey, featureKey) => {
      return permissionMatrix.value[featureKey]?.[roleKey] ? 'Ja' : 'Nej'
    }

    const hasRbacPerm = (roleKey, permKey) => {
      return (rbacPermissions.value || []).includes(permKey)
    }

    return { roles, features, permissionMatrix, rbacPermissions, getCellClass, getCellLabel, hasRbacPerm }
  },
}
</script>

<style scoped>
.scrollable-view { padding: 20px; max-width: 1200px; margin: 0 auto; }
.page-title { margin-bottom: 20px; }
.card { background: #fff; border-radius: 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.08); padding: 24px; margin-bottom: 20px; }
.card h4 { margin: 0 0 8px; font-size: 16px; }
.hint { font-size: 13px; color: #666; margin-bottom: 16px; }
.table-wrapper { overflow-x: auto; }
.matrix-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.matrix-table th, .matrix-table td { padding: 8px 12px; text-align: center; border: 1px solid #e0e0e0; }
.matrix-table th { background: #f5f5f5; font-weight: 600; position: sticky; top: 0; }
.feature-col { text-align: left; min-width: 200px; }
.role-col { min-width: 90px; }
.feature-label { text-align: left; font-weight: 500; }
.status-cell.granted { background: #e8f5e9; color: #2e7d32; font-weight: 500; }
.status-cell.denied { background: #fafafa; color: #999; }
</style>
