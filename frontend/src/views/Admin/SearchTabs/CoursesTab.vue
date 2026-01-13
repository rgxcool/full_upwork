<template>
  <div class="courses-tab">
    <h3>Ansvariga kurser</h3>
    <div v-if="loading" class="loading">
      <p>Laddar kurser...</p>
    </div>
    <div v-else-if="error" class="error">
      <p>{{ error }}</p>
    </div>
    <div v-else-if="courseInstances && courseInstances.length > 0" class="courses-section">
      <h4>Kursinstanser</h4>
      <ul class="courses-list">
        <li v-for="instance in courseInstances" :key="instance._id" class="course-item">
          <router-link 
            :to="`/education/${instance._id}?type=instance`" 
            class="course-link"
          >
            <div class="course-name">{{ instance.courseName }}</div>
            <div class="course-details">
              <span class="course-code">{{ instance.courseCode }}</span>
              <span v-if="instance.startDate && instance.endDate" class="course-dates">
                {{ formatDate(instance.startDate) }} - {{ formatDate(instance.endDate) }}
              </span>
            </div>
          </router-link>
        </li>
      </ul>
    </div>
    <div v-else class="no-courses">
      <p>Inga kurser tilldelade</p>
    </div>
  </div>
</template>

<script>
import { ref, onMounted } from 'vue';

export default {
  name: 'CoursesTab',
  props: {
    userData: {
      type: Object,
      default: null
    }
  },
  setup(props) {
    const courseInstances = ref([]);
    const loading = ref(false);
    const error = ref(null);

    const formatDate = (dateString) => {
      if (!dateString) return '';
      const date = new Date(dateString);
      return date.toLocaleDateString('sv-SE');
    };

    onMounted(() => {
      if (props.userData && props.userData.courseInstances) {
        courseInstances.value = props.userData.courseInstances;
      } else {
        error.value = 'Ingen data tillgänglig';
      }
    });

    return {
      courseInstances,
      loading,
      error,
      formatDate
    };
  }
};
</script>

<style scoped>
.courses-tab {
  padding: 20px;
}

.courses-tab h3 {
  margin-bottom: 20px;
  font-size: 24px;
  font-weight: 600;
  color: #2c3e50;
}

.loading,
.error {
  padding: 20px;
  text-align: center;
  color: #666;
}

.error {
  color: #d32f2f;
}

.courses-section {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 20px;
}

.courses-section h4 {
  margin-bottom: 16px;
  font-size: 18px;
  font-weight: 600;
  color: #2c3e50;
}

.courses-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.course-item {
  margin-bottom: 12px;
  background: white;
  border-radius: 6px;
  border: 1px solid #e0e0e0;
  transition: all 0.2s ease;
  overflow: hidden;
}

.course-item:hover {
  border-color: #1976d2;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.course-link {
  display: block;
  padding: 16px;
  text-decoration: none;
  color: inherit;
}

.course-name {
  font-weight: 600;
  font-size: 16px;
  color: #2c3e50;
  margin-bottom: 8px;
}

.course-details {
  display: flex;
  gap: 16px;
  font-size: 14px;
  color: #666;
}

.course-code {
  font-weight: 500;
  color: #1976d2;
}

.course-dates {
  color: #999;
}

.no-courses {
  padding: 40px;
  text-align: center;
  color: #999;
  font-style: italic;
}
</style>
