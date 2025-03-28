<template>
  <div class="apl-board">
    <div
      v-if="copied"
      class="copied-floating"
      :style="{ top: copiedPosition.y + 'px', left: copiedPosition.x + 'px' }"
    >
      Kopierat
    </div>

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
      >
        {{ student.name }}
        <v-icon
          v-if="commentStatus(student)"
          :class="['comment-icon', { pulse: commentStatus(student) === 'unseen' }]"
          :color="commentStatus(student) === 'unseen' ? 'blue' : 'green'"
          size="24"
          title="Kommentarstatus"
        >
          {{ commentStatus(student) === 'unseen' ? 'mdi-note-text' : 'mdi-pencil' }}
        </v-icon>
      </div>
    </div>

    <v-dialog v-model="dialog" max-width="500px">
      <v-card v-if="selectedStudent" class="dialog-card">
        <v-btn icon class="dialog-close-btn" @click="closeDialog">
          <v-icon>mdi-close</v-icon>
        </v-btn>

        <v-card-title>
          <span
            :class="{ clickable: true, blinkGreen: blinkedField === 'name' }"
            @click="handleCopy(selectedStudent?.name, 'name', $event)"
          >
            <div>{{ selectedStudent?.name }}</div>
          </span>
        </v-card-title>

        <v-card-subtitle style="margin-top: 0 px">
          <div class="contact-info">
            <span
              :class="{ clickable: true }"
              @click="handleCopy(selectedStudent?.email, 'email', $event)"
            >
              {{ selectedStudent?.email }}
            </span>
            <br />
            <span
              :class="{ clickable: true }"
              @click="handleCopy(selectedStudent?.phone, 'phone', $event)"
            >
              <div class="mb-2">{{ selectedStudent?.phone }}</div>
            </span>
          </div>
        </v-card-subtitle>
        <div
          v-for="(entry, index) in selectedStudent.commentHistory"
          :key="index"
          class="comment-entry"
        >
          <div class="comment-header">
            <span>{{ entry.author || 'Okänd' }}</span>
            <span>{{ formatDate(entry.date) }}</span>
          </div>

          <div class="comment-box">
            <div v-if="editingIndex === index">
              <v-textarea v-model="editedComment" label="Redigera kommentar" auto-grow rows="2" />
              <v-btn color="success" small class="ml-2 mr-10 mt-1" @click="saveEditedComment">
                Spara
              </v-btn>
              <v-btn small @click="cancelEdit">Avbryt</v-btn>
            </div>
            <div v-else>
              <div class="comment-body">
                <p>{{ entry.comment }}</p>
                <div v-if="canEditComments" class="comment-actions">
                  <div class="edit-btn">
                    <v-btn size="24" icon color="primary" @click.stop="editComment(index)">
                      <v-icon :size="16">mdi-pencil</v-icon>
                    </v-btn>
                  </div>
                  <div class="delete-btn">
                    <v-btn size="24" icon color="error" @click.stop="deleteComment(index)">
                      <v-icon :size="16">mdi-minus</v-icon>
                    </v-btn>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="comment-entry" v-if="canComment">
          <v-textarea v-model="newComment" label="Lägg till kommentar" rows="3" auto-grow />

          <div class="button-row">
            <v-btn class="ml-3" small color="green" @click="submitComment">Spara</v-btn>
            <v-btn class="mr-3" small color="primary" @click="closeDialog">Stäng</v-btn>
          </div>
        </div>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
  import { ref, onMounted, computed } from 'vue'
  import axios from 'axios'
  import { useStore } from 'vuex'

  const store = useStore()
  const currentUser = computed(() => store.state.user)
  const currentUserId = computed(() => store.state.user?.userId?.toString() || '')

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

  const copied = ref(false)
  const blinkedField = ref('')
  const copiedPosition = ref({ x: 0, y: 0 })

  const handleCopy = async (text, field, event) => {
    try {
      if (!text) return
      await navigator.clipboard.writeText(text)

      // Flash at pointer
      copied.value = true
      blinkedField.value = field

      const buffer = 12
      copiedPosition.value = {
        x: event.clientX + buffer,
        y: event.clientY + buffer,
      }

      setTimeout(() => {
        copied.value = false
        blinkedField.value = ''
      }, 600)
    } catch (err) {
      console.error('❌ Failed to copy to clipboard:', err)
    }
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

  const statusMap = [
    { key: 'GRAY', label: 'Ej börjat' },
    { key: 'RED', label: 'Praktik slut, ej närvarat' },
    { key: 'BLUE', label: 'Bokade för samtal' },
    { key: 'ORANGE', label: 'Är i fas' },
    { key: 'GREEN', label: 'Har kontrakt, skall gå eller har börjat praktik' },
  ]

  const commentStatus = (student) => {
    const history = student.commentHistory || []
    const userId = currentUserId.value
    if (!history.length) return null

    const hasUnseen = history.some(
      (c) => !(c.seenBy || []).map((id) => id.toString()).includes(userId)
    )

    return hasUnseen ? 'unseen' : 'seen'
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

      const userId = currentUserId.value

      const markSeen = (s) => {
        s.commentHistory = (s.commentHistory || []).map((c) => ({
          ...c,
          seenBy: Array.isArray(c.seenBy)
            ? [...new Set([...c.seenBy.map(String), userId])]
            : [userId],
        }))
      }

      markSeen(selectedStudent.value)
      const index = students.value.findIndex((s) => s._id === student._id)
      if (index !== -1) markSeen(students.value[index])
    } catch (err) {
      console.error('⚠️ Failed to mark comments as seen:', err)
    }
  }

  const closeDialog = () => {
    dialog.value = false
    setTimeout(() => {
      selectedStudent.value = null
    }, 99) // matches v-dialog close transition
  }

  const submitComment = async () => {
    if (!newComment.value) return
    try {
      const { data } = await axios.post(
        `${import.meta.env.VITE_API_URL}/api/students/${selectedStudent.value._id}/comment`,
        { comment: newComment.value },
        { withCredentials: true }
      )

      const userId = currentUserId.value

      const patchedHistory = (data.commentHistory || []).map((c) => ({
        ...c,
        seenBy: Array.isArray(c.seenBy)
          ? [...new Set([...c.seenBy.map(String), userId])]
          : [userId],
      }))

      selectedStudent.value.commentHistory = patchedHistory
      const index = students.value.findIndex((s) => s._id === selectedStudent.value._id)
      if (index !== -1) students.value[index].commentHistory = patchedHistory

      newComment.value = ''
    } catch (err) {
      console.error('❌ Failed to save comment:', err)
    }
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

      selectedStudent.value.commentHistory[editingIndex.value].comment = editedComment.value
      const index = students.value.findIndex((s) => s._id === selectedStudent.value._id)
      if (index !== -1) {
        students.value[index].commentHistory[editingIndex.value].comment = editedComment.value
      }

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

      // ❗ Clone the arrays to avoid shared references
      const newHistory = [...selectedStudent.value.commentHistory]
      newHistory.splice(index, 1)
      selectedStudent.value.commentHistory = newHistory

      const i = students.value.findIndex((s) => s._id === selectedStudent.value._id)
      if (i !== -1) {
        students.value[i].commentHistory = [...newHistory] // clone here too
      }
    } catch (err) {
      console.error('❌ Failed to delete comment', err)
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

  const fetchStudents = async () => {
    try {
      const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/students`, {
        withCredentials: true,
      })

      console.log(
        '🧩 Raw commentHistory from API:',
        res.data.map((s) => ({
          name: s.name,
          history: (s.commentHistory || []).map((c) => c.seenBy),
        }))
      )

      students.value = res.data.map((student) => ({
        ...student,
        commentHistory: (student.commentHistory || []).map((comment) => ({
          ...comment,
          seenBy: (comment.seenBy || []).map((id) => id.toString()),
        })),
      }))

      console.log(
        '🎯 Normalized commentHistory:',
        students.value.map((s) => ({
          name: s.name,
          history: s.commentHistory.map((c) => c.seenBy),
        }))
      )
    } catch (err) {
      console.error('❌ Failed to fetch students:', err)
    }
  }

  onMounted(() => {
    console.log('🧠 currentUser:', currentUser.value)
    console.log('🆔 currentUserId:', currentUserId.value)
    fetchStudents()
  })

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
      await fetchStudents()
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
  .tight-title {
    margin-bottom: 0;
    padding-bottom: 0;
    line-height: 0;
  }
  .student-card {
    position: relative; /* ✅ required for absolute positioning of icon */
    background: white;
    padding: 8px;
    margin: 6px 0;
    border-radius: 3px;
    cursor: grab;
  }
  .comment-entry {
    margin-bottom: 16px;
    border: 1px solid rgb(194, 187, 187);
    overflow: hidden;
    background-color: #fafafa;
  }

  .comment-header {
    background: #f0f0f0;
    padding: 8px 12px;
    font-size: 0.95rem;
    border-style: 1px solid white;
    border-bottom: 1px solid white;
    display: flex;
    justify-content: space-between;
    color: #333;
  }

  .comment-box {
    border: 1px solid;
    padding: 10px 12px;
    font-size: 0.95rem;
  }

  .comment-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .edit-btn {
    flex: 1;
    text-align: left;
  }

  .delete-btn {
    flex: 1;
    text-align: right;
  }

  .comment-icon {
    position: absolute;
    top: 8px;
    right: 10px;
    transition: transform 0.3s ease;
  }

  .pulse {
    animation: pulse 1.5s infinite;
  }

  @keyframes pulse {
    0% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.3);
    }
    100% {
      transform: scale(1);
    }
  }
  .copied-floating {
    position: fixed;
    z-index: 9999;
    background: #4caf50;
    font-weight: bold;
    padding: 4px 10px;
    border-radius: 4px;
    pointer-events: none;
    font-size: 13px;
    color: white;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    animation: fadeAway 1s;
  }

  @keyframes fadeAway {
    0% {
      opacity: 0;
      transform: scale(0.9);
    }
    50% {
      opacity: 1;
      transform: scale(1);
    }
    100% {
      opacity: 0;
      transform: scale(0.95);
    }
  }

  .clickable {
    cursor: pointer;
    text-decoration: underline;
    color: #1976d2;
    transition: all 0.3s ease;
  }

  .clickable:hover {
    color: #0fce19; /* Strong green */
  }

  .blinkGreen {
    animation: flash-green 0.6s;
  }

  @keyframes fade-green-reverse {
    0% {
      background-color: #c8e6c9;
      color: #2e7d32;
    }
    100% {
      background-color: transparent;
      color: inherit;
    }
  }

  @keyframes flash-green {
    0% {
      background-color: #c8e6c9;
      color: #2e7d32;
    }
    100% {
      background-color: transparent;
      color: inherit;
    }
  }
  .contact-info {
    margin-top: 0px;
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
  .comment-dot-blue {
    background-color: #009688;
  }
  .comment-dot.purple {
    background-color: #74016a;
  }
  .btn .no-margin-title {
    margin-bottom: 0 !important;
    display: inline-block;
  }
  .button-row {
    display: flex;
    justify-content: space-between;
    margin-top: 8px;
  }
  .right {
    float: right;
    width: 300px;
    border: 3px solid #73ad21;
    padding: 10px;
  }
  .dialog-card {
    position: relative;
  }

  .dialog-close-btn {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 10;
    background-color: transparent;
    color: #666;
  }

  .dialog-close-btn:hover {
    color: #000;
  }
</style>
