<template>
  <div class="scrollable-view">
    <section class="container py-4">
      <div v-if="studentsToGrade.length === 0" class="text-muted empty-state">
        <p>Inga elever att betygsätta just nu.</p>
      </div>
      <div v-if="studentsToGrade.length === 0" class="text-center text-muted py-5">
        <v-icon size="48">mdi-account-off</v-icon>
        <div class="mt-2">Inga elever att betygsätta just nu.</div>
      </div>
      <v-data-table
        :headers="headers"
        :items="formattedRows"
        class="elevation-1"
        item-value="id"
        disable-sort
      >
        <template #item.name="{ item }">
          {{ item.student.name }}
        </template>

        <template #item.courseCode="{ item }">
          {{ item.course.courseCode || '-' }}
        </template>

        <template #item.grade="{ item }">
          <v-select
            v-model="item.course.grade"
            :items="grades"
            label="Betyg"
            variant="outlined"
            density="compact"
            :disabled="item.course.locked"
            hide-details
          />
        </template>

        <template #item.reason="{ item }">
          <v-text-field
            v-model="item.course.reason"
            placeholder="Motivering"
            variant="outlined"
            density="compact"
            hide-details
          />
        </template>

        <template #item.comments="{ item }">
          <v-textarea
            v-model="item.course.comments"
            placeholder="Kommentar"
            auto-grow
            variant="outlined"
            density="compact"
            hide-details
          />
        </template>

        <template #item.save="{ item }">
          <v-btn color="success" size="small" @click="saveGrade(item.student._id, item.course)">
            Spara
          </v-btn>
        </template>

        <template #item.lock="{ item }">
          <v-checkbox
            v-model="item.course.locked"
            @change="toggleLock(item.student._id, item.course.refId, !item.course.locked)"
            density="compact"
            hide-details
            variant="outlined"
          />
        </template>
      </v-data-table>
    </section>
  </div>
</template>

<script setup>
  import { ref, onMounted, computed } from 'vue'
  import axios from 'axios'
  import { useStore } from 'vuex'

  const store = useStore()
  const isAdmin = computed(() => store.getters.isAdmin)
  const studentsToGrade = ref([])
  const grades = ['A', 'B', 'C', 'D', 'E', 'F']

  const headers = [
    { text: 'Elev', value: 'name' },
    { text: 'Kurs', value: 'courseCode' },
    { text: 'Betyg', value: 'grade' },
    { text: 'Motivering', value: 'reason' },
    { text: 'Kommentar', value: 'comments' },
    { text: 'Spara', value: 'save', sortable: false },
    { text: 'Lås', value: 'lock', sortable: false },
  ]

  const formattedRows = computed(() =>
    studentsToGrade.value.flatMap((student) =>
      student.coursesToGrade.map((course) => ({
        student,
        course,
        id: `${student._id}-${course.refId}`,
      }))
    )
  )

  const loadStudents = async () => {
    try {
      const { data } = await axios.get(`${import.meta.env.VITE_API_URL}/api/students-to-grade`, {
        withCredentials: true,
      })

      console.log('📦 Mottagna elever:', data)

      // Säkerställ att alla kurser har betygsdata (för Vue reaktivitet)
      data.forEach((student) => {
        student.education?.forEach((course) => {
          if (course.type === 'Course') {
            course.grade = course.grade || ''
            course.reason = course.reason || ''
            course.comments = course.comments || ''
            course.locked = course.locked || false
          }
        })
      })

      studentsToGrade.value = data
    } catch (err) {
      console.error('❌ Kunde inte hämta elever:', err)
      alert('Kunde inte ladda elever.')
    }
  }

  const shouldShowCourse = (course, student) => {
    return true
  }

  const saveGrade = async (studentId, course) => {
    const courseId = course.refId
    /*
  if (!course.type || !course.name) {
    alert("Kursen saknar information om typ eller namn.");
    return;
  }
*/
    try {
      await axios.post(
        `${import.meta.env.VITE_API_URL}/api/teacher/save-grade/`,
        {
          studentId,
          courseId,
          grade: course.grade,
          reason: course.reason,
          comments: course.comments,
          npScore: course.npScore,
          type: course.type,
        },
        { withCredentials: true }
      )

      alert('✅ Betyg sparat!')
      await loadStudents()
    } catch (err) {
      console.error('❌ Spara betyg misslyckades:', err.response?.data || err.message)
      alert('⚠️ Kunde inte spara betyg.')
    }
  }

  const toggleLock = async (studentId, courseId, isLocked) => {
    try {
      if (!isLocked) {
        await axios.post(
          `${import.meta.env.VITE_API_URL}/api/teacher/lock-grade`,
          {
            studentId,
            courseId,
          },
          { withCredentials: true }
        )

        alert('✅ Betyg låst!')
      } else if (isAdmin.value) {
        await axios.put(
          `${import.meta.env.VITE_API_URL}/api/admin/unlock-grade`,
          {
            studentId,
            courseId,
          },
          { withCredentials: true }
        )

        alert('✅ Betyg upplåst!')
      }
      await loadStudents()
    } catch (err) {
      console.error('Låsning/upplåsning misslyckades:', err)
      alert('⚠️ Kunde inte ändra låsstatus.')
    }
  }

  onMounted(loadStudents)
</script>

<style scoped>
  .empty-state {
    padding: 40px;
    font-size: 1.2rem;
    text-align: center;
    background: #fdfdfd;
    border: 1px dashed #ccc;
    border-radius: 8px;
  }

  .table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    background-color: #fff;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
    border-radius: 8px;
    overflow: hidden;
  }

  .table th {
    background-color: #f8f9fa;
    color: #333;
    font-weight: 600;
    padding: 12px;
    text-align: center;
    border-bottom: 2px solid #ddd;
  }

  .table td {
    padding: 10px;
    text-align: center;
    border-bottom: 1px solid #eee;
    vertical-align: middle;
  }

  tr:hover {
    background-color: #f5f5f5;
  }

  input[type='text'],
  textarea,
  select {
    width: 100%;
    padding: 6px 8px;
    font-size: 0.9rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    transition: border-color 0.3s, box-shadow 0.3s;
  }

  input[type='text']:focus,
  textarea:focus,
  select:focus {
    outline: none;
    border-color: #007bff;
    box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.15);
  }

  textarea {
    resize: vertical;
    min-height: 50px;
  }

  button.btn {
    padding: 6px 12px;
    border-radius: 4px;
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-success {
    background-color: #28a745;
    color: #fff;
    border: none;
  }
  .btn-success:hover {
    background-color: #218838;
  }

  input[type='checkbox'] {
    transform: scale(1.2);
  }

  .text-muted {
    color: #888;
    font-style: italic;
    padding: 20px;
    text-align: center;
  }

  tr.locked-row {
    background-color: #f0f0f0;
    opacity: 0.7;
  }
</style>
