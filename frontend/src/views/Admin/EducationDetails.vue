<template>
  <div class="course-details">
    <h1>{{ course.courseName }}</h1>
    <div class="teacher-info">
      Lärare: 
      <router-link :to="`/detaljer/Lärare/${course.teacher._id}`">
        {{ course.teacher.username }}
      </router-link>
    </div>

    <h2>Elever</h2>
    <ul>
      <li v-for="student in course.students" :key="student._id">
        <router-link :to="`/detaljer/Elev/${student._id}`">
          {{ student.name }}
        </router-link>
      </li>
    </ul>
  </div>
</template>

<script>
import axios from 'axios'
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'

export default {
  setup() {
    const route = useRoute()
    const course = ref({ courseName: '', teacher: {}, students: [] })

    const fetchCourse = async () => {
      try {
        const { data } = await axios.get(`http://localhost:5001/api/details/Kurs/${route.params.id}`)
        course.value = data
      } catch (err) {
        console.error("❌ Kunde inte hämta kurs:", err)
      }
    }

    onMounted(fetchCourse)

    return { course }
  }
}
</script>

<style scoped>
.course-details {
  padding: 40px;
  max-width: 800px;
  margin: auto;
}

.teacher-info {
  margin: 10px 0 30px;
}

ul {
  list-style: none;
  padding: 0;
}

li {
  padding: 5px 0;
}
</style>
