<template>
  <div class="card">
    <div class="card-header">
      <h3>Utbildning</h3>
      <div v-if="student.enrollmentStats" class="enrollment-stats">
        <span class="stat-item">
          <strong>{{ student.enrollmentStats.totalEnrollments }}</strong>
          totalt
        </span>
        <span class="stat-item">
          <strong>{{ student.enrollmentStats.activeEnrollments }}</strong>
          aktiva
        </span>
      </div>
    </div>
    <div class="card-body">
      <div class="education-scroll-container">
        <div v-if="sortedEducation && sortedEducation.length > 0">
          <draggable
            v-model="sortedEducation"
            :animation="200"
            handle=".drag-handle"
            @end="handleEducationReorder"
            item-key="_id"
            class="education-list"
          >
            <template #item="{ element }">
              <div
                :key="element._id || element.refId?._id"
                class="education-item"
                :class="{ 'enrollment-item': element.isEnrollment, 'reviderad-item': element.status === 'reviderad' }"
              >
                <div class="education-header">
                  <span class="drag-handle" title="Dra för att ändra ordning">☰</span>
                  <span class="education-type">{{ element.type }}</span>
                  <span v-if="element.isEnrollment" class="enrollment-badge">Inskriven</span>
                  <span v-if="element.type === 'Course' && (element.courseInstanceId || element.refId?._id)" class="education-name">
                    <router-link 
                      :to="getCourseLink(element)" 
                      class="course-link"
                      @click.stop
                    >
                      {{ getEducationName(element) }}
                    </router-link>
                  </span>
                  <span v-else class="education-name">
                    {{ getEducationName(element) }}
                  </span>
                </div>

                <div class="education-details">
                  <div v-if="element.startDate && element.endDate" class="education-dates">
                    {{ formatDate(element.startDate) }} - {{ formatDate(element.endDate) }}
                  </div>

                  <div v-if="element.status" class="education-status">
                    Status:
                    <span :class="'status-' + element.status">{{ element.status }}</span>
                  </div>

                  <div v-if="element.grade" class="education-grade">
                    Betyg: {{ element.grade }}
                  </div>

                  <div
                    v-if="element.isEnrollment && element.courseInstance"
                    class="course-instance-info"
                  >
                    Kursinstans: {{ element.courseInstance.courseName }} ({{
                      formatDate(element.courseInstance.startDate)
                    }}
                    - {{ formatDate(element.courseInstance.endDate) }})
                  </div>
                </div>
              </div>
            </template>
          </draggable>
        </div>
        <div v-else class="no-education">Ingen utbildning registrerad</div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, watch } from 'vue';
import { api } from '@/store/store.js';
import draggable from 'vuedraggable';

