<template>
  <v-container>
    <v-card>
      <v-card-title>Min kursöversikt</v-card-title>
      <v-card-text>
        <div class="d-flex flex-wrap align-center ga-2 mb-3">
          <v-text-field v-model="searchQuery" label="Sök kurs" density="compact" variant="outlined" hide-details style="max-width:220px"></v-text-field>
          <v-text-field v-model="finalExamDateFilter" label="Slutprovsdatum" type="date" density="compact" variant="outlined" hide-details style="max-width:180px"></v-text-field>
          <v-text-field v-model="startDateFilter" label="Startdatum" type="date" density="compact" variant="outlined" hide-details style="max-width:180px"></v-text-field>
          <v-text-field v-model="endDateFilter" label="Slutdatum" type="date" density="compact" variant="outlined" hide-details style="max-width:180px"></v-text-field>
          <v-btn variant="outlined" size="small" @click="clearFilters">Rensa</v-btn>
        </div>
        <v-data-table
          :headers="headers"
          :items="filteredCourses"
          :loading="loading"
          class="elevation-1 course-table"
          item-value="_id"
        >
          <template #item.courseCode="{ item }">
            <a 
              href="#" 
              class="course-code-link"
              @click.prevent="handleCourseCodeClick(item)"
            >
              {{ item.courseCode }}
            </a>
          </template>
          <template #item.startDate="{ item }">
            {{ formatDate(item.startDate) }}
          </template>
          <template #item.endDate="{ item }">
            {{ formatDate(item.endDate) }}
          </template>
          <template #item.slutprovDate="{ item }">
            {{ formatDate(item.slutprovDate) }}
          </template>
          <template #item.responsibleTeacher="{ item }">
            {{ getResponsibleTeacher(item) }}
          </template>
        </v-data-table>

        <!-- Course Details Modal -->
        <v-dialog v-model="showModal" max-width="800px" persistent>
          <v-card>
            <v-card-title class="d-flex align-center">
              <span class="text-h5">{{ courseDetails.courseName || 'Kursdetaljer' }}</span>
              <v-spacer></v-spacer>
              <v-btn icon variant="text" @click="closeModal">
                <v-icon>mdi-close</v-icon>
              </v-btn>
            </v-card-title>
            <v-card-text v-if="loadingDetails">
              <div class="text-center py-4">
                <v-progress-circular indeterminate color="primary"></v-progress-circular>
                <p class="mt-4">Laddar kursdetaljer...</p>
              </div>
            </v-card-text>
            <v-card-text v-else>
              <v-tabs
                v-model="detailsTab"
                color="primary"
                density="compact"
                class="mb-4"
                @update:model-value="onDetailsTabChange"
              >
                <v-tab value="students">Elever</v-tab>
                <v-tab value="modules">Moduler</v-tab>
              </v-tabs>

              <v-window v-model="detailsTab">
                <v-window-item value="students">
                  <div v-if="courseDetails.isCourseInstance" class="course-instance-info mb-4">
                    <div class="info-item">
                      <strong>Kurskod:</strong> {{ courseDetails.courseCode }}
                    </div>
                    <div v-if="courseDetails.startDate && courseDetails.endDate" class="info-item">
                      <strong>Period:</strong> {{ formatDate(courseDetails.startDate) }} - {{ formatDate(courseDetails.endDate) }}
                    </div>
                    <div v-if="courseDetails.slutprovDate" class="info-item">
                      <strong>Slutprovsdatum:</strong> {{ formatDate(courseDetails.slutprovDate) }}
                    </div>
                    <div v-if="courseDetails.mainCourseId" class="info-item">
                      <strong>Huvudkurs:</strong> {{ courseDetails.mainCourseId?.courseName || 'Okänd' }}
                    </div>
                  </div>

                  <div class="teacher-info mb-4">
                    <div v-if="courseDetails.teacher && courseDetails.teacher._id">
                      <strong>Ansvarig lärare:</strong>
                      <a href="#" class="teacher-link" @click.prevent="viewTeacher(courseDetails.teacher._id)">
                        {{ courseDetails.teacher.username }}
                      </a>
                    </div>
                    <div v-else-if="courseDetails.teachers && courseDetails.teachers.length > 0">
                      <strong>Lärare:</strong>
                      <span v-for="(teacher, index) in courseDetails.teachers" :key="teacher._id">
                        <a href="#" class="teacher-link" @click.prevent="viewTeacher(teacher._id)">
                          {{ teacher.username }}
                        </a>
                        <span v-if="index < courseDetails.teachers.length - 1">, </span>
                      </span>
                    </div>
                    <div v-else>
                      <strong>Lärare:</strong> Ingen ansvarig lärare tilldelad
                    </div>
                  </div>

                  <h3 class="mb-3">Elever ({{ courseDetails.students?.length || 0 }})</h3>
                  <div v-if="courseDetails.students && courseDetails.students.length > 0" class="students-list">
                    <div
                      v-for="student in courseDetails.students"
                      :key="student._id"
                      class="student-item p-3 mb-2 rounded border bg-light"
                    >
                      <div class="d-flex justify-space-between align-center mb-1">
                        <div>
                          <a href="#" class="student-link font-weight-bold" @click.prevent="viewStudent(student._id)">
                            {{ student.name }}
                          </a>
                          <span v-if="student.personalNumber" class="text-caption text-grey ml-2">({{ student.personalNumber }})</span>
                        </div>
                        <v-chip
                          size="x-small"
                          :color="student.attended ? 'success' : 'grey'"
                          variant="flat"
                        >
                          {{ student.attended ? 'Deltog vid slutprov' : 'Ej registrerad' }}
                        </v-chip>
                      </div>
                      <div class="student-exam-meta d-flex flex-wrap gap-3 text-caption text-grey-darken-1 mt-1">
                        <span v-if="student.email"><strong>E-post:</strong> {{ student.email }}</span>
                        <span><strong>Tid:</strong> {{ student.examTime || 'Enligt schema' }}</span>
                        <span><strong>Kommun:</strong> {{ student.examMunicipality || 'Ej angiven' }}</span>
                        <span><strong>Plats:</strong> {{ student.examLocation || 'Ej angiven' }}<span v-if="student.examRoom"> (Sal: {{ student.examRoom }})</span></span>
                      </div>
                    </div>
                  </div>
                  <div v-else class="no-students">
                    Inga elever inskrivna i denna kurs
                  </div>
                </v-window-item>

                <v-window-item value="modules">
                  <v-alert
                    v-if="moduleStatusError"
                    type="warning"
                    variant="tonal"
                    density="compact"
                    class="mb-3"
                  >
                    {{ moduleStatusError }}
                  </v-alert>
                  <v-progress-linear
                    v-if="moduleStatusLoading"
                    indeterminate
                    color="primary"
                    class="mb-3"
                  />
                  <v-table v-else dense class="module-status-table">
                    <thead>
                      <tr>
                        <th class="text-left">Modul</th>
                        <th class="text-left">Planerat datum</th>
                        <th class="text-left">Avsnitt</th>
                        <th class="text-left">Elever</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="row in moduleRows" :key="row.moduleNumber">
                        <td>
                          <div class="font-weight-medium">
                            Modul {{ row.moduleNumber }} · {{ row.title || 'Utan titel' }}
                          </div>
                          <div class="d-flex flex-wrap ga-1 mt-1">
                            <v-chip v-if="row.isHiddenFromStudent" size="x-small" color="grey" variant="tonal">
                              Dold för elever
                            </v-chip>
                            <v-chip v-if="row.isPartialExam" size="x-small" color="warning" variant="tonal">
                              Deltenta
                            </v-chip>
                            <v-chip v-if="row.isCaseStudy" size="x-small" color="info" variant="tonal">
                              Fallstudie
                            </v-chip>
                          </div>
                        </td>
                        <td>{{ row.plannedDate || '–' }}</td>
                        <td>
                          <div v-if="row.avsnitt.length" class="avsnitt-summary">
                            <div
                              v-for="av in row.avsnitt"
                              :key="av.avsnittId || av.order"
                              class="avsnitt-summary-row"
                            >
                              <strong>{{ avsnittLabel(av) }}</strong>
                              <span class="text-caption">{{ PLANNED_DATE_LABEL }}: {{ av.plannedDate || '–' }}</span>
                            </div>
                          </div>
                          <span v-else class="text-caption text-grey">–</span>
                        </td>
                        <td>
                          <div v-if="row.students.length" class="d-flex flex-wrap ga-1">
                            <v-chip
                              v-for="student in row.students"
                              :key="student.studentId"
                              size="x-small"
                              :color="moduleStatusTone(student)"
                              variant="tonal"
                              :title="studentTooltip(student)"
                            >
                              {{ student.name }} · {{ moduleStatusLabel(student) }}
                            </v-chip>
                          </div>
                          <span v-else class="text-caption text-grey">–</span>
                          <div v-if="row.completedCount || row.behindCount" class="text-caption text-grey mt-1">
                            {{ row.completedCount }} klara · {{ row.behindCount }} bakom
                          </div>
                        </td>
                      </tr>
                      <tr v-if="moduleRows.length === 0">
                        <td colspan="4" class="text-center text-grey">Inga moduler registrerade.</td>
                      </tr>
                    </tbody>
                  </v-table>
                </v-window-item>
              </v-window>
            </v-card-text>
            <v-card-actions>
              <v-spacer></v-spacer>
              <v-btn color="primary" @click="closeModal">Stäng</v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>
      </v-card-text>
    </v-card>
  </v-container>
