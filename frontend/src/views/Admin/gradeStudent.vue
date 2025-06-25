<template>
  <section class="ungraded-section">
    <h2>Elever med obetygsatta utbildningar</h2>

    <a href="scrive.com" target="_blank" class="btn btn-primary">Scrive</a>
    Signera betyg på Scrive och lås betyget efter signering.

    <div v-if="loading">Laddar...</div>
    <div v-else-if="students.length === 0">Inga obetygsatta elever hittades.</div>
    <table v-else class="ungraded-table">
      <thead>
        <tr>
          <th>Elevnamn</th>
          <th>Personnummer</th>
          <th>Utbildningstyp</th>
          <th>Utbildningsnamn</th>
          <th>Betyg</th>
          <th>Datum tillagd</th>
          <th>Åtgärder</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in flatRows" :key="`${row.studentId}-${row.refId}`">
          <td>{{ row.name }}</td>
          <td>{{ row.personalNumber }}</td>
          <td>{{ row.type }}</td>
          <td>{{ row.displayName }}</td>
          <td>
            <span v-if="!row.grade">Ej betygsatt</span>
            <span v-else>{{ row.grade }}</span>
          </td>
          <td>{{ formatDate(row.addedAt) }}</td>
          <td>
            <button class="btn btn-primary" v-if="!row.grade" @click="setGrade(row)">
              Sätt betyg
            </button>
            <button
              v-if="row.grade && !row.locked"
              class="btn btn-success"
              @click="lockGrade(row)"
              :disabled="row.locked"
            >
              Lås betyg
            </button>
            <button
              v-if="row.grade === 'F' && row.locked === true"
              class="btn btn-warning"
              @click="goToActionPlan(row)"
            >
              Skapa handlingsplan
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </section>

  <div v-if="showGradeModal" class="modal d-block" style="background: rgba(0, 0, 0, 0.5)">
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Sätt betyg</h5>
          <button type="button" class="btn-close" @click="showGradeModal = false"></button>
        </div>
        <form @submit.prevent="saveGrade">
          <div class="modal-body">
            <label>Betyg *</label>
            <select v-model="gradeData.grade" required>
              <option value="" disabled>Välj betyg</option>
              <option v-for="g in ['A', 'B', 'C', 'D', 'E', 'F']" :key="g">{{ g }}</option>
            </select>

            <label>Motivering *</label>
            <textarea v-model="gradeData.reason" required></textarea>

            <label>Kommentar</label>
            <textarea v-model="gradeData.comments"></textarea>

            <!-- NP-fält visas bara om kursen är SVE, ENG, MA -->
            <div v-if="isNationalCourse(gradeData.courseCode)">
              <label>Nationella prov-poäng *</label>
              <input v-model.number="gradeData.npScore" required type="number" min="0" />
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" @click="showGradeModal = false">
              Avbryt
            </button>
            <button type="submit" class="btn btn-primary" :disabled="!canSaveGrade()">
              Spara betyg
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
  import { ref, computed, onMounted } from 'vue'
  import { useRouter } from 'vue-router'

  import axios from 'axios'

  const students = ref([])
  const loading = ref(true)
  const showGradeModal = ref(false)
  const gradeData = ref({ studentId: '', courseId: '', grade: '', comments: '' })

  const router = useRouter()

  const goToActionPlan = (row) => {
    router.push(`/detaljer/Elev/${row.studentId}?showActionPlan=true`)
  }

  const flatRows = computed(() =>
    students.value.flatMap((student) =>
      [
        ...student.ungradedEducation,
        ...(student.lockedF || []), // bara om det finns
      ].map((edu) => ({
        ...edu,
        studentId: student.studentId,
        name: student.name,
        personalNumber: student.personalNumber,
        email: student.email,
      }))
    )
  )

  const fetchUngraded = async () => {
    try {
      const response = await axios.get('http://localhost:5001/api/students/ungraded')
      students.value = response.data
    } catch (err) {
      console.error('Fel vid hämtning:', err)
    } finally {
      loading.value = false
    }
  }

  function isNationalCourse(courseCode) {
    return ['SVE', 'ENG', 'MA'].some((sub) => courseCode && courseCode.startsWith(sub))
  }

  function canSaveGrade() {
    const isNational = isNationalCourse(gradeData.value.courseCode)
    return (
      gradeData.value.grade &&
      gradeData.value.reason &&
      (!isNational || (typeof gradeData.value.npScore === 'number' && gradeData.value.npScore >= 0))
    )
  }

  // När du öppnar modalen, sätt även courseCode!
  const setGrade = (row) => {
    gradeData.value.studentId = row.studentId
    gradeData.value.courseId = row.refId
    gradeData.value.courseCode = row.details?.courseCode ?? '' // <-- Ta med kurskoden!
    gradeData.value.grade = ''
    gradeData.value.reason = ''
    gradeData.value.comments = ''
    gradeData.value.npScore = null
    showGradeModal.value = true
  }

  const saveGrade = async () => {
    try {
      const { studentId, courseId, grade, reason, comments, npScore } = gradeData.value

      // Sending the grade data to the backend
      await axios.post('http://localhost:5001/api/teacher/save-grade', gradeData.value, {
        withCredentials: true,
      })

      // ✅ Update only the affected entry in the frontend's student data
      const student = students.value.find((s) => s.studentId === studentId)
      if (student) {
        // Find the education entry that matches the courseId
        const edu = [...(student.ungradedEducation || []), ...(student.lockedF || [])].find(
          (e) => e.refId === courseId
        )

        // If the course is found, update its grade and other details
        if (edu) {
          edu.grade = grade
          edu.reason = reason
          edu.comments = comments
          edu.npScore = npScore
        }
      }

      showGradeModal.value = false // Close the grade modal after the update
    } catch (error) {
      console.error('❌ Error saving grade:', error)
      // Optionally, add user-facing error handling, e.g., alert or UI feedback
    }
  }

  const lockGrade = async (row) => {
    try {
      const response = await axios.post(
        'http://localhost:5001/api/teacher/lock-grade',
        {
          studentId: row.studentId,
          courseId: row.refId,
        },
        { withCredentials: true }
      )

      // 🔁 Force reactive update
      const student = students.value.find((s) => s.studentId === row.studentId)
      if (student) {
        const educationList = [...(student.ungradedEducation || []), ...(student.lockedF || [])]
        const eduIndex = educationList.findIndex((e) => e.refId === row.refId)
        if (eduIndex !== -1) {
          educationList[eduIndex].locked = true
          // 🔄 Reassign the updated list to trigger reactivity
          if (student.ungradedEducation?.some((e) => e.refId === row.refId)) {
            student.ungradedEducation = [...educationList]
          } else if (student.lockedF?.some((e) => e.refId === row.refId)) {
            student.lockedF = [...educationList]
          }
        }
      }

      console.log(response.data.message)
    } catch (error) {
      console.error('❌ Error locking grade:', error)
    }
  }

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('sv-SE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  onMounted(async () => {
    fetchUngraded()
  })
</script>

<style scoped>
  .ungraded-section {
    padding: 30px;
  }

  .ungraded-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 20px;
  }

  .ungraded-table th,
  .ungraded-table td {
    border: 1px solid #ccc;
    padding: 0.75rem;
    text-align: left;
  }

  .ungraded-table th {
    background-color: #f0f0f0;
  }

  .modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .modal-content {
    background: white;
    padding: 20px;
    border-radius: 5px;
    width: 400px;
  }

  button {
    margin: 5px;
  }
</style>
