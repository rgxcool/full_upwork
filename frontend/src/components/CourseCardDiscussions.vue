<template>
  <section class="discussion-panel">
    <div class="discussion-heading">
      <h3>Trådar om uppgiften</h3>
      <span class="discussion-context">{{ categoryLabel(category) }}</span>
    </div>

    <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-3" />
    <v-alert v-else-if="loadError" type="error" density="compact" class="mb-3">
      {{ loadError }}
    </v-alert>
    <p v-else-if="discussions.length === 0" class="empty-discussions">
      Inga trådar ännu.
    </p>

    <article v-for="discussion in discussions" :key="discussion._id" class="discussion-thread">
      <h4>{{ discussion.title }}</h4>
      <p class="thread-prompt">{{ discussion.promptText }}</p>
      <div class="thread-created">
        Startad av {{ discussion.createdBy?.username || 'Lärare' }} ·
        {{ formatDate(discussion.createdAt) }}
      </div>

      <div v-if="staffView" class="student-conversations">
        <div
          v-for="conversation in discussion.studentConversations || []"
          :key="conversation.studentId?._id || conversation.studentId"
          class="student-conversation"
        >
          <h5>{{ conversation.studentId?.name || 'Elev' }}</h5>
          <div
            v-for="(message, index) in conversation.messages || []"
            :key="`${message.at}-${index}`"
            class="discussion-message"
            :class="{ 'staff-message': message.authorRole === 'staff' }"
          >
            <div class="message-meta">
              {{ message.authorId?.username || (message.authorRole === 'staff' ? 'Personal' : 'Elev') }}
              · {{ formatDate(message.at) }}
            </div>
            <p>{{ message.text }}</p>
          </div>
          <form
            v-if="lastMessage(conversation)?.authorRole === 'student'"
            class="reply-form"
            @submit.prevent="replyToStudent(discussion, conversation)"
          >
            <v-textarea
              v-model="replyDrafts[conversationKey(discussion, conversation)]"
              label="Svara eleven"
              rows="2"
              auto-grow
              hide-details
              density="compact"
              maxlength="5000"
            />
            <v-btn
              type="submit"
              color="primary"
              size="small"
              :loading="savingKey === conversationKey(discussion, conversation)"
              :disabled="!replyDrafts[conversationKey(discussion, conversation)]?.trim()"
            >
              Svara
            </v-btn>
          </form>
          <p v-else class="conversation-status">Inväntar elevens svar.</p>
        </div>
      </div>

      <div v-else class="student-conversation">
        <div
          v-for="(message, index) in studentMessages(discussion)"
          :key="`${message.at}-${index}`"
          class="discussion-message"
          :class="{ 'staff-message': message.authorRole === 'staff' }"
        >
          <div class="message-meta">
            {{ message.authorId?.username || (message.authorRole === 'staff' ? 'Lärare' : 'Du') }}
            · {{ formatDate(message.at) }}
          </div>
          <p>{{ message.text }}</p>
        </div>
        <p v-if="!canStudentReply(discussion)" class="conversation-status">
          Vänta på lärarens svar innan du skickar ett nytt meddelande.
        </p>
        <form v-else class="reply-form" @submit.prevent="requestStudentReply(discussion)">
          <v-textarea
            v-model="studentDrafts[discussion._id]"
            label="Ditt meddelande"
            rows="2"
            auto-grow
            hide-details
            density="compact"
            maxlength="5000"
          />
          <v-btn
            type="submit"
            color="primary"
            size="small"
            :disabled="!studentDrafts[discussion._id]?.trim()"
          >
            Svara
          </v-btn>
        </form>
      </div>
    </article>

    <form v-if="staffView" class="new-thread-form" @submit.prevent="createThread">
      <h4>Starta en tråd</h4>
      <v-text-field
        v-model="newTitle"
        label="Rubrik"
        maxlength="160"
        hide-details
        class="mb-3"
      />
      <v-textarea
        v-model="newText"
        label="Meddelande eller fråga till eleverna"
        rows="3"
        auto-grow
        maxlength="5000"
        hide-details
        class="mb-3"
      />
      <v-btn
        type="submit"
        color="primary"
        :loading="savingKey === 'new-thread'"
        :disabled="!newText.trim() || savingKey === 'new-thread'"
      >
        Starta tråd
      </v-btn>
    </form>

    <v-dialog v-model="confirmOpen" max-width="460">
      <v-card>
        <v-card-title>Kontrollera ditt meddelande</v-card-title>
        <v-card-text>
          När du skickat meddelandet är det skrivet i sten och kan inte ändras. Du kan svara igen
          först när läraren har kommenterat.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="confirmOpen = false">Avbryt</v-btn>
          <v-btn color="primary" :loading="savingKey === 'student-reply'" @click="confirmStudentReply">
            Skicka meddelandet
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import client from '@/api/client.js'

const props = defineProps({
  courseInstanceId: { type: String, required: true },
  moduleNumber: { type: Number, required: true },
  module: { type: Object, default: () => ({}) },
  staffView: { type: Boolean, default: false },
})

const discussions = ref([])
const loading = ref(false)
const loadError = ref('')
const savingKey = ref('')
const newTitle = ref('')
const newText = ref('')
const replyDrafts = ref({})
const studentDrafts = ref({})
const confirmOpen = ref(false)
const pendingDiscussion = ref(null)

