<template>
  <div class="scrollable-view">
    <div class="course-details">
      <h1>{{ course.courseName }}<span v-if="course.isCourseInstance && course.courseCode"> - {{ course.courseCode }}</span></h1>
      
      <div v-if="course.isCourseInstance" class="course-instance-info">
        <div class="info-item">
          <strong>Kurskod:</strong> {{ course.courseCode }}
        </div>
        <div v-if="course.startDate && course.endDate" class="info-item">
          <strong>Period:</strong> {{ formatDate(course.startDate) }} - {{ formatDate(course.endDate) }}
        </div>
        <div v-if="course.slutprovDate" class="info-item">
          <strong>Slutprovsdatum:</strong> {{ formatDate(course.slutprovDate) }}
        </div>
        <div v-if="course.mainCourseId" class="info-item">
          <strong>Huvudkurs:</strong> {{ course.mainCourseId?.courseName || 'Okänd' }}
        </div>
      </div>

      <div v-if="course.teacher && course.teacher._id" class="teacher-info">
        <strong>Ansvarig lärare:</strong>
        <router-link :to="`/detaljer/Lärare/${course.teacher._id}`">
          {{ course.teacher.username }}
        </router-link>
      </div>
      <div v-else-if="course.teachers && course.teachers.length > 0" class="teacher-info">
        <strong>Lärare:</strong>
        <span v-for="(teacher, index) in course.teachers" :key="teacher._id">
          <router-link :to="`/detaljer/Lärare/${teacher._id}`">
            {{ teacher.username }}
          </router-link>
          <span v-if="index < course.teachers.length - 1">, </span>
        </span>
      </div>
      <div v-else class="teacher-info">
        <strong>Lärare:</strong> Ingen ansvarig lärare tilldelad
      </div>

      <h2>Elever ({{ course.students?.length || 0 }})</h2>
      <div v-if="course.students && course.students.length > 0" class="students-list">
        <ul>
          <li v-for="student in course.students" :key="student._id">
            <router-link :to="`/student/${student._id}`">
              {{ student.name }}
            </router-link>
            <span v-if="student.email" class="student-email"> ({{ student.email }})</span>
          </li>
        </ul>
      </div>
      <div v-else class="no-students">
        Inga elever inskrivna i denna kurs
      </div>
    </div>
  </div>
</template>

<script>
import axios from 'axios'
import { ref, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'

export default {
  setup() {
    const route = useRoute()
    const course = ref({ courseName: '', teacher: null, teachers: [], students: [] })

    const formatDate = (date) => {
      if (!date) return ''
      return new Date(date).toLocaleDateString('sv-SE')
    }

    const fetchCourse = async () => {
      try {
        // Students are enrolled in CourseInstances, not Courses
        // Default to CourseInstance unless explicitly told otherwise
        const courseType = route.query.type === 'course' ? 'Kurs' : 'Kursinstans'
        console.log("🔍 Fetching course with ID:", route.params.id, "Type:", courseType)
        const { data } = await axios.get(`${import.meta.env.VITE_API_URL}/api/details/${courseType}/${route.params.id}`)
        console.log("✅ Course data received:", data)
        course.value = data
      } catch (err) {
        console.error("❌ Kunde inte hämta kurs:", err)
        console.error("❌ Error details:", err.response?.data)
        // If CourseInstance fails and we're not explicitly looking for a Course, try CourseInstance again
        if (route.query.type !== 'course' && err.response?.status === 404) {
          console.log("⚠️ CourseInstance not found, this might be a Course template (only viewable in /programsandcourses)")
        }
      }
    }

    onMounted(fetchCourse)
    
    watch(() => route.params.id, fetchCourse)

    return { course, formatDate }
  }
}
</script>

<style scoped>
.course-details {
  padding: 40px;
  max-width: 800px;
  margin: auto;
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

.teacher-info a {
  color: #007bff;
  text-decoration: none;
}

.teacher-info a:hover {
  text-decoration: underline;
}

h2 {
  margin-top: 30px;
  margin-bottom: 15px;
  color: #2c3e50;
}

.students-list ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.students-list li {
  padding: 10px;
  border-bottom: 1px solid #e9ecef;
  transition: background-color 0.2s;
}

.students-list li:hover {
  background-color: #f8f9fa;
}

.students-list li:last-child {
  border-bottom: none;
}

.students-list a {
  color: #007bff;
  text-decoration: none;
  font-weight: 500;
}

.students-list a:hover {
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
</style>
