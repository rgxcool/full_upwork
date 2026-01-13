<template>
  <div class="students-tab">
    <h3>Elever</h3>
    <div v-if="loading" class="loading">
      <p>Laddar elever...</p>
    </div>
    <div v-else-if="error" class="error">
      <p>{{ error }}</p>
    </div>
    <div v-else-if="students && students.length > 0" class="students-list">
      <ul class="students-ul">
        <li v-for="student in students" :key="student._id" class="student-item">
          <router-link :to="`/student/${student._id}`" class="student-link">
            {{ student.name }}
          </router-link>
          <span v-if="student.email" class="student-email"> ({{ student.email }})</span>
        </li>
      </ul>
      <p class="student-count">Totalt: {{ students.length }} elev(er)</p>
    </div>
    <div v-else class="no-students">
      <p>Inga elever hittades för denna lärare.</p>
    </div>
  </div>
</template>

<script>
import { ref, onMounted } from 'vue';

export default {
  name: 'StudentsTab',
  props: {
    userData: {
      type: Object,
      default: null
    }
  },
  setup(props) {
    const students = ref([]);
    const loading = ref(false);
    const error = ref(null);

    onMounted(() => {
      if (props.userData && props.userData.students) {
        students.value = props.userData.students;
      } else {
        error.value = 'Ingen data tillgänglig';
      }
    });

    return {
      students,
      loading,
      error
    };
  }
};
</script>

<style scoped>
.students-tab {
  padding: 20px;
}

.students-tab h3 {
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

.students-list {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 20px;
}

.students-ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.student-item {
  padding: 12px 16px;
  margin-bottom: 8px;
  background: white;
  border-radius: 6px;
  border: 1px solid #e0e0e0;
  transition: all 0.2s ease;
}

.student-item:hover {
  background: #f5f5f5;
  border-color: #1976d2;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.student-link {
  color: #1976d2;
  text-decoration: none;
  font-weight: 500;
  font-size: 16px;
  transition: color 0.2s ease;
}

.student-link:hover {
  color: #1565c0;
  text-decoration: underline;
}

.student-email {
  color: #666;
  font-size: 14px;
  margin-left: 8px;
}

.student-count {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid #e0e0e0;
  color: #666;
  font-size: 14px;
  font-weight: 500;
}

.no-students {
  padding: 40px;
  text-align: center;
  color: #999;
  font-style: italic;
}
</style>