export default {
  name: 'StudyPlanTab',
  components: {
    draggable,
  },
  props: {
    student: {
      type: Object,
      required: true,
    },
  },
  setup(props) {
    const sortedEducation = ref([]);
    const localStudent = ref(props.student);

    watch(
      () => props.student,
      (newStudent) => {
        localStudent.value = newStudent;
        if (!newStudent?.education) {
          sortedEducation.value = [];
          return;
        }
        sortedEducation.value = [...newStudent.education].sort((a, b) => {
          if (!a.startDate && !b.startDate) return 0;
          if (!a.startDate) return 1;
          if (!b.startDate) return -1;
          return new Date(a.startDate) - new Date(b.startDate);
        });
      },
      { immediate: true, deep: true }
    );

    const handleEducationReorder = async () => {
      if (!localStudent.value?.education || sortedEducation.value.length === 0) return;

      try {
        const updatedEducation = recalculateEducationDates(sortedEducation.value);
        sortedEducation.value = updatedEducation;
        localStudent.value.education = updatedEducation;

        for (const edu of updatedEducation.filter((edu) => edu.enrollmentId)) {
          await api.put(`/enrollments/${edu.enrollmentId}`, {
            startDate: edu.startDate,
            endDate: edu.endDate,
          });
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        console.log('Education dates updated successfully');
      } catch (err) {
        console.error('Error updating education dates:', err);
        alert('Kunde inte uppdatera utbildningsdatum');
        // Optionally emit an event to reload student data from parent
      }
    };

    const recalculateEducationDates = (educationArray) => {
      if (educationArray.length === 0) return [];
      const dateSlots = [...educationArray]
        .map((item) => ({
          startDate: item.startDate ? new Date(item.startDate) : null,
          endDate: item.endDate ? new Date(item.endDate) : null,
        }))
        .sort((a, b) => {
          if (!a.startDate && !b.startDate) return 0;
          if (!a.startDate) return 1;
          if (!b.startDate) return -1;
          return a.startDate - b.startDate;
        });

      return educationArray.map((item, index) => {
        const slot = dateSlots[index];
        return {
          ...item,
          startDate: slot?.startDate ? slot.startDate.toISOString() : item.startDate,
          endDate: slot?.endDate ? slot.endDate.toISOString() : item.endDate,
        };
      });
    };

    const getEducationName = (edu) => {
      if (edu.name) return edu.name;
      if (!edu.refId) return 'Okänd';
      if (edu.type === 'Course') return edu.refId.courseName || 'Okänd kurs';
      if (edu.type === 'CoursePackage') return edu.refId.coursePackageName || 'Okänt kurspaket';
      if (edu.type === 'Program') return edu.refId.programName || 'Okänt program';
      return 'Okänd';
    };

    const formatDate = (date) => {
      if (!date) return '';
      return new Date(date).toLocaleDateString('sv-SE');
    };

    const getCourseLink = (edu) => {
      // Always prefer linking to the main course to show all enrolled students
      // This ensures consistency - clicking a course name shows all students in that course
      // regardless of which course instance they're enrolled in
      if (edu.refId?._id) {
        return `/education/${edu.refId._id}`;
      }
      // Fallback: if no main course ID, try course instance (shouldn't happen normally)
      if (edu.courseInstanceId) {
        return `/education/${edu.courseInstanceId}?type=instance`;
      }
      // Fallback to empty string if no ID available
      return '#';
    };

    return {
      sortedEducation,
      handleEducationReorder,
      getEducationName,
      formatDate,
      getCourseLink,
    };
  },
};
</script>

<style scoped>
.card {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}
.card-header {
  background: #f8f9fa;
  padding: 15px 20px;
  border-bottom: 1px solid #dee2e6;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.card-header h3 {
  margin: 0;
  color: #2c3e50;
}
.card-body {
  padding: 20px;
}
.education-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.education-item {
  padding: 10px;
  border: 1px solid #dee2e6;
  border-radius: 4px;
}
.education-header {
  display: flex;
  gap: 10px;
  align-items: center;
}
.education-type {
  background: #007bff;
  color: white;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
}
.education-name {
  font-weight: 500;
}

.course-link {
  color: #007bff;
  text-decoration: none;
  cursor: pointer;
  transition: color 0.2s;
}

.course-link:hover {
  color: #0056b3;
  text-decoration: underline;
}
.education-grade {
  margin-top: 5px;
  color: #6c757d;
}
.no-education {
  text-align: center;
  color: #6c757d;
  font-style: italic;
  padding: 20px;
}
.enrollment-stats {
  display: flex;
  gap: 15px;
  font-size: 14px;
}
.stat-item {
  color: #6c757d;
}
.enrollment-item {
  border-left: 4px solid #28a745;
  background-color: #f8fff9;
}
.reviderad-item {
  border-left: 4px solid #ffc107; /* Yellow color for reviderad */
  background-color: #fffaf0;
}
.enrollment-badge {
  background: #28a745;
  color: white;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 10px;
  margin-left: 10px;
}
.education-details {
  margin-top: 10px;
  font-size: 14px;
  color: #6c757d;
}
.education-dates {
  margin-bottom: 5px;
}
.education-status {
  margin-bottom: 5px;
}
.status-enrolled {
  color: #28a745;
  font-weight: 500;
}
.status-active {
  color: #007bff;
  font-weight: 500;
}
.status-completed {
  color: #6c757d;
  font-weight: 500;
}
.status-dropped {
  color: #dc3545;
  font-weight: 500;
}
.status-reviderad {
    color: #ffc107;
    font-weight: 500;
}
.course-instance-info {
  margin-top: 5px;
  font-size: 12px;
  color: #495057;
  background: #f8f9fa;
  padding: 5px;
  border-radius: 4px;
}
.education-scroll-container {
  padding: 10px;
}
.drag-handle {
  cursor: move;
  font-size: 20px;
  color: #6c757d;
  margin-right: 8px;
  user-select: none;
}
.drag-handle:hover {
  color: #007bff;
}
.education-item {
  cursor: grab;
}
.education-item:active {
  cursor: grabbing;
}
.sortable-ghost {
  opacity: 0.4;
}
.sortable-chosen {
  cursor: grabbing !important;
}
</style>