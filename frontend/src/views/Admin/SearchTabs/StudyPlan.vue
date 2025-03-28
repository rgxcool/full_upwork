v<template>
    <div>
      <h2>{{ student.name }}</h2>
      <table class="table">
        <thead>
          <tr>
            <th>Kurs</th>
            <th>Status</th>
            <th>Startdatum</th>
            <th>Slutdatum</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="course in student.courses" :key="course._id">
            <td>{{ course.courseId?.courseCode }}</td>
            <td>
              <select v-model="course.status" @change="updateStatus(course)">
                <option v-for="s in statuses" :key="s" :value="s">{{ s }}</option>
              </select>
            </td>
            <td>{{ formatDate(course.startDate) }}</td>
            <td>{{ formatDate(course.endDate) }}</td>
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
  await axios.put(`/api/students/${student.value._id}/course/${course.courseId._id}/status`, {
    status: course.status,
  });
};

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
  </style>
  