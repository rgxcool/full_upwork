<template>
  <div class="scrollable-view">
    <div class="student-details-container">
      <div class="header-section">
        <h1 class="page-title">{{ student ? student.name : 'Elevdetaljer' }}</h1>
      </div>

      <div v-if="loading" class="loading">
        <div class="spinner"></div>
        <p>Laddar elevinformation...</p>
      </div>

      <div v-else-if="error" class="error-message">
        <p>{{ error }}</p>
      </div>

      <div v-else-if="student">
        <div v-if="student.dropout === true || student.dropout === 'true' || student.dropout === 1" class="inactive-banner">
          <h2>INAKTIV</h2>
          <p>Denna elev har markerats som avbrott (inaktiv).</p>
        </div>
        <ul class="nav nav-tabs">
          <li class="nav-item" v-for="tab in tabs" :key="tab.name">
            <a
              class="nav-link"
              :class="{ active: activeTab === tab.component }"
              @click.prevent="activeTab = tab.component"
              href="#"
            >
              {{ tab.name }}
            </a>
          </li>
        </ul>

        <div class="tab-content">
          <keep-alive>
            <component
              :is="activeTab"
              :student="student"
              :changeHistory="changeHistory"
              @student-updated="handleStudentUpdate"
            />
          </keep-alive>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, computed, shallowRef } from 'vue';
import { useRoute } from 'vue-router';
import { useStore } from 'vuex';
import { api } from '@/store/store.js';

import GeneralTab from './tabs/GeneralTab.vue';
import StudyPlanTab from './tabs/StudyPlanTab.vue';
import PermissionsTab from './tabs/PermissionsTab.vue';
import DocumentsTab from './tabs/DocumentsTab.vue';
import CourseArchiveTab from './tabs/CourseArchiveTab.vue';
// APL tab is not yet implemented per plan
// import AplTab from './tabs/AplTab.vue';

export default {
  name: 'StudentDetails',
  components: {
    GeneralTab,
    StudyPlanTab,
    PermissionsTab,
    DocumentsTab,
    CourseArchiveTab,
  },
  setup() {
    const route = useRoute();
    const store = useStore();
    const student = ref(null);
    const loading = ref(true);
    const error = ref(null);
    const changeHistory = ref([]);
    const activeTab = shallowRef(GeneralTab);

    const isAdmin = computed(() => store.getters.isAdmin);

    const tabs = computed(() => {
      const allTabs = [
        { name: 'Allmänt', component: GeneralTab },
        { name: 'Studieplan', component: StudyPlanTab },
        { name: 'Dokument', component: DocumentsTab },
        { name: 'Kursarkiv', component: CourseArchiveTab },
      ];

      // Conditionally add APL tab
      if (student.value && student.value.education && student.value.education.some(e => e.coursePackageId)) {
        // allTabs.push({ name: 'APL', component: AplTab });
      }

      if (isAdmin.value) {
        allTabs.push({ name: 'Behörigheter', component: PermissionsTab });
      }

      return allTabs;
    });

    const loadStudent = async () => {
      try {
        loading.value = true;
        error.value = null;
        const response = await api.get(`/student-details/${route.params.id}`);
        student.value = response.data;
        if (isAdmin.value) {
          await loadChangeHistory();
        }
      } catch (err) {
        console.error('Error loading student:', err);
        error.value = 'Kunde inte ladda elevinformation';
      } finally {
        loading.value = false;
      }
    };

    const loadChangeHistory = async () => {
      try {
        const response = await api.get(`/student-details/${route.params.id}/history`);
        changeHistory.value = response.data.changeHistory;
      } catch (err) {
        console.error('Error loading change history:', err);
      }
    };

    const handleStudentUpdate = async (updatedStudent) => {
      console.log('🔄 Updating student data:', updatedStudent);
      console.log('🔄 updatedStudent.dropout:', updatedStudent.dropout);
      console.log('🔄 student.value.dropout before update:', student.value?.dropout);
      
      // Ensure dropout is explicitly set
      student.value = { 
        ...student.value, 
        ...updatedStudent,
        dropout: updatedStudent.dropout === true || updatedStudent.dropout === 'true'
      };
      
      console.log('✅ Updated student.value.dropout:', student.value.dropout);
      console.log('✅ student.value.dropout type:', typeof student.value.dropout);
      console.log('✅ Will show banner?', student.value.dropout === true);
      
      if (isAdmin.value) {
        await loadChangeHistory();
      }
    };

    onMounted(() => {
      loadStudent();
    });

    return {
      student,
      loading,
      error,
      activeTab,
      tabs,
      changeHistory,
      handleStudentUpdate,
    };
  },
};
</script>

<style scoped>
.student-details-container {
  padding: 20px;
  max-width: 1400px;
  margin: 0 auto;
}
.header-section {
  margin-bottom: 20px;
}
.page-title {
  margin: 0;
  color: #2c3e50;
}
.loading, .error-message {
  text-align: center;
  padding: 40px;
}
.spinner {
  border: 4px solid #f3f3f3;
  border-top: 4px solid #007bff;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  animation: spin 1s linear infinite;
  margin: 0 auto 20px;
}
@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
.nav-tabs {
  margin-bottom: 20px;
  border-bottom: 1px solid #dee2e6;
}
.nav-item {
    margin-bottom: -1px;
}
.nav-link {
    display: block;
    padding: 0.5rem 1rem;
    color: #007bff;
    text-decoration: none;
    background: none;
    border: 1px solid transparent;
    border-top-left-radius: 0.25rem;
    border-top-right-radius: 0.25rem;
}
.nav-link.active {
    color: #495057;
    background-color: #fff;
    border-color: #dee2e6 #dee2e6 #fff;
}
.tab-content {
  padding-top: 20px;
}
.inactive-banner {
  background-color: #dc3545;
  color: white;
  padding: 20px;
  margin-bottom: 20px;
  border-radius: 8px;
  text-align: center;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}
.inactive-banner h2 {
  margin: 0 0 10px 0;
  font-size: 2rem;
  font-weight: bold;
  text-transform: uppercase;
}
.inactive-banner p {
  margin: 0;
  font-size: 1.1rem;
}
</style>