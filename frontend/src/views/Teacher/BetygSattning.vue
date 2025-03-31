<template>
  <section class="tab-container">
    <div class="tab-menu">
      <ul>
        <li
          v-for="tab in tabs"
          :key="tab.key"
          :class="{ active: activeTab === tab.key }"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
        </li>
      </ul>
    </div>

    <div class="content">
      <div v-if="activeTab === 'betygsattning'">
        <h3>Betygsättning</h3>
        <div v-if="studentsToGrade.length">
          <table class="table">
            <thead>
              <tr>
                <th>Elev</th>
                <th>Kurs</th>
                <th>Slutdatum</th>
                <th>Betyg</th>
                <th>Motivering</th>
                <th>Kommentar</th>
                <th>NP-poäng</th>
                <th>Lås</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="student in studentsToGrade" :key="student._id">
              <template v-for="course in student.courses" :key="course._id">
                <tr v-if="shouldShowCourse(course)">
                  <td>{{ student.name }}</td>
                  <td>{{ course.courseId?.courseCode || '-' }}</td>
                  <td>{{ formatDate(course.endDate) }}</td>
                  <td>
                    <select v-model="course.grades.grade">
                      <option disabled value="">Välj betyg</option>
                      <option v-for="g in grades" :key="g">{{ g }}</option>
                    </select>
                  </td>
                  <td><input v-model="course.grades.reason" placeholder="Motivering" /></td>
                  <td><textarea v-model="course.grades.comments" placeholder="Kommentar" /></td>
                  <td><input type="number" v-model="course.grades.npScore" /></td>
                  <td>
                    <button v-if="!course.grades.locked && !isAdmin" @click="lockGrade(student._id, course.courseId._id)">Lås</button>
                    <span v-else-if="course.grades.locked">🔒 Låst</span>
                    <button v-if="course.grades.locked && isAdmin" @click="unlockGrade(student._id, course.courseId._id)">Lås upp</button>
                  </td>
                </tr>
              </template>
            </tr>

            </tbody>
          </table>
        </div>
        <div v-else>
          <p class="text-muted">Inga elever har kopplade kurser ännu.</p>
        </div>
      </div>

      <div v-if="activeTab === 'lastaBetyg'">
        <h3>Låsta betyg</h3>
        <!-- Visa låsta betyg här -->
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import axios from 'axios';

const tabs = [
  { key: 'betygsattning', label: 'Betygsättning' },
  { key: 'lastaBetyg', label: 'Låsta betyg' }
];

const activeTab = ref('betygsattning');
const studentsToGrade = ref([]);
const grades = ['A', 'B', 'C', 'D', 'E', 'F'];

const isAdmin = computed(() => ['admin', 'systemadmin'].includes(userRole.value));


const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString();

const shouldShowCourse = (course) => {
  const today = new Date();
  const end = new Date(course.endDate);
  return end <= today && !course.grades?.grade;
};

const loadStudents = async () => {
  const { data } = await axios.get(`${import.meta.env.VITE_API_URL}/api/students-to-grade`, {
  withCredentials: true,
});
  studentsToGrade.value = data;
};

const lockGrade = async (studentId, courseId) => {
  await axios.post(`${import.meta.env.VITE_API_URL}/api/teacher/lock-grade`, { studentId, courseId });
  await loadStudents();
};

const unlockGrade = async (studentId, courseId) => {
  await axios.put(`${import.meta.env.VITE_API_URL}/api/admin/unlock-grade`, { studentId, courseId });
  await loadStudents();
};

onMounted(loadStudents);
</script>

<style scoped>
.tab-container {
  padding: 20px;
  height: 70vh;
}
.tab-menu {
  display: flex;
  gap: 20px;
  padding-bottom: 10px;
}
.tab-menu ul {
  display: flex;
  list-style: none;
  padding: 0;
  margin: 0;
}
.tab-menu li {
  font-size: 18px;
  padding: 8px 16px;
  cursor: pointer;
  font-weight: bold;
  color: gray;
  transition: color 0.3s ease-in-out;
}
.tab-menu li.active {
  color: black;
  border-bottom: 3px solid black;
}
.content {
  margin-top: 20px;
  background: white;
  padding: 25px;
  border-radius: 15px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
}
.table {
  width: 100%;
  border-collapse: collapse;
}
.table th, .table td {
  border: 1px solid #ddd;
  padding: 8px;
  text-align: center;
}
</style>
