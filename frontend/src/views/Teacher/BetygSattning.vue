<template>
  <section>
    <div v-if="studentsToGrade.length === 0">
        <p class="text-muted">Inga elever att betygsätta just nu.</p>
    </div>
    
    <table v-else class="table">
      <thead>
        <tr>
          <th>Elev</th>
          <th>Kurs</th>
          <th>Betyg</th>
          <th>Motivering</th>
          <th>Kommentar</th>
          <th>NP-poäng</th>
          <th>Lås</th>
        </tr>
      </thead>
    <tbody>
      <div v-for="student in studentsToGrade" :key="student._id">
      <tr
        v-for="course in student.courses"
        :key="student._id + '-' + course._id"
        v-if="shouldShowCourse(course, student)"
      >
        <td>{{ student.name }}</td>
        <td>{{ course.courseId?.courseCode || '-' }}</td>
        <td>
          <select v-model="course.grades.grade">
            <option disabled value="">Välj betyg</option>
            <option v-for="g in grades" :key="g">{{ g }}</option>
          </select>
        </td>
        <td><input v-model="course.grades.reason" placeholder="Motivering" /></td>
        <td><textarea v-model="course.grades.comments" placeholder="Kommentar" /></td>
        <td v-if="shouldShowNp(course)">
          <input type="number" v-model="course.grades.npScore" />
        </td>
        <td v-else>-</td>
        <td>
          <button
            v-if="!course.grades.locked && !isAdmin"
            @click="lockGrade(student._id, course.courseId?._id || course.courseId)"
            :disabled="!course.grades.grade || !course.grades.reason"
          >
            Lås
          </button>
          <span v-else-if="course.grades.locked">🔒 Låst</span>
          <button
            v-if="course.grades.locked && isAdmin"
            @click="unlockGrade(student._id, course.courseId._id)"
          >
            Lås upp
          </button>
        </td>
      </tr>
    </div>
    </tbody>
    </table>

  </section>
</template>


<script setup>
import { ref, onMounted, computed } from 'vue';
import { useStore } from 'vuex';
import axios from 'axios';

const store = useStore();
const userRole = computed(() => store.getters.userRole);
const isAdmin = computed(() => store.getters.isAdmin);

const activeTab = ref('betygsattning');
const studentsToGrade = ref([]);
const grades = ['A', 'B', 'C', 'D', 'E', 'F'];

const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString();

const shouldShowCourse = (course, student) => {
  if (!course || !student || !student.endDate) return false;
  if (!course.grades) course.grades = {}; // Se till att den finns!

  const today = new Date();
  const end = new Date(student.endDate);
  return end <= today && !course.grades?.grade;
};

const shouldShowNp = (course) => {
  const code = course.courseId?.courseCode?.toLowerCase() || '';
  return code.startsWith('sve') || code.startsWith('eng') || code.startsWith('mat');
};

const loadStudents = async () => {
  const { data } = await axios.get(`${import.meta.env.VITE_API_URL}/api/students-to-grade`, {
    withCredentials: true,
  });

  // Se till att varje course har grades-objekt
  data.forEach(student => {
    student.courses?.forEach(course => {
      if (!course.grades) {
        course.grades = {};
      }
    });
  });

  studentsToGrade.value = data;
};

const lockGrade = async (studentId, courseId) => {
  try {
    await axios.post(`${import.meta.env.VITE_API_URL}/api/teacher/lock-grade`, {
      studentId, courseId
  }, { withCredentials: true });

    await loadStudents();
  } catch (err) {
    console.error("❌ Axios error vid lockGrade:", err.response?.data || err.message);
  }
};

const unlockGrade = async (studentId, courseId) => {
  await axios.put(`${import.meta.env.VITE_API_URL}/api/admin/unlock-grade`, {
    studentId, courseId
  }, { withCredentials: true });

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
