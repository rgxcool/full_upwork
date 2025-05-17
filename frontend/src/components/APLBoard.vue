<template>
  <div class="summary centered">
    <h2>📊 APL Statusöversikt</h2>
    <table>
      <tbody>
        <tr v-for="status in statusMap" :key="status.key">
          <td>{{ status.label }}:</td>
          <td>
            <strong>{{ statusCounts[status.key] }}</strong>
          </td>
        </tr>
        <tr>
          <td colspan="2" style="padding-top: 6px">
            Totalt antal studenter: <strong>{{ totalStudents }}</strong>
          </td>
        </tr>
      </tbody>
    </table>
    <div class="comment-order-toggle">
      <label>
        <input type="checkbox" v-model="commentAscOrder" />
        Visa senaste kommentar längst ner
      </label>
    </div>
  </div>
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
        v-for="student in studentsByStatus[status.key] || []"
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
    <v-dialog v-model="dialog" max-width="600px">
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
        <v-card-subtitle style="margin-top: 0px">
          <div class="contact-info">
            <span
              :class="{ clickable: true }"
              @click="handleCopy(selectedStudent?.email, 'email', $event)"
              >{{ selectedStudent?.email }}</span
            >
            <br />
            <span
              :class="{ clickable: true }"
              @click="handleCopy(selectedStudent?.phone, 'phone', $event)"
            >
              <div class="mb-2">{{ selectedStudent?.phone }}</div>
            </span>
          </div>
        </v-card-subtitle>

        <FileUploaderDownloader
          v-if="selectedStudent"
          :studentId="selectedStudent._id"
          :studentName="selectedStudent.name"
        />

        <div class="comment-history-scroll" ref="commentContainerRef">
          <template v-for="(entry, index) in getSortedComments" :key="index">
            <div class="comment-entry">
              <div class="comment-header">
                <div>
                  <strong>{{ entry.author || 'Okänd' }}</strong>
                </div>
                <div class="comment-actions">
                  <span>{{ formatDate(entry.date) }}</span>
                </div>
              </div>
              <div class="comment-box" v-if="editingIndex !== index">
                {{ entry.comment }}
              </div>
              <v-textarea
                v-else
                v-model="editedComment"
                auto-grow
                label="Redigera kommentar"
                rows="2"
                class="mb-2"
              />
              <div class="button-row">
                <v-btn
                  v-if="editingIndex === index"
                  color="green"
                  small
                  @click="saveEditedComment(index)"
                >
                  <v-icon left>mdi-content-save</v-icon> Spara
                </v-btn>
                <v-btn v-if="editingIndex === index" color="grey" small @click="cancelEdit">
                  <v-icon left>mdi-cancel</v-icon> Avbryt
                </v-btn>
                <v-btn
                  v-if="editingIndex !== index"
                  color="yellow darken-2"
                  icon
                  @click="editComment(index)"
                >
                  <v-icon>mdi-comment-edit</v-icon>
                </v-btn>
                <v-btn color="red" icon @click="confirmDelete(index)" v-if="canDelete(entry)">
                  <v-icon>mdi-delete</v-icon>
                </v-btn>
              </div>
            </div>
          </template>

          <div v-if="canComment" class="mt-4">
            <v-textarea v-model="newComment" label="Lägg till kommentar" rows="3" auto-grow />
          </div>
        </div>

        <div class="button-row">
          <v-btn class="ml-3" small color="green" @click="submitComment">Spara</v-btn>
          <v-btn class="mr-3" small color="primary" @click="closeDialog">Stäng</v-btn>
        </div>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
  import { ref, computed, onMounted, nextTick } from 'vue'
  import axios from 'axios'
  import { useStore } from 'vuex'
  import FileUploaderDownloader from '../components/FileUploaderDownloder.vue'

  const store = useStore()
  const currentUser = computed(() => store.state.user)
  console.log('Current user:', currentUser.value)

  console.log('Role:', currentUser.value?.role)
  const currentUserId = computed(() => store.state.user?.userId?.toString() || '')
  console.log('Current user ID:', currentUserId.value)
  const totalStudents = computed(() => students.value.length)

  const commentAscOrder = ref(true)
  const copied = ref(false)
  const blinkedField = ref('')
  const copiedPosition = ref({ x: 0, y: 0 })
  const dialog = ref(false)
  const selectedStudent = ref(null)
  const newComment = ref('')
  const editingIndex = ref(null)
  const editedComment = ref('')
  const students = ref([])
  const draggedStudent = ref(null)
  const commentContainerRef = ref(null)

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

  const statusMap = [
    { key: 'GRAY', label: 'Ej börjat' },
    { key: 'RED', label: 'Praktik slut, ej närvarat' },
    { key: 'BLUE', label: 'Bokade för samtal' },
    { key: 'YELLOW', label: 'Är i fas' },
    { key: 'GREEN', label: 'Har kontrakt, skall gå eller har börjat praktik' },
  ]

  const studentsByStatus = computed(() => {
    if (!Array.isArray(students.value)) return {}
    return statusMap.reduce((acc, status) => {
      acc[status.key] = students.value.filter((s) => s.aplStatus === status.key)
      return acc
    }, {})
  })

  const statusCounts = computed(() => {
    return statusMap.reduce((acc, status) => {
      acc[status.key] = students.value.filter((s) => s.aplStatus === status.key).length
      return acc
    }, {})
  })

  const commentStatus = (student) => {
    const history = student.commentHistory || []
    const userId = currentUserId.value
    if (!history.length) return null
    const hasUnseen = history.some(
      (c) => !(c.seenBy || []).map((id) => id.toString()).includes(userId)
    )
    return hasUnseen ? 'unseen' : 'seen'
  }

  const handleCopy = async (text, field, event) => {
    try {
      if (!text) return
      await navigator.clipboard.writeText(text)
      copied.value = true
      blinkedField.value = field
      copiedPosition.value = { x: event.clientX + 12, y: event.clientY + 12 }
      setTimeout(() => {
        copied.value = false
        blinkedField.value = ''
      }, 600)
    } catch (err) {
      console.error('❌ Failed to copy to clipboard:', err)
    }
  }

  const fetchStudents = async () => {
    try {
      const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/students`, {
        withCredentials: true,
      })
      students.value = res.data.map((student) => ({
        ...student,
        commentHistory: (student.commentHistory || []).map((comment) => ({
          ...comment,
          seenBy: (comment.seenBy || []).map((id) => id.toString()),
        })),
      }))
    } catch (err) {
      console.error('❌ Failed to fetch students:', err)
    }
  }

  onMounted(() => {
    fetchStudents()
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

  const openComments = async (student) => {
    selectedStudent.value = student
    newComment.value = ''
    dialog.value = true
    await nextTick()
    scrollToLatest()

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

  const getSortedComments = computed(() => {
    if (!selectedStudent.value) return []
    const comments = [...(selectedStudent.value.commentHistory || [])]
    return comments.sort((a, b) =>
      commentAscOrder.value
        ? new Date(a.date) - new Date(b.date)
        : new Date(b.date) - new Date(a.date)
    )
  })

  const shouldShowDateSeparator = (index) => {
    const sorted = getSortedComments.value
    if (index === 0) return true
    const current = new Date(sorted[index].date).toDateString()
    const prev = new Date(sorted[index - 1].date).toDateString()
    return current !== prev
  }

  const formatDate = (date) => {
    const d = new Date(date)
    return (
      d.toLocaleDateString() +
      ' ' +
      d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    )
  }

  const scrollToLatest = () => {
    const el = commentContainerRef.value
    if (el) el.scrollTop = el.scrollHeight
  }

  const canComment = computed(() => roleRank[currentUser.value?.role] >= roleRank['coordinator'])
  console.log('Role rank:', roleRank[currentUser.value?.role])
  const closeDialog = () => {
    dialog.value = false
    setTimeout(() => {
      selectedStudent.value = null
    }, 99)
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

  const deleteComment = async (index) => {
    try {
      await axios.delete(
        `${import.meta.env.VITE_API_URL}/api/students/${selectedStudent.value._id}/comment`,
        { data: { index }, withCredentials: true }
      )
      const newHistory = [...selectedStudent.value.commentHistory]
      newHistory.splice(index, 1)
      selectedStudent.value.commentHistory = newHistory
      const i = students.value.findIndex((s) => s._id === selectedStudent.value._id)
      if (i !== -1) students.value[i].commentHistory = [...newHistory]
    } catch (err) {
      console.error('❌ Failed to delete comment', err)
    }
  }
  const canDelete = (entry) => {
    return (
      entry.author?.toString() === currentUser.value?.name ||
      roleRank[currentUser.value?.role] >= roleRank['admin']
    )
  }

  const confirmDelete = (index) => {
    if (confirm('Är du säker på att du vill ta bort denna kommentar?')) {
      console.log('🗑️ Comment deleted by:', currentUser.value?.name || currentUserId.value)
      deleteComment(index)
    }
  }
  const editComment = (index) => {
    editingIndex.value = index
    editedComment.value = getSortedComments.value[index].comment
  }

  const cancelEdit = () => {
    editingIndex.value = null
    editedComment.value = ''
  }

  const saveEditedComment = async (index) => {
    try {
      const updatedEntry = {
        ...getSortedComments.value[index],
        comment: editedComment.value,
      }
      await axios.put(
        `${import.meta.env.VITE_API_URL}/api/students/${selectedStudent.value._id}/comment`,
        { index, updatedEntry },
        { withCredentials: true }
      )
      selectedStudent.value.commentHistory[index].comment = editedComment.value
      const i = students.value.findIndex((s) => s._id === selectedStudent.value._id)
      if (i !== -1) {
        students.value[i].commentHistory[index].comment = editedComment.value
      }
      editingIndex.value = null
      editedComment.value = ''
    } catch (err) {
      console.error('❌ Failed to update comment', err)
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

  .column.yellow {
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
    position: relative;
    /* ✅ required for absolute positioning of icon */
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
    color: #0fce19;
    /* Strong green */
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

  .comment-history-scroll {
    max-height: 500px;
    overflow-y: auto;
    padding-right: 6px;
    /* give space for scrollbar */
  }

  .comment-history-scroll::-webkit-scrollbar {
    width: 6px;
  }

  .comment-history-scroll::-webkit-scrollbar-thumb {
    background-color: #ccc;
    border-radius: 3px;
  }
  .date-separator {
    text-align: center;
    font-size: 0.9rem;
    font-weight: bold;
    color: #555;
    margin: 10px 0 4px;
  }
  .jump-button {
    display: flex;
    justify-content: center;
    margin-top: 10px;
  }
  .comment-order-toggle {
    margin: 10px 16px;
    font-size: 0.95rem;
  }
  .centered {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    margin-bottom: 16px;
    text-align: center;
  }
</style>
