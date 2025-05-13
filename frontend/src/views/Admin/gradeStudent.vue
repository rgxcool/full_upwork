<template>
    <section class="ungraded-section">
      <h2>Elever med obetygsatta utbildningar</h2>

      <a href="scrive.com"  target="_blank" class="btn btn-primary">Scrive</a>
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
              <button class="btn btn-primary" v-if="!row.grade" @click="setGrade(row)">Sätt betyg</button>
              <button v-if="row.grade && !row.locked" class="btn btn-success" @click="lockGrade(row)" :disabled="row.locked">Lås betyg</button>

            </td>
          </tr>
        </tbody>
      </table>
    </section>
  
    <div v-if="showGradeModal" class="modal">
    <div class="modal-content">
      <h3>Sätt betyg</h3>
      <form @submit.prevent="saveGrade">
        <label for="grade">Betyg</label>
        <select v-model="gradeData.grade" required>
          <option value="" disabled>Välj betyg</option>
          <option>A</option>
          <option>B</option>
          <option>C</option>
          <option>D</option>
          <option>E</option>
          <option>F</option>
        </select>
        <label for="comments">Kommentar</label>
        <textarea v-model="gradeData.comments"></textarea>
        <button type="submit">Spara betyg</button>
        <button type="button" @click="showGradeModal = false">Avbryt</button>
      </form>
    </div>
  </div>
  </template>
  
  <script setup>
  import { ref, computed, onMounted } from 'vue'
  import axios from 'axios'
  
  const students = ref([])
  const loading = ref(true)
  const showGradeModal = ref(false)
  const gradeData = ref({ studentId: '', courseId: '', grade: '', comments: '' })
  
  const flatRows = computed(() =>
    students.value.flatMap(student =>
      student.ungradedEducation.map(edu => ({
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
      console.error("Fel vid hämtning:", err)
    } finally {
      loading.value = false
    }
  }
  
  const setGrade = (row) => {
    gradeData.value.studentId = row.studentId
    gradeData.value.courseId = row.refId
    gradeData.value.grade = ''
    gradeData.value.comments = ''
    showGradeModal.value = true
  }
  
  const saveGrade = async () => {
    try {
        axios.post('http://localhost:5001/api/teacher/save-grade', gradeData.value, {
         withCredentials: true
        })
      showGradeModal.value = false
      fetchUngraded()  // Refresh the list after saving the grade
    } catch (error) {
      console.error('Fel vid sparande av betyg:', error)
    }
  }

  const lockGrade = async (row) => {
  // Logga för att kontrollera om du har rätt data
  console.log('Row:', row);

  try {
    // Skicka POST-begäran med endast studentId och refId
    await axios.post('http://localhost:5001/api/teacher/lock-grade', {
      studentId: row.studentId,  // studentId från row
      courseId: row.refId,       // refId från row
    }, {
      withCredentials: true,  // Skicka med cookies
    });

    // Uppdatera låsstatus direkt i din data utan att använda flatRows
    row.locked = true;  // Sätt locked till true för den specifika raden
  } catch (error) {
    console.error( error);
  }
};




  
  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString("sv-SE", {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
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
  