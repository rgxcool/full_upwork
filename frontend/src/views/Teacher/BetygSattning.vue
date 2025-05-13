<template>
  <section>
    <div v-if="studentsToGrade.length === 0">
      <p class="text-muted">Inga elever att betygsätta just nu.</p>
    </div>

    <table v-if="studentsToGrade.length > 0" class="table">
  <thead>
    <tr>
      <th>Elev</th>
      <th>Kurs</th>
      <th>Betyg</th>
      <th>Motivering</th>
      <th>Kommentar</th>
      <th>Spara</th>
      <th>Lås</th>
    </tr>
  </thead>
  
  <tbody>
    <template v-for="student in studentsToGrade" :key="student._id">
      <template v-for="course in student.coursesToGrade" :key="course.refId">
        <tr v-if="shouldShowCourse(course, student)">
          <td>{{ student.name }}</td>
          <td>{{ course.courseCode || '-' }}</td>
          <td>
            <select v-model="course.grade" :disabled="course.locked">
              <option disabled value="">Välj betyg</option>
              <option v-for="g in grades" :key="g">{{ g }}</option>
            </select>
          </td>
          <td><input v-model="course.reason" placeholder="Motivering" /></td>
          <td><textarea v-model="course.comments" placeholder="Kommentar"></textarea></td>
          <td>
            <button class="btn btn-success" @click="saveGrade(student._id, course)">
              Spara
            </button>
          </td>
          <td>
            <input
              type="checkbox"
              :checked="course.locked"
              @click="toggleLock(student._id, course.refId, course.locked)"
            />
          </td>
        </tr>
      </template>
    </template>
  </tbody>
</table>

  </section>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import axios from 'axios';
import { useStore } from 'vuex';

const store = useStore();
const isAdmin = computed(() => store.getters.isAdmin);
const studentsToGrade = ref([]);
const grades = ['A', 'B', 'C', 'D', 'E', 'F'];

const loadStudents = async () => {
  try {
    const { data } = await axios.get(`${import.meta.env.VITE_API_URL}/api/students-to-grade`, {
      withCredentials: true,
    });

    console.log("📦 Mottagna elever:", data);


    // Säkerställ att alla kurser har betygsdata (för Vue reaktivitet)
    data.forEach(student => {
      student.education?.forEach(course => {
        if (course.type === 'Course') {
          course.grade = course.grade || '';
          course.reason = course.reason || '';
          course.comments = course.comments || '';
          course.locked = course.locked || false;
        }
      });
    });

    studentsToGrade.value = data;
  } catch (err) {
    console.error("❌ Kunde inte hämta elever:", err);
    alert("Kunde inte ladda elever.");
  }
};


const shouldShowCourse = (course, student) => {
  return true
};

const saveGrade = async (studentId, course) => {
  const courseId = course.refId;
/*
  if (!course.type || !course.name) {
    alert("Kursen saknar information om typ eller namn.");
    return;
  }
*/
  try {
    await axios.post(`${import.meta.env.VITE_API_URL}/api/teacher/save-grade/`, {
      studentId,
      courseId,
      grade: course.grade,
      reason: course.reason,
      comments: course.comments,
      npScore: course.npScore,
      type: course.type
    }, { withCredentials: true });

    alert("✅ Betyg sparat!");
    await loadStudents();
  } catch (err) {
    console.error("❌ Spara betyg misslyckades:", err.response?.data || err.message);
    alert("⚠️ Kunde inte spara betyg.");
  }
};


const toggleLock = async (studentId, courseId, isLocked) => {
  try {
    if (!isLocked) {
      await axios.post(`${import.meta.env.VITE_API_URL}/api/teacher/lock-grade`, {
        studentId,
        courseId
      }, { withCredentials: true });

      alert("✅ Betyg låst!");
    } else if (isAdmin.value) {
      await axios.put(`${import.meta.env.VITE_API_URL}/api/admin/unlock-grade`, {
        studentId,
        courseId
      }, { withCredentials: true });

      alert("✅ Betyg upplåst!");
    }
    await loadStudents();
  } catch (err) {
    console.error("Låsning/upplåsning misslyckades:", err);
    alert("⚠️ Kunde inte ändra låsstatus.");
  }
};

onMounted(loadStudents);
</script>

<style scoped>
.table {
  width: 100%;
  border-collapse: collapse;
}
.table th, .table td {
  border: 1px solid #ddd;
  padding: 8px;
  text-align: center;
}
input[type="text"], textarea, select {
  width: 100%;
}
</style>
