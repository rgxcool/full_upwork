<template>
    <div>
      <table class="table">
        <thead>
          <tr>
            <th>Kursnamn</th>
            <th>Kurskod</th>
            <th>Status</th>
            <th>Poäng</th>
            <th>Extent</th>
          </tr>
        </thead>
        <tbody>

          <tr v-for="course in student.courses" :key="course._id">
            <td>{{ course.courseId?.courseName || 'Ingen kursdata' }}</td>
            <td>{{ course.courseId?.courseCode || 'Ingen kursdata' }}</td>
            <td>
              <select v-model="course.status" @change="updateStatus(course)">
                <option disabled selected>Choose here</option>
                <option v-for="s in statuses" :key="s" :value="s">{{ s }}</option>
              </select>
            </td>
            <td>{{ course.courseId?.coursePoints || 'Ej angivet' }}</td>
            <td>{{ course.courseId?.courseExtent || 'Ej angivet' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </template>
<script setup>
import { computed } from 'vue';
import axios from 'axios';

const props = defineProps({
  userData: Object
});

const student = computed(() => props.userData || { courses: [] });

const statuses = ["Antagen", "Betygsatt", "Avbrott", "Ej påbörjad", "Reviderad"];

const updateStatus = async (course) => {
  const rawCourseId = course.courseId;
  const isObject = typeof rawCourseId === 'object';
  const finalCourseId = isObject ? rawCourseId._id : rawCourseId;

  console.log("🧪 Uppdaterar status för kurs:");
  console.log("📘 course:", course);
  console.log("🔍 course.courseId:", rawCourseId);
  console.log("🔍 typeof course.courseId:", typeof rawCourseId);
  console.log("✅ courseId som skickas till backend:", finalCourseId);

  try {
    const response = await axios.put(
      `http://localhost:5001/api/students/${student.value._id}/course/${finalCourseId}/status`,
      { status: course.status }
    );
    console.log("✅ Status uppdaterad:", response.data);
  } catch (err) {
    console.error("❌ Error updating status:", err.response?.data || err.message);
    alert("Kunde inte uppdatera kursstatus.");
  }
};



console.log("👤 Student data received:", student.value);


const formatDate = (date) => date ? new Date(date).toLocaleDateString() : '';


</script>

  
  <style scoped>
  .table {
    width: 100%;
    border-collapse: collapse;
  }
  .table th, .table td {
    border: 1px solid #ccc;
    padding: 0.5rem;
  }

  button, input, select, textarea, option {
  font: inherit;
  color: inherit;
  background: none;
  padding: 0;
  margin: 0;
  box-sizing: border-box;
}

select {
  min-width: 150px;
  width: 100%;
  box-sizing: border-box;
}
  </style>
  