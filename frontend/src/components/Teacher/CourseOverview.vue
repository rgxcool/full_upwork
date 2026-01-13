<template>
  <v-container>
    <v-card>
      <v-card-title>Min kursöversikt</v-card-title>
      <v-card-text>
        <v-data-table
          :headers="headers"
          :items="courses"
          :loading="loading"
          class="elevation-1 course-table"
          item-value="_id"
        >
          <template v-slot:item.startDate="{ item }">
            {{ formatDate(item.startDate) }}
          </template>
          <template v-slot:item.endDate="{ item }">
            {{ formatDate(item.endDate) }}
          </template>
          <template v-slot:item.slutprovDate="{ item }">
            {{ formatDate(item.slutprovDate) }}
          </template>
          <template v-slot:item.responsibleTeacher="{ item }">
            {{ getResponsibleTeacher(item) }}
          </template>
        </v-data-table>
      </v-card-text>
    </v-card>
  </v-container>
</template>

<script>
export default {
  name: 'CourseOverview',
  data() {
    return {
      loading: true,
      courses: [],
      headers: [
        { title: 'Kursnamn', key: 'courseName', sortable: true, align: 'start' },
        { title: 'Kurskod', key: 'courseCode', sortable: true, align: 'start' },
        { title: 'Startdatum', key: 'startDate', sortable: true, align: 'start' },
        { title: 'Slutdatum', key: 'endDate', sortable: true, align: 'start' },
        { title: 'Slutprovsdatum', key: 'slutprovDate', sortable: true, align: 'start' },
        { title: 'Antal anmälda', key: 'enrollmentCount', sortable: true, align: 'start' },
        { title: 'Ansvarig lärare', key: 'responsibleTeacher', sortable: true, align: 'start' },
      ],
    };
  },
  async created() {
    await this.fetchMyCourses();
  },
  methods: {
    async fetchMyCourses() {
      this.loading = true;
      try {
        // Use the api instance from store which has proper baseURL and credentials
        const { api } = await import('@/store/store.js');
        const response = await api.get('/course-instances/mine', { withCredentials: true });
        const instances = response.data.instances || [];
        
        // Debug: Log first instance to see data structure
        if (instances.length > 0) {
          console.log('Sample course instance:', instances[0]);
          console.log('Responsible teacher data:', instances[0].responsibleTeacher);
        }
        
        // Deduplicate by _id to prevent duplicate entries
        const seen = new Map();
        this.courses = instances.filter(instance => {
          const id = instance._id?.toString() || instance.id?.toString();
          if (!id) return false;
          if (seen.has(id)) {
            return false;
          }
          seen.set(id, true);
          return true;
        });
      } catch (error) {
        console.error('Error fetching my courses:', error);
        // Handle error, e.g., show a notification
        this.courses = [];
      } finally {
        this.loading = false;
      }
    },
    formatDate(dateString) {
      if (!dateString) return 'N/A';
      const options = { year: 'numeric', month: 'short', day: 'numeric' };
      return new Date(dateString).toLocaleDateString('sv-SE', options);
    },
    getResponsibleTeacher(item) {
      // Handle different possible data structures
      const teacher = item.responsibleTeacher;
      
      if (!teacher) {
        return 'Ej tilldelad';
      }
      
      // If userId is populated with username
      if (teacher.userId?.username) {
        return teacher.userId.username;
      }
      
      // If userId is an object but not populated, try to get it from the object
      if (teacher.userId && typeof teacher.userId === 'object' && teacher.userId.username) {
        return teacher.userId.username;
      }
      
      // If there's a username directly on the teacher object (fallback)
      if (teacher.username) {
        return teacher.username;
      }
      
      // Debug: Log what we actually have
      console.log('Teacher data structure:', {
        teacher,
        hasUserId: !!teacher.userId,
        userIdType: typeof teacher.userId,
        userIdValue: teacher.userId
      });
      
      return 'Ej tilldelad';
    },
  },
};
</script>

<style scoped>
.v-card-title {
  font-weight: bold;
}

/* Ensure table headers are visible and black - Vuetify 3 */
:deep(.v-data-table) {
  border-collapse: separate;
}

:deep(.v-data-table__thead) {
  background-color: #f5f5f5 !important;
  display: table-header-group !important;
  visibility: visible !important;
}

:deep(.v-data-table__thead tr) {
  display: table-row !important;
}

:deep(.v-data-table__thead th) {
  color: #000000 !important;
  font-weight: 600 !important;
  font-size: 14px !important;
  background-color: #f5f5f5 !important;
  border-bottom: 2px solid #dee2e6 !important;
  padding: 12px 16px !important;
  display: table-cell !important;
  visibility: visible !important;
  opacity: 1 !important;
}

:deep(.v-data-table-header__content) {
  color: #000000 !important;
  font-weight: 600 !important;
  visibility: visible !important;
  opacity: 1 !important;
}

:deep(.v-data-table-header__title) {
  color: #000000 !important;
  font-weight: 600 !important;
  visibility: visible !important;
  opacity: 1 !important;
}

/* Fallback for any th elements */
:deep(.v-data-table th),
:deep(.course-table th) {
  color: #000000 !important;
  font-weight: 600 !important;
  display: table-cell !important;
  visibility: visible !important;
  opacity: 1 !important;
  background-color: #f5f5f5 !important;
}
</style>
