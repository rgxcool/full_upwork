<template>
  <div class="summary centered">
    <div class="summary-header">
      <h2>📊 APL Statusöversikt</h2>
      <div class="header-actions">
        <button @click="summaryExpanded = !summaryExpanded" class="toggle-btn" title="Visa/dölj statusöversikt">
          <i :class="summaryExpanded ? 'fas fa-chevron-up' : 'fas fa-chevron-down'"></i>
        </button>
        <button @click="fetchStudents" class="refresh-btn" title="Uppdatera data">
          <i class="fas fa-sync-alt"></i>
        </button>
      </div>
    </div>
    <div v-show="summaryExpanded" class="summary-content">
      <div style="margin-bottom: 10px">
        <v-btn color="primary" small @click="openAddStudentDialog">Lägg till elev till APL</v-btn>
      </div>
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
              Totalt antal studenter:
              <strong>{{ totalStudents }}</strong>
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
  </div>
  <div class="apl-board">
    <div
      v-if="copied"
      class="copied-floating"
      :style="{ top: copiedPosition.y + 'px', left: copiedPosition.x + 'px' }"
    >
      Kopierat
    </div>
    <!-- Debug info 
    <div style="background: yellow; padding: 10px; margin: 10px; border: 2px solid red;">
      <strong>🔍 DEBUG INFO:</strong><br>
      StatusMap length: {{ statusMap.length }}<br>
      StudentsByStatus keys: {{ Object.keys(studentsByStatus) }}<br>
      FilteredStudents length: {{ filteredStudents.length }}<br>
      StudentsByStatus: {{ JSON.stringify(studentsByStatus, null, 2) }}
    </div>
    -->
    <div
      v-for="status in statusMap"
      :key="status.key"
      class="column"
      :class="status.key.toLowerCase()"
      @dragover.prevent
      @drop="handleDrop($event, status.key)"
    >
      <h3>{{ status.label }} ({{ studentsByStatus[status.key]?.length || 0 }})</h3>
      <div
        v-for="student in studentsByStatus[status.key] || []"
        :key="student._id"
        class="student-card"
        draggable="true"
        @dragstart="handleDragStart($event, student)"
        @click="openComments(student)"
      >
        <router-link :to="`/student/${student._id}`" @click.stop>{{ student.name }}</router-link>
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
      <div
        v-if="(studentsByStatus[status.key] || []).length === 0"
        style="color: #666; font-style: italic; text-align: center; padding: 20px"
      >
        Inga studenter i denna kolumn
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

        <v-card-text v-if="selectedStudent" class="mb-0">
          <div class="education-summary">
            <div class="education-row">
              <strong>Kurspaket:</strong>
              <span>{{ packageNamesDisplay || '–' }}</span>
            </div>
            <div class="education-row">
              <strong>Utbildning:</strong>
              <span>Start: {{ earliestStartDisplay || '–' }}</span>
              <span class="dot-sep">•</span>
              <span>Slut: {{ latestEndDisplay || '–' }}</span>
            </div>
          </div>
        </v-card-text>

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
                  <v-icon size="x-small" left>mdi-content-save</v-icon>
                  Spara
                </v-btn>
                <v-btn v-if="editingIndex === index" color="grey" small @click="cancelEdit">
                  <v-icon size="x-small" left>mdi-cancel</v-icon>
                  Avbryt
                </v-btn>
                <v-btn
                  v-if="editingIndex !== index"
                  class="ml-1"
                  color="yellow darken-2"
                  icon
                  size="22"
                  @click="editComment(index)"
                >
                  <v-icon size="12">mdi-comment-edit</v-icon>
                </v-btn>
                <v-btn
                  color="red"
                  class="mr-1 mb-2"
                  size="22"
                  icon
                  @click="confirmDelete(index)"
                  v-if="canDelete(entry)"
                >
                  <v-icon size="16">mdi-delete</v-icon>
                </v-btn>
              </div>
            </div>
          </template>

          <div v-if="canComment">
            <v-textarea v-model="newComment" label="Lägg till kommentar" rows="3" auto-grow />
          </div>
        </div>

        <div class="button-row">
          <v-btn class="ml-3 mb-2" small color="green" @click="submitComment">Spara</v-btn>
          <v-btn class="ml-3 mb-2" small color="red" @click="removeFromApl(selectedStudent)">
            Ta bort från APL
          </v-btn>
          <v-btn class="mr-3 mb-2" small color="primary" @click="closeDialog">Stäng</v-btn>
        </div>
      </v-card>
    </v-dialog>

    <!-- Add student to APL dialog -->
    <v-dialog v-model="addStudentDialog" max-width="600px">
      <v-card>
        <v-card-title>Lägg till elev till APL</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="searchQuery"
            label="Sök elev (minst 3 tecken)"
            clearable
            @input="onSearchInput"
          />
          <div v-if="isSearching" style="font-size: 0.9rem; color: #666">Söker...</div>
          <div v-if="searchError" style="font-size: 0.9rem; color: #d32f2f; margin-top: 8px">
            {{ searchError }}
          </div>
          <v-list v-if="showSuggestions && suggestions.length">
            <v-list-item v-for="s in suggestions" :key="s.id" @click="selectSuggestion(s)">
              <v-list-item-title>{{ s.name }}</v-list-item-title>
              <v-list-item-subtitle>{{ s.extra }}</v-list-item-subtitle>
            </v-list-item>
          </v-list>
          <div v-else-if="showSuggestions && !isSearching && !searchError" style="font-size: 0.9rem; color: #666">
            Inga träffar
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="closeAddDialog">Stäng</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup>
  import { ref, computed, onMounted, nextTick, watch } from 'vue'
  import axios from 'axios'
  import { useStore } from 'vuex'
  import { useRoute } from 'vue-router'
  import FileUploaderDownloader from '../components/FileUploaderDownloader.vue'

  const store = useStore()
  const route = useRoute()
  const currentUser = computed(() => store.state.user)
  console.log('Current user:', currentUser.value)

  console.log('Role:', currentUser.value?.role)
  const currentUserId = computed(() => store.state.user?.userId?.toString() || '')
  console.log('Current user ID:', currentUserId.value)
  const totalStudents = computed(() => filteredStudents.value.length)

  const commentAscOrder = ref(true)
  const summaryExpanded = ref(false) // Start collapsed by default
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

  // Manual APL inclusions persisted locally
  const addStudentDialog = ref(false)
  const searchQuery = ref('')
  const suggestions = ref([])
  const isSearching = ref(false)
  const showSuggestions = ref(false)
  const searchError = ref('')
  const manualAplIds = ref(new Set())
  const excludedAplIds = ref(new Set())

  const loadManualAplIds = () => {
    try {
      const raw = localStorage.getItem('manualAplIds')
      if (raw) {
        const arr = JSON.parse(raw)
        manualAplIds.value = new Set(Array.isArray(arr) ? arr : [])
      }
    } catch {}
  }
  const saveManualAplIds = () => {
    try {
      localStorage.setItem('manualAplIds', JSON.stringify(Array.from(manualAplIds.value)))
    } catch {}
  }
  const loadExcludedAplIds = () => {
    try {
      const raw = localStorage.getItem('excludedAplIds')
      if (raw) {
        const arr = JSON.parse(raw)
        excludedAplIds.value = new Set(Array.isArray(arr) ? arr : [])
      }
    } catch {}
  }
  const saveExcludedAplIds = () => {
    try {
      localStorage.setItem('excludedAplIds', JSON.stringify(Array.from(excludedAplIds.value)))
    } catch {}
  }

  // Only include students with a CoursePackage or manually added, and exclude dropout students
  const filteredStudents = computed(() => {
    const hasCoursePackageOrManual = (student) => {
      const studentId = String(student._id)
      
      // Exclude dropout students
      if (student.dropout) {
        console.debug(`[APL Filter] Student ${student.name} (${studentId}) excluded: dropout`)
        return false
      }
      
      // Check excluded list
      if (excludedAplIds.value.has(studentId)) {
        console.debug(`[APL Filter] Student ${student.name} (${studentId}) excluded: in excludedAplIds`)
        return false
      }
      
      // Manually added students always appear
      if (manualAplIds.value.has(studentId)) {
        console.log(`[APL Filter] ✅ Student ${student.name} (${studentId}) included: manually added`)
        return true
      }
      
      // Check for CoursePackage in education
      if (!Array.isArray(student.education)) {
        console.debug(`[APL Filter] Student ${student.name} (${studentId}) excluded: no education array`)
        return false
      }
      
      const hasCoursePackage = student.education.some((edu) => edu.type === 'CoursePackage')
      if (hasCoursePackage) {
        console.debug(`[APL Filter] ✅ Student ${student.name} (${studentId}) included: has CoursePackage`)
      } else {
        console.debug(`[APL Filter] Student ${student.name} (${studentId}) excluded: no CoursePackage`)
      }
      return hasCoursePackage
    }
    
    const filtered = (students.value || []).filter(hasCoursePackageOrManual)
    console.log(`[APL Filter] Total filtered students: ${filtered.length} out of ${students.value?.length || 0}`)
    return filtered
  })

  // Update studentsByStatus and statusCounts to use filteredStudents
  const studentsByStatus = computed(() => {
    if (!Array.isArray(filteredStudents.value)) {
      return {}
    }

    return statusMap.reduce((acc, status) => {
      acc[status.key] = filteredStudents.value.filter((s) => s.aplStatus === status.key)
      return acc
    }, {})
  })

  const statusCounts = computed(() => {
    return statusMap.reduce((acc, status) => {
      acc[status.key] = filteredStudents.value.filter((s) => s.aplStatus === status.key).length
      return acc
    }, {})
  })

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
    { key: 'GRAY', label: 'Ny Elev' },
    { key: 'BLUE', label: 'Kontaktad' },
    { key: 'YELLOW', label: 'APL på gång' },
    { key: 'PURPLE', label: 'Behöver uppföljning' },
    { key: 'RED', label: 'Snart slut' },
    { key: 'GREEN', label: 'Klar praktik' },
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
      
      console.log('📋 Fetched students count:', students.value.length)
      console.log('📋 Manual APL IDs:', Array.from(manualAplIds.value))
      console.log('📋 Students with manual IDs:', students.value.filter(s => manualAplIds.value.has(String(s._id))).map(s => ({ name: s.name, id: s._id })))
    } catch (err) {
      console.error('❌ Failed to fetch students:', err)
    }
  }

  onMounted(() => {
    loadManualAplIds()
    loadExcludedAplIds()
    fetchStudents()
  })

  watch(manualAplIds, saveManualAplIds, { deep: false })
  watch(excludedAplIds, saveExcludedAplIds, { deep: false })

  // Watch for route changes to refresh data
  watch(
    () => route.path,
    () => {
      if (route.path === '/apl') {
        console.log('🔄 APL route detected, refreshing student data...')
        fetchStudents()
      }
    }
  )

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

  // Debounce timer for search
  let searchDebounceTimer = null

  // Autocomplete search and selection
  const onSearchInput = async () => {
    const q = searchQuery.value.trim()
    searchError.value = ''
    
    if (q.length < 3) {
      showSuggestions.value = false
      suggestions.value = []
      // Clear any pending debounce
      if (searchDebounceTimer) {
        clearTimeout(searchDebounceTimer)
        searchDebounceTimer = null
      }
      return
    }
    
    // Clear previous debounce timer
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer)
    }
    
    // Debounce the search - wait 500ms after user stops typing
    searchDebounceTimer = setTimeout(async () => {
      console.log('🔍 Searching for:', q)
      showSuggestions.value = false
      suggestions.value = []
      isSearching.value = true
      
      try {
        const apiUrl = `${import.meta.env.VITE_API_URL}/api/search`
        console.log('📡 Calling search API:', apiUrl, { q, type: 'Användare' })
        
        const { data } = await axios.get(apiUrl, {
          params: { q, type: 'Användare' },
          withCredentials: true,
        })
        
        console.log('✅ Search response:', data)
        
        // Only keep students (Elev)
        const studentResults = (data || []).filter((r) => r.type === 'Elev')
        console.log('📚 Filtered student results:', studentResults)
        
        suggestions.value = studentResults
        showSuggestions.value = true
      } catch (e) {
        console.error('❌ Sökning misslyckades:', e)
        console.error('❌ Error details:', e.response?.data || e.message)
        if (e.response?.status === 429) {
          searchError.value = 'För många förfrågningar. Vänta lite och försök igen.'
        } else {
          searchError.value = `Sökfel: ${e.response?.data?.message || e.message || 'Okänt fel'}`
        }
        showSuggestions.value = false
        suggestions.value = []
      } finally {
        isSearching.value = false
        searchDebounceTimer = null
      }
    }, 500) // Wait 500ms after user stops typing
  }

  const selectSuggestion = async (s) => {
    console.log('👆 Selected suggestion:', s)
    if (!s?.id) {
      console.error('❌ No ID in suggestion:', s)
      return
    }
    // Ensure ID is stored as string for consistent comparison
    const studentId = String(s.id)
    console.log('➕ Adding student to APL:', s.name, 'ID:', studentId)
    manualAplIds.value.add(studentId)
    saveManualAplIds()
    console.log('💾 Saved manualAplIds:', Array.from(manualAplIds.value))
    
    // Check if student is already in the list
    const existingStudent = students.value.find(st => String(st._id) === studentId)
    if (!existingStudent) {
      console.log('⚠️ Student not in current list, fetching student details...')
      try {
        // Fetch the specific student to add them to the list
        // Use student-details endpoint which includes enrollments/education
        const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/student-details/${studentId}`, {
          withCredentials: true,
        })
        if (res.data && res.data.student) {
          const newStudent = {
            ...res.data.student,
            commentHistory: (res.data.student.commentHistory || []).map((comment) => ({
              ...comment,
              seenBy: (comment.seenBy || []).map((id) => id.toString()),
            })),
          }
          // Add to students array if not already there
          const exists = students.value.some(st => String(st._id) === studentId)
          if (!exists) {
            students.value.push(newStudent)
            console.log('✅ Added student to list:', newStudent.name, 'Education:', newStudent.education)
          }
        }
      } catch (err) {
        console.error('❌ Failed to fetch student details:', err)
        // Try alternative endpoint
        try {
          const res2 = await axios.get(`${import.meta.env.VITE_API_URL}/api/student/${studentId}`, {
            withCredentials: true,
          })
          if (res2.data) {
            const newStudent = {
              ...res2.data,
              commentHistory: (res2.data.commentHistory || []).map((comment) => ({
                ...comment,
                seenBy: (comment.seenBy || []).map((id) => id.toString()),
              })),
            }
            const exists = students.value.some(st => String(st._id) === studentId)
            if (!exists) {
              students.value.push(newStudent)
              console.log('✅ Added student to list (via /student endpoint):', newStudent.name)
            }
          }
        } catch (err2) {
          console.error('❌ Failed to fetch student via alternative endpoint:', err2)
        }
      }
    } else {
      console.log('✅ Student already in list:', existingStudent.name)
    }
    
    // Refresh students to ensure the newly added student appears
    console.log('🔄 Refreshing student list...')
    await fetchStudents()
    console.log('✅ Student list refreshed')
    searchQuery.value = ''
    suggestions.value = []
    showSuggestions.value = false
    searchError.value = ''
    addStudentDialog.value = false
  }

  const openAddStudentDialog = () => {
    console.log('🔘 Add student button clicked')
    addStudentDialog.value = true
    searchQuery.value = ''
    suggestions.value = []
    showSuggestions.value = false
    searchError.value = ''
    isSearching.value = false
  }

  const closeAddDialog = () => {
    console.log('❌ Closing add student dialog')
    addStudentDialog.value = false
    searchQuery.value = ''
    suggestions.value = []
    showSuggestions.value = false
    searchError.value = ''
    isSearching.value = false
  }

  const removeFromApl = (student) => {
    if (!student?._id) return
    if (!confirm(`Ta bort ${student.name} från APL?`)) return
    // Ensure ID is stored as string for consistent comparison
    const studentId = String(student._id)
    // If they were manually added, remove from manual set
    if (manualAplIds.value.has(studentId)) {
      manualAplIds.value.delete(studentId)
      saveManualAplIds()
    }
    // Add to excluded set
    excludedAplIds.value.add(studentId)
    saveExcludedAplIds()
    // Optimistic local update
    const idx = students.value.findIndex((s) => s._id === student._id)
    if (idx !== -1) {
      // No mutation to education to keep server state intact; local filter will hide them
    }
    dialog.value = false
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

  const formatDateOnly = (date) => {
    if (!date) return ''
    const d = new Date(date)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleDateString('sv-SE')
  }

  const packageNamesDisplay = computed(() => {
    const edu = selectedStudent.value?.education || []
    const names = edu
      .filter((e) => e && e.type === 'CoursePackage')
      .map((e) => e.name || e.refId?.coursePackageName)
      .filter(Boolean)
    const unique = Array.from(new Set(names))
    return unique.join(', ')
  })

  const earliestStartDisplay = computed(() => {
    const edu = selectedStudent.value?.education || []
    const starts = edu
      .map((e) => (e && e.startDate ? new Date(e.startDate).getTime() : NaN))
      .filter((n) => !isNaN(n))
    if (!starts.length) return ''
    return formatDateOnly(new Date(Math.min(...starts)))
  })

  const latestEndDisplay = computed(() => {
    const edu = selectedStudent.value?.education || []
    const ends = edu
      .map((e) => (e && e.endDate ? new Date(e.endDate).getTime() : NaN))
      .filter((n) => !isNaN(n))
    if (!ends.length) return ''
    return formatDateOnly(new Date(Math.max(...ends)))
  })

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
    width: 100%;
    min-height: 600px;
    height: auto;
    overflow: auto;
    display: flex;
    flex-direction: row;
    gap: 16px;
    box-sizing: border-box;
    padding: 20px;
  }

  .column {
    min-width: 300px;
    flex: 1 1 0;
    overflow-y: auto;
    max-height: 80vh;
    padding: 15px;
    border-radius: 8px;
    min-height: 400px;
    background-color: #f1f1f1;
    border: 1px solid #ddd;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
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

  .column.purple {
    background-color: #ce93d8;
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

  .education-summary {
    margin: 8px 0 4px;
    padding: 10px 12px;
    background: #f7f9fb;
    border: 1px solid #e1e7ef;
    border-radius: 6px;
  }
  .education-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
    flex-wrap: wrap;
  }
  .education-row:last-child {
    margin-bottom: 0;
  }
  .education-row strong {
    min-width: 90px;
  }
  .dot-sep {
    opacity: 0.5;
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

  .summary-header {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 15px;
    margin-bottom: 15px;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .toggle-btn {
    background: #6c757d;
    color: white;
    border: none;
    border-radius: 50%;
    width: 40px;
    height: 40px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background-color 0.2s;
  }

  .toggle-btn:hover {
    background: #5a6268;
  }

  .summary-content {
    animation: slideDown 0.3s ease-out;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      max-height: 0;
    }
    to {
      opacity: 1;
      max-height: 1000px;
    }
  }

  .refresh-btn {
    background: #007dc3;
    color: white;
    border: none;
    border-radius: 50%;
    width: 40px;
    height: 40px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background-color 0.2s;
  }

  .refresh-btn:hover {
    background: #005a8b;
  }

  .refresh-btn i {
    font-size: 16px;
  }
</style>
