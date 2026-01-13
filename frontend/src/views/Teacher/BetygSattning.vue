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
        class="elevation-1 grade-table"
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
    { title: 'Elev', key: 'name', sortable: false },
    { title: 'Kurs', key: 'courseCode', sortable: false },
    { title: 'Betyg', key: 'grade', sortable: false },
    { title: 'Motivering', key: 'reason', sortable: false },
    { title: 'Kommentar', key: 'comments', sortable: false },
    { title: 'Spara', key: 'save', sortable: false },
    { title: 'Lås', key: 'lock', sortable: false },
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

      console.log('📦 Mottagna elever från backend:', data)

      // Transform backend response to frontend expected format
      // Backend returns: [{ student, courseInstance, endDate, grade, enrollmentId, source }]
      // Frontend expects: [{ _id, name, coursesToGrade: [{ refId, courseCode, grade, ... }] }]
      
      const studentMap = new Map()
      
      data.forEach((item) => {
        const studentId = item.student?._id?.toString() || item.student?._id
        if (!studentId) {
          console.warn('⚠️ Item missing student ID:', item)
          return
        }
        
        // Get or create student entry
        if (!studentMap.has(studentId)) {
          studentMap.set(studentId, {
            _id: studentId,
            name: item.student?.name || 'Okänd elev',
            email: item.student?.email || '',
            coursesToGrade: []
          })
        }
        
        const student = studentMap.get(studentId)
        
        // Extract course information
        let courseData = null
        
        if (item.courseInstance) {
          // New enrollment-based data (from StudentEnrollment)
          const courseInstance = item.courseInstance
          const mainCourse = courseInstance.mainCourseId
          
          // Get course ID - handle both populated object and ObjectId
          let courseId
          if (mainCourse) {
            courseId = mainCourse._id?.toString() || mainCourse._id || courseInstance.mainCourseId?.toString() || courseInstance.mainCourseId
          } else {
            courseId = courseInstance.mainCourseId?.toString() || courseInstance.mainCourseId
          }
          
          courseData = {
            refId: courseId,
            courseCode: courseInstance.courseCode || mainCourse?.courseCode || '-',
            courseName: courseInstance.courseName || mainCourse?.courseName || 'Okänd kurs',
            grade: item.grade || '',
            reason: item.reason || '',
            comments: item.comments || '',
            locked: item.locked || false,
            type: 'Course',
            name: courseInstance.courseName || mainCourse?.courseName || 'Okänd kurs',
            endDate: item.endDate,
            enrollmentId: item.enrollmentId,
            source: 'enrollment'
          }
        } else if (item.source === 'student_education') {
          // Old education-based data (from Student.education)
          // The enrollmentId is the education entry _id, but courseRefId is the actual course ID
          courseData = {
            refId: item.courseRefId || item.enrollmentId, // Use courseRefId if available, fallback to enrollmentId
            courseCode: item.courseCode || '-',
            courseName: item.courseName || 'Kurs (från utbildning)',
            grade: item.grade || '',
            reason: '',
            comments: '',
            locked: false,
            type: 'Course',
            name: item.courseName || 'Kurs (från utbildning)',
            endDate: item.endDate,
            enrollmentId: item.enrollmentId,
            source: 'student_education'
          }
        }
        
        if (courseData) {
          // Initialize grade fields if missing
          courseData.grade = courseData.grade || ''
          courseData.reason = courseData.reason || ''
          courseData.comments = courseData.comments || ''
          courseData.locked = courseData.locked || false
          
          student.coursesToGrade.push(courseData)
        }
      })
      
      // Convert map to array and filter out students with no courses
      studentsToGrade.value = Array.from(studentMap.values()).filter(s => s.coursesToGrade.length > 0)
      
      console.log('✅ Transformerade elever:', studentsToGrade.value)
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

  /* Ensure table headers are visible and black - Vuetify 3 */
  :deep(.grade-table) {
    border-collapse: separate;
  }

  :deep(.grade-table .v-data-table__thead) {
    background-color: #f5f5f5 !important;
    display: table-header-group !important;
    visibility: visible !important;
  }

  :deep(.grade-table .v-data-table__thead tr) {
    display: table-row !important;
  }

  :deep(.grade-table .v-data-table__thead th) {
    color: #000000 !important;
    font-weight: 600 !important;
    font-size: 14px !important;
    background-color: #f5f5f5 !important;
    border-bottom: 2px solid #dee2e6 !important;
    padding: 12px 16px !important;
    display: table-cell !important;
    visibility: visible !important;
    opacity: 1 !important;
  }

  :deep(.grade-table .v-data-table-header__content) {
    color: #000000 !important;
    font-weight: 600 !important;
    visibility: visible !important;
    opacity: 1 !important;
  }

  :deep(.grade-table .v-data-table-header__title) {
    color: #000000 !important;
    font-weight: 600 !important;
    visibility: visible !important;
    opacity: 1 !important;
  }

  /* Fallback for any th elements */
  :deep(.grade-table th) {
    color: #000000 !important;
    font-weight: 600 !important;
    display: table-cell !important;
    visibility: visible !important;
    opacity: 1 !important;
    background-color: #f5f5f5 !important;
  }
</style>
