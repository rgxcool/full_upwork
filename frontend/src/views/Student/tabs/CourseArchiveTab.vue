<template>
  <div class="course-archive-container">
    <div v-if="student.education && student.education.length > 0">
      <div
        v-for="enrollment in student.education"
        :key="enrollment.enrollmentId"
        class="card enrollment-card"
      >
        <div class="card-header">
          <h4>{{ getEducationName(enrollment) }}</h4>
          <span class="enrollment-dates">
            {{ formatDate(enrollment.startDate) }} - {{ formatDate(enrollment.endDate) }}
          </span>
        </div>
        <div class="card-body">
          <DocumentSection
            :student="student"
            type="COURSE_ARCHIVE"
            :enrollment-id="enrollment.enrollmentId"
          />
        </div>
      </div>
    </div>
    <div v-else>
      <p>Studenten har inga kurser.</p>
    </div>
  </div>
</template>

<script>
import DocumentSection from '../../Admin/SearchTabs/DocumentSection.vue';

export default {
  name: 'CourseArchiveTab',
  components: {
    DocumentSection,
  },
  props: {
    student: {
      type: Object,
      required: true,
    },
  },
  setup() {
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

    return {
      getEducationName,
      formatDate,
    };
  },
};
</script>

<style scoped>
.course-archive-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.enrollment-card {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}
.card-header {
  background: #f8f9fa;
  padding: 15px 20px;
  border-bottom: 1px solid #dee2e6;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.card-header h4 {
  margin: 0;
  color: #2c3e50;
}
.enrollment-dates {
  color: #6c757d;
  font-size: 14px;
}
.card-body {
  padding: 0;
}
</style>