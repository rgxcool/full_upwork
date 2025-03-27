<template>
  <div class="apl-board">
    <div
      v-for="status in statusMap"
      :key="status.key"
      class="column"
      :class="status.key.toLowerCase()"
      @dragover.prevent
      @drop="handleDrop($event, status.key)"
    >
      <h3>{{ status.label }}</h3>
      <div
        v-for="student in studentsByStatus[status.key]"
        :key="student._id"
        class="student-card"
        draggable="true"
        @dragstart="handleDragStart($event, student)"
        @click="openComments(student)"
        style="position: relative"
      >
        {{ student.name }}
        <span
          v-if="commentStatus(student)"
          class="comment-dot"
          :class="commentStatus(student)"
        ></span>
      </div>
    </div>

    <v-dialog v-model="dialog" max-width="500px" @update:modelValue="onDialogClose">
      <v-card>
        <v-card-title>Kommentarhistorik – {{ selectedStudent?.name }}</v-card-title>
        <v-card-text>
          <div v-if="selectedStudent?.commentHistory?.length">
            <div
              v-for="(entry, index) in selectedStudent.commentHistory"
              :key="index"
              class="comment-entry"
            >
              <p>
                <strong>{{ entry.author || 'Okänd' }}</strong> — {{ formatDate(entry.date) }}
              </p>
              <div class="comment-body">
                <div v-if="editingIndex === index">
                  <v-textarea
                    v-model="editedComment"
                    label="Redigera kommentar"
                    auto-grow
                    rows="2"
                  />
                  <v-btn color="success" small class="mt-1" @click="saveEditedComment">
                    Spara
                  </v-btn>
                  <v-btn small @click="cancelEdit">Avbryt</v-btn>
                </div>
                <div v-else>
                  <p>{{ entry.comment }}</p>
                  <div v-if="canEditComments" class="comment-actions">
                    <v-btn icon size="xxx-small" color="primary" @click.stop="editComment(index)">
                      <v-icon>mdi-pencil</v-icon>
                    </v-btn>
                    <v-btn icon size="xxx-small" color="error" @click.stop="deleteComment(index)">
                      <v-icon>mdi-minus</v-icon>
                    </v-btn>
                  </div>
                </div>
              </div>
              <hr v-if="index !== selectedStudent.commentHistory.length - 1" />
            </div>
          </div>
          <p v-else>Inga kommentarer än.</p>

          <div v-if="canComment">
            <v-textarea v-model="newComment" label="Lägg till kommentar" rows="3" auto-grow />
            <v-btn color="primary" class="mt-2" :disabled="!newComment" @click="submitComment">
              Spara kommentar
            </v-btn>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn color="secondary" @click="dialog = false">Stäng</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
  import { ref, onMounted, computed } from 'vue'
  import axios from 'axios'
  import { useStore } from 'vuex'
  const store = useStore()
  const currentUserId = computed(() => store.state.user?.id)
  const currentUser = computed(() => store.state.user)

  const roleRank = {
    guest: 0,
    user: 1,
    student: 2,
    coordinator: 3,
    specped: 4,
    syv: 5,
    teacher: 6,
    admin: 7,
    systemadmin: 8,
  }

  const canComment = computed(() => roleRank[currentUser.value?.role] >= roleRank['coordinator'])
  const canEditComments = computed(() => ['admin', 'systemadmin'].includes(currentUser.value?.role))

  const dialog = ref(false)
  const selectedStudent = ref(null)
  const newComment = ref('')
  const editingIndex = ref(null)
  const editedComment = ref('')
  const students = ref([])
  const draggedStudent = ref(null)

  const commentStatus = (student) => {
    const history = student.commentHistory || []
    const userId = currentUserId.value
    if (!history.length) return null
    const hasUnseen = history.some((comment) => !(comment.seenBy || []).includes(userId))
    return hasUnseen ? 'green' : 'yellow'
  }

  const openComments = async (student) => {
    selectedStudent.value = student
    newComment.value = ''
    dialog.value = true

    try {
      await axios.post(
        `${import.meta.env.VITE_API_URL}/api/students/${student._id}/mark-comments-seen`,
        {},
        { withCredentials: true }
      )
      // Locally update seenBy for currentUserId
      const index = students.value.findIndex((s) => s._id === student._id)
      if (index !== -1) {
        const updated = JSON.parse(JSON.stringify(students.value[index]))
        updated.commentHistory = updated.commentHistory.map((entry) => {
          if (!entry.seenBy?.includes(currentUserId.value)) {
            return {
              ...entry,
              seenBy: [...(entry.seenBy || []), currentUserId.value],
            }
          }
          return entry
        })
        students.value[index] = updated
      }
    } catch (err) {
      console.error('⚠️ Failed to mark comments as seen:', err)
    }
  }

  const onDialogClose = async (value) => {
    if (!value) {
      selectedStudent.value = null
    }
  }

  const cancelEdit = () => {
    editingIndex.value = null
    editedComment.value = ''
  }

  const editComment = (index) => {
    editingIndex.value = index
    editedComment.value = selectedStudent.value.commentHistory[index].comment
  }

  const saveEditedComment = async () => {
    if (editingIndex.value === null) return
    const updatedEntry = {
      ...selectedStudent.value.commentHistory[editingIndex.value],
      comment: editedComment.value,
    }
    try {
      await axios.put(
        `${import.meta.env.VITE_API_URL}/api/students/${selectedStudent.value._id}/comment`,
        { index: editingIndex.value, updatedEntry },
        { withCredentials: true }
      )
      selectedStudent.value.commentHistory[editingIndex.value] = updatedEntry
      editingIndex.value = null
      editedComment.value = ''
    } catch (err) {
      console.error('❌ Failed to update comment', err)
    }
  }

  const deleteComment = async (index) => {
    try {
      await axios.delete(
        `${import.meta.env.VITE_API_URL}/api/students/${selectedStudent.value._id}/comment`,
        { data: { index }, withCredentials: true }
      )
      selectedStudent.value.commentHistory.splice(index, 1)
    } catch (err) {
      console.error('❌ Failed to delete comment', err)
    }
  }

  const submitComment = async () => {
    if (!newComment.value) return
    try {
      await axios.post(
        `${import.meta.env.VITE_API_URL}/api/students/${selectedStudent.value._id}/comment`,
        { comment: newComment.value },
        { withCredentials: true }
      )
      selectedStudent.value.commentHistory.unshift({
        comment: newComment.value,
        author: currentUser.value.name,
        date: new Date(),
        seenBy: [currentUserId.value],
      })
      newComment.value = ''
    } catch (err) {
      console.error('❌ Failed to save comment:', err)
    }
  }

  const statusMap = [
    { key: 'GRAY', label: 'Ej börjat' },
    { key: 'RED', label: 'Praktik slut, ej närvarat' },
    { key: 'BLUE', label: 'Bokade för samtal' },
    { key: 'ORANGE', label: 'Är i fas' },
    { key: 'GREEN', label: 'Har kontrakt, skall gå eller har börjat praktik' },
  ]

  const fetchStudents = async () => {
    const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/students`, {
      withCredentials: true,
    })
    students.value = res.data
  }

  onMounted(fetchStudents)

  const studentsByStatus = computed(() => {
    return statusMap.reduce((acc, status) => {
      acc[status.key] = students.value.filter((s) => s.aplStatus === status.key)
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
        { aplStatus: newStatus },
        { withCredentials: true }
      )
      draggedStudent.value.aplStatus = newStatus
      students.value = [...students.value]
      draggedStudent.value = null
    } catch (err) {
      console.error('❌ Failed to update student APL status', err)
    }
  }

  const formatDate = (date) => new Date(date).toLocaleDateString()
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
  .column.white {
    background-color: #ffffff;
  }
  .student-card {
    background: white;
    padding: 8px;
    margin: 6px 0;
    border-radius: 4px;
    cursor: grab;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    position: relative;
  }
  .comment-entry {
    margin-bottom: 12px;
  }
  .comment-actions {
    display: flex;
    gap: 4px;
    margin-top: 4px;
  }
  .comment-dot {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }
  .comment-dot.green {
    background-color: #4caf50;
  }
  .comment-dot.yellow {
    background-color: #ffeb3b;
  }
</style>