</template>

<script>
  import client from '@/api/client.js'
  import { useToast } from '@/composables/useToast.js'
  import { PLANNED_DATE_LABEL, formatPlannedDate, sortedAvsnitt } from '@/utils/courseContent.js'

  export default {
    name: 'CourseOverview',
    setup() {
      const toast = useToast()
      return { toast }
    },
    data() {
      return {
        loading: true,
        courses: [],
        searchQuery: '',
        finalExamDateFilter: '',
        startDateFilter: '',
        endDateFilter: '',
        showModal: false,
        loadingDetails: false,
        courseDetails: {},
        detailsTab: 'students',
        activityResults: [],
        moduleStatusLoading: false,
        moduleStatusLoaded: false,
        moduleStatusError: '',
        PLANNED_DATE_LABEL,
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
    computed: {
      filteredCourses() {
        return (this.courses || []).filter((c) => {
          if (this.searchQuery) {
            const q = this.searchQuery.toLowerCase();
            const name = (c.courseName || '').toLowerCase();
            const code = (c.courseCode || '').toLowerCase();
            const teacher = this.getResponsibleTeacher(c).toLowerCase();
            if (
              !name.includes(q) &&
              !code.includes(q) &&
              !teacher.includes(q)
            ) {
              return false;
            }
          }
          if (
            this.finalExamDateFilter &&
            this.toLocalDateKey(c.slutprovDate) !== this.finalExamDateFilter
          ) {
            return false;
          }
          if (
            this.startDateFilter &&
            this.toLocalDateKey(c.startDate) !== this.startDateFilter
          ) {
            return false;
          }
          if (
            this.endDateFilter &&
            this.toLocalDateKey(c.endDate) !== this.endDateFilter
          ) {
            return false;
          }
          return true;
        });
      },
      moduleRows() {
        const modules = Array.isArray(this.courseDetails.modules)
          ? this.courseDetails.modules
          : [];
        const students = Array.isArray(this.courseDetails.students)
          ? this.courseDetails.students
          : [];
        const content =
          this.courseDetails.content instanceof Map
            ? Object.fromEntries(this.courseDetails.content)
            : this.courseDetails.content || {};
        const resultsByStudent = new Map(
          this.activityResults
            .filter((result) => result && result.studentId)
            .map((result) => [String(result.studentId), result])
        );

        return [...modules]
          .sort(
            (a, b) =>
              (Number(a.moduleNumber) || 0) - (Number(b.moduleNumber) || 0)
          )
          .map((mod) => {
            const moduleNumber = Number(mod.moduleNumber) || 0;
            const overlay = content[String(moduleNumber)] || {};
            const statusByStudent = new Map();
            for (const result of resultsByStudent.values()) {
              const statuses = Array.isArray(result.moduleStatuses)
                ? result.moduleStatuses
                : [];
              const status = statuses.find(
                (entry) => Number(entry.moduleNumber) === moduleNumber
              );
              if (status) {
                statusByStudent.set(String(result.studentId), {
                  status,
                  result,
                });
              }
            }

            const studentRows = students.map((student) => {
              const studentId = String(student._id || student.studentId || '');
              const entry = statusByStudent.get(studentId);
              return {
                studentId,
                name: student.name || 'Elev',
                hasStatus: Boolean(entry),
                completed: Boolean(entry?.status?.completed),
                behind: Boolean(entry?.status?.behind),
                overallStatus: entry?.result?.overallStatus || null,
              };
            });

            return {
              moduleNumber,
              title: overlay.title || mod.title || '',
              // D5: planned dates come from the details payload only. The batch
              // service's sectionDate is deliberately not used here.
              plannedDate: formatPlannedDate(mod.startDate),
              isPartialExam: Boolean(mod.isPartialExam),
              isCaseStudy: Boolean(mod.isCaseStudy),
              isHiddenFromStudent: Boolean(overlay.isHiddenFromStudent),
              avsnitt: sortedAvsnitt(mod).map((av) => ({
                avsnittId: av.avsnittId || null,
                title: av.title || '',
                order: Number.isFinite(Number(av.order))
                  ? Number(av.order)
                  : null,
                plannedDate: formatPlannedDate(av.plannedDate),
              })),
              students: studentRows,
              completedCount: studentRows.filter((s) => s.completed).length,
              behindCount: studentRows.filter((s) => s.behind).length,
            };
          });
      },
    },
    async created() {
      await this.fetchMyCourses();
    },
    methods: {
      async fetchMyCourses() {
        this.loading = true;
        try {
          const response = await client.get('/course-instances/mine');
          const instances = response.data.instances || [];
          
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
          this.courses = [];
        } finally {
          this.loading = false;
        }
      },
      clearFilters() {
        this.searchQuery = '';
        this.finalExamDateFilter = '';
        this.startDateFilter = '';
        this.endDateFilter = '';
      },
      toLocalDateKey(value) {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
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
        
        return 'Ej tilldelad';
      },
      handleCourseCodeClick(item) {
        if (item && item._id) {
          this.showCourseDetails(item._id);
        }
      },
      async showCourseDetails(instanceId) {
        this.showModal = true;
        this.loadingDetails = true;
        this.courseDetails = {};
        this.detailsTab = 'students';
        this.activityResults = [];
        this.moduleStatusLoading = false;
        this.moduleStatusLoaded = false;
        this.moduleStatusError = '';
        
        try {
          const response = await client.get(`/details/Kursinstans/${instanceId}`);
          this.courseDetails = response.data;
        } catch (error) {
          console.error('Error fetching course details:', error);
          this.toast.error('Kunde inte ladda kursdetaljer');
          this.closeModal();
        } finally {
          this.loadingDetails = false;
        }
      },
      closeModal() {
        this.showModal = false;
        this.courseDetails = {};
        this.detailsTab = 'students';
        this.activityResults = [];
        this.moduleStatusLoading = false;
        this.moduleStatusLoaded = false;
        this.moduleStatusError = '';
      },
      async onDetailsTabChange(tab) {
        if (tab === 'modules' && !this.moduleStatusLoaded) {
          await this.loadModuleStatus();
        }
      },
      async loadModuleStatus() {
        const instanceId = this.courseDetails?._id;
        if (!instanceId || this.moduleStatusLoading || this.moduleStatusLoaded) return;

        this.moduleStatusLoading = true;
        this.moduleStatusError = '';
        try {
          const { data } = await client.post(
            `/learning/instances/${instanceId}/activity-status/batch`,
            {}
          );
          if (data?.error) throw new Error(data.error);
          this.activityResults = Array.isArray(data?.activityResults)
            ? data.activityResults
            : [];
          this.moduleStatusLoaded = true;
        } catch (error) {
          console.error('Error fetching module status:', error);
          this.moduleStatusError =
            'Kunde inte hämta modulstatus. Planeringsdatum visas ändå.';
          this.activityResults = [];
        } finally {
          this.moduleStatusLoading = false;
        }
      },
      avsnittLabel(av) {
        return av.title || `Avsnitt ${av.order || ''}`;
      },
      moduleStatusLabel(student) {
        if (!student.hasStatus) return '–';
        if (student.completed) return 'Klar';
        if (student.behind) return 'Bakom';
        return 'På gång';
      },
      moduleStatusTone(student) {
        if (!student.hasStatus) return undefined;
        if (student.completed) return 'success';
        if (student.behind) return 'warning';
        return 'info';
      },
      studentTooltip(student) {
        const status = this.moduleStatusLabel(student);
        const overall = student.overallStatus
          ? ` (${student.overallStatus})`
          : '';
        return `${student.name}: ${status}${overall}`;
      },
      viewStudent(studentId) {
        this.$router.push(`/student/${studentId}`);
      },
      viewTeacher(teacherId) {
        this.$router.push(`/teacher/${teacherId}`);
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

.course-code-link {
  color: #1976d2;
  text-decoration: none;
  cursor: pointer;
  font-weight: 500;
}

.course-code-link:hover {
  text-decoration: underline;
}

.course-instance-info {
  background: #f8f9fa;
  padding: 15px;
  border-radius: 8px;
  margin-bottom: 20px;
}

.info-item {
  margin-bottom: 8px;
  font-size: 14px;
}

.info-item:last-child {
  margin-bottom: 0;
}

.teacher-info {
  margin: 20px 0 30px;
  font-size: 16px;
}

.teacher-link {
  color: #1976d2;
  text-decoration: none;
  cursor: pointer;
}

.teacher-link:hover {
  text-decoration: underline;
}

.students-list {
  margin-top: 15px;
}

.students-ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.student-item {
  padding: 10px;
  border-bottom: 1px solid #e9ecef;
  transition: background-color 0.2s;
}

.student-item:hover {
  background-color: #f8f9fa;
}

.student-item:last-child {
  border-bottom: none;
}

.student-link {
  color: #1976d2;
  text-decoration: none;
  font-weight: 500;
  cursor: pointer;
}

.student-link:hover {
  text-decoration: underline;
}

.student-email {
  color: #6c757d;
  font-size: 14px;
}

.no-students {
  color: #6c757d;
  font-style: italic;
  padding: 20px;
  text-align: center;
}

.module-status-table th {
  white-space: nowrap;
}

.avsnitt-summary-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.25rem 0.5rem;
  padding: 0.1rem 0;
}
</style>