const category = computed(() =>
  props.module?.isPartialExam
    ? 'exam'
    : props.module?.assignment?.title || props.module?.assignment?.description
      ? 'assignment'
      : 'general'
)

const categoryLabel = (value) =>
  ({ assignment: 'Inlämningsuppgift', exam: 'Prov', general: 'Övrigt' })[value] || 'Övrigt'

const formatDate = (value) => {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })
}

const studentConversation = (discussion) => discussion.studentConversations?.[0] || null
const studentMessages = (discussion) => studentConversation(discussion)?.messages || []
const lastMessage = (conversation) => conversation?.messages?.at(-1) || null
const canStudentReply = (discussion) => lastMessage(studentConversation(discussion))?.authorRole !== 'student'
const conversationKey = (discussion, conversation) =>
  `${discussion._id}:${conversation.studentId?._id || conversation.studentId}`

const loadDiscussions = async () => {
  loading.value = true
  loadError.value = ''
  try {
    const { data } = await client.get(
      `/course-instances/${encodeURIComponent(props.courseInstanceId)}/module-discussions`,
      { params: { moduleNumber: props.moduleNumber } }
    )
    discussions.value = Array.isArray(data?.discussions) ? data.discussions : []
  } catch (requestError) {
    loadError.value = requestError?.response?.data?.error || 'Kunde inte hämta trådarna.'
  } finally {
    loading.value = false
  }
}

const createThread = async () => {
  const title =
    newTitle.value.trim() ||
    (props.module?.assignment?.title
      ? `Fråga om ${props.module.assignment.title}`
      : `Fråga om ${props.module?.title || `modul ${props.moduleNumber}`}`)
  savingKey.value = 'new-thread'
  loadError.value = ''
  try {
    await client.post(
      `/course-instances/${encodeURIComponent(props.courseInstanceId)}/module-discussions`,
      {
        moduleNumber: props.moduleNumber,
        title,
        category: category.value,
        text: newText.value.trim(),
      }
    )
    newTitle.value = ''
    newText.value = ''
    await loadDiscussions()
  } catch (requestError) {
    loadError.value = requestError?.response?.data?.error || 'Kunde inte starta tråden.'
  } finally {
    savingKey.value = ''
  }
}

const addMessage = async (discussion, text, studentId) => {
  const key = studentId ? `${discussion._id}:${studentId}` : 'student-reply'
  savingKey.value = key
  loadError.value = ''
  try {
    await client.post(
      `/course-instances/${encodeURIComponent(props.courseInstanceId)}/module-discussions/${encodeURIComponent(discussion._id)}/messages`,
      { moduleNumber: props.moduleNumber, text, ...(studentId ? { studentId } : {}) }
    )
    return true
  } catch (requestError) {
    loadError.value = requestError?.response?.data?.error || 'Kunde inte skicka meddelandet.'
    return false
  } finally {
    savingKey.value = ''
  }
}

const replyToStudent = async (discussion, conversation) => {
  const key = conversationKey(discussion, conversation)
  const text = replyDrafts.value[key]?.trim()
  if (!text) return
  const studentId = conversation.studentId?._id || conversation.studentId
  if (await addMessage(discussion, text, studentId)) {
    replyDrafts.value[key] = ''
    await loadDiscussions()
  }
}

const requestStudentReply = (discussion) => {
  if (!studentDrafts.value[discussion._id]?.trim()) return
  pendingDiscussion.value = discussion
  confirmOpen.value = true
}

const confirmStudentReply = async () => {
  const discussion = pendingDiscussion.value
  const text = studentDrafts.value[discussion?._id]?.trim()
  if (!discussion || !text) return
  if (await addMessage(discussion, text)) {
    studentDrafts.value[discussion._id] = ''
    confirmOpen.value = false
    pendingDiscussion.value = null
    await loadDiscussions()
  }
}

watch(
  () => [props.courseInstanceId, props.moduleNumber],
  loadDiscussions
)

onMounted(loadDiscussions)
</script>

<style scoped>
.discussion-panel {
  margin-top: 1.25rem;
  padding-top: 1rem;
  border-top: 1px solid #e5e7eb;
}

.discussion-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.discussion-heading h3,
.new-thread-form h4,
.discussion-thread h4,
.student-conversation h5 {
  margin: 0;
}

.discussion-context,
.thread-created,
.message-meta,
.conversation-status,
.empty-discussions {
  color: #64748b;
  font-size: 0.82rem;
}

.discussion-thread,
.new-thread-form {
  margin-top: 0.75rem;
  padding: 0.9rem;
  border: 1px solid #e2e8f0;
  border-radius: 0.65rem;
  background: #fff;
}

.thread-prompt {
  margin: 0.45rem 0;
  white-space: pre-wrap;
}

.student-conversation {
  margin-top: 0.8rem;
  padding: 0.75rem;
  background: #f8fafc;
  border-radius: 0.5rem;
}

.discussion-message {
  margin-top: 0.55rem;
  padding: 0.55rem 0.7rem;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 0.45rem;
}

.discussion-message.staff-message {
  background: #eff6ff;
  border-color: #bfdbfe;
}

.discussion-message p {
  margin: 0.25rem 0 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.reply-form {
  display: grid;
  gap: 0.6rem;
  justify-items: start;
  margin-top: 0.7rem;
}

.new-thread-form h4 {
  margin-bottom: 0.75rem;
}

.conversation-status {
  margin: 0.6rem 0 0;
}
</style>
