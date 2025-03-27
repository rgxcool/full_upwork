<template>
  <div class="apl-board">
    <div
      v-for="status in statuses"
      :key="status"
      class="column"
      :class="status.toLowerCase()"
      @dragover.prevent
      @drop="handleDrop($event, status)"
    >
      <h3>{{ status }}</h3>
      <div
        v-for="student in studentsByStatus[status]"
        :key="student._id"
        class="student-card"
        draggable="true"
        @dragstart="handleDragStart($event, student)"
      >
        {{ student.name }}
      </div>
    </div>
  </div>
</template>

<script setup>
  import { ref, onMounted, computed } from 'vue'
  import axios from 'axios'

  const statuses = ['GRAY', 'RED', 'BLUE', 'ORANGE', 'GREEN']
  const students = ref([])
  const draggedStudent = ref(null)

  const fetchStudents = async () => {
    const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/students`)
    students.value = res.data
  }

  onMounted(fetchStudents)

  const studentsByStatus = computed(() => {
    return statuses.reduce((acc, status) => {
      acc[status] = students.value.filter((s) => s.aplStatus === status)
      return acc
    }, {})
  })

  const handleDragStart = (e, student) => {
    draggedStudent.value = student
  }

  const handleDrop = async (e, newStatus) => {
    if (!draggedStudent.value || draggedStudent.value.aplStatus === newStatus) return

    try {
      await axios.patch(
        `${import.meta.env.VITE_API_URL}/api/students/${draggedStudent.value._id}`,
        {
          aplStatus: newStatus,
        }
      )

      // Update local state
      draggedStudent.value.aplStatus = newStatus
      students.value = [...students.value]
      draggedStudent.value = null
    } catch (err) {
      console.error('Failed to update student APL status', err)
    }
  }
</script>

<style scoped>
  .apl-board {
    display: flex;
    gap: 16px;
    padding: 16px;
  }
  .column {
    flex: 1;
    padding: 10px;
    border-radius: 8px;
    min-height: 300px;
    background-color: #f1f1f1;
  }
  .column.gray {
    background-color: #d3d3d3;
  }
  .column.red {
    background-color: #f28b82;
  }
  .column.blue {
    background-color: #aecbfa;
  }
  .column.orange {
    background-color: #fdd663;
  }
  .column.green {
    background-color: #ccff90;
  }
  .student-card {
    background: white;
    padding: 8px;
    margin: 6px 0;
    border-radius: 4px;
    cursor: grab;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  }
</style>
